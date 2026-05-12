import type { VizArtwork } from '@/hooks/queries/useVisualizationData';

// 头部 3 种 type 保留辨识度，其余归入 "other"。
// 顺序决定 SVG 堆叠：靠前的 tier 渲染在底部（视觉上更"稳"）。
export const TYPE_TIERS = ['Installation', 'Video', 'Digital printing'] as const;
export type TypeTier = (typeof TYPE_TIERS)[number] | 'other';

export function tierForType(type: string | null | undefined): TypeTier {
  if (!type) return 'other';
  const found = TYPE_TIERS.find((t) => t === type);
  return found ?? 'other';
}

// type → 透明度（基于 foreground 色，跟随主题切换）。
export const TIER_OPACITY: Record<TypeTier, number> = {
  Installation: 1.0,
  Video: 0.7,
  'Digital printing': 0.45,
  other: 0.22,
};

// 解析 year 字段：'2017' / '2014-2015' / '2014–2015' / 'circa 2010' / null
// 返回 anchor year（用于堆叠的列），找不到 4 位数字串则返回 null。
export function parseYearAnchor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d{4})/);
  if (!match) return null;
  const y = Number(match[1]);
  if (Number.isNaN(y) || y < 1900 || y > 2100) return null;
  return y;
}

export interface YearBucket {
  year: number;
  artworks: VizArtwork[];
}

// 把作品按 year anchor 分桶，连续填充缺失年份（哪怕该年没作品也保留空列），
// 保证 SVG 列宽均匀、视觉上是真正的时间轴而不是密度图。
export function buildYearBuckets(artworks: VizArtwork[]): {
  buckets: YearBucket[];
  maxStack: number;
} {
  const map = new Map<number, VizArtwork[]>();
  for (const a of artworks) {
    const y = parseYearAnchor(a.year);
    if (y === null) continue;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(a);
  }

  // bucket 内排序：tier index 大的（other）在数组前面（→ 渲染到栈的顶部）
  for (const arts of map.values()) {
    arts.sort((a, b) => {
      const ia = tierIndex(a.type);
      const ib = tierIndex(b.type);
      return ib - ia;
    });
  }

  const years = Array.from(map.keys()).sort((a, b) => a - b);
  if (years.length === 0) return { buckets: [], maxStack: 0 };

  const minY = years[0];
  const maxY = years[years.length - 1];
  const buckets: YearBucket[] = [];
  for (let y = minY; y <= maxY; y++) {
    buckets.push({ year: y, artworks: map.get(y) ?? [] });
  }
  const maxStack = Math.max(...buckets.map((b) => b.artworks.length));
  return { buckets, maxStack };
}

// tier index：值越小 = 越靠"底层"。用于 bucket 内排序，让 Installation 在最底。
function tierIndex(type: string | null | undefined): number {
  const t = tierForType(type);
  if (t === 'other') return TYPE_TIERS.length;
  return TYPE_TIERS.indexOf(t as (typeof TYPE_TIERS)[number]);
}

// 历史月份密度桶。'YYYY-MM' → count
export function buildHistoryMonthBuckets(
  history: { created_at: string }[]
): { entries: Array<[string, number]>; max: number } {
  const map = new Map<string, number>();
  for (const h of history) {
    const m = (h.created_at ?? '').slice(0, 7);
    if (!m) continue;
    map.set(m, (map.get(m) ?? 0) + 1);
  }
  const entries = Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const max = entries.length > 0 ? Math.max(...entries.map((e) => e[1])) : 0;
  return { entries, max };
}
