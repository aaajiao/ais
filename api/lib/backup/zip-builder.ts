/**
 * Backup ZIP builder
 *
 * 流程
 * ----
 * 1. 调 RPC `public.backup_snapshot(p_user_id)` 拿到跨表一致性 jsonb 快照
 *    （单事务内所有 SELECT 共享同一 snapshot，避免 supabase-js 多请求间的脏读）。
 * 2. 收集两类资产、并发下载（batch size = 5，与 api/export/pdf.ts:414 对齐）：
 *      a) artworks.thumbnail_url —— 作品主图（thumbnails public bucket）
 *      b) edition_files：仅 source_type='upload' 的行 —— 上传到 edition-files
 *         **private** bucket 的附件（image / pdf / document 全部，不再限 file_type='image'）
 *    source_type='link' 的行（如 Basecamp 外链）跳过 —— 备份 = 工作室自有数据，
 *    不下载第三方资源。
 * 3. 重写两张表的行：
 *      - artworks.thumbnail_url → `artworks/{artwork_id}.{ext}` + _original_thumbnail_url
 *      - edition_files.file_url → `files/{file_id}.{ext}` + _original_url
 *    ZIP 子目录拆开（不再平铺 images/），与两张表的语义对齐。
 * 4. 用 jszip 组装：manifest.json + data.json + artworks/* + files/*
 * 5. 返回 `{ buffer, manifest }`（jszip nodebuffer 模式，内存全打包）。
 *
 * Storage 下载策略：service-key download() 穿 public + private
 * ----------------------------------------------------------
 * thumbnails bucket 是 public（fetch URL 也能读），但 edition-files bucket 是 **private**
 * （前端走 `getSignedUrl` 拿临时签名 URL）—— 直接 fetch public URL 会 404。
 *
 * 解法：所有 Supabase Storage 资源统一用 `supabase.storage.from(bucket).download(path)`
 * —— service-key 客户端绕过 RLS 和 bucket public 设置，对 public / private 同效。
 *
 * URL 形态：相对路径 vs 绝对 URL
 * ------------------------------
 * `edition_files.file_url` 历史上双形态：
 *   - 老数据：相对路径 `{edition_id}/{uuid}_filename.png`（src/hooks/useFileUpload.ts:150 写入）
 *   - 新数据：绝对 URL `https://{ref}.supabase.co/storage/v1/object/...`
 * `artworks.thumbnail_url` 目前观察都是绝对 URL，但代码两种形态都吃。
 *
 * `parseStorageRef(raw, defaultBucket)` 把两种形态统一成 `{bucket, path}`：
 *   - 绝对 supabase Storage URL → 从 path 里 extract `/storage/v1/object/{public|sign}/{bucket}/{path}`
 *   - 相对路径 → 用 defaultBucket + 路径原样
 *
 * 注意
 * ----
 * - Pro 计划 maxDuration 300s 够用：100 件作品 + 几百张附件在 batchSize=5 并发下 p95 < 60s。
 * - 软删行（artworks.deleted_at IS NOT NULL）也进备份，恢复时保留软删状态。
 * - `source_type='link'` 行原样保留 file_url（外链），不下载——见 docs/backup.md `链接类外链`。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import {
  BACKUP_FORMAT_VERSION,
  DB_SCHEMA_VERSION,
  type BackupManifest,
  type BackupStats,
} from './manifest.js';

// =====================================================
// 类型：RPC 返回的快照结构（与 SQL function 一致）
// =====================================================

interface EditionFileRow {
  id: string;
  edition_id: string;
  source_type: string;
  file_url: string;
  file_type: string;
  file_name?: string | null;
  file_size?: number | null;
  description?: string | null;
  sort_order?: number | null;
  created_at: string;
  created_by?: string | null;
  // 写入 ZIP 时附加：保留原始外链 URL / storage path
  _original_url?: string;
}

interface ArtworkRow {
  id: string;
  thumbnail_url?: string | null;
  // 写入 ZIP 时附加：保留原始 thumbnail URL
  _original_thumbnail_url?: string;
  [key: string]: unknown;
}

interface BackupSnapshot {
  artworks: ArtworkRow[];
  editions: unknown[];
  edition_files: EditionFileRow[];
  edition_history: unknown[];
  locations: unknown[];
  gallery_links: unknown[];
  api_keys: unknown[];
}

// =====================================================
// 常量
// =====================================================

/** artworks.thumbnail_url 默认所在 bucket（public）。 */
const THUMBNAILS_BUCKET = 'thumbnails';
/** edition_files.file_url 默认所在 bucket（private，前端走 signed URL）。 */
const EDITION_FILES_BUCKET = 'edition-files';

