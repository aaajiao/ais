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
