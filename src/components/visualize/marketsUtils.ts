import type { VizEdition } from '@/hooks/queries/useVisualizationData';

export interface CurrencyGroup {
  currency: string;
  sales: VizEdition[];
}

export interface CurrencyStats {
  count: number;
  sum: number;
  median: number;
  max: number;
  min: number;
}

// 只保留 sold + 有正价格 + 有货币的版本，按交易数降序分组。
export function groupEditionsByCurrency(editions: VizEdition[]): CurrencyGroup[] {
  const map = new Map<string, VizEdition[]>();
  for (const ed of editions) {
    if (ed.status !== 'sold') continue;
    const price = Number(ed.sale_price);
    if (!price || price <= 0) continue;
    const currency = ed.sale_currency;
    if (!currency) continue;
    if (!map.has(currency)) map.set(currency, []);
    map.get(currency)!.push(ed);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([currency, sales]) => ({ currency, sales }));
}

export function computeCurrencyStats(sales: VizEdition[]): CurrencyStats {
  const prices = sales.map((s) => Number(s.sale_price)).sort((a, b) => a - b);
  const count = prices.length;
  if (count === 0) return { count: 0, sum: 0, median: 0, max: 0, min: 0 };
  const sum = prices.reduce((a, b) => a + b, 0);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  return { count, sum, median, max: prices[count - 1], min: prices[0] };
}

// 每列独立 scale：圆的大小只代表该货币列内的相对值。
// 原因：CNY ¥50,000 ≈ USD $7,000 按汇率折算几乎同价，但若用全局 scale，
// CNY 圆会因数字大而比 USD 大一倍，误导观众认为"中国市场价格更高"。
// 独立 scale 让每列内部的相对差异清晰可读，列间比较依靠 stat 文字。
const MIN_R = 4;
const MAX_R = 18;

export function priceToRadius(
  price: number,
  minPrice: number,
  maxPrice: number
): number {
  if (minPrice === maxPrice) return (MIN_R + MAX_R) / 2;
  const logMin = Math.log1p(minPrice);
  const logMax = Math.log1p(maxPrice);
  if (logMin === logMax) return (MIN_R + MAX_R) / 2;
  const t = (Math.log1p(price) - logMin) / (logMax - logMin);
  return MIN_R + t * (MAX_R - MIN_R);
}

// ─── filterSalesByDateCutoff ────────────────────────────────────────────────
// 给定 cutoff ISO date 字符串（`YYYY-MM-DD`），返回 sale_date <= cutoff 的 sold edition。
// sale_date 缺失 / 无法解析的 edition 视为不在范围内（保守，不显示）。
// Markets 播头只过滤 sold + 有 sale_date 的数据，与 groupEditionsByCurrency 的过滤维度独立。
export function filterSalesByDateCutoff(
  editions: VizEdition[],
  cutoffISODate: string
): VizEdition[] {
  const cutoffTs = new Date(cutoffISODate).getTime();
  if (!Number.isFinite(cutoffTs)) return editions;
  return editions.filter((ed) => {
    if (!ed.sale_date) return false;
    const ts = new Date(ed.sale_date).getTime();
    return Number.isFinite(ts) && ts <= cutoffTs;
  });
}

// ─── 缺价已售（M2 缺失数据态）──────────────────────────────────────────────
// 当前 groupEditionsByCurrency 会把无 sale_price 的 sold edition silent drop。
// 这条 util 反向暴露这部分：sold 但 sale_price 无效（null / 0 / 负）→ "未记录价格"。
// 不要求 currency 有效——sold 没价格的 edition 本身就没货币意义；视觉上铺一条独立横条。
export function getSalesWithoutPrice(editions: VizEdition[]): VizEdition[] {
  return editions.filter((ed) => {
    if (ed.status !== 'sold') return false;
    const price = Number(ed.sale_price);
    if (Number.isFinite(price) && price > 0) return false;
    return true;
  });
}

