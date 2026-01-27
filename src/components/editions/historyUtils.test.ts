/**
 * Tests for historyUtils
 */

import { describe, it, expect, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { EditionHistory } from './historyTypes';
import {
  formatDateTime,
  formatRelativeTime,
  getDateKey,
  mergeHistory,
  getDescription,
  getActionLabel,
} from './historyUtils';

// Mock translation function
const createMockT = (translations: Record<string, string> = {}): TFunction => {
  return ((key: string, options?: Record<string, unknown>) => {
    if (translations[key]) {
      let result = translations[key];
      if (options) {
        Object.entries(options).forEach(([k, v]) => {
          result = result.replace(`{{${k}}}`, String(v));
        });
      }
      return result;
    }
    return key;
  }) as TFunction;
};

// Helper to create mock history items
const createMockHistoryItem = (
  overrides: Partial<EditionHistory> = {}
): EditionHistory => ({
  id: 'test-id',
  edition_id: 'edition-1',
  action: 'created',
  created_at: '2024-01-15T10:30:00Z',
  from_status: null,
  to_status: null,
  from_location: null,
  to_location: null,
  price: null,
  currency: null,
  related_party: null,
  notes: null,
  ...overrides,
});

describe('historyUtils', () => {
  describe('formatDateTime', () => {
    it('formats date in English locale', () => {
      const result = formatDateTime('2024-01-15T10:30:00Z', 'en');
      // Result format depends on timezone, so just check it contains expected parts
      expect(result).toContain('2024');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
    });

    it('formats date in Chinese locale', () => {
      const result = formatDateTime('2024-01-15T10:30:00Z', 'zh');
      expect(result).toContain('2024');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "today" for same day', () => {
      const t = createMockT({ 'relativeTime.today': '今天' });
      const now = new Date();
      const result = formatRelativeTime(now.toISOString(), t);
      expect(result).toBe('今天');
    });

    it('returns "yesterday" for previous day', () => {
      const t = createMockT({ 'relativeTime.yesterday': '昨天' });
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatRelativeTime(yesterday.toISOString(), t);
      expect(result).toBe('昨天');
    });

    it('returns "X days ago" for 2-6 days', () => {
      const t = createMockT({ 'relativeTime.daysAgo': '{{count}}天前' });
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const result = formatRelativeTime(threeDaysAgo.toISOString(), t);
      expect(result).toBe('3天前');
    });

    it('returns "X weeks ago" for 7-29 days', () => {
      const t = createMockT({ 'relativeTime.weeksAgo': '{{count}}周前' });
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const result = formatRelativeTime(twoWeeksAgo.toISOString(), t);
      expect(result).toBe('2周前');
    });

    it('returns "X months ago" for 30-364 days', () => {
      const t = createMockT({ 'relativeTime.monthsAgo': '{{count}}个月前' });
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
      const result = formatRelativeTime(twoMonthsAgo.toISOString(), t);
      expect(result).toBe('2个月前');
    });

    it('returns "X years ago" for 365+ days', () => {
      const t = createMockT({ 'relativeTime.yearsAgo': '{{count}}年前' });
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setDate(oneYearAgo.getDate() - 1); // Ensure > 365 days
      const result = formatRelativeTime(oneYearAgo.toISOString(), t);
      expect(result).toBe('1年前');
    });
  });

  describe('getDateKey', () => {
    it('extracts date part from ISO string', () => {
      expect(getDateKey('2024-01-15T10:30:00Z')).toBe('2024-01-15');
    });

    it('handles different times on same day', () => {
      expect(getDateKey('2024-01-15T00:00:00Z')).toBe('2024-01-15');
      expect(getDateKey('2024-01-15T23:59:59Z')).toBe('2024-01-15');
    });
  });

  describe('mergeHistory', () => {
    it('returns empty array for empty input', () => {
      expect(mergeHistory([])).toEqual([]);
    });

    it('returns single item for one history entry', () => {
      const history = [createMockHistoryItem()];
      const result = mergeHistory(history);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('single');
      expect(result[0].items).toHaveLength(1);
    });

    it('merges consecutive file_added actions on same day', () => {
      const history = [
        createMockHistoryItem({
          id: '1',
          action: 'file_added',
          created_at: '2024-01-15T10:00:00Z',
        }),
        createMockHistoryItem({
          id: '2',
          action: 'file_added',
          created_at: '2024-01-15T11:00:00Z',
        }),
        createMockHistoryItem({
          id: '3',
          action: 'file_added',
          created_at: '2024-01-15T12:00:00Z',
        }),
      ];
      const result = mergeHistory(history);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('merged');
      expect(result[0].items).toHaveLength(3);
      expect(result[0].action).toBe('file_added');
    });

    it('does not merge actions on different days', () => {
      const history = [
        createMockHistoryItem({
          id: '1',
          action: 'file_added',
          created_at: '2024-01-15T10:00:00Z',
        }),
        createMockHistoryItem({
          id: '2',
          action: 'file_added',
          created_at: '2024-01-16T10:00:00Z',
        }),
      ];
      const result = mergeHistory(history);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
    });

    it('does not merge different action types', () => {
      const history = [
        createMockHistoryItem({
          id: '1',
          action: 'file_added',
          created_at: '2024-01-15T10:00:00Z',
        }),
        createMockHistoryItem({
          id: '2',
          action: 'file_deleted',
          created_at: '2024-01-15T11:00:00Z',
        }),
      ];
      const result = mergeHistory(history);

      expect(result).toHaveLength(2);
    });

    it('does not merge non-mergable actions', () => {
      const history = [
        createMockHistoryItem({
          id: '1',
          action: 'status_change',
          created_at: '2024-01-15T10:00:00Z',
        }),
        createMockHistoryItem({
          id: '2',
          action: 'status_change',
          created_at: '2024-01-15T11:00:00Z',
        }),
      ];
      const result = mergeHistory(history);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
    });

    it('handles mixed actions correctly', () => {
      const history = [
        createMockHistoryItem({
          id: '1',
          action: 'file_added',
          created_at: '2024-01-15T10:00:00Z',
        }),
        createMockHistoryItem({
          id: '2',
          action: 'file_added',
          created_at: '2024-01-15T11:00:00Z',
        }),
        createMockHistoryItem({
          id: '3',
          action: 'status_change',
          created_at: '2024-01-15T12:00:00Z',
        }),
        createMockHistoryItem({
          id: '4',
          action: 'file_deleted',
          created_at: '2024-01-15T13:00:00Z',
        }),
        createMockHistoryItem({
          id: '5',
          action: 'file_deleted',
          created_at: '2024-01-15T14:00:00Z',
        }),
      ];
      const result = mergeHistory(history);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('merged');
      expect(result[0].items).toHaveLength(2);
      expect(result[1].type).toBe('single');
      expect(result[2].type).toBe('merged');
      expect(result[2].items).toHaveLength(2);
    });
  });

  describe('getDescription', () => {
    const t = createMockT({
      'descriptions.unknown': '未知',
      'descriptions.statusChange': '从{{from}}变更为{{to}}',
      'descriptions.locationChange': '从{{from}}移至{{to}}',
      'descriptions.sold': '已售出',
      'descriptions.soldWithPrice': '以{{currency}}{{price}}售出',
      'descriptions.soldBuyer': '，买家：{{buyer}}',
      'descriptions.consignedTo': '寄售至{{party}}',
      'descriptions.consignedStart': '开始寄售',
      'descriptions.returnedFrom': '从{{location}}归还',
      'descriptions.returned': '已归还',
      'descriptions.fileAdded': '添加了文件',
      'descriptions.fileDeleted': '删除了文件',
      'descriptions.numberAssigned': '分配了编号',
      'descriptions.created': '创建了版本',
      'descriptions.conditionUpdate': '更新了状态',
    });

    const tStatus = createMockT({
      in_studio: '在工作室',
      at_gallery: '在画廊',
      sold: '已售出',
    });

    it('describes status_change action', () => {
      const item = createMockHistoryItem({
        action: 'status_change',
        from_status: 'in_studio',
        to_status: 'at_gallery',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('从在工作室变更为在画廊');
    });

    it('handles missing status in status_change', () => {
      const item = createMockHistoryItem({
        action: 'status_change',
        from_status: null,
        to_status: 'sold',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('从未知变更为已售出');
    });

    it('describes location_change action', () => {
      const item = createMockHistoryItem({
        action: 'location_change',
        from_location: '北京工作室',
        to_location: '上海画廊',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('从北京工作室移至上海画廊');
    });

    it('describes sold action with price and buyer', () => {
      const item = createMockHistoryItem({
        action: 'sold',
        price: 10000,
        currency: 'USD',
        related_party: '张三',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('以USD10,000售出，买家：张三');
    });

    it('describes sold action without price', () => {
      const item = createMockHistoryItem({
        action: 'sold',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('已售出');
    });

    it('describes consigned action with party', () => {
      const item = createMockHistoryItem({
        action: 'consigned',
        related_party: 'Gallery A',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('寄售至Gallery A');
    });

    it('describes returned action with location', () => {
      const item = createMockHistoryItem({
        action: 'returned',
        from_location: 'Gallery B',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('从Gallery B归还');
    });

    it('describes file_added with custom notes', () => {
      const item = createMockHistoryItem({
        action: 'file_added',
        notes: '添加了证书照片',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('添加了证书照片');
    });

    it('describes created action', () => {
      const item = createMockHistoryItem({
        action: 'created',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('创建了版本');
    });

    it('describes condition_update with notes', () => {
      const item = createMockHistoryItem({
        action: 'condition_update',
        notes: '轻微划痕',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('轻微划痕');
    });

    it('falls back to notes or action for unknown action', () => {
      const item = createMockHistoryItem({
        action: 'unknown_action' as any,
        notes: '自定义备注',
      });
      const result = getDescription(item, t, tStatus);
      expect(result).toBe('自定义备注');
    });
  });

  describe('getActionLabel', () => {
    it('returns translated action label', () => {
      const t = createMockT({ 'actions.created': '创建' });
      expect(getActionLabel('created', t)).toBe('创建');
    });

    it('returns key if translation not found', () => {
      const t = createMockT({});
      expect(getActionLabel('file_added', t)).toBe('actions.file_added');
    });
  });
});
