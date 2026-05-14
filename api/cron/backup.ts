/**
 * Cron: 周期性工作室数据备份
 *
 * 调度
 * ----
 * Vercel Cron 每天 03:00 UTC 调用 GET /api/cron/backup
 * （配置见 vercel.json crons 段）。
 *
 * 频率分发
 * --------
 * 单一 cron 入口里按每用户 `users.backup_frequency` 字段 + `last_backup_at`
 * 决定是否本次执行 —— 避免多 cron 配额浪费，也方便审计。
 *   - weekly  : last_backup_at IS NULL  OR  last_backup_at < now() - 7 days
 *   - monthly : last_backup_at IS NULL  OR  last_backup_at < now() - 30 days
 *   - off     : 跳过
 *
 * 安全
 * ----
 * Authorization: Bearer <CRON_SECRET> —— Vercel Cron 自动注入。
 * 缺 CRON_SECRET 或不匹配返 401。
 *
 * 存储后端：Vercel Blob (access: 'private')
 * ----------------------------------------
 * 与 /api/export/backup 同一 Blob store，路径约定一致（getBackupBlobPath）。
 * allowOverwrite=true + addRandomSuffix=false：每用户单 slot，cron 覆盖上一份。
 * BLOB_READ_WRITE_TOKEN 由 Vercel 自动注入，无需在代码里传 token。
 *
 * 隔离
 * ----
 * 串行处理（不并发）：避免 Blob / 图片源端限流；单用户失败包 try/catch
 * 不影响其他用户。返回 details[] 给运维查看（Vercel Logs / cron history）。
 *
 * 不更新 last_backup_downloaded_at
 * --------------------------------
 * cron 写完 Blob 算"快递送达"，不算"用户取走"。downloaded_at 字段语义专属于
 * /api/export/backup/download 完成时（Phase 3 14 天提醒卡片依赖该字段）。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { put } from '@vercel/blob';
import { buildBackupZip } from '../lib/backup/zip-builder.js';
import { getBackupBlobPath } from '../lib/backup/storage.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};

export interface UserRow {
  id: string;
  email: string;
  backup_frequency: 'weekly' | 'monthly' | 'off';
  last_backup_at: string | null;
}

interface PerUserResult {
  userId: string;
  email: string;
  ok: boolean;
  sizeBytes?: number;
  error?: string;
}

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
 * 判断本次 cron 应不应该给该用户跑备份。
 *   weekly:  没备过 OR 上次备份 ≥ 7  天前
 *   monthly: 没备过 OR 上次备份 ≥ 30 天前
 *   off:     跳过
 *
 * 导出供单元测试直接覆盖；handler 内部正常调用。
 */
export function shouldBackupNow(user: UserRow, now: Date): boolean {
  if (user.backup_frequency === 'off') return false;
  if (!user.last_backup_at) return true;

  const last = new Date(user.last_backup_at);
  const diffMs = now.getTime() - last.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (user.backup_frequency === 'weekly') return days >= 7;
  if (user.backup_frequency === 'monthly') return days >= 30;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1) Bearer CRON_SECRET 校验
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron Backup] CRITICAL: CRON_SECRET not configured.');
    return res.status(401).json({ error: 'Server cron misconfigured' });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (headerValue !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabase: ReturnType<typeof getServiceClient>;
  try {
    supabase = getServiceClient();
  } catch (error) {
    console.error('[Cron Backup] Init error:', (error as Error).message);
    return res.status(500).json({ error: (error as Error).message });
  }

  // 2) 查需要备份的用户。先 select 所有 backup_frequency != 'off'，
  //    应用层做 shouldBackupNow 判断（用户量级小，SQL 时间窗写复杂不划算）。
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, backup_frequency, last_backup_at')
    .neq('backup_frequency', 'off');

  if (usersError) {
    console.error('[Cron Backup] users query failed:', usersError.message);
    return res.status(500).json({ error: usersError.message });
  }

  const now = new Date();
  const candidates = (users || []) as UserRow[];
  const toRun = candidates.filter((u) => shouldBackupNow(u, now));

  console.log(`[Cron Backup] ${candidates.length} candidates, ${toRun.length} due for backup`);

  // 3) 串行跑备份
  const details: PerUserResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const user of toRun) {
    const result: PerUserResult = { userId: user.id, email: user.email, ok: false };
    try {
      const { buffer, manifest } = await buildBackupZip(user.id, user.email, supabase);

      const blobPath = getBackupBlobPath(user.id);
      // SDK v2.3.3 access 字面只接受 'public'；私有性由 store 级别决定（Dashboard 创建时选 Private）
      // —— blob URL 直接访问返 401，必须带 BLOB_READ_WRITE_TOKEN。详见 api/export/backup.ts 文件头说明。
      await put(blobPath, buffer, {
        access: 'public',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/zip',
      });

      const { error: updateError } = await supabase
        .from('users')
        .update({
          last_backup_at: manifest.created_at,
          last_backup_size_bytes: manifest.total_size_bytes,
          last_backup_stats: manifest.stats,
        })
        .eq('id', user.id);

      if (updateError) {
        // Blob 已写成功但 metadata 失败：算成功，下次 cron 会再覆盖 metadata
        console.warn(
          `[Cron Backup] user=${user.id} metadata update failed: ${updateError.message}`,
        );
      }

      result.ok = true;
      result.sizeBytes = manifest.total_size_bytes;
      succeeded += 1;
      console.log(
        `[Cron Backup] user=${user.id} email=${user.email} ok size=${manifest.total_size_bytes}`,
      );
    } catch (error) {
      const msg = (error as Error).message;
      result.error = msg;
      failed += 1;
      console.error(`[Cron Backup] user=${user.id} email=${user.email} FAILED: ${msg}`);
    }
    details.push(result);
  }

  return res.status(200).json({
    processed: toRun.length,
    skipped: candidates.length - toRun.length,
    succeeded,
    failed,
    details,
  });
}
