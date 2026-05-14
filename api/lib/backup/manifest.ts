/**
 * Backup Manifest 类型 + 版本常量
 *
 * 设计原则
 * --------
 * - manifest.json 是 ZIP 的 self-describing header：Phase 2 导入流程读它判断
 *   "能不能恢复 / 该不该拒绝（跨账号 + 版本不兼容）"
 * - backup_format_version：ZIP 外壳结构变化时 bump（e.g. 改文件夹布局、加新顶级文件）
 * - db_schema_version：DB schema 变化时 bump（e.g. 新增列、enum 扩展）。
 *   v1 = 2026.05 包含的列集合参见 supabase/schema.sql + migration 009。
 *
 * Phase 1 (本阶段) 只产出 manifest，不消费。Phase 2 导入会按 user_id +
 * schema_version 做兼容性 gate。
 */

/** ZIP 外壳结构版本。改 zip 目录布局 / 顶级文件命名时 bump。 */
export const BACKUP_FORMAT_VERSION = 1 as const;

/**
 * DB schema 版本。schema 变化（新列、enum 扩展、表新增）时 bump。
 * 格式：'YYYY.MM' —— 与 changelog / migration 命名相互参照。
 * 2026.05 = migration 009 应用之后的状态（users 表 + backup 字段，含已有 8 张业务表）。
 */
export const DB_SCHEMA_VERSION = '2026.05' as const;

/** 备份内含表的行数统计。键固定为快照中的表名。 */
export interface BackupStats {
  artworks: number;
  editions: number;
  edition_files: number;
  edition_history: number;
  locations: number;
  gallery_links: number;
  api_keys: number;
}

/** ZIP 顶级 manifest.json 结构。Phase 2 导入端按此 schema 解析。 */
export interface BackupManifest {
  backup_format_version: typeof BACKUP_FORMAT_VERSION;
  db_schema_version: typeof DB_SCHEMA_VERSION;
  /** 来源用户 UUID。Phase 2 导入时 reject mismatch（防跨账号污染）。 */
  user_id: string;
  /** 来源用户邮箱。仅信息性展示，不参与导入校验。 */
  user_email: string;
  /** ISO-8601 (UTC) 备份生成时间。 */
  created_at: string;
  /** 各表行数（健全性检查 + 前端展示）。 */
  stats: BackupStats;
  /** ZIP 中 images/ 下实际打包到的图片数（成功下载数，非 edition_files 行数）。 */
  image_count: number;
  /** ZIP 整体字节数。生成 ZIP 后由 buildBackupZip 填入。 */
  total_size_bytes: number;
}

/** 表名联合，用于在快照解析时给 jsonb 字段加类型。 */
export type BackupTableName = keyof BackupStats;
