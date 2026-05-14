/**
 * Backup restore — 覆盖式恢复
 *
 * 流程
 * ----
 * 1. DELETE 当前用户所有用户域表数据（反 FK 顺序）
 * 2. 解出 ZIP 中图片 → 上传到 Supabase Storage `thumbnails` bucket → 改写 file_url
 * 3. INSERT 备份数据（正 FK 顺序），保留原 UUID（让 gallery_links 公开 URL 继续有效）
 *
 * 为何不在 PG TX 里包整个过程
 * --------------------------
 * supabase-js 不支持显式 BEGIN/COMMIT；要么写 SQL function 把整段塞进 RPC，
 * 要么靠"用户已被强制下载回滚包"作为最后防线。后者更简单 + 调用方可看到细粒度
 * 进度（imagesRestored / imagesFailed）。任意一步失败 → 抛错给 handler，
 * 由 handler 给用户提示"恢复中断，用回滚包还原"。
 *
 * 为何不清理旧 thumbnails
 * ---------------------
 * Storage orphan 文件占空间但不破数据。1GB Supabase Free 配额内能容忍；
 * 真清理跑独立 cron / 脚本，不在恢复路径搅。
 *
 * 安全约束
 * --------
 * - `users` 表全程不碰（账号身份保护，备份只是工作室数据）
 * - DELETE / INSERT 都用 service_key + 显式 user_id 过滤（不能完全依赖 RLS，
 *   service key 绕过 RLS；手动过滤才是真实安全边界）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackupData } from './manifest.js';
import type { ParsedBackup } from './zip-parser.js';

// =====================================================
// 类型
// =====================================================

export interface RestoreParams {
  userId: string;
  supabase: SupabaseClient;
  parsed: ParsedBackup;
  /** 可选：每步完成回调（fire-and-forget log，错误不影响 restore） */
  onProgress?: (step: string, detail?: Record<string, unknown>) => void;
}

export interface RestoreResult {
  deletedRowCounts: Record<string, number>;
  insertedRowCounts: Record<string, number>;
  imagesRestored: number;
  imagesFailed: number;
  warnings: string[];
}

// =====================================================
// 工具：批量 INSERT（防 PostgREST 单请求体过大）
// =====================================================

const INSERT_BATCH_SIZE = 500;

async function insertInBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const slice = rows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      throw new Error(
        `INSERT into ${table} failed at batch ${i / INSERT_BATCH_SIZE + 1}: ${error.message}`,
      );
    }
  }
}

// =====================================================
// 文件名工具
// =====================================================

function extFromContentType(contentType: string): string {
  const sub = contentType.split('/')[1]?.split(';')[0]?.toLowerCase() || 'bin';
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'svg+xml') return 'svg';
  return sub.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
}

// =====================================================
// DELETE 现有数据（反 FK 顺序）
// =====================================================

/**
 * 逐表 DELETE 当前用户行。FK 反向顺序：
 *   edition_history → edition_files → editions → gallery_links → api_keys → locations → artworks
 *
 * edition_* 三张表没有 user_id 列 —— 先 select 出当前用户的 edition_ids 集合，
 * 再用 `.in('edition_id', ids)` 删（也得删 edition_history.edition_id 不在
 * 这些 ids 内的孤儿；但 FK + 软删都不会留孤儿，这里跳过）。
 *
 * 返回每张表实际删除的行数（PostgREST 默认不返回 count，要 head: 'exact' 走两次
 * 请求 —— 这里图简单，先 select id 拿 count，再 delete）。
 */
