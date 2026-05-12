import type {
  VizArtwork,
  VizEdition,
  VizLocation,
} from '@/hooks/queries/useVisualizationData';

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

export interface TerminalRow {
  /** edition.id */
  id: string;
  /** artwork.year，原始字符串，如 '2017' / '2014–2015' / null */
  year: string | null;
  /** artwork.type，如 'Installation' / null */
  type: string | null;
  /** edition.inventory_number */
  inventoryNumber: string | null;
  /** 格式化后的版本标签，如 '1/3' / '1/3+AP1' / 'unique' / '#3' */
  editionLabel: string;
  /** edition.status */
  status: string;
  /** 格式化后的位置名称，如 'Tabula Rasa London (London, UK)' / null */
  locationName: string | null;
  /** 格式化后的价格，如 'EUR 4,500' / null */
  priceLabel: string | null;
  /** artwork.id（用于 navigate） */
  artworkId: string;
}

export type GroupBy = 'none' | 'status' | 'year' | 'location';

export interface TerminalGroup {
  key: string;
  rows: TerminalRow[];
}

export interface TerminalStats {
  artworksTotal: number;
  artworksWithEditions: number;
  editionsTotal: number;
  marketsLine: string;
}

// ──────────────────────────────────────────────
// 辅助：版本标签
// ──────────────────────────────────────────────

/**
 * 生成 editionLabel：
 * - unique → 'unique'
 * - ap (edition_type='ap') → '#1' 或 '#N'，或带 total 的 'AP1/2'
 * - numbered 且有 total → '1/3'
 * - numbered 只知道 number → '#1'
 * - 都不知道 → '#?'
 *
 * artwork.edition_total / ap_total 来自 artwork；edition.edition_number 来自 edition。
 */
export function buildEditionLabel(
  edition: Pick<VizEdition, 'edition_type' | 'edition_number'>,
  artwork: Pick<VizArtwork, 'edition_total' | 'ap_total' | 'is_unique'>
): string {
  if (artwork.is_unique || edition.edition_type === 'unique') return 'unique';

  if (edition.edition_type === 'ap') {
    const num = edition.edition_number;
    const total = artwork.ap_total;
    if (num !== null && num !== undefined) {
      if (total !== null && total !== undefined) {
        return `AP${num}/${total}`;
      }
      return `AP${num}`;
    }
    return 'AP';
  }

  // numbered
  const num = edition.edition_number;
  const total = artwork.edition_total;
  if (num !== null && num !== undefined) {
    if (total !== null && total !== undefined) {
      return `${num}/${total}`;
    }
    return `#${num}`;
  }
  return '#?';
}

// ──────────────────────────────────────────────
// 辅助：位置名称
// ──────────────────────────────────────────────

/**
 * 格式化位置名称：
 * - 有 city 且有 country → 'Name (City, Country)'
 * - 只有 city → 'Name (City)'
 * - 只有 country → 'Name (Country)'
 * - 都没有 → 'Name'
 * - location 为 null → null
 */
export function buildLocationName(location: VizLocation | null | undefined): string | null {
  if (!location) return null;
  const parts: string[] = [];
  if (location.city) parts.push(location.city);
  if (location.country) parts.push(location.country);
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `${location.name}${suffix}`;
}

// ──────────────────────────────────────────────
// 辅助：价格标签
// ──────────────────────────────────────────────

