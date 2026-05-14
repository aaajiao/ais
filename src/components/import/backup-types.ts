/**
 * 备份恢复流程的客户端类型。
 *
 * 注意：manifest 形状必须跟 api/lib/backup/manifest.ts 对齐，这里手工镜像，
 * 因为前端不能直接 import api/ 路径（会把 server-only 代码打包进 bundle）。
 * 如果后端 manifest 加字段，记得在这里同步。
 */

export type BackupImportStep = 'upload' | 'preview' | 'result';

/**
 * 客户端期望的 backup_format_version / db_schema_version。
 * 必须跟 api/lib/backup/manifest.ts 的常量同值。改后端时同步改这里，
 * 不然客户端 pre-check 跟服务端最终校验会不一致。
 */
export const CLIENT_EXPECTED_FORMAT_VERSION = 1;
export const CLIENT_EXPECTED_DB_SCHEMA_VERSION = '2026.05';

/** 跟 api/lib/backup/manifest.ts `BackupStats` 对齐。 */
export interface BackupStatsShape {
  artworks: number;
  editions: number;
  edition_files: number;
  edition_history: number;
  locations: number;
  gallery_links: number;
  api_keys: number;
}

/** 跟 api/lib/backup/manifest.ts `BackupManifest` 对齐。 */
export interface BackupManifestShape {
  backup_format_version: number;
  db_schema_version: string;
  user_id: string;
  user_email: string;
  created_at: string;
  stats: BackupStatsShape;
  image_count: number;
  total_size_bytes: number;
}

/** 上传步骤客户端解析完的产物。file 会原封不动透传给 /api/import/backup。 */
export interface ParsedBackupClient {
  file: File;
  manifest: BackupManifestShape;
}

/** Restore 的结果归一化形状（成功 / 失败两态）。 */
import type { RestoreResultShape } from '@/hooks/useBackup';

export type BackupRestoreOutcome =
  | { kind: 'success'; data: RestoreResultShape }
  | {
      kind: 'failure';
      /** error code from server JSON.error（cross_account / schema_mismatch / format_mismatch / rollback_required / no_backup / null） */
      code: string | null;
      message: string;
      details: Record<string, unknown> | null;
    };