// y 轴是 sale_date 时间轴（顶部 = 最新，底部 = 最早）。
// 没有 sale_date 的版本用 created_at fallback，还没有则居中。
export function priceToY(
  saleDate: string | null,
  edition: VizEdition,
  dateRange: { min: Date; max: Date },
  panelHeight: number
): number {
  const rawDate = saleDate ?? edition.created_at;
  if (!rawDate) return panelHeight / 2;
  const ts = new Date(rawDate).getTime();
  const minTs = dateRange.min.getTime();
  const maxTs = dateRange.max.getTime();
  if (minTs === maxTs) return panelHeight / 2;
  const t = (ts - minTs) / (maxTs - minTs);
  // t=1（最新）→ y=0（顶部）；t=0（最早）→ y=panelHeight（底部）
  return panelHeight * (1 - t);
}

// ─── Activity histogram（M1.5 优化）─────────────────────────────────────────
// Markets ribbon 用 histogram 表达"市场活跃节奏"——bin 高 = 该时段交易笔数。
// Strata 的"地层切片"语义在 Markets 不成立（X 轴是货币 nominal，时间跟空间正交），
// 所以 Markets 改用"活动密度直方图"，跟 Strata 视觉不同步。

export type ActivityBinKind = 'year' | 'month';

export interface ActivityBin {
  /** Bin start ISO date (inclusive)，用于 x 轴定位与 cutoff 比较 */
  startISO: string;
  /** 显示 label：'2024' 或 '2024-03' */
  label: string;
  /** 该 bin 内的 sale_date 数 */
  count: number;
}

export interface ActivityHistogram {
  bins: ActivityBin[];
  kind: ActivityBinKind;
  /** 全数据起始日 ISO（用于连续时间轴定位 marker） */
  minISO: string;
  /** 全数据终止日 ISO */
  maxISO: string;
  /** 任意 bin 的最大 count（用于 bar 高度归一化） */
  maxCount: number;
}

/** ISO 'YYYY-MM-DD' → 年（整数）。直接 slice 避免 timezone 漂移。 */
function isoYear(d: string): number {
  return Number(d.slice(0, 4));
}

/** ISO → 月（1-12） */
function isoMonth(d: string): number {
  return Number(d.slice(5, 7));
}

/** 给定 sale_date 数组，按年或月分桶，返回连续时间轴的 histogram（含空 bin）。 */
export function buildActivityHistogram(saleDates: string[]): ActivityHistogram | null {
  const valid = saleDates.filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort();
  const minISO = sorted[0];
  const maxISO = sorted[sorted.length - 1];
  const minY = isoYear(minISO);
  const maxY = isoYear(maxISO);
  const yearSpan = maxY - minY;

  // 跨度 ≥ 5 年 → 按年分桶（避免月桶太多挤）；否则按月分桶
  const kind: ActivityBinKind = yearSpan >= 5 ? 'year' : 'month';

  const bins: ActivityBin[] = [];
  if (kind === 'year') {
    for (let y = minY; y <= maxY; y++) {
      bins.push({ startISO: `${y}-01-01`, label: String(y), count: 0 });
    }
    for (const d of sorted) {
      const idx = isoYear(d) - minY;
      bins[idx].count++;
    }
  } else {
    // month bins：从 minY-minM 起到 maxY-maxM
    const minM = isoMonth(minISO);
    const maxM = isoMonth(maxISO);
    let y = minY;
    let m = minM;
    while (y < maxY || (y === maxY && m <= maxM)) {
      const mm = String(m).padStart(2, '0');
      bins.push({ startISO: `${y}-${mm}-01`, label: `${y}-${mm}`, count: 0 });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    for (const d of sorted) {
      const dy = isoYear(d);
      const dm = isoMonth(d);
      const idx = (dy - minY) * 12 + (dm - minM);
      if (idx >= 0 && idx < bins.length) bins[idx].count++;
    }
  }

  let maxCount = 0;
  for (const b of bins) if (b.count > maxCount) maxCount = b.count;

  return { bins, kind, minISO, maxISO, maxCount };
}
