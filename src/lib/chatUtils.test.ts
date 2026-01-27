import { describe, it, expect } from 'vitest';
import { formatDateLabel, isSameDay, getTodayDateKey, groupMessagesByDate } from './chatUtils';
import type { UIMessage } from 'ai';

describe('formatDateLabel', () => {
  it('should return "今天" for today', () => {
    const now = new Date('2024-06-15T10:00:00');
    const today = new Date('2024-06-15T08:00:00');
    expect(formatDateLabel(today, now)).toBe('今天');
  });

  it('should return "昨天" for yesterday', () => {
    const now = new Date('2024-06-15T10:00:00');
    const yesterday = new Date('2024-06-14T20:00:00');
    expect(formatDateLabel(yesterday, now)).toBe('昨天');
  });

  it('should return "X天前" for 2-6 days ago', () => {
    const now = new Date('2024-06-15T10:00:00');
    const threeDaysAgo = new Date('2024-06-12T10:00:00');
    expect(formatDateLabel(threeDaysAgo, now)).toBe('3天前');
  });

  it('should return "月日" format for 7+ days ago', () => {
    const now = new Date('2024-06-15T10:00:00');
    const oldDate = new Date('2024-06-01T10:00:00');
    expect(formatDateLabel(oldDate, now)).toBe('6月1日');
  });

  it('should handle year boundaries correctly', () => {
    const now = new Date('2024-01-02T10:00:00');
    const lastYear = new Date('2023-12-20T10:00:00');
    expect(formatDateLabel(lastYear, now)).toBe('12月20日');
  });

  it('should use current date if now is not provided', () => {
    const today = new Date();
    const result = formatDateLabel(today);
    expect(result).toBe('今天');
  });
});

describe('isSameDay', () => {
  it('should return true for same day', () => {
    const d1 = new Date('2024-06-15T08:00:00');
    const d2 = new Date('2024-06-15T20:00:00');
    expect(isSameDay(d1, d2)).toBe(true);
  });

  it('should return false for different days', () => {
    const d1 = new Date('2024-06-15T10:00:00');
    const d2 = new Date('2024-06-16T10:00:00');
    expect(isSameDay(d1, d2)).toBe(false);
  });

  it('should return false for same day different months', () => {
    const d1 = new Date('2024-06-15T10:00:00');
    const d2 = new Date('2024-07-15T10:00:00');
    expect(isSameDay(d1, d2)).toBe(false);
  });

  it('should return false for same day different years', () => {
    const d1 = new Date('2023-06-15T10:00:00');
    const d2 = new Date('2024-06-15T10:00:00');
    expect(isSameDay(d1, d2)).toBe(false);
  });
});

describe('getTodayDateKey', () => {
  it('should return YYYY-MM-DD format', () => {
    const dateKey = getTodayDateKey();
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should match today ISO date', () => {
    const dateKey = getTodayDateKey();
    const expected = new Date().toISOString().split('T')[0];
    expect(dateKey).toBe(expected);
  });
});

describe('groupMessagesByDate', () => {
  it('should return empty array for empty input', () => {
    expect(groupMessagesByDate([])).toEqual([]);
  });

  it('should group messages by date', () => {
    const now = Date.now();
    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [],
        metadata: { createdAt: now },
      },
      {
        id: '2',
        role: 'assistant',
        parts: [],
        metadata: { createdAt: now + 1000 },
      },
    ];

    const groups = groupMessagesByDate(messages);
    expect(groups.length).toBe(1);
    expect(groups[0].messages.length).toBe(2);
    expect(groups[0].displayDate).toBe('今天');
  });

  it('should sort groups by date (newest first)', () => {
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;
    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [],
        metadata: { createdAt: yesterday },
      },
      {
        id: '2',
        role: 'user',
        parts: [],
        metadata: { createdAt: now },
      },
    ];

    const groups = groupMessagesByDate(messages);
    expect(groups.length).toBe(2);
    expect(groups[0].displayDate).toBe('今天');
    expect(groups[1].displayDate).toBe('昨天');
  });

  it('should handle messages without metadata', () => {
    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [],
      },
    ];

    const groups = groupMessagesByDate(messages);
    expect(groups.length).toBe(1);
    expect(groups[0].messages.length).toBe(1);
  });
});