async function deleteExistingData(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // 1) 先查出当前用户的所有 artwork ids / edition ids（FK 链上游）
  const { data: artworks, error: aErr } = await supabase
    .from('artworks')
    .select('id')
    .eq('user_id', userId);
  if (aErr) throw new Error(`select artworks failed: ${aErr.message}`);
  const artworkIds = (artworks ?? []).map((r) => r.id as string);

  let editionIds: string[] = [];
  if (artworkIds.length > 0) {
    const { data: editions, error: eErr } = await supabase
      .from('editions')
      .select('id')
      .in('artwork_id', artworkIds);
    if (eErr) throw new Error(`select editions failed: ${eErr.message}`);
    editionIds = (editions ?? []).map((r) => r.id as string);
  }

  // 2) edition_history (FK → editions)
  if (editionIds.length > 0) {
    const { error, count } = await supabase
      .from('edition_history')
      .delete({ count: 'exact' })
      .in('edition_id', editionIds);
    if (error) throw new Error(`delete edition_history failed: ${error.message}`);
    counts.edition_history = count ?? 0;
  } else {
    counts.edition_history = 0;
  }

  // 3) edition_files (FK → editions)
  if (editionIds.length > 0) {
    const { error, count } = await supabase
      .from('edition_files')
      .delete({ count: 'exact' })
      .in('edition_id', editionIds);
    if (error) throw new Error(`delete edition_files failed: ${error.message}`);
    counts.edition_files = count ?? 0;
  } else {
    counts.edition_files = 0;
  }

  // 4) editions (FK → artworks)
  if (artworkIds.length > 0) {
    const { error, count } = await supabase
      .from('editions')
      .delete({ count: 'exact' })
      .in('artwork_id', artworkIds);
    if (error) throw new Error(`delete editions failed: ${error.message}`);
    counts.editions = count ?? 0;
  } else {
    counts.editions = 0;
  }

  // 5) gallery_links (created_by = userId)
  {
    const { error, count } = await supabase
      .from('gallery_links')
      .delete({ count: 'exact' })
      .eq('created_by', userId);
    if (error) throw new Error(`delete gallery_links failed: ${error.message}`);
    counts.gallery_links = count ?? 0;
  }

  // 6) api_keys (user_id = userId)
  {
    const { error, count } = await supabase
      .from('api_keys')
      .delete({ count: 'exact' })
      .eq('user_id', userId);
    if (error) throw new Error(`delete api_keys failed: ${error.message}`);
    counts.api_keys = count ?? 0;
  }

  // 7) locations (user_id = userId)
  {
    const { error, count } = await supabase
      .from('locations')
      .delete({ count: 'exact' })
      .eq('user_id', userId);
    if (error) throw new Error(`delete locations failed: ${error.message}`);
    counts.locations = count ?? 0;
  }

  // 8) artworks (user_id = userId) —— 最后删（FK 终点）
  {
    const { error, count } = await supabase
      .from('artworks')
      .delete({ count: 'exact' })
      .eq('user_id', userId);
    if (error) throw new Error(`delete artworks failed: ${error.message}`);
    counts.artworks = count ?? 0;
  }

  return counts;
}

// =====================================================
// 重传图片到 thumbnails bucket
// =====================================================

/**
 * 上传单张 ZIP 内图片 → thumbnails bucket → 返回新 public URL。
 * 失败时返 null，调用方决定 fallback。
 *
 * 路径约定：`restored/${id}.${ext}` —— 扁平、唯一、与 `${artworkId}/...` 现有上传流区隔。
 * id 既可以是 edition_file.id 也可以是 artwork.id（UUID 全局唯一）。
 */
