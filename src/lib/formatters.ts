/**
 * 格式化版本号显示
 */
export function formatEditionNumber(
  edition: { edition_type: string; edition_number: number | null },
  editionTotal: number | null | undefined,
  uniqueLabel: string = 'Unique'
): string {
  if (edition.edition_type === 'unique') return uniqueLabel;
  if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
  return `${edition.edition_number || '?'}/${editionTotal || '?'}`;
}

/**
 * 格式化价格显示
 */
export function formatPrice(price: number | null, currency: string | null): string {
  if (!price) return '-';
  const currencySymbol: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CNY: '¥',
    JPY: '¥',
    CHF: 'Fr',
    HKD: 'HK$',
  };
  const symbol = currencySymbol[currency || 'USD'] || currency || '$';
  return `${symbol}${price.toLocaleString()}`;
}

/**
 * 格式化日期显示
 */
export function formatDate(
  dateString: string | null,
  locale: string = 'en'
): string {
  if (!dateString) return '-';
  const localeCode = locale === 'zh' ? 'zh-CN' : 'en-US';
  return new Date(dateString).toLocaleDateString(localeCode, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
