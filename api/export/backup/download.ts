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
 *   verifyAuth → get() 读取该用户的精确 pathname → stream to client。
 * 每次访问都过 verifyAuth，与项目其它敏感 endpoint 同安全边界。
 *
 * 流程
 * ----
 * 1. verifyAuth → userId
 * 2. get(blobPath, { access: 'private', useCache: false }) 读最新备份；空 → 404 `{ error: 'no_backup' }`
 *    前端 settings 页据此提示"还没生成过备份，点'立即备份'触发一次"
 * 3. SDK 自动携带服务端凭据，upstream.stream 是 web ReadableStream
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
import { get } from '@vercel/blob';
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

  // 精确 pathname 取代旧版 list + fetch workaround；单 slot 覆盖后必须绕过缓存。
  let upstream: Awaited<ReturnType<typeof get>>;
  try {
    upstream = await get(blobPath, {
      access: 'private',
      useCache: false,
    });
  } catch (err) {
    console.error('[Backup Download] fetch blob failed:', err);
    return res.status(502).json({ error: (err as Error).message });
  }

  if (!upstream) {
    return res.status(404).json({ error: 'no_backup' });
  }

  if (upstream.statusCode !== 200 || !upstream.stream) {
    console.error(
      `[Backup Download] upstream not ok: status=${upstream.statusCode} body=${!!upstream.stream}`,
    );
    return res
      .status(502)
      .json({ error: `Blob fetch failed: HTTP ${upstream.statusCode}` });
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
  const nodeStream = Readable.fromWeb(upstream.stream as Parameters<typeof Readable.fromWeb>[0]);

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
