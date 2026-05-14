/**
 * Cron 备份测试：覆盖频率判定逻辑
 *
 * shouldBackupNow 是 cron handler 决定"今天给哪些用户跑备份"的核心。
 * 错一行就会导致：用户已设 monthly 却被周备、或者用户 off 仍被备份、
 * 或者备份过的用户被重复跑（浪费 Blob 配额 + 函数调用）。
 *
 * handler 级 auth 测试这里不写（需要 mock @vercel/blob 的 put 等，
 * 整合在更高层的 e2e；本测试聚焦纯函数 + 已 export 的判定逻辑）。
 */

import { describe, it, expect } from 'vitest';
import { shouldBackupNow, type UserRow } from '../cron/backup';

// 固定 "现在" 为 2026-05-14 12:00:00 UTC，便于推算 last_backup_at 边界
const NOW = new Date('2026-05-14T12:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function user(overrides: Partial<UserRow>): UserRow {
  return {
    id: 'u-default',
    email: 'a@b.com',
    backup_frequency: 'weekly',
    last_backup_at: null,
    ...overrides,
  };
}

describe('shouldBackupNow — off 频率', () => {
  it('off：永远跳过（哪怕从未备过）', () => {
    expect(shouldBackupNow(user({ backup_frequency: 'off', last_backup_at: null }), NOW)).toBe(false);
  });

  it('off：哪怕上次备份是远古，也跳过', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'off', last_backup_at: daysAgo(365) }), NOW),
    ).toBe(false);
  });
});

describe('shouldBackupNow — weekly 频率', () => {
  it('从未备过 → 跑', () => {
    expect(shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: null }), NOW)).toBe(true);
  });

  it('上次备份 1 天前 → 跳过', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: daysAgo(1) }), NOW),
    ).toBe(false);
  });

  it('上次备份 6 天前 → 跳过（还差一天到周期）', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: daysAgo(6) }), NOW),
    ).toBe(false);
  });

  it('上次备份恰好 7 天前 → 跑（边界包含）', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: daysAgo(7) }), NOW),
    ).toBe(true);
  });

  it('上次备份 10 天前 → 跑', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: daysAgo(10) }), NOW),
    ).toBe(true);
  });
});

describe('shouldBackupNow — monthly 频率', () => {
  it('从未备过 → 跑', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'monthly', last_backup_at: null }), NOW),
    ).toBe(true);
  });

  it('上次备份 7 天前 → 跳过（monthly 不响应 weekly 节奏）', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'monthly', last_backup_at: daysAgo(7) }), NOW),
    ).toBe(false);
  });

  it('上次备份 29 天前 → 跳过（还差 1 天）', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'monthly', last_backup_at: daysAgo(29) }), NOW),
    ).toBe(false);
  });

  it('上次备份恰好 30 天前 → 跑', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'monthly', last_backup_at: daysAgo(30) }), NOW),
    ).toBe(true);
  });

  it('上次备份 45 天前 → 跑', () => {
    expect(
      shouldBackupNow(user({ backup_frequency: 'monthly', last_backup_at: daysAgo(45) }), NOW),
    ).toBe(true);
  });
});

describe('shouldBackupNow — 时间正确性', () => {
  it('未来时间戳（last_backup_at > NOW）→ 跳过（防御异常状态）', () => {
    const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(
      shouldBackupNow(user({ backup_frequency: 'weekly', last_backup_at: future }), NOW),
    ).toBe(false);
  });
});
