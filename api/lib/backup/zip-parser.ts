/**
 * Backup ZIP parser
 *
 * 职责
 * ----
 * 把 buildBackupZip 产出的 ZIP buffer 解回 manifest + data + 懒加载图片。
 * **只**做 ZIP 结构解析与字段存在性校验（"这是一份合法的本系统备份"），
 * **不**做业务校验（user_id 匹配、schema 版本匹配）—— 那是 handler 的职责。
 *
 * 为何 manifest 字段校验放这里
 * ---------------------------
 * 缺字段意味着 ZIP 不是本系统产出的（或被篡改）。在 parser 一次性拦截，
 * 比 handler 一行行查容错代码清晰。校验失败抛 Error("Invalid manifest: ...")
 * 调用方包 try/catch 返 400。
 *
 * getImage 设计为懒加载
 * --------------------
 * 备份可能含数百张图片（每张 1-5MB），全部预先 toBuffer 进内存 = 300+MB
 * 工作集。restore 路径每张图上传完就 GC，不需要全部常驻。jszip 内部按需
 * 解压单文件支持这种模式。
 */

import JSZip from 'jszip';
import {
  type BackupData,
  type BackupManifest,
} from './manifest.js';

// =====================================================
// 类型
// =====================================================

export interface ParsedBackupImage {
  buffer: Buffer;
  contentType: string;
}

export interface ParsedBackup {
  manifest: BackupManifest;
  data: BackupData;
  /**
   * 按 edition_file.id 取图片 buffer + contentType。
   * 找不到（包括 ZIP 里没打包 / file_type !== 'image'）返 null。
   */
  getImage(fileId: string): Promise<ParsedBackupImage | null>;
}

// =====================================================
// 工具：扩展名 → MIME
// =====================================================

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  avif: 'image/avif',
};

function extToMime(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

// =====================================================
// Manifest 字段校验
// =====================================================

/**
 * 必填字段一处声明 + 一处校验，缺一即抛。
 * 不做语义校验（值合法性）—— 那由 handler 按业务规则做（user_id 匹配 / schema 版本）。
 */
function assertValidManifest(raw: unknown): asserts raw is BackupManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid manifest: not an object');
  }
  const m = raw as Record<string, unknown>;
  const requiredFields: Array<keyof BackupManifest> = [
    'backup_format_version',
    'db_schema_version',
    'user_id',
    'user_email',
    'created_at',
    'stats',
    'image_count',
    'total_size_bytes',
  ];
  for (const field of requiredFields) {
    if (!(field in m)) {
      throw new Error(`Invalid manifest: missing required field "${String(field)}"`);
    }
  }
  // stats 必须是对象且含 7 张表（不强检值是 number，让 handler 看具体错误）
  if (typeof m.stats !== 'object' || m.stats === null) {
    throw new Error('Invalid manifest: stats must be an object');
  }
  const stats = m.stats as Record<string, unknown>;
  const requiredTables = [
    'artworks',
    'editions',
    'edition_files',
    'edition_history',
    'locations',
    'gallery_links',
    'api_keys',
  ];
  for (const table of requiredTables) {
    if (!(table in stats)) {
      throw new Error(`Invalid manifest: stats missing table "${table}"`);
    }
  }
}

/**
 * data.json 形状校验。每张表必须是数组（缺/类型错即抛）。
 * 行内字段不校验 —— restore 时由 PG schema (NOT NULL / FK / CHECK) 拦。
 */
function assertValidData(raw: unknown): asserts raw is BackupData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid data.json: not an object');
  }
  const d = raw as Record<string, unknown>;
  const tables: Array<keyof BackupData> = [
    'artworks',
    'editions',
    'edition_files',
    'edition_history',
    'locations',
    'gallery_links',
    'api_keys',
  ];
  for (const table of tables) {
    if (!Array.isArray(d[table])) {
      throw new Error(`Invalid data.json: "${String(table)}" must be an array`);
    }
  }
}

// =====================================================
// 主入口
// =====================================================

export async function parseBackupZip(buffer: Buffer): Promise<ParsedBackup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error(`Failed to read ZIP: ${(err as Error).message}`);
  }

  // 1) manifest.json
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup: manifest.json not found');
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await manifestFile.async('string'));
  } catch (err) {
    throw new Error(`Invalid manifest: not valid JSON (${(err as Error).message})`);
  }
  assertValidManifest(manifestRaw);
  const manifest = manifestRaw;

  // 2) data.json
  const dataFile = zip.file('data.json');
  if (!dataFile) {
    throw new Error('Invalid backup: data.json not found');
  }
  let dataRaw: unknown;
  try {
    dataRaw = JSON.parse(await dataFile.async('string'));
  } catch (err) {
    throw new Error(`Invalid data.json: not valid JSON (${(err as Error).message})`);
  }
  assertValidData(dataRaw);
  const data = dataRaw;

  // 3) getImage：懒加载 images/<fileId>.<ext>
  //    扩展名未知 → 按 prefix 找首个匹配；找不到返 null（不抛，由调用方决定怎么 fallback）
  const getImage = async (fileId: string): Promise<ParsedBackupImage | null> => {
    // jszip file lookup by name 是 O(1) hash，但我们不知道扩展名，只能扫
    // `images/` 目录下名字以 `${fileId}.` 开头的条目
    const prefix = `images/${fileId}.`;
    let matched: JSZip.JSZipObject | null = null;
    let matchedName = '';
    // jszip files map iteration —— 备份内典型几百条目，遍历可接受
    for (const [name, file] of Object.entries(zip.files)) {
      if (name.startsWith(prefix) && !file.dir) {
        matched = file;
        matchedName = name;
        break;
      }
    }
    if (!matched) return null;

    const dotIdx = matchedName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? matchedName.slice(dotIdx + 1) : '';
    const arrayBuffer = await matched.async('uint8array');
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: extToMime(ext),
    };
  };

  return { manifest, data, getImage };
}
