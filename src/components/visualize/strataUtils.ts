import type { VizArtwork } from '@/hooks/queries/useVisualizationData';

// ─── parseYearAnchor ────────────────────────────────────────────────────────
// 解析 year 字段：'2017' / '2014-2015' / '2014–2015' / 'circa 2010' / null
// 返回 anchor year（用于确定列），找不到 4 位数字串则返回 null。
export function parseYearAnchor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d{4})/);
  if (!match) return null;
  const y = Number(match[1]);
  if (Number.isNaN(y) || y < 1900 || y > 2100) return null;
  return y;
}

// ─── buildHistoryMonthBuckets ───────────────────────────────────────────────
// 历史月份密度桶。'YYYY-MM' → count（保留原有逻辑）
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

// ─── Swimlane ───────────────────────────────────────────────────────────────

export interface Swimlane {
  /** 内部 key：raw type 字符串，null type 用字面值 '__untyped__' */
  type: string;
  /** 显示给用户：null → '(untyped)'，否则就是 type 本身 */
  displayLabel: string;
  count: number;
  artworks: VizArtwork[];
}

const UNTYPED_KEY = '__untyped__';
const UNTYPED_LABEL = '(untyped)';

// ─── buildSwimlanes ─────────────────────────────────────────────────────────
// 把作品按 distinct type 分组（null 单独一组），按 count desc 排序，
// 同时推断连续年份区间。
export function buildSwimlanes(artworks: VizArtwork[]): {
  swimlanes: Swimlane[];
  yearRange: number[];
} {
  const map = new Map<string, VizArtwork[]>();

  for (const a of artworks) {
    const key = a.type ?? UNTYPED_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  // 排序：count desc，tie 时 displayLabel asc
  const swimlanes: Swimlane[] = Array.from(map.entries())
    .map(([key, arts]) => ({
      type: key,
      displayLabel: key === UNTYPED_KEY ? UNTYPED_LABEL : key,
      count: arts.length,
      artworks: arts,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.displayLabel.localeCompare(b.displayLabel);
    });

  // 推断连续年份区间
  const yearSet = new Set<number>();
  for (const a of artworks) {
    const y = parseYearAnchor(a.year);
    if (y !== null) yearSet.add(y);
  }

  const yearRange: number[] = [];
  if (yearSet.size > 0) {
    const sorted = Array.from(yearSet).sort((a, b) => a - b);
    const minY = sorted[0];
    const maxY = sorted[sorted.length - 1];
    for (let y = minY; y <= maxY; y++) yearRange.push(y);
  }

  return { swimlanes, yearRange };
}

// ─── swimlaneHeight ─────────────────────────────────────────────────────────
// log1p 归一化：count=1 → min，count=maxCount → max，中间值按 log scale 内插。
export function swimlaneHeight(
  count: number,
  maxCount: number,
  min = 16,
  max = 64
): number {
  if (maxCount <= 0) return min;
  if (count <= 0) return min;
  const ratio = Math.log1p(count) / Math.log1p(maxCount);
  return min + ratio * (max - min);
}

// ─── filterArtworksByYearCutoff ─────────────────────────────────────────────
// 给定 cutoff year（含），返回 anchor year <= cutoff 的作品。
// year 无法解析的作品视为不在范围内（保守，不显示）。
export function filterArtworksByYearCutoff(
  artworks: VizArtwork[],
  cutoffYear: number
): VizArtwork[] {
  return artworks.filter((a) => {
    const y = parseYearAnchor(a.year);
    return y !== null && y <= cutoffYear;
  });
}

// ─── stackPositionFor ───────────────────────────────────────────────────────
// 给定 cell 内作品数和带高，返回每个作品的 (row, col)。
// 先竖直堆（row 递增），行满了水平后移一格（col 递增，row 重置为 0）。
//
// blockSize: 方块边长（像素）
// gap: 方块间距（像素）
// swimlaneH: 带的总高度（像素）
export function stackPositionFor(
  artworksInCell: number,
  blockSize: number,
  gap: number,
  swimlaneH: number
): Array<{ row: number; col: number }> {
  const cellHeight = blockSize + gap;
  const maxRowsInLane = Math.max(1, Math.floor(swimlaneH / cellHeight));

  const positions: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < artworksInCell; i++) {
    positions.push({
      row: i % maxRowsInLane,
      col: Math.floor(i / maxRowsInLane),
    });
  }
  return positions;
}
