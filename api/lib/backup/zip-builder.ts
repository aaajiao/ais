/**
 * Backup ZIP builder
 *
 * 流程
 * ----
 * 1. 调 RPC `public.backup_snapshot(p_user_id)` 拿到跨表一致性 jsonb 快照
 *    （单事务内所有 SELECT 共享同一 snapshot，避免 supabase-js 多请求间的脏读）。
 * 2. 收集两类图片 URL 一起并发下载（batch size = 5，与 api/export/pdf.ts:414 对齐）：
 *      - `edition_files.file_url`（仅 file_type='image'，且 file_url 可能是相对路径
 *        或绝对 URL —— 见下方 "URL 形态" 说明）
 *      - `artworks.thumbnail_url`（前端列表/详情显示的作品主图，全部用绝对 URL）
 * 3. 重写两张表的行：
 *      - edition_files: `file_url` → `images/{file_id}.{ext}`，原 URL 保留到 `_original_url`
 *      - artworks: `thumbnail_url` → `images/{artwork_id}.{ext}`，原 URL 保留到
 *        `_original_thumbnail_url`
 *      ZIP 内文件命名都是 UUID，artwork_id 与 file_id 命名空间天然不冲突，
 *      平铺到一个 `images/` 子目录。
 * 4. 用 jszip 组装 ZIP：manifest.json + data.json + images/{id}.{ext}
 * 5. 返回 `{ buffer, manifest }`（jszip nodebuffer 模式，内存全打包）。
 *
 * URL 形态：相对路径 vs 绝对 URL
 * ------------------------------
 * `edition_files.file_url` 是历史遗留双形态：
 *   - 老数据：相对路径 `{edition_id}/{uuid}_filename.png`（早期上传流写入）
 *   - 新数据：绝对 URL `https://{ref}.supabase.co/storage/v1/object/public/thumbnails/...`
 * `artworks.thumbnail_url` 目前观察都是绝对 URL，但为防御性兼容也走同一 resolver。
 * `resolveToAbsoluteUrl()` 统一处理：绝对 URL 原样返；相对路径拼上
 * `${SUPABASE_URL}/storage/v1/object/public/thumbnails/` 前缀。
 *
 * 注意
 * ----
 * - Pro 计划 maxDuration 300s 够用：100 件作品 / 几百张图片 / 顺序串行批量并发都在范围内。
 * - 这里**不复用** api/export/pdf.ts 的 fetchImagesInBatches —— 那个返回 base64
 *   data URL（PDF 嵌入用），我们要原始二进制 Buffer。两条路径同模式不同 payload，
 *   保持职责分离。
 * - 软删行（artworks.deleted_at IS NOT NULL）也进备份 —— RPC 函数没过滤
 *   deleted_at，恢复时保留软删状态。
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
  // 写入 ZIP 时附加：保留原始外链 URL，导入端可决定是回填还是重传
  _original_url?: string;
}

interface ArtworkRow {
  id: string;
  thumbnail_url?: string | null;
  // 写入 ZIP 时附加：保留原始 thumbnail URL，restore 时若 ZIP 内图片缺失走 fallback
  _original_thumbnail_url?: string;
  // 其他字段保持透明，restore 时整行回写
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
// URL 形态归一：相对路径 → 绝对 Storage URL；绝对 URL 原样
// =====================================================

const THUMBNAILS_BUCKET = 'thumbnails';

function getSupabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_URL in environment');
  }
  return url.replace(/\/+$/, '');
}

/**
 * 把可能是相对路径的 file_url / thumbnail_url 归一成绝对 https URL。
 *   - 已经是 http(s):// 开头：原样返回（已是 Storage public URL 或外链）
 *   - 否则：当作 `${THUMBNAILS_BUCKET}/${path}` 拼出 public URL
 *     —— 项目当前唯一的公开图片 bucket 就是 thumbnails，老相对路径都属于这里
 */
export function resolveToAbsoluteUrl(raw: string): string {
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getSupabaseUrl();
  const cleaned = raw.replace(/^\/+/, '');
  return `${base}/storage/v1/object/public/${THUMBNAILS_BUCKET}/${cleaned}`;
}

