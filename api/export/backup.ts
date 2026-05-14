/**
 * 工作室数据备份 — 手动导出 endpoint
 *
 * 入口
 * ----
 * POST /api/export/backup
 * Authorization: Bearer <supabase session token>
 *
 * 行为
 * ----
 * 1. verifyAuth → 拿 userId + userEmail
 * 2. buildBackupZip → 拉一致性快照 + 下载图片 + 组装 ZIP buffer（in-memory）
 * 3. put(...) 到 Vercel Blob 的 private store，路径 `backups/${userId}/latest.zip`，
 *    allowOverwrite=true + addRandomSuffix=false（每用户单 slot，cron 覆盖语义）
 * 4. 更新 users 表：last_backup_at / last_backup_size_bytes / last_backup_stats
 * 5. 返回 JSON `{ manifest, sizeBytes, downloadEndpoint }`
 *    前端拿 downloadEndpoint 调 /api/export/backup/download 拉文件（不返回 URL）
 *
 * 存储后端：为何 Vercel Blob 而非 Supabase Storage
 * --------------------------------------------
 * 用户的 Supabase 是 Free 计划（单文件 50MB 上限），完整快照可能 ~340MB；
 * Vercel 是 Pro（Blob 单文件 5TB + 包含 quota 远超本项目需求）。
 *
 * 为何 Private store + Function 中转，而不是 public URL
 * ---------------------------------------------------
 * 私有性在 Vercel Blob Store 创建时（Dashboard）设为 Private —— blob URL 直接访问返 401，
 * 必须带 Authorization Bearer <BLOB_READ_WRITE_TOKEN> 才能拿内容。
 * 下载走 /api/export/backup/download endpoint：verifyAuth → 服务端代取 → stream 给客户端。
 * 切忌"public store + addRandomSuffix"图省事 —— URL 不可猜但永久泄漏，是 security-by-obscurity 反模式。
 *
 * SDK access 参数注意
 * ------------------
 * @vercel/blob v2.3.3 的 put() options.access 字面要求 'public'（SDK 类型限制）。
 * 这与 store 的私有性无关 —— store 私有性看 Dashboard 创建时的选项决定 URL 域。
 * 这个 API 设计违反直觉但是当前真实行为；未来 SDK 升级支持 'private' 调用时再切。
 *
 * Atomic replace
 * --------------
 * `allowOverwrite: true` + `addRandomSuffix: false` —— Vercel Blob put 是原子写：
 * 上传失败 → 旧 latest.zip 不破；上传成功 + 后续 DB metadata 失败 →
 * 下次 cron 重写 metadata，最差就是 ZIP 比 DB 记录新一点，不破数据。
 *
 * maxDuration: 300s
 * -----------------
 * 100 件作品 + 几百张图片在 batchSize=5 并发下 p95 < 60s；Pro 计划 300s 上限做安全边界。
 *
 * BLOB_READ_WRITE_TOKEN
 * ---------------------
 * Vercel 自动从连接的 Blob Store 注入到运行时环境；@vercel/blob SDK 自动读取，无需手动传 token。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { put } from '@vercel/blob';
import { verifyAuth } from '../lib/auth.js';
import { buildBackupZip } from '../lib/backup/zip-builder.js';
import { getBackupBlobPath } from '../lib/backup/storage.js';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth.success) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  const userId = auth.userId!;
  const userEmail = auth.userEmail || '';

  try {
    const supabase = getServiceClient();

    // 1) 构建 ZIP（耗时大头：snapshot RPC + 图片并发下载 + jszip 组装）
    const { buffer, manifest } = await buildBackupZip(userId, userEmail, supabase);

    // 2) 上传到 Vercel Blob，每用户单 slot
    //    私有 store 必须传 access: 'private'，否则服务端返
    //    "Cannot use public access on a private store"。
    const blobPath = getBackupBlobPath(userId);
    await put(blobPath, buffer, {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/zip',
      // token 自动从 BLOB_READ_WRITE_TOKEN env 读取
    });

    // 3) 更新 users 元数据。失败不阻断响应 —— Blob 已写成功，
    //    元数据下次 cron / 手动备份会刷新；这里只 warn。
    //    注意：cron 与手动 export 都不更新 last_backup_downloaded_at ——
    //    那个字段表示"用户真正拉走过"，由 /api/export/backup/download 完成时写入。
    const { error: updateError } = await supabase
      .from('users')
      .update({
        last_backup_at: manifest.created_at,
        last_backup_size_bytes: manifest.total_size_bytes,
        last_backup_stats: manifest.stats,
      })
      .eq('id', userId);

    if (updateError) {
      console.warn('[Backup Export] users metadata update failed:', updateError.message);
    }

    return res.status(200).json({
      manifest,
      sizeBytes: manifest.total_size_bytes,
      // 前端拉文件走这个 endpoint（verifyAuth 中转），不直接返回 Blob URL —— 防永久泄漏
      downloadEndpoint: '/api/export/backup/download',
    });
  } catch (error) {
    console.error('[Backup Export] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
