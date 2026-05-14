import { describe, it, expect } from 'vitest';
import { getBackupBlobPath, getBackupDownloadFilename } from '../storage';

describe('getBackupBlobPath', () => {
  it('每用户单 slot：路径形如 backups/<userId>/latest.zip', () => {
    expect(getBackupBlobPath('abc-123')).toBe('backups/abc-123/latest.zip');
  });

  it('不同 userId → 不同路径前缀', () => {
    const a = getBackupBlobPath('user-a');
    const b = getBackupBlobPath('user-b');
    expect(a).not.toBe(b);
    expect(a.startsWith('backups/user-a/')).toBe(true);
    expect(b.startsWith('backups/user-b/')).toBe(true);
  });
});

describe('getBackupDownloadFilename', () => {
  it('文件名格式 <slug>-backup-YYYY-MM-DD.zip（UTC 日期段）', () => {
    const d = new Date('2026-05-14T03:00:00.000Z');
    expect(getBackupDownloadFilename('aaajiao', d)).toBe('aaajiao-backup-2026-05-14.zip');
  });

  it('artist slug 经 lowercase + 非 a-z0-9 替换为 - + 首尾 dash 被裁剪', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    // "Studio Name 工作室" → lowercase + 连续非字母数字塌成单 "-" + trim "-" 首尾
    // → "studio-name"
    expect(getBackupDownloadFilename('Studio Name 工作室', d)).toBe('studio-name-backup-2026-01-01.zip');
  });

  it('artist 全部非法字符 → fallback "studio"', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(getBackupDownloadFilename('!!!', d)).toBe('studio-backup-2026-01-01.zip');
  });

  it('默认参数：当前日期 + "aaajiao" slug', () => {
    const name = getBackupDownloadFilename();
    expect(name).toMatch(/^aaajiao-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('文件名不暴露 userId / email', () => {
    const name = getBackupDownloadFilename('aaajiao', new Date('2026-05-14T03:00:00Z'));
    expect(name).not.toMatch(/@/);
    expect(name).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/); // UUID 形状
  });
});