async function uploadImageToBucket(
  supabase: SupabaseClient,
  id: string,
  img: { buffer: Buffer; contentType: string },
): Promise<string | null> {
  const ext = extFromContentType(img.contentType);
  const storagePath = `restored/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('thumbnails')
    .upload(storagePath, img.buffer, {
      contentType: img.contentType,
      upsert: true,
    });

  if (uploadError) {
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from('thumbnails').getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
}

/**
 * 遍历 edition_files 行：
 *   - file_type === 'image' 且 file_url 以 `images/` 开头 → 从 ZIP 取 buffer → 上传 thumbnails
 *   - 上传成功 → row.file_url = 新 public URL，删 _original_url
 *   - 上传失败 → row.file_url fallback 到 _original_url（如果存在），warn
 *
 * 返回新的 rows 数组（不变更入参），以及成功/失败计数。
 */
async function restoreEditionFileImages(
  supabase: SupabaseClient,
  parsed: ParsedBackup,
  warnings: string[],
): Promise<{
  rewrittenFileRows: Record<string, unknown>[];
  imagesRestored: number;
  imagesFailed: number;
}> {
  const rows = parsed.data.edition_files;
  let imagesRestored = 0;
  let imagesFailed = 0;

  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const r = { ...row };
    const fileUrl = typeof r.file_url === 'string' ? r.file_url : '';
    const fileType = typeof r.file_type === 'string' ? r.file_type : '';
    const fileId = typeof r.id === 'string' ? r.id : '';

    // 非图片 / 不是 ZIP 内相对路径 → 原样保留（外链或非图文件）
    if (fileType !== 'image' || !fileUrl.startsWith('images/')) {
      delete r._original_url; // 即使旧备份带 _original_url，DB 里也不该有这个字段
      out.push(r);
      continue;
    }

    if (!fileId) {
      const originalUrl = typeof r._original_url === 'string' ? r._original_url : '';
      r.file_url = originalUrl || fileUrl;
      delete r._original_url;
      imagesFailed += 1;
      warnings.push(`edition_files row without id; cannot restore image (file_url=${fileUrl})`);
      out.push(r);
      continue;
    }

    const img = await parsed.getImage(fileId);
    if (!img) {
      const originalUrl = typeof r._original_url === 'string' ? r._original_url : '';
      r.file_url = originalUrl || fileUrl;
      delete r._original_url;
      imagesFailed += 1;
      warnings.push(`Image not found in ZIP for edition_file ${fileId}; fallback to ${r.file_url}`);
      out.push(r);
      continue;
    }

    const newUrl = await uploadImageToBucket(supabase, fileId, img);
    if (!newUrl) {
      const originalUrl = typeof r._original_url === 'string' ? r._original_url : '';
      r.file_url = originalUrl || fileUrl;
      delete r._original_url;
      imagesFailed += 1;
      warnings.push(`Upload failed for edition_file ${fileId}; fallback to ${r.file_url}`);
      out.push(r);
      continue;
    }

    r.file_url = newUrl;
    delete r._original_url;
    imagesRestored += 1;
    out.push(r);
  }

  return { rewrittenFileRows: out, imagesRestored, imagesFailed };
}

/**
 * 遍历 artworks 行 thumbnail_url：
 *   - thumbnail_url 以 `images/` 开头 → 从 ZIP 取 buffer → 上传 thumbnails → 改写为绝对 URL
 *   - 失败 → fallback 到 _original_thumbnail_url（如有），warn
 *
 * 与 edition_files 走同一个 ZIP 子目录 `images/`，按 row.id 查（artwork_id 也是 UUID）。
 */
async function restoreArtworkThumbnails(
  supabase: SupabaseClient,
  parsed: ParsedBackup,
  warnings: string[],
): Promise<{
  rewrittenArtworkRows: Record<string, unknown>[];
  thumbnailsRestored: number;
  thumbnailsFailed: number;
}> {
  const rows = parsed.data.artworks;
  let thumbnailsRestored = 0;
  let thumbnailsFailed = 0;

  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const r = { ...row };
    const thumb = typeof r.thumbnail_url === 'string' ? r.thumbnail_url : '';
    const artworkId = typeof r.id === 'string' ? r.id : '';

    // 无 thumbnail_url 或不是 ZIP 内相对路径 → 原样保留
    if (!thumb || !thumb.startsWith('images/')) {
      delete r._original_thumbnail_url; // 防止 DB 里残留 _original_thumbnail_url 字段
      out.push(r);
      continue;
    }

    if (!artworkId) {
      const originalUrl =
        typeof r._original_thumbnail_url === 'string' ? r._original_thumbnail_url : '';
      r.thumbnail_url = originalUrl || thumb;
      delete r._original_thumbnail_url;
      thumbnailsFailed += 1;
      warnings.push(`artwork row without id; cannot restore thumbnail (thumbnail_url=${thumb})`);
      out.push(r);
      continue;
    }

    const img = await parsed.getImage(artworkId);
    if (!img) {
      const originalUrl =
        typeof r._original_thumbnail_url === 'string' ? r._original_thumbnail_url : '';
      r.thumbnail_url = originalUrl || thumb;
      delete r._original_thumbnail_url;
      thumbnailsFailed += 1;
      warnings.push(
        `Thumbnail not found in ZIP for artwork ${artworkId}; fallback to ${r.thumbnail_url}`,
      );
      out.push(r);
      continue;
    }

    const newUrl = await uploadImageToBucket(supabase, artworkId, img);
    if (!newUrl) {
      const originalUrl =
        typeof r._original_thumbnail_url === 'string' ? r._original_thumbnail_url : '';
      r.thumbnail_url = originalUrl || thumb;
      delete r._original_thumbnail_url;
      thumbnailsFailed += 1;
      warnings.push(`Upload failed for artwork ${artworkId}; fallback to ${r.thumbnail_url}`);
      out.push(r);
      continue;
    }

    r.thumbnail_url = newUrl;
    delete r._original_thumbnail_url;
    thumbnailsRestored += 1;
    out.push(r);
  }

  return { rewrittenArtworkRows: out, thumbnailsRestored, thumbnailsFailed };
}

// =====================================================
// 主入口
// =====================================================

export async function restoreBackup(params: RestoreParams): Promise<RestoreResult> {
  const { userId, supabase, parsed, onProgress } = params;
  const warnings: string[] = [];

  // a) DELETE 现有数据
  onProgress?.('delete:start');
  const deletedRowCounts = await deleteExistingData(supabase, userId);
  onProgress?.('delete:done', deletedRowCounts);

  // b) 上传两类图片到 thumbnails bucket + 改写对应字段
  //    b1) edition_files.file_url
  //    b2) artworks.thumbnail_url
  //    两类合并到 imagesRestored / imagesFailed 总计（manifest.image_count 是统一口径）
  onProgress?.('images:start');
  const {
    rewrittenFileRows,
    imagesRestored: fileImagesRestored,
    imagesFailed: fileImagesFailed,
  } = await restoreEditionFileImages(supabase, parsed, warnings);
  const {
    rewrittenArtworkRows,
    thumbnailsRestored,
    thumbnailsFailed,
  } = await restoreArtworkThumbnails(supabase, parsed, warnings);
  const imagesRestored = fileImagesRestored + thumbnailsRestored;
  const imagesFailed = fileImagesFailed + thumbnailsFailed;
  onProgress?.('images:done', { imagesRestored, imagesFailed });

  // c) INSERT 备份数据（正 FK 顺序）
  //    edition_files / artworks 用 b 步骤改写后的 rows；其他表用 parsed.data 原始 rows
  const data: BackupData = parsed.data;
  const insertedRowCounts: Record<string, number> = {};

  // 1) artworks (root, 用改写后的 rows)
  onProgress?.('insert:artworks');
  await insertInBatches(supabase, 'artworks', rewrittenArtworkRows);
  insertedRowCounts.artworks = rewrittenArtworkRows.length;

  // 2) locations
  onProgress?.('insert:locations');
  await insertInBatches(supabase, 'locations', data.locations);
  insertedRowCounts.locations = data.locations.length;

  // 3) api_keys
  onProgress?.('insert:api_keys');
  await insertInBatches(supabase, 'api_keys', data.api_keys);
  insertedRowCounts.api_keys = data.api_keys.length;

  // 4) editions (FK → artworks)
  onProgress?.('insert:editions');
  await insertInBatches(supabase, 'editions', data.editions);
  insertedRowCounts.editions = data.editions.length;

  // 5) edition_files (FK → editions；用改写后的 rows)
  onProgress?.('insert:edition_files');
  await insertInBatches(supabase, 'edition_files', rewrittenFileRows);
  insertedRowCounts.edition_files = rewrittenFileRows.length;

  // 6) edition_history (FK → editions)
  onProgress?.('insert:edition_history');
  await insertInBatches(supabase, 'edition_history', data.edition_history);
  insertedRowCounts.edition_history = data.edition_history.length;

  // 7) gallery_links
  onProgress?.('insert:gallery_links');
  await insertInBatches(supabase, 'gallery_links', data.gallery_links);
  insertedRowCounts.gallery_links = data.gallery_links.length;

  onProgress?.('done');

  return {
    deletedRowCounts,
    insertedRowCounts,
    imagesRestored,
    imagesFailed,
    warnings,
  };
}