// =====================================================
// URL ↔ Storage 引用解析
// =====================================================

interface StorageRef {
  bucket: string;
  path: string;
}

/**
 * 把可能是相对路径或绝对 supabase Storage URL 的字段值，归一为 `{bucket, path}`。
 * 解析失败（外链 / 格式异常）返 null —— 调用方决定 fallback 行为。
 *
 *   - 相对路径 → `{ bucket: defaultBucket, path: raw }`
 *   - 绝对 supabase Storage URL → 从 pathname `/storage/v1/object/{public|sign}/{bucket}/{...}`
 *     里提取 bucket 与 path
 *   - 其它绝对 URL（非 supabase storage） → null（外链不下载）
 */
export function parseStorageRef(raw: string, defaultBucket: string): StorageRef | null {
  if (!raw) return null;

  // 绝对 URL 路径
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      // 期望路径：/storage/v1/object/{public|sign|authenticated}/{bucket}/{...}
      const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (!m) return null;
      const bucket = decodeURIComponent(m[1]);
      const path = decodeURIComponent(m[2]);
      return { bucket, path };
    } catch {
      return null;
    }
  }

  // 相对路径
  const cleaned = raw.replace(/^\/+/, '');
  return { bucket: defaultBucket, path: cleaned };
}

// =====================================================
// Storage 下载：service-key 穿 public + private
// =====================================================

interface DownloadedAsset {
  buffer: Buffer;
  contentType: string;
  /** 用于 dedup 的 key（bucket/path 组合）。 */
  key: string;
}

/**
 * 通过 service-key 下载 Storage 对象。private bucket 也能读。
 * 失败（path 不存在 / network / etc）返 null —— 调用方据此决定 ZIP 内是否打包。
 */
async function downloadFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<DownloadedAsset | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      console.error(`[Backup ZIP] storage.download(${bucket}/${path}) failed:`, error?.message);
      return null;
    }
    const arrayBuffer = await data.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: data.type || 'application/octet-stream',
      key: `${bucket}/${path}`,
    };
  } catch (e) {
    console.error(`[Backup ZIP] storage.download exception (${bucket}/${path}):`, (e as Error).message);
    return null;
  }
}

/**
 * 分批并发下载（batch size 5），与 api/export/pdf.ts:414 模式对齐。
 * 失败的 ref 不进结果 Map —— 调用方据此决定怎么重写字段。
 * cache key 用 `bucket/path` 组合，跨字段共用一份。
 */
