/**
 * PDF 导出辅助函数
 *
 * 从 pdf.ts 中提取的纯函数，方便单元测试。
 */

import type { CatalogItem, CatalogOptions } from './catalog-template.js';
import type { ArtworkExportData, ExportOptions } from '../../src/lib/exporters/index.js';
import { formatEditionInfo, formatPrice } from '../../src/lib/exporters/index.js';

// 状态标签映射
export const STATUS_LABELS: Record<string, string> = {
  in_production: 'In Production',
  in_studio: 'In Studio',
  at_gallery: 'On Loan',
  at_museum: 'On Exhibition',
  in_transit: 'In Transit',
  sold: 'Sold',
  gifted: 'Gifted',
  lost: 'Lost',
  damaged: 'Damaged',
};

// Edition 行类型（Supabase 查询结果）
export type EditionRow = {
  id: string;
  edition_type: string;
  edition_number: number | null;
  status: string;
  sale_price: number | null;
  sale_currency: string | null;
  artwork: {
    id: string;
    title_en: string;
    title_cn: string | null;
    year: string | null;
    type: string | null;
    materials: string | null;
    dimensions: string | null;
    duration: string | null;
    thumbnail_url: string | null;
    source_url: string | null;
    edition_total: number | null;
    ap_total: number | null;
    is_unique: boolean | null;
  } | null;
};

/**
 * 格式化版本标签
 */
export function formatEditionLabel(edition: EditionRow & { artwork: NonNullable<EditionRow['artwork']> }): string {
  const { artwork } = edition;

  if (edition.edition_type === 'unique' || artwork.is_unique) {
    return 'Unique';
  }
  if (edition.edition_type === 'ap') {
    return edition.edition_number
      ? `AP ${edition.edition_number}${artwork.ap_total ? '/' + artwork.ap_total : ''}`
      : 'AP';
  }
  if (edition.edition_number) {
    return artwork.edition_total
      ? `${edition.edition_number}/${artwork.edition_total}`
      : `${edition.edition_number}`;
  }
  return '';
}

/**
 * 格式化版本概要信息
 */
export function formatEditionSummary(artwork: NonNullable<EditionRow['artwork']>): string {
  if (artwork.is_unique) return 'Unique';
  const parts: string[] = [];
  if (artwork.edition_total) parts.push(`Edition of ${artwork.edition_total}`);
  if (artwork.ap_total) parts.push(`${artwork.ap_total}AP`);
  return parts.join(' + ') || 'N/A';
}

/**
 * 从 edition 行数据构建 CatalogItem（不含图片获取）
 */
export function buildCatalogItemFromEdition(
  edition: EditionRow,
  options: CatalogOptions,
  imageCache?: Map<string, string>
): CatalogItem | null {
  if (!edition.artwork) return null;

  const artwork = edition.artwork;
  const editionLabel = formatEditionLabel(edition as EditionRow & { artwork: NonNullable<EditionRow['artwork']> });
  const editionInfo = formatEditionSummary(artwork);

  return {
    titleEn: artwork.title_en,
    titleCn: artwork.title_cn || undefined,
    year: artwork.year || undefined,
    type: artwork.type || undefined,
    materials: artwork.materials || undefined,
    dimensions: artwork.dimensions || undefined,
    duration: artwork.duration || undefined,
    editionLabel,
    editionInfo,
    status: options.includeStatus ? (STATUS_LABELS[edition.status] || edition.status) : undefined,
    price: options.includePrice && edition.sale_price && edition.sale_currency
      ? formatPrice(edition.sale_price, edition.sale_currency)
      : undefined,
    thumbnailBase64: artwork.thumbnail_url && imageCache ? imageCache.get(artwork.thumbnail_url) || undefined : undefined,
    sourceUrl: artwork.source_url || undefined,
  };
}

/**
 * 从 ArtworkExportData 构建 CatalogItem（不含图片获取）
 */
export function buildCatalogItemFromArtworkData(
  data: ArtworkExportData,
  options: ExportOptions,
  imageCache?: Map<string, string>
): CatalogItem {
  const { artwork, priceInfo, editions } = data;

  const firstEdition = editions[0];
  const status = options.includeStatus && firstEdition
    ? (STATUS_LABELS[firstEdition.status] || firstEdition.status)
    : undefined;

  return {
    titleEn: artwork.title_en,
    titleCn: artwork.title_cn || undefined,
    year: artwork.year || undefined,
    type: artwork.type || undefined,
    materials: artwork.materials || undefined,
    dimensions: artwork.dimensions || undefined,
    duration: artwork.duration || undefined,
    editionLabel: formatEditionInfo(artwork),
    editionInfo: formatEditionInfo(artwork),
    status,
    price: options.includePrice && priceInfo
      ? formatPrice(priceInfo.price, priceInfo.currency)
      : undefined,
    thumbnailBase64: artwork.thumbnail_url && imageCache ? imageCache.get(artwork.thumbnail_url) || undefined : undefined,
    sourceUrl: artwork.source_url || undefined,
  };
}

/**
 * 生成 PDF 文件名
 */
export function generatePDFFilename(label: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `aaajiao-${slug}-${dateStr}.pdf`;
}

/**
 * 格式化日期（英文长格式）
 */
export function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