// =====================================================
// 图片下载（仿 fetchImagesInBatches，但返回 Buffer 而非 base64）
// =====================================================

interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
}

async function fetchImageBuffer(url: string, timeoutMs = 10000): Promise<DownloadedImage | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'image/jpeg',
    };
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'AbortError') {
      console.error(`[Backup ZIP] Image fetch timeout: ${url}`);
    } else {
      console.error('[Backup ZIP] Failed to fetch image:', (error as Error).message);
    }
    return null;
  }
}

/**
 * 分批并发下载图片（batch size 5），与 api/export/pdf.ts:414 模式对齐。
 * 失败的 URL 不进结果 Map —— 调用方据此决定怎么重写 file_url。
 */
async function fetchImagesInBatches(
  urls: string[],
  batchSize = 5,
): Promise<Map<string, DownloadedImage>> {
  const cache = new Map<string, DownloadedImage>();

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => {
        const img = await fetchImageBuffer(url);
        return { url, img };
      }),
    );
    for (const { url, img } of results) {
      if (img) cache.set(url, img);
    }
  }

  return cache;
}

// =====================================================
// 文件名工具
// =====================================================

/**
 * 从 URL 提取扩展名（无 query），fallback 到 contentType。
 * 安全输出 lowercase ASCII，仅取首段（防 `.tar.gz` 之类的多段误判）。
 */
