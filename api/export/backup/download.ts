/**
 * 工作室数据备份 — 下载 endpoint
 *
 * 入口
 * ----
 * GET /api/export/backup/download
 * Authorization: Bearer <supabase session token>
 *
 * 为什么是 Function 中转而不是直接给 blob URL
 * ----------------------------------------
 * Blob store 是 Private —— 直接访问 blob URL 返 401，必须带 Authorization Bearer
 * <BLOB_READ_WRITE_TOKEN>。我们绝不能把这个 token 暴露给浏览器。所以下载流程：
 *   verifyAuth → list() 找出该用户的 blob URL → fetch with token → stream to client。
 * 每次访问都过 verifyAuth，与项目其它敏感 endpoint 同安全边界。
 *
 * @vercel/blob v2.3.3 API 限制
 * ---------------------------
 * 当前 SDK 版本**没有** `get()` 函数（docs 写有但未发布）。下载内容靠 fetch blob URL +
 * 手动加 Authorization 头实现。`list({ prefix })` 返回结果含 `url`（私有 store 是
 * `xxx.private.blob.vercel-storage.com/...`），fetch 该 URL 时带 token 才能拉到内容。
 *
 * 流程
 * ----
 * 1. verifyAuth → userId
 * 2. list({ prefix: 'backups/${userId}/', limit: 1 }) 找最新备份；空 → 404 `{ error: 'no_backup' }`
 *    前端 settings 页据此提示"还没生成过备份，点'立即备份'触发一次"
 * 3. fetch(blobUrl, { Authorization: Bearer <token> }) → 拿 Response
 *    upstream.body 是 web ReadableStream
 * 4. 设响应 header（必须在 stream pipe 之前）：
 *      Content-Type: application/zip
 *      Content-Disposition: attachment; filename="aaajiao-backup-YYYY-MM-DD.zip"
 *      Content-Length（如果 upstream 给了）
 *      Cache-Control: no-store, private（防浏览器 / 中间缓存）
 * 5. Stream → Vercel response（用 Readable.fromWeb 桥接 web stream → node stream）
 * 6. 完成后更新 users.last_backup_downloaded_at = now()
 *    （Phase 3 14 天提醒卡片靠这个字段判断"上次实际拿走时间"）
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { list } from '@vercel/blob';
import { Readable } from 'node:stream';
import { verifyAuth } from '../../lib/auth.js';
import { getBackupBlobPath, getBackupDownloadFilename } from '../../lib/backup/storage.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_KEY or VITE_SUPABASE_URL');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET 是 idiomatic 浏览器下载方式；POST 同样接受（前端某些情况想避免预检 / 历史记录）
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth.success) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  const userId = auth.userId!;
  const blobPath = getBackupBlobPath(userId);

  // 1) 查找该用户的备份 blob —— list 用 pathname 前缀找 URL（v2.3.3 SDK 没有 head-by-pathname）
  //    单 slot 设计：list 命中要么 0 条要么 1 条
  let blobUrl: string;
  try {
    const { blobs } = await list({
      prefix: blobPath, // 完整 pathname 当 prefix，精确命中单 slot
      limit: 1,
    });

    if (blobs.length === 0) {
      // 前端 settings 页据此提示"还没生成过备份"
      return res.status(404).json({ error: 'no_backup' });
    }

    blobUrl = blobs[0].url;
  } catch (err) {
    console.error('[Backup Download] list failed:', err);
    return res.status(500).json({ error: (err as Error).message });
  }

  // 2) Fetch blob 内容 —— 私有 store 必须带 token，SDK 不替我们做（v2.3.3 没 get()）
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('[Backup Download] BLOB_READ_WRITE_TOKEN not configured');
    return res.status(500).json({ error: 'Blob store not configured' });
  }

  let upstream: Response;
  try {
    upstream = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error('[Backup Download] fetch blob failed:', err);
    return res.status(502).json({ error: (err as Error).message });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(
      `[Backup Download] upstream not ok: status=${upstream.status} body=${!!upstream.body}`,
    );
    return res
      .status(502)
      .json({ error: `Blob fetch failed: HTTP ${upstream.status}` });
  }

  // 3) 设响应 header（必须在 pipe 之前）
  const filename = getBackupDownloadFilename();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // private + no-store: 防浏览器 / 中间缓存敏感数据
  res.setHeader('Cache-Control', 'no-store, private');

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  // 4) Pipe web stream → Node res
  const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);

  // 5) 完成后更新 last_backup_downloaded_at（fire-and-forget；下载失败时不要写）
  nodeStream.on('end', () => {
    void (async () => {
      try {
        const supabase = getServiceClient();
        const { error } = await supabase
          .from('users')
          .update({ last_backup_downloaded_at: new Date().toISOString() })
          .eq('id', userId);
        if (error) {
          console.warn(
            `[Backup Download] last_backup_downloaded_at update failed for user=${userId}: ${error.message}`,
          );
        }
      } catch (err) {
        console.warn(
          `[Backup Download] downloaded_at update threw for user=${userId}:`,
          (err as Error).message,
        );
      }
    })();
  });

  nodeStream.on('error', (err) => {
    console.error(`[Backup Download] stream error for user=${userId}:`, err);
    // 已经发了 header，不能再换 status；交给 client 看到截断的 ZIP 判失败
    res.destroy(err);
  });

  nodeStream.pipe(res);
}
