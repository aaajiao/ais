/**
 * Backup blob storage 路径约定 + 下载文件名构造
 *
 * 单一来源：blob pathname / download filename 全部在这里集中，
 * 防止 export endpoint / cron / download endpoint 各写各的字符串漂移。
 */

/**
 * Vercel Blob 路径（per-user single-slot 设计）。
 * 顶层 `backups/` 前缀仅约定命名空间 —— Vercel Blob store 是扁平的，
 * 没有真"目录"的概念，但前缀方便日后从 dashboard / list 接口里筛备份。
 */
export function getBackupBlobPath(userId: string): string {
  return `backups/${userId}/latest.zip`;
}

/**
 * 浏览器下载文件名。timestamp 用 ISO 日期段（YYYY-MM-DD）够用 + 可读，
 * 不暴露用户邮箱也不暴露 userId。
 *
 * 例：aaajiao-backup-2026-05-14.zip
 */
export function getBackupDownloadFilename(artistName = 'aaajiao', date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'studio';
  return `${slug}-backup-${yyyy}-${mm}-${dd}.zip`;
}