function extractExtension(url: string, contentType: string): string {
  try {
    const pathname = new URL(url).pathname;
    const idx = pathname.lastIndexOf('.');
    if (idx >= 0 && idx < pathname.length - 1) {
      const ext = pathname.slice(idx + 1).toLowerCase();
      // 只保留 a-z0-9，最多 5 字符（防奇异 path）
      const clean = ext.replace(/[^a-z0-9]/g, '').slice(0, 5);
      if (clean) return clean;
    }
  } catch {
    /* fallthrough */
  }

  // fallback: contentType 末段
  const sub = contentType.split('/')[1]?.toLowerCase() || 'bin';
  // image/jpeg → jpg
  if (sub === 'jpeg') return 'jpg';
  return sub.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
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
 * @param supabase  service-role Supabase client（绕过 RLS）
 */
export async function buildBackupZip(
  userId: string,
  userEmail: string,
  supabase: SupabaseClient,
): Promise<BuildBackupZipResult> {
  // 1) 跨表一致性快照（单事务 RPC）
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

  // 2) 收集两类图片 URL：
  //    a) edition_files (file_type='image' 且 file_url 非空)
  //    b) artworks.thumbnail_url（前端列表/详情主图）
  //    file_url 可能是相对 Storage 路径，先 resolveToAbsoluteUrl 归一成绝对 URL 再 fetch。
  const fileRows: EditionFileRow[] = Array.isArray(data.edition_files) ? data.edition_files : [];
  const artworkRows: ArtworkRow[] = Array.isArray(data.artworks) ? data.artworks : [];

  const imageFileRows = fileRows.filter(
    (f) => f.file_type === 'image' && typeof f.file_url === 'string' && f.file_url.length > 0,
  );
  const thumbArtworkRows = artworkRows.filter(
    (a) => typeof a.thumbnail_url === 'string' && a.thumbnail_url.length > 0,
  );

  // 收集所有需要下载的绝对 URL（去重）
  const urlSet = new Set<string>();
  for (const f of imageFileRows) urlSet.add(resolveToAbsoluteUrl(f.file_url));
  for (const a of thumbArtworkRows) urlSet.add(resolveToAbsoluteUrl(a.thumbnail_url as string));
  const uniqueUrls = [...urlSet];

  const imageCache = await fetchImagesInBatches(uniqueUrls);

  // 3) 重写两张表的图片字段：
  //    - 成功下载 → file_url / thumbnail_url 改 `images/{id}.{ext}`，原 URL 存 _original*
  //    - 失败 → 字段保持原值（restore 时若也找不到 ZIP buffer，落到 fallback 原 URL）
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  if (!imagesFolder) {
    throw new Error('jszip: failed to create images/ folder');
  }

  let packedImageCount = 0;
  let packedThumbCount = 0;

  // 3a) edition_files
  const rewrittenFileRows: EditionFileRow[] = fileRows.map((row) => {
    if (row.file_type !== 'image') return row;
    const absUrl = resolveToAbsoluteUrl(row.file_url);
    const img = imageCache.get(absUrl);
    if (!img) return row; // 下载失败 → 保留原 file_url

    const ext = extractExtension(absUrl, img.contentType);
    const zipPath = `${row.id}.${ext}`;
    imagesFolder.file(zipPath, img.buffer);
    packedImageCount += 1;

    return {
      ...row,
      file_url: `images/${zipPath}`,
      _original_url: row.file_url,
    };
  });

  // 3b) artworks.thumbnail_url
  const rewrittenArtworkRows: ArtworkRow[] = artworkRows.map((row) => {
    const thumb = row.thumbnail_url;
    if (typeof thumb !== 'string' || thumb.length === 0) return row;
    const absUrl = resolveToAbsoluteUrl(thumb);
    const img = imageCache.get(absUrl);
    if (!img) return row; // 下载失败 → 保留原 thumbnail_url

    const ext = extractExtension(absUrl, img.contentType);
    const zipPath = `${row.id}.${ext}`;
    // artwork_id 与 file_id 都是 UUID，同一 images/ 子目录命名空间不冲突
    imagesFolder.file(zipPath, img.buffer);
    packedThumbCount += 1;

    return {
      ...row,
      thumbnail_url: `images/${zipPath}`,
      _original_thumbnail_url: thumb,
    };
  });

  // 4) Stats
  const stats: BackupStats = {
    artworks: Array.isArray(data.artworks) ? data.artworks.length : 0,
    editions: Array.isArray(data.editions) ? data.editions.length : 0,
    edition_files: fileRows.length,
    edition_history: Array.isArray(data.edition_history) ? data.edition_history.length : 0,
    locations: Array.isArray(data.locations) ? data.locations.length : 0,
    gallery_links: Array.isArray(data.gallery_links) ? data.gallery_links.length : 0,
    api_keys: Array.isArray(data.api_keys) ? data.api_keys.length : 0,
  };

  // 5) Manifest（total_size_bytes 暂填 0，generateAsync 完成后回填）
  //    image_count 同时含 edition_files 图片 + artworks thumbnail（两条路径合计）
  const manifest: BackupManifest = {
    backup_format_version: BACKUP_FORMAT_VERSION,
    db_schema_version: DB_SCHEMA_VERSION,
    user_id: userId,
    user_email: userEmail,
    created_at: new Date().toISOString(),
    stats,
    image_count: packedImageCount + packedThumbCount,
    total_size_bytes: 0,
  };

  // 6) data.json: 完整快照（edition_files + artworks 已重写）
  const dataPayload = {
    ...data,
    artworks: rewrittenArtworkRows,
    edition_files: rewrittenFileRows,
  };

  // 7) 先写 data.json，再生成 buffer 拿 size，最后回填 manifest.total_size_bytes 写 manifest.json
  //    顺序：jszip 不保证 entry 顺序与添加顺序一致，但读取端无依赖（按 name 取）
  zip.file('data.json', JSON.stringify(dataPayload, null, 2));

  // 临时 manifest（先放进去占位，最后用 buffer.byteLength 回写一次）
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 第一轮 generateAsync 拿到 size
  const tempBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  manifest.total_size_bytes = tempBuffer.byteLength;

  // 回填 manifest.json 并重新生成（保证 manifest.total_size_bytes 与 ZIP 实际大小一致）
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  // total_size_bytes 是"包含含 size 字段的 manifest 的 ZIP"大小。第二轮 buffer 可能比
  // 第一轮多出几个字节（manifest.total_size_bytes 由 0 变成实际值），可接受 ——
  // 调用方依赖的 sizeBytes（返回给前端展示 + DB 存）我们用第二轮 buffer.byteLength 重赋。
  return { buffer, manifest: { ...manifest, total_size_bytes: buffer.byteLength } };
}
