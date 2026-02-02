// 导出功能类型定义和数据获取

import type { Artwork, Edition, Location, EditionStatus } from '../types.js';

// 导出请求参数
export interface ExportRequest {
  scope: 'single' | 'selected' | 'all';
  artworkIds?: string[];
  editionIds?: string[];  // 可选：指定导出的版本 ID（仅单作品导出时有效）
  format: 'pdf' | 'md';
  options: ExportOptions;
  artistName?: string;    // 项目/艺术家名称，默认 "aaajiao"
}

// 导出选项
export interface ExportOptions {
  includePrice: boolean;
  includeStatus: boolean;
  includeLocation: boolean;
  includeDetails: boolean;
}

// 导出用的作品数据（包含版本统计）
export interface ArtworkExportData {
  artwork: Artwork;
  editions: Edition[];
  locations: Map<string, Location>;
  // 版本统计
  stats: {
    total: number;
    inStock: number;      // 在库（in_studio, at_gallery, at_museum）
    onLoan: number;       // 外借中（at_gallery）
    sold: number;         // 已售
    other: number;        // 其他（in_production, in_transit, gifted, lost, damaged）
  };
  // 价格信息（如果有）
  priceInfo?: {
    price: number;
    currency: string;
  };
}

// 状态分类
const IN_STOCK_STATUSES: EditionStatus[] = ['in_studio', 'at_gallery', 'at_museum'];
const SOLD_STATUSES: EditionStatus[] = ['sold'];
const ON_LOAN_STATUSES: EditionStatus[] = ['at_gallery']; // 外借中（画廊、私人藏家、机构等）

// 计算版本统计
export function calculateEditionStats(editions: Edition[]): ArtworkExportData['stats'] {
  const stats = {
    total: editions.length,
    inStock: 0,
    onLoan: 0,
    sold: 0,
    other: 0,
  };

  for (const edition of editions) {
    if (SOLD_STATUSES.includes(edition.status)) {
      stats.sold++;
    } else if (IN_STOCK_STATUSES.includes(edition.status)) {
      stats.inStock++;
      // at_gallery 同时计入外借中
      if (ON_LOAN_STATUSES.includes(edition.status)) {
        stats.onLoan++;
      }
    } else {
      stats.other++;
    }
  }

  return stats;
}

// 获取作品的价格信息（取第一个有价格的版本）
export function getArtworkPriceInfo(editions: Edition[]): ArtworkExportData['priceInfo'] | undefined {
  for (const edition of editions) {
    if (edition.sale_price && edition.sale_currency) {
      return {
        price: edition.sale_price,
        currency: edition.sale_currency,
      };
    }
  }
  return undefined;
}

// 格式化版本信息字符串
export function formatEditionInfo(artwork: Artwork): string {
  if (artwork.is_unique) {
    return 'Unique';
  }

  const parts: string[] = [];

  if (artwork.edition_total) {
    parts.push(`Edition of ${artwork.edition_total}`);
  }

  if (artwork.ap_total) {
    parts.push(`${artwork.ap_total}AP`);
  }

  return parts.join(' + ') || 'N/A';
}

// 格式化价格显示
export function formatPrice(price: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(price);
}

// 格式化状态统计显示
export function formatStatusStats(stats: ArtworkExportData['stats'], lang: 'zh' | 'en' = 'zh'): string {
  const parts: string[] = [];

  const labels = lang === 'en'
    ? { inStock: 'In Stock', onLoan: 'On Loan', sold: 'Sold', none: 'No editions' }
    : { inStock: '在库', onLoan: '外借中', sold: '已售', none: '无版本' };

  if (stats.inStock > 0) {
    parts.push(`${labels.inStock}: ${stats.inStock}`);
  }
  if (stats.onLoan > 0) {
    parts.push(`${labels.onLoan}: ${stats.onLoan}`);
  }
  if (stats.sold > 0) {
    parts.push(`${labels.sold}: ${stats.sold}`);
  }

  return parts.join(' | ') || labels.none;
}

// 获取位置名称列表
export function getLocationNames(editions: Edition[], locations: Map<string, Location>): string[] {
  const locationNames = new Set<string>();

  for (const edition of editions) {
    if (edition.location_id) {
      const location = locations.get(edition.location_id);
      if (location) {
        locationNames.add(location.name);
      }
    }
  }

  return Array.from(locationNames);
}

// 状态标签映射
const STATUS_LABELS: Record<EditionStatus, { zh: string; en: string }> = {
  in_production: { zh: '制作中', en: 'In Production' },
  in_studio: { zh: '在库', en: 'In Studio' },
  at_gallery: { zh: '外借中', en: 'On Loan' },
  at_museum: { zh: '展览中', en: 'On Exhibition' },
  in_transit: { zh: '运输中', en: 'In Transit' },
  sold: { zh: '已售', en: 'Sold' },
  gifted: { zh: '赠送', en: 'Gifted' },
  lost: { zh: '遗失', en: 'Lost' },
  damaged: { zh: '损坏', en: 'Damaged' },
};