export function buildPriceLabel(
  price: number | null | undefined,
  currency: string | null | undefined
): string | null {
  if (price === null || price === undefined) return null;
  if (!currency) return null;
  // 格式化数字，千分位逗号
  const formatted = price.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currency} ${formatted}`;
}

// ──────────────────────────────────────────────
// 辅助：inventory_number 自然排序比较器
// ──────────────────────────────────────────────

/**
 * 自然排序：比较字符串时，数字段按数值排序。
 * 'AAJ-2017-002' < 'AAJ-2017-010'
 */
export function naturalCompare(a: string, b: string): number {
  // 按数字和非数字分段进行比较
  const tokenize = (s: string): Array<string | number> => {
    const parts: Array<string | number> = [];
    const re = /(\d+)|(\D+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m[1] !== undefined) {
        parts.push(Number(m[1]));
      } else {
        parts.push(m[2]);
      }
    }
    return parts;
  };

  const aParts = tokenize(a);
  const bParts = tokenize(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] ?? '';
    const bp = bParts[i] ?? '';
    if (typeof ap === 'number' && typeof bp === 'number') {
      if (ap !== bp) return ap - bp;
    } else {
      const as = String(ap);
      const bs = String(bp);
      if (as < bs) return -1;
      if (as > bs) return 1;
    }
  }
  return 0;
}

// ──────────────────────────────────────────────
// 主：buildRows
// ──────────────────────────────────────────────

export function buildRows(
  artworks: VizArtwork[],
  editions: VizEdition[],
  locations: VizLocation[]
): TerminalRow[] {
  // 建索引
  const artworkMap = new Map<string, VizArtwork>();
  for (const a of artworks) artworkMap.set(a.id, a);

  const locationMap = new Map<string, VizLocation>();
  for (const l of locations) locationMap.set(l.id, l);

  const rows: TerminalRow[] = editions.map((e) => {
    const artwork = artworkMap.get(e.artwork_id);
    const location = e.location_id ? locationMap.get(e.location_id) : null;

    return {
      id: e.id,
      year: artwork?.year ?? null,
      type: artwork?.type ?? null,
      inventoryNumber: e.inventory_number ?? null,
      editionLabel: artwork
        ? buildEditionLabel(e, artwork)
        : e.edition_number !== null && e.edition_number !== undefined
          ? `#${e.edition_number}`
          : '#?',
      status: e.status,
      locationName: buildLocationName(location ?? null),
      priceLabel: buildPriceLabel(e.sale_price, e.sale_currency),
      artworkId: e.artwork_id,
    };
  });

  // 排序：有 inventory_number 的按自然排序，无的放最后
  rows.sort((a, b) => {
    if (a.inventoryNumber && b.inventoryNumber) {
      return naturalCompare(a.inventoryNumber, b.inventoryNumber);
    }
    if (a.inventoryNumber) return -1;
    if (b.inventoryNumber) return 1;
    return 0;
  });

  return rows;
}

// ──────────────────────────────────────────────
// 主：groupRows
// ──────────────────────────────────────────────

export function groupRows(
  rows: TerminalRow[],
  by: GroupBy
): TerminalGroup[] {
  if (by === 'none') {
    return [{ key: 'all', rows: [...rows] }];
  }

  const buckets = new Map<string, TerminalRow[]>();

  for (const row of rows) {
    let key: string;
    if (by === 'status') {
      key = row.status;
    } else if (by === 'year') {
      key = row.year ?? '─';
    } else {
      // location
      key = row.locationName ?? '─';
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  // 将桶转换为数组，每组内行已经是自然排序的（buildRows 结果保持顺序）
  // 组之间按 key 排序（status 按字典序，year 按自然排序，location 按字典序）
  const groups: TerminalGroup[] = Array.from(buckets.entries()).map(
    ([key, groupRows]) => ({ key, rows: groupRows })
  );

  if (by === 'year') {
    // year 自然排序，─ 放最后
    groups.sort((a, b) => {
      if (a.key === '─' && b.key === '─') return 0;
      if (a.key === '─') return 1;
      if (b.key === '─') return -1;
      return naturalCompare(a.key, b.key);
    });
  } else {
    // status / location 字典序，─ 放最后
    groups.sort((a, b) => {
      if (a.key === '─' && b.key === '─') return 0;
      if (a.key === '─') return 1;
      if (b.key === '─') return -1;
      return a.key.localeCompare(b.key);
    });
  }

  return groups;
}

// ──────────────────────────────────────────────
// 主：computeStats
// ──────────────────────────────────────────────

export function computeStats(
  rows: TerminalRow[],
  artworksTotal: number
): TerminalStats {
  // artworkId 去重
  const artworkIdsWithEditions = new Set(rows.map((r) => r.artworkId));

  // 货币统计：count
  const currencyCount = new Map<string, number>();
  for (const row of rows) {
    if (!row.priceLabel) continue;
    const currency = row.priceLabel.split(' ')[0];
    currencyCount.set(currency, (currencyCount.get(currency) ?? 0) + 1);
  }

  // 按 count desc 排序
  const sorted = Array.from(currencyCount.entries()).sort((a, b) => b[1] - a[1]);
  const marketsLine =
    sorted.length > 0
      ? sorted.map(([cur, cnt]) => `${cur} ${cnt}`).join(' / ')
      : '─';

  return {
    artworksTotal,
    artworksWithEditions: artworkIdsWithEditions.size,
    editionsTotal: rows.length,
    marketsLine,
  };
}
