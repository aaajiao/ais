// 导出功能类型定义和数据获取

import type { Artwork, Edition, Location, EditionFile, EditionHistory, EditionStatus } from '../types.js';

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
  includeFiles: boolean;
}

// 导出用的作品数据（包含版本统计 + 版本文件 + 版本历史）
export interface ArtworkExportData {
  artwork: Artwork;
  editions: Edition[];
  locations: Map<string, Location>;
  // 版本文件，按 edition_id 分组（无文件的 edition 不出现在 Map 中）
  filesByEdition: Map<string, EditionFile[]>;
  // 版本历史，按 edition_id 分组；undefined 表示未请求历史（仅全量备份请求）
  historyByEdition?: Map<string, EditionHistory[]>;
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

// 历史动作标签映射
const HISTORY_ACTION_LABELS: Record<string, { zh: string; en: string }> = {
  created: { zh: '创建', en: 'Created' },
  status_change: { zh: '状态变更', en: 'Status changed' },
  location_change: { zh: '位置变更', en: 'Location changed' },
  sold: { zh: '售出', en: 'Sold' },
  consigned: { zh: '寄售', en: 'Consigned' },
  returned: { zh: '归还', en: 'Returned' },
  condition_update: { zh: '品相更新', en: 'Condition updated' },
  file_added: { zh: '文件添加', en: 'File added' },
  file_deleted: { zh: '文件删除', en: 'File deleted' },
  number_assigned: { zh: '编号分配', en: 'Number assigned' },
};

// 版本编号标签（"1/5" / "AP 1" / "Unique"）
export function formatEditionLabel(
  edition: Edition,
  artwork: Artwork,
  lang: 'zh' | 'en' = 'en'
): string {
  if (edition.edition_type === 'unique') {
    return lang === 'zh' ? '独版' : 'Unique';
  }
  if (edition.edition_type === 'ap') {
    return `AP ${edition.edition_number || ''}`.trim();
  }
  // numbered
  return `${edition.edition_number || '?'}/${artwork.edition_total || '?'}`;
}

// 版本标题（"### 1/5 · INV-001" 中的 "1/5 · INV-001" 部分）
export function formatEditionHeading(
  edition: Edition,
  artwork: Artwork,
  lang: 'zh' | 'en' = 'en'
): string {
  const label = formatEditionLabel(edition, artwork, lang);
  if (edition.inventory_number) {
    return `${label} · ${edition.inventory_number}`;
  }
  return label;
}

// 版本字段列表（每个 toggle 控制对应字段；空值不输出整行）
export function formatEditionFields(
  edition: Edition,
  locations: Map<string, Location>,
  options: ExportOptions,
  lang: 'zh' | 'en' = 'en'
): string[] {
  const lines: string[] = [];

  // Status（仅在 includeStatus 开启时）
  if (options.includeStatus) {
    const statusLabel = STATUS_LABELS[edition.status]?.[lang] || edition.status;
    lines.push(`- **Status**: ${statusLabel}`);
  }

  // Location（仅在 includeLocation 开启且有位置时）
  if (options.includeLocation && edition.location_id) {
    const location = locations.get(edition.location_id);
    if (location) {
      lines.push(`- **Location**: ${location.name}`);
    }
  }

  // Storage（保留原有"双门控"语义：需要 includeLocation + includeDetails）
  if (options.includeLocation && options.includeDetails && edition.storage_detail) {
    lines.push(`- **Storage**: ${edition.storage_detail}`);
  }

  // Price（仅在 includePrice 开启且有价格时）
  if (options.includePrice && edition.sale_price && edition.sale_currency) {
    lines.push(`- **Price**: ${formatPrice(edition.sale_price, edition.sale_currency)} ${edition.sale_currency}`);
  }

  // Certificate（始终输出 —— 等同身份标识）
  if (edition.certificate_number) {
    lines.push(`- **Certificate**: ${edition.certificate_number}`);
  }

  // 详细信息（受 includeDetails 控制）
  if (options.includeDetails) {
    if (edition.condition) {
      const conditionText = edition.condition_notes
        ? `${edition.condition} — ${edition.condition_notes}`
        : edition.condition;
      lines.push(`- **Condition**: ${conditionText}`);
    }
    if (edition.buyer_name) {
      lines.push(`- **Buyer**: ${edition.buyer_name}`);
    }
    if (edition.sale_date) {
      lines.push(`- **Sale Date**: ${edition.sale_date}`);
    }
    if (edition.consignment_start || edition.consignment_end) {
      const range = [edition.consignment_start, edition.consignment_end].filter(Boolean).join(' ~ ');
      lines.push(`- **Consignment**: ${range}`);
    }
    if (edition.loan_start || edition.loan_end || edition.loan_institution) {
      const loanParts: string[] = [];
      if (edition.loan_institution) loanParts.push(edition.loan_institution);
      const range = [edition.loan_start, edition.loan_end].filter(Boolean).join(' ~ ');
      if (range) loanParts.push(range);
      if (loanParts.length > 0) lines.push(`- **Loan**: ${loanParts.join(', ')}`);
    }
    if (edition.notes) {
      lines.push(`- **Notes**: ${edition.notes}`);
    }
  }

  return lines;
}

// 版本文件块（仅在 includeFiles=true 且有文件时输出）
export function formatEditionFiles(
  files: EditionFile[] | undefined,
  options: ExportOptions,
  lang: 'zh' | 'en' = 'en'
): string[] {
  if (!options.includeFiles || !files || files.length === 0) {
    return [];
  }
  const lines: string[] = [];
  lines.push(`**${lang === 'zh' ? '文件' : 'Files'}**:`);
  const sorted = [...files].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const f of sorted) {
    const name = f.file_name || f.file_url;
    const tagParts: string[] = [f.file_type];
    if (f.description) tagParts.push(f.description);
    lines.push(`- [${name}](${f.file_url}) — ${tagParts.join(', ')}`);
  }
  return lines;
}

