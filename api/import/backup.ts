/**
 * 工作室数据备份 — 导入 endpoint（覆盖式恢复）
 *
 * 入口
 * ----
 * POST /api/import/backup
 * Authorization: Bearer <supabase session token>
 * X-Rollback-Confirmed: true     ← 必传，否则 412
 * Content-Type: application/zip
 * Body: raw ZIP buffer
 *
 * 流程
 * ----
 * 1. verifyAuth → userId
 * 2. 校验 X-Rollback-Confirmed === 'true' —— 没这个 header 表示前端没走过
 *    "强制下载回滚包"的 UX gate，禁止进入破坏性操作。412 Precondition Failed。
 * 3. 读 raw body → Buffer（bodyParser: false，因 ZIP 不是 JSON）
 * 4. parseBackupZip → manifest + data + getImage
 * 5. 业务校验：
 *      manifest.user_id !== userId        → 403 cross_account
 *      manifest.db_schema_version 不匹配  → 400 schema_mismatch
 *      manifest.backup_format_version 不匹配 → 400 format_mismatch
 * 6. restoreBackup（service_key 客户端 + 备份解析结果）
 * 7. 200 返回 { stats, imagesRestored, imagesFailed, warnings, deletedRowCounts, insertedRowCounts }
 *
 * 为何 raw body 而非 multipart / base64
 * -----------------------------------
 * - JSON body base64 编码 ZIP：体积 +33%（340MB → 450MB），Vercel JSON 解析体积放大风险
 * - multipart/form-data：要装 busboy/formidable，本项目 import/md.ts 等也是 JSON 模式没引入这条
 * - raw application/zip：fetch API 直接 `body: zipBlob`；服务端读 stream 拼 Buffer。零依赖、零编码膨胀。
 *
 * 为何 bodyParser: false
 * ----------------------
 * Vercel 默认按 Content-Type 解析（json/form/text）；application/zip 会被
 * 当 buffer 但保留默认 4.5MB 大小限制。disabled bodyParser + 手动读 stream
 * 可以接受更大的 body。本项目场景几十到几百 MB。
 *
 * 为何不在 try/catch 包整段 restore
 * --------------------------------
 * restore 内部任一步失败抛错 → catch 在外层统一返 500 + 错误消息。
 * 用户看到 "恢复失败 X 步" + 已下载的回滚包 → 可以自助恢复。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth, getHeader } from '../lib/auth.js';
import { parseBackupZip, type ParsedBackup } from '../lib/backup/zip-parser.js';
import { restoreBackup } from '../lib/backup/restore.js';
import {
  BACKUP_FORMAT_VERSION,
  DB_SCHEMA_VERSION,
} from '../lib/backup/manifest.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
  // 关键：禁用默认 bodyParser，手动读 raw stream
  api: {
    bodyParser: false,
  },
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
 * 从 Vercel Node request 读 raw body 到 Buffer。
 * stream 是 Node Readable；累加 chunks → Buffer.concat。
 */
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Auth
  const auth = await verifyAuth(req);
  if (!auth.success) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }
  const userId = auth.userId!;

  // 2) Rollback gate：必须先走过 /api/export/rollback 拿到本地回滚包
  //    前端在用户点"我已下载回滚包"之后才注入这个 header
  const rollbackConfirmed = getHeader(req, 'X-Rollback-Confirmed');
  if (rollbackConfirmed !== 'true') {
    return res.status(412).json({
      error: 'rollback_required',
      message: '请先调 /api/export/rollback 下载回滚包到本地',
    });
  }

  // 3) 读 raw body
  let buffer: Buffer;
  try {
    buffer = await readRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: `Failed to read request body: ${(err as Error).message}` });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Empty request body' });
  }

  // 4) 解 ZIP
  let parsed: ParsedBackup;
  try {
    parsed = await parseBackupZip(buffer);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  // 5) 业务校验
  if (parsed.manifest.user_id !== userId) {
    return res.status(403).json({
      error: 'cross_account',
      message: '此备份属于另一账号，无法导入到当前账号',
    });
  }

  if (parsed.manifest.backup_format_version !== BACKUP_FORMAT_VERSION) {
    return res.status(400).json({
      error: 'format_mismatch',
      expected: BACKUP_FORMAT_VERSION,
      got: parsed.manifest.backup_format_version,
    });
  }

  if (parsed.manifest.db_schema_version !== DB_SCHEMA_VERSION) {
    return res.status(400).json({
      error: 'schema_mismatch',
      expected: DB_SCHEMA_VERSION,
      got: parsed.manifest.db_schema_version,
    });
  }

  // 6) Restore
  try {
    const supabase = getServiceClient();
    const result = await restoreBackup({ userId, supabase, parsed });
    return res.status(200).json({
      manifest_stats: parsed.manifest.stats,
      ...result,
    });
  } catch (err) {
    console.error('[Backup Import] Restore failed:', err);
    return res.status(500).json({
      error: (err as Error).message,
      hint: '恢复失败。请使用之前下载的回滚包还原至导入前状态。',
    });
  }
}
