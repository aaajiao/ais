import { describe, it, expect } from 'vitest';
import { formatEditionNumber, formatPrice, formatDate } from './formatters';

describe('formatEditionNumber', () => {
  it('should format unique edition', () => {
    expect(formatEditionNumber({ edition_type: 'unique', edition_number: null }, 10, 'Unique')).toBe('Unique');
    expect(formatEditionNumber({ edition_type: 'unique', edition_number: 1 }, 10, '独版')).toBe('独版');
  });

  it('should format AP edition', () => {
    expect(formatEditionNumber({ edition_type: 'ap', edition_number: 1 }, 10)).toBe('AP1');
    expect(formatEditionNumber({ edition_type: 'ap', edition_number: 2 }, 10)).toBe('AP2');
  });

  it('should format AP edition without number', () => {
    expect(formatEditionNumber({ edition_type: 'ap', edition_number: null }, 10)).toBe('AP');
  });

  it('should format numbered edition', () => {
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: 1 }, 10)).toBe('1/10');
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: 5 }, 20)).toBe('5/20');
  });

  it('should handle missing edition number', () => {
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: null }, 10)).toBe('?/10');
  });

  it('should handle missing edition total', () => {
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: 1 }, null)).toBe('1/?');
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: 1 }, undefined)).toBe('1/?');
  });

  it('should handle both missing', () => {
    expect(formatEditionNumber({ edition_type: 'numbered', edition_number: null }, null)).toBe('?/?');
  });
});

describe('formatPrice', () => {
  it('should return dash for null price', () => {
    expect(formatPrice(null, 'USD')).toBe('-');
  });

  it('should return dash for zero price', () => {
    expect(formatPrice(0, 'USD')).toBe('-');
  });

  it('should format USD price', () => {
    expect(formatPrice(1000, 'USD')).toBe('$1,000');
    expect(formatPrice(1234567, 'USD')).toBe('$1,234,567');
  });

  it('should format EUR price', () => {
    expect(formatPrice(1000, 'EUR')).toBe('€1,000');
  });

  it('should format GBP price', () => {
    expect(formatPrice(1000, 'GBP')).toBe('£1,000');
  });

  it('should format CNY price', () => {
    expect(formatPrice(1000, 'CNY')).toBe('¥1,000');
  });

  it('should format JPY price', () => {
    expect(formatPrice(1000, 'JPY')).toBe('¥1,000');
  });

  it('should format CHF price', () => {
    expect(formatPrice(1000, 'CHF')).toBe('Fr1,000');
  });

  it('should format HKD price', () => {
    expect(formatPrice(1000, 'HKD')).toBe('HK$1,000');
  });

  it('should use USD as default currency', () => {
    expect(formatPrice(1000, null)).toBe('$1,000');
  });

  it('should use unknown currency code as symbol', () => {
    expect(formatPrice(1000, 'BTC')).toBe('BTC1,000');
  });
});

describe('formatDate', () => {
  it('should return dash for null date', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('should return dash for empty string', () => {
    expect(formatDate('')).toBe('-');
  });

  it('should format date in English', () => {
    const result = formatDate('2024-03-15', 'en');
    expect(result).toContain('March');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should format date in Chinese', () => {
    const result = formatDate('2024-03-15', 'zh');
    expect(result).toContain('2024');
    expect(result).toContain('3');
    expect(result).toContain('15');
  });

  it('should default to English locale', () => {
    const result = formatDate('2024-03-15');
    expect(result).toContain('March');
  });

  it('should handle ISO date strings', () => {
    const result = formatDate('2024-03-15T10:30:00Z', 'en');
    expect(result).toContain('March');
    expect(result).toContain('2024');
  });
});
