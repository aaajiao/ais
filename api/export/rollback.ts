/**
 * 工作室数据备份 — 回滚包下载 endpoint
 *
 * 入口
 * ----
 * GET /api/export/rollback
 * Authorization: Bearer <supabase session token>
 *
 * 与 /api/export/backup/download 的区别
 * ----------------------------------
 * - `/backup/download` 拉 Vercel Blob 里**已持久化**的 latest.zip（可能是几天前 cron 生成的）
 * - `/rollback` 实时**重新生成**一份当前状态的 ZIP，**只 stream 给浏览器、不存 Blob**
 *
 * 设计意图
 * --------
 * 这个 endpoint 是导入流程的安全 gate。Phase 3 前端在用户点"导入备份"前，会先
 * 调这个 endpoint 强制下载一份"当前状态快照"到本地（用户能感知到磁盘上多了个文件），
 * 然后才允许提交导入。如果导入翻车，用户手里就有一个 100% 准确的回滚源。
 *
 * 为何不上传 Blob
 * --------------
 * - cron 备份 + 手动备份**都**会覆盖 Blob slot（per-user single slot）；如果回滚也
 *   写 Blob，会覆盖用户最近的稳定备份 —— 反而破坏回滚意图
 * - 回滚包只服务"立即下载到本地"这一个用途，存 Blob 没有任何附加价值
 *
 * 文件名约定
 * ----------
 * `aaajiao-rollback-YYYY-MM-DD-HHmm.zip` —— 比常规备份多分钟级，
 * 一次导入流程里可能产生多个回滚包（导入失败 → 修复 → 重试），用分钟级避免重名。
 *
 * 实现注意
 * --------
 * - buildBackupZip 内存全量打包（jszip nodebuffer），Pro 计划 1GB 内存对几百 MB 工作集
 *   够用。如果未来要支持更大场景，需要切到 streaming zip（jszip 不支持 streaming write）。
 * - maxDuration: 300（与备份导出同上限）
 * - Cache-Control: no-store 防浏览器/中间缓存敏感数据
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '../lib/auth.js';
import { buildBackupZip } from '../lib/backup/zip-builder.js';

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

/**
 * 分钟级文件名 helper。与 storage.ts:getBackupDownloadFilename 区分（后者只到天级）。
 * 例：aaajiao-rollback-2026-05-14-1532.zip
 */
function getRollbackFilename(artistName = 'aaajiao', date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const slug =
    artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'studio';
  return `${slug}-rollback-${yyyy}-${mm}-${dd}-${hh}${min}.zip`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
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

    // 1) 实时打包当前状态 —— 与 /export/backup 同一路径，但不写 Blob、不更新 users 元数据
    const { buffer, manifest } = await buildBackupZip(userId, userEmail, supabase);

    // 2) 设响应 header
    const filename = getRollbackFilename();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'no-store, private');
    // 给前端一个观测点：manifest.created_at + 大小 + 行数 stats（小数据，header 顺道带）
    res.setHeader('X-Rollback-Created-At', manifest.created_at);
    res.setHeader('X-Rollback-Size-Bytes', String(manifest.total_size_bytes));

    // 3) 直接 send buffer（小到几百 MB 在 Pro 计划内存内）
    //    VercelResponse.send 接受 Buffer，会自动加 Content-Length（已显式设过，让其覆盖即可）
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[Rollback Export] Error:', err);
    // 如果 header 已经发了（理论上 buildBackupZip 抛错在 setHeader 之前），可以返 JSON
    return res.status(500).json({ error: (err as Error).message });
  }
}
