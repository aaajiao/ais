/**
 * Backup hooks —— 跟 Phase 1 / Phase 2 已有的后端端点对接。
 *
 * 端点契约
 * --------
 * - POST /api/export/backup            → 生成新备份（写 Blob + 更新 users 元数据），返回 { manifest, sizeBytes, downloadEndpoint }
 * - GET  /api/export/backup/download   → stream 下载最新 ZIP；服务端会更新 users.last_backup_downloaded_at
 * - GET  /api/export/rollback          → stream 下载"当前状态"快照 ZIP（不改 DB，临时生成）
 * - POST /api/import/backup            → 上传 ZIP 覆盖恢复；必须带 X-Rollback-Confirmed: true
 *
 * 这些 hook 故意分两类：
 *   1) status / 频率配置：React Query 缓存（key 见 queryKeys.backup.status）
 *   2) generate / download / restore：mutation 或一次性 imperative 调用，
 *      成功后通过 cacheInvalidation.ts 的 helper 失效相应缓存。
 */

import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supabase, updateTable } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import {
  invalidateOnBackupGenerated,
  invalidateOnBackupDownloaded,
  invalidateOnRestoreBackup,
} from '@/lib/cacheInvalidation';
import type { BackupFrequency, Json } from '@/lib/database.types';

/** users 表里跟备份相关的列。Phase 1/2 schema 已固化。 */
export interface BackupStatus {
  last_backup_at: string | null;
  last_backup_size_bytes: number | null;
  last_backup_stats: Json | null;
  last_backup_downloaded_at: string | null;
  backup_frequency: BackupFrequency;
}

/** 备份内 stats JSON 的形状（参见 api/lib/backup/manifest.ts `BackupStats`）。 */
export interface BackupStatsShape {
  artworks: number;
  editions: number;
  edition_files: number;
  edition_history: number;
  locations: number;
  gallery_links: number;
  api_keys: number;
}

/** /api/import/backup 成功响应的形状（手工对齐 api/lib/backup/restore.ts `RestoreResult`）。 */
export interface RestoreResultShape {
  manifest_stats: BackupStatsShape;
  deletedRowCounts: Record<string, number>;
  insertedRowCounts: Record<string, number>;
  imagesRestored: number;
  imagesFailed: number;
  warnings: string[];
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

/** 从 Content-Disposition: attachment; filename="…" 里提取 filename，失败 fallback。 */
function parseFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match =
    /filename\*=UTF-8''([^;]+)/i.exec(header) ||
    /filename="?([^";]+)"?/i.exec(header);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
}

/** 触发浏览器把 blob 当文件下载落本地。 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 给浏览器一点时间把 blob 抓出去再 revoke；过早 revoke 在某些浏览器上下载会断
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 读 users.last_backup_* + backup_frequency。
 *
 * 直接走 supabase-js 而不是新开 endpoint —— 这五个字段已经在 users 表里
 * （migration 009），RLS 保证只能读 own row，没必要加一层。
 */
export function useBackupStatus(userId: string | null | undefined) {
  return useQuery<BackupStatus | null>({
    queryKey: userId ? queryKeys.backup.status(userId) : ['backup', 'status', 'unauthed'],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('users')
        .select(
          'last_backup_at, last_backup_size_bytes, last_backup_stats, last_backup_downloaded_at, backup_frequency'
        )
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as BackupStatus | null) ?? null;
    },
  });
}

/** POST /api/export/backup —— 触发一次新备份生成。 */
export function useGenerateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      const response = await fetch('/api/export/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || `HTTP ${response.status}`
        );
      }
      return (await response.json()) as {
        manifest: unknown;
        sizeBytes: number;
        downloadEndpoint: string;
      };
    },
    onSuccess: async () => {
      await invalidateOnBackupGenerated(queryClient);
    },
  });
}

/**
 * GET /api/export/backup/download —— 拉最新备份 ZIP 到本地。
 *
 * 不是 mutation —— 这是一次"取走文件"的 imperative 操作。返回 callback 让
 * 组件按钮 click 直接调；成功后失效 status 让 last_backup_downloaded_at 跟上。
 */
export function useDownloadBackup() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch('/api/export/backup/download', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error || `HTTP ${response.status}`
      );
    }
    const filename = parseFilename(
      response.headers.get('Content-Disposition'),
      `backup-${new Date().toISOString().slice(0, 10)}.zip`
    );
    const blob = await response.blob();
    triggerDownload(blob, filename);
    // 服务端 download endpoint 已更新 last_backup_downloaded_at，本地缓存要同步
    await invalidateOnBackupDownloaded(queryClient);
    return { filename, size: blob.size };
  }, [queryClient]);
}

/**
 * GET /api/export/rollback —— 拉"当前状态"快照 ZIP 到本地（恢复前的回滚兜底）。
 *
 * 不更新任何缓存：rollback 是临时生成的快照，不改 DB / users.last_backup_*。
 */
export function useDownloadRollback() {
  return useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch('/api/export/rollback', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error || `HTTP ${response.status}`
      );
    }
    const filename = parseFilename(
      response.headers.get('Content-Disposition'),
      `rollback-${new Date().toISOString().slice(0, 10)}.zip`
    );
    const blob = await response.blob();
    triggerDownload(blob, filename);
    return { filename, size: blob.size };
  }, []);
}

/** POST /api/import/backup —— 提交 ZIP 做覆盖式恢复。 */
export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation<RestoreResultShape, Error, { zip: Blob | ArrayBuffer }>({
    mutationFn: async ({ zip }) => {
      const token = await getAccessToken();
      const response = await fetch('/api/import/backup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/zip',
          // 必须带：服务端在 /api/import/backup 里硬性检查这个 header（412 rollback_required）
          'X-Rollback-Confirmed': 'true',
        },
        body: zip,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const err = new Error(
          (body.message as string) || (body.error as string) || `HTTP ${response.status}`
        ) as Error & { code?: string; details?: Record<string, unknown> };
        if (typeof body.error === 'string') err.code = body.error;
        err.details = body;
        throw err;
      }
      return (await response.json()) as RestoreResultShape;
    },
    onSuccess: async () => {
      // 恢复 = 全数据替换 → 所有缓存全部失效
      await invalidateOnRestoreBackup(queryClient);
    },
  });
}

/** 更新 users.backup_frequency。直接走 supabase-js，跟 useBackupStatus 对称。 */
export function useUpdateBackupFrequency(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BackupFrequency>({
    mutationFn: async (frequency) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await updateTable(
        'users',
        { backup_frequency: frequency },
        userId
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      if (userId) {
        await invalidateBackupStatusFor(queryClient, userId);
      }
    },
  });
}

/** 内部 helper：定位失效某一用户的 backup.status 节点。 */
async function invalidateBackupStatusFor(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.backup.status(userId),
  });
}