async function downloadInBatches(
  supabase: SupabaseClient,
  refs: StorageRef[],
  batchSize = 5,
): Promise<Map<string, DownloadedAsset>> {
  const cache = new Map<string, DownloadedAsset>();

  // 去重
  const uniqueRefs: StorageRef[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const k = `${r.bucket}/${r.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniqueRefs.push(r);
  }

  for (let i = 0; i < uniqueRefs.length; i += batchSize) {
    const batch = uniqueRefs.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (r) => downloadFromStorage(supabase, r.bucket, r.path)),
    );
    for (const asset of results) {
      if (asset) cache.set(asset.key, asset);
    }
  }

  return cache;
}

// =====================================================
// 文件名工具：决定 ZIP 内文件扩展名
// =====================================================

/**
 * 决定 ZIP 内文件扩展名的优先级：
 *   1. storage path 末尾扩展（最权威，与上传时文件名一致）
 *   2. DB 行的 file_name 字段末尾扩展（用户可读文件名）
 *   3. contentType 末段 → 常见 mime 映射
 *   4. 'bin' 兜底
 *
 * 仅保留 a-z0-9，最多 5 字符，防奇异 path。
 */
function pickExtension(
  storagePath: string,
  fileNameHint: string | null | undefined,
  contentType: string,
): string {
  const cleanExt = (s: string) =>
    s.replace(/[^a-z0-9]/g, '').slice(0, 5);

  for (const candidate of [storagePath, fileNameHint ?? '']) {
    if (!candidate) continue;
    const idx = candidate.lastIndexOf('.');
    if (idx >= 0 && idx < candidate.length - 1) {
      const raw = candidate.slice(idx + 1).toLowerCase();
      // 去掉 query / fragment（path 可能含 ?）
      const stripped = raw.split(/[?#]/)[0];
      const cleaned = cleanExt(stripped);
      if (cleaned) return cleaned;
    }
  }

  const sub = contentType.split('/')[1]?.toLowerCase() || 'bin';
  if (sub === 'jpeg') return 'jpg';
  return cleanExt(sub) || 'bin';
}

// =====================================================
// 主入口
// =====================================================

export interface BuildBackupZipResult {
  buffer: Buffer;
  manifest: BackupManifest;
}

/**
 * 构建一份完整工作室备份 ZIP。
 *
 * @param userId    被备份用户 UUID（service key 上下文，由 verifyAuth / cron 提供）
 * @param userEmail 用户邮箱（manifest 元数据用）
 * @param supabase  service-role Supabase client（绕过 RLS + 穿 private bucket）
 */
export async function buildBackupZip(
  userId: string,
  userEmail: string,
  supabase: SupabaseClient,
): Promise<BuildBackupZipResult> {
  // 1) 跨表一致性快照
  const { data: snapshot, error: rpcError } = await supabase.rpc('backup_snapshot', {
    p_user_id: userId,
  });

  if (rpcError) {
    throw new Error(`backup_snapshot RPC failed: ${rpcError.message}`);
  }
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('backup_snapshot RPC returned empty payload');
  }

  const data = snapshot as BackupSnapshot;
  const fileRows: EditionFileRow[] = Array.isArray(data.edition_files) ? data.edition_files : [];
  const artworkRows: ArtworkRow[] = Array.isArray(data.artworks) ? data.artworks : [];

  // 2) 解析两条路径的 StorageRef
  //
  //    artworks.thumbnail_url —— 全部（默认 thumbnails bucket）
  //    edition_files —— 仅 source_type='upload'（默认 edition-files bucket）。
  //                     source_type='link' 跳过；上传类不限 file_type，pdf/doc/image 都备份。

  type ArtworkRefEntry = { row: ArtworkRow; ref: StorageRef };
  const artworkRefs: ArtworkRefEntry[] = [];
  for (const row of artworkRows) {
    const thumb = row.thumbnail_url;
    if (typeof thumb !== 'string' || thumb.length === 0) continue;
    const ref = parseStorageRef(thumb, THUMBNAILS_BUCKET);
    if (!ref) continue; // 外链 / 解析失败 → 字段保留原值
    artworkRefs.push({ row, ref });
  }

  type FileRefEntry = { row: EditionFileRow; ref: StorageRef };
  const fileRefs: FileRefEntry[] = [];
  for (const row of fileRows) {
    if (row.source_type !== 'upload') continue; // link 类不下载
    if (typeof row.file_url !== 'string' || row.file_url.length === 0) continue;
    const ref = parseStorageRef(row.file_url, EDITION_FILES_BUCKET);
    if (!ref) continue;
    fileRefs.push({ row, ref });
  }

  // 3) 下载（去重在 downloadInBatches 内部完成）
  const allRefs = [...artworkRefs.map((e) => e.ref), ...fileRefs.map((e) => e.ref)];
  const assetCache = await downloadInBatches(supabase, allRefs);

  // 4) 组装 ZIP：拆 artworks/ 与 files/ 子目录
  const zip = new JSZip();
  const artworksFolder = zip.folder('artworks');
  const filesFolder = zip.folder('files');
  if (!artworksFolder || !filesFolder) {
    throw new Error('jszip: failed to create artworks/ or files/ folder');
  }

  let packedThumbnails = 0;
  let packedFiles = 0;
  const refOf = (r: StorageRef) => `${r.bucket}/${r.path}`;

  // 4a) artworks.thumbnail_url → artworks/{artwork_id}.{ext}
  const rewrittenArtworkRows: ArtworkRow[] = artworkRows.map((row) => {
    const entry = artworkRefs.find((e) => e.row.id === row.id);
    if (!entry) return row;
    const asset = assetCache.get(refOf(entry.ref));
    if (!asset) return row; // 下载失败 → 保留原 thumbnail_url

    const ext = pickExtension(entry.ref.path, null, asset.contentType);
    const zipPath = `${row.id}.${ext}`;
    artworksFolder.file(zipPath, asset.buffer);
    packedThumbnails += 1;

    return {
      ...row,
      thumbnail_url: `artworks/${zipPath}`,
      _original_thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : undefined,
    };
  });

  // 4b) edition_files (source_type='upload') → files/{file_id}.{ext}
  //     不限 file_type —— image / pdf / document 全部入 ZIP。
  //     source_type='link' 行不改 file_url。
  const rewrittenFileRows: EditionFileRow[] = fileRows.map((row) => {
    if (row.source_type !== 'upload') return row;
    const entry = fileRefs.find((e) => e.row.id === row.id);
    if (!entry) return row;
    const asset = assetCache.get(refOf(entry.ref));
    if (!asset) return row;

    const ext = pickExtension(entry.ref.path, row.file_name, asset.contentType);
    const zipPath = `${row.id}.${ext}`;
    filesFolder.file(zipPath, asset.buffer);
    packedFiles += 1;

    return {
      ...row,
      file_url: `files/${zipPath}`,
      _original_url: row.file_url,
    };
  });

  // 5) Stats
  const stats: BackupStats = {
    artworks: artworkRows.length,
    editions: Array.isArray(data.editions) ? data.editions.length : 0,
    edition_files: fileRows.length,
    edition_history: Array.isArray(data.edition_history) ? data.edition_history.length : 0,
    locations: Array.isArray(data.locations) ? data.locations.length : 0,
    gallery_links: Array.isArray(data.gallery_links) ? data.gallery_links.length : 0,
    api_keys: Array.isArray(data.api_keys) ? data.api_keys.length : 0,
  };

  // 6) Manifest（total_size_bytes 暂填 0，generateAsync 完成后回填）
  //    image_count 现在含义 = ZIP 内所有 binary asset 总数（artworks + edition_files 上传类合计）。
  //    旧 v1 备份语义只含 image；新备份语义扩展为含 pdf/doc 等。format_version 不 bump，
  //    parser 仍按必填字段校验。
  const manifest: BackupManifest = {
    backup_format_version: BACKUP_FORMAT_VERSION,
    db_schema_version: DB_SCHEMA_VERSION,
    user_id: userId,
    user_email: userEmail,
    created_at: new Date().toISOString(),
    stats,
    image_count: packedThumbnails + packedFiles,
    total_size_bytes: 0,
  };

  // 7) data.json: 完整快照（artworks + edition_files 已重写）
  const dataPayload = {
    ...data,
    artworks: rewrittenArtworkRows,
    edition_files: rewrittenFileRows,
  };

  zip.file('data.json', JSON.stringify(dataPayload, null, 2));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 第一轮 generateAsync 拿到 size
  const tempBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  manifest.total_size_bytes = tempBuffer.byteLength;

  // 回填 manifest.json 并重新生成（保证 manifest.total_size_bytes 与 ZIP 实际大小一致）
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return { buffer, manifest: { ...manifest, total_size_bytes: buffer.byteLength } };
}