// 格式化单个版本的显示文本（主行 + 详情子行）
export function formatEditionLine(
  edition: Edition,
  artwork: Artwork,
  locations: Map<string, Location>,
  options: ExportOptions,
  lang: 'zh' | 'en' = 'zh'
): { main: string; details: string[] } {
  const parts: string[] = [];
  const details: string[] = [];

  // 1. 版本编号
  let editionLabel: string;
  if (edition.edition_type === 'unique') {
    editionLabel = lang === 'zh' ? '独版' : 'Unique';
  } else if (edition.edition_type === 'ap') {
    editionLabel = `AP ${edition.edition_number || ''}`.trim();
  } else {
    // numbered
    editionLabel = `${edition.edition_number || '?'}/${artwork.edition_total || '?'}`;
  }
  parts.push(editionLabel);

  // 库存编号（始终输出）
  if (edition.inventory_number) {
    parts.push(edition.inventory_number);
  }

  // 2. 位置（如果选项启用且有位置）
  if (options.includeLocation && edition.location_id) {
    const location = locations.get(edition.location_id);
    if (location) {
      parts.push(location.name);
    }
  }

  // 3. 状态（如果选项启用）
  if (options.includeStatus) {
    const statusLabel = STATUS_LABELS[edition.status]?.[lang] || edition.status;
    // 对于在库状态，如果已显示位置则不重复显示"在库"
    if (edition.status === 'in_studio' && options.includeLocation && edition.location_id) {
      // 不显示状态，位置已足够表达
    } else {
      parts.push(`(${statusLabel})`);
    }
  }

  // 4. 价格（如果选项启用且有价格）
  if (options.includePrice && edition.sale_price && edition.sale_currency) {
    parts.push(formatPrice(edition.sale_price, edition.sale_currency));
  }

  // 证书编号（始终输出）
  if (edition.certificate_number) {
    details.push(`Certificate: ${edition.certificate_number}`);
  }

  // 5. 详细信息（如果选项启用）
  if (options.includeDetails) {
    if (edition.condition) {
      const conditionText = edition.condition_notes
        ? `${edition.condition} — ${edition.condition_notes}`
        : edition.condition;
      details.push(`Condition: ${conditionText}`);
    }
    if (edition.buyer_name) {
      details.push(`Buyer: ${edition.buyer_name}`);
    }
    if (edition.sale_date) {
      details.push(`Sale Date: ${edition.sale_date}`);
    }
    if (edition.consignment_start || edition.consignment_end) {
      const range = [edition.consignment_start, edition.consignment_end].filter(Boolean).join(' ~ ');
      details.push(`Consignment: ${range}`);
    }
    if (edition.loan_start || edition.loan_end || edition.loan_institution) {
      const loanParts: string[] = [];
      if (edition.loan_institution) loanParts.push(edition.loan_institution);
      const range = [edition.loan_start, edition.loan_end].filter(Boolean).join(' ~ ');
      if (range) loanParts.push(range);
      if (loanParts.length > 0) details.push(`Loan: ${loanParts.join(', ')}`);
    }
    if (options.includeLocation && edition.storage_detail) {
      details.push(`Storage: ${edition.storage_detail}`);
    }
    if (edition.notes) {
      details.push(`Notes: ${edition.notes}`);
    }
  }

  return { main: parts.join(', '), details };
}

// 格式化所有版本为行数组（每个元素包含主行和详情子行）
export function formatEditionLines(
  editions: Edition[],
  artwork: Artwork,
  locations: Map<string, Location>,
  options: ExportOptions,
  lang: 'zh' | 'en' = 'zh'
): { main: string; details: string[] }[] {
  if (editions.length === 0) {
    return [{ main: lang === 'zh' ? '无版本信息' : 'No editions', details: [] }];
  }

  // 按版本类型和编号排序
  const sortedEditions = [...editions].sort((a, b) => {
    // 类型优先级: numbered > ap > unique
    const typeOrder: Record<string, number> = { numbered: 0, ap: 1, unique: 2 };
    const typeCompare = (typeOrder[a.edition_type] || 0) - (typeOrder[b.edition_type] || 0);
    if (typeCompare !== 0) return typeCompare;

    // 同类型按编号排序
    return (a.edition_number || 0) - (b.edition_number || 0);
  });

  return sortedEditions.map(edition =>
    formatEditionLine(edition, artwork, locations, options, lang)
  );
}
