/**
 * Tests for editionDetailUtils
 */

import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { EditionWithDetails } from './editionDetailUtils';
import {
  formatEditionNumber,
  formatDate,
  formatPrice,
} from './editionDetailUtils';

// Mock translation function
const createMockT = (translations: Record<string, string> = {}): TFunction => {
  return ((key: string) => {
    return translations[key] || key;
  }) as TFunction;
};

// Helper to create mock edition
const createMockEdition = (
  overrides: Partial<EditionWithDetails> = {}
): EditionWithDetails => ({
  id: 'test-id',
  artwork_id: 'artwork-1',
  edition_type: 'numbered',
  edition_number: 1,
  inventory_number: 'INV-001',
  status: 'in_studio',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  consignment_start: null,
  consignment_end: null,
  loan_start: null,
  loan_end: null,
  certificate_number: null,
  storage_detail: null,
  condition: null,
  condition_notes: null,
  notes: null,
  location: null,
  artwork: {
    id: 'artwork-1',
    title_en: 'Test Artwork',
    title_cn: '测试作品',
    thumbnail_url: null,
    edition_total: 10,
  },
  ...overrides,
});

describe('editionDetailUtils', () => {
  describe('formatEditionNumber', () => {
    const t = createMockT({ unique: '唯一版' });

    it('returns empty string for null edition', () => {
      expect(formatEditionNumber(null, t)).toBe('');
    });

    it('returns empty string for undefined edition', () => {
      expect(formatEditionNumber(undefined, t)).toBe('');
    });

    it('returns "唯一版" for unique edition', () => {
      const edition = createMockEdition({ edition_type: 'unique' });
      expect(formatEditionNumber(edition, t)).toBe('唯一版');
    });

    it('formats AP edition correctly', () => {
      const edition = createMockEdition({
        edition_type: 'ap',
        edition_number: 3,
      });
      expect(formatEditionNumber(edition, t)).toBe('AP3');
    });

    it('formats AP edition without number', () => {
      const edition = createMockEdition({
        edition_type: 'ap',
        edition_number: null,
      });
      expect(formatEditionNumber(edition, t)).toBe('AP');
    });

    it('formats numbered edition correctly', () => {
      const edition = createMockEdition({
        edition_type: 'numbered',
        edition_number: 5,
        artwork: {
          id: 'artwork-1',
          title_en: 'Test',
          title_cn: null,
          thumbnail_url: null,
          edition_total: 20,
        },
      });
      expect(formatEditionNumber(edition, t)).toBe('5/20');
    });

    it('handles missing edition_number in numbered edition', () => {
      const edition = createMockEdition({
        edition_type: 'numbered',
        edition_number: null,
        artwork: {
          id: 'artwork-1',
          title_en: 'Test',
          title_cn: null,
          thumbnail_url: null,
          edition_total: 20,
        },
      });
      expect(formatEditionNumber(edition, t)).toBe('?/20');
    });

    it('handles missing edition_total in numbered edition', () => {
      const edition = createMockEdition({
        edition_type: 'numbered',
        edition_number: 5,
        artwork: {
          id: 'artwork-1',
          title_en: 'Test',
          title_cn: null,
          thumbnail_url: null,
          edition_total: null,
        },
      });
      expect(formatEditionNumber(edition, t)).toBe('5/?');
    });

    it('handles null artwork in numbered edition', () => {
      const edition = createMockEdition({
        edition_type: 'numbered',
        edition_number: 5,
        artwork: null,
      });
      expect(formatEditionNumber(edition, t)).toBe('5/?');
    });
  });

  describe('formatDate', () => {
    it('returns "-" for null date', () => {
      expect(formatDate(null, 'en')).toBe('-');
    });

    it('formats date in English locale', () => {
      const result = formatDate('2024-01-15', 'en');
      // Check for expected parts (exact format depends on locale)
      expect(result).toContain('2024');
      expect(result).toContain('January');
      expect(result).toContain('15');
    });

    it('formats date in Chinese locale', () => {
      const result = formatDate('2024-01-15', 'zh');
      expect(result).toContain('2024');
    });
  });

  describe('formatPrice', () => {
    it('returns "-" for null price', () => {
      expect(formatPrice(null, null)).toBe('-');
    });

    it('returns "-" for zero price', () => {
      expect(formatPrice(0, 'USD')).toBe('-');
    });

    it('formats USD price', () => {
      expect(formatPrice(10000, 'USD')).toBe('$10,000');
    });

    it('formats EUR price', () => {
      expect(formatPrice(5000, 'EUR')).toBe('€5,000');
    });

    it('formats GBP price', () => {
      expect(formatPrice(3000, 'GBP')).toBe('£3,000');
    });

    it('formats CNY price', () => {
      expect(formatPrice(50000, 'CNY')).toBe('¥50,000');
    });

    it('formats JPY price', () => {
      expect(formatPrice(100000, 'JPY')).toBe('¥100,000');
    });

    it('uses currency code for unknown currency', () => {
      expect(formatPrice(1000, 'CHF')).toBe('CHF1,000');
    });

    it('defaults to USD symbol when currency is null', () => {
      expect(formatPrice(1000, null)).toBe('$1,000');
    });

    it('handles large numbers', () => {
      expect(formatPrice(1000000, 'USD')).toBe('$1,000,000');
    });

    it('handles decimal-ish numbers via toLocaleString', () => {
      expect(formatPrice(1234.56, 'USD')).toContain('1,234');
    });
  });
});
