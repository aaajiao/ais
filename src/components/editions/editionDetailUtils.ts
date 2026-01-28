/**
 * Edition detail utility functions
 */

import type { TFunction } from 'i18next';
import type { EditionStatus } from '@/lib/types';

export interface EditionWithDetails {
  id: string;
  artwork_id: string;
  edition_type: 'numbered' | 'ap' | 'unique';
  edition_number: number | null;
  inventory_number: string | null;
  status: EditionStatus;
  sale_price: number | null;
  sale_currency: string | null;
  sale_date: string | null;
  buyer_name: string | null;
  consignment_start: string | null;
  consignment_end: string | null;
  loan_start: string | null;
  loan_end: string | null;
  certificate_number: string | null;
  storage_detail: string | null;
  condition: string | null;
  condition_notes: string | null;
  notes: string | null;
  location: {
    id: string;
    name: string;
    address: string | null;
    contact: string | null;
    notes: string | null;
  } | null;
  artwork: {
    id: string;
    title_en: string;
    title_cn: string | null;
    thumbnail_url: string | null;
    edition_total: number | null;
  } | null;
}

/**
 * Format edition number based on type
 */
export function formatEditionNumber(
  edition: EditionWithDetails | null | undefined,
  t: TFunction
): string {
  if (!edition) return '';
  if (edition.edition_type === 'unique') return t('unique');
  if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
  return `${edition.edition_number || '?'}/${edition.artwork?.edition_total || '?'}`;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | null, locale: string): string {
  if (!dateString) return '-';
  const localeStr = locale === 'zh' ? 'zh-CN' : 'en-US';
  return new Date(dateString).toLocaleDateString(localeStr, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format price with currency symbol
 */
export function formatPrice(price: number | null, currency: string | null): string {
  if (!price) return '-';
  const currencySymbol: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CNY: '¥',
    JPY: '¥',
  };
  const symbol = currencySymbol[currency || 'USD'] || currency || '$';
  return `${symbol}${price.toLocaleString()}`;
}