// 版本历史块（仅在传入 history 时输出 —— 调用方负责仅在 scope=all 时传入）
export function formatEditionHistory(
  history: EditionHistory[] | undefined,
  lang: 'zh' | 'en' = 'en'
): string[] {
  if (!history || history.length === 0) {
    return [];
  }
  const lines: string[] = [];
  lines.push(`**${lang === 'zh' ? '历史' : 'History'}**:`);
  // 时间倒序：最新在前
  const sorted = [...history].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const h of sorted) {
    const date = h.created_at.slice(0, 10);
    const actionLabel = HISTORY_ACTION_LABELS[h.action]?.[lang] || h.action;
    const segments: string[] = [date, '—', actionLabel];

    // 状态/位置流转
    if (h.from_status || h.to_status) {
      const arrow = `${h.from_status || '-'} → ${h.to_status || '-'}`;
      segments.push(`(${arrow})`);
    } else if (h.from_location || h.to_location) {
      const arrow = `${h.from_location || '-'} → ${h.to_location || '-'}`;
      segments.push(`(${arrow})`);
    }

    // 相关方
    if (h.related_party) {
      segments.push(`· ${h.related_party}`);
    }

    // 价格
    if (h.price && h.currency) {
      segments.push(`· ${formatPrice(h.price, h.currency)} ${h.currency}`);
    }

    // 备注
    if (h.notes) {
      segments.push(`· ${h.notes}`);
    }

    lines.push(`- ${segments.join(' ')}`);
  }
  return lines;
}

// 编排单个版本完整块（heading + fields + files + history）
export function formatEditionBlock(
  edition: Edition,
  artwork: Artwork,
  locations: Map<string, Location>,
  files: EditionFile[] | undefined,
  history: EditionHistory[] | undefined,
  options: ExportOptions,
  lang: 'zh' | 'en' = 'en'
): string[] {
  const lines: string[] = [];
  lines.push(`### ${formatEditionHeading(edition, artwork, lang)}`);
  lines.push('');

  const fields = formatEditionFields(edition, locations, options, lang);
  if (fields.length > 0) {
    lines.push(...fields);
    lines.push('');
  }

  const fileLines = formatEditionFiles(files, options, lang);
  if (fileLines.length > 0) {
    lines.push(...fileLines);
    lines.push('');
  }

  const historyLines = formatEditionHistory(history, lang);
  if (historyLines.length > 0) {
    lines.push(...historyLines);
    lines.push('');
  }

  return lines;
}

// 对一组版本按类型 + 编号排序
export function sortEditions(editions: Edition[]): Edition[] {
  const typeOrder: Record<string, number> = { numbered: 0, ap: 1, unique: 2 };
  return [...editions].sort((a, b) => {
    const typeCompare = (typeOrder[a.edition_type] || 0) - (typeOrder[b.edition_type] || 0);
    if (typeCompare !== 0) return typeCompare;
    return (a.edition_number || 0) - (b.edition_number || 0);
  });
}
