import type {
  VizArtwork,
  VizEdition,
} from '@/hooks/queries/useVisualizationData';
import type { EditionStatus } from '@/lib/database.types';

// ─── Ownership state encoding (M2) ──────────────────────────────────────────
// 把 9 个 EditionStatus 聚合成 3 桶 + 1 个独立"degenerate"叠加层。
//
// 视觉态：
//   HELD     —— stroke-only（仅描边，无填充）
//   EXTERNAL —— pattern fill（细点阵）
//   DEPARTED —— solid fill（默认）
// DEGENERATE 是叠加层：任何 edition 是 lost / damaged 都给 isDegenerate=true，
// 视觉上在主桶 fill 之上画一个 X 标记。
//
// 数据驱动：所有判断都基于 `OWNERSHIP_STATUS_MAP`，新增 status 只需更新这个 map。
// 这是 ts 编译器的 Record<EditionStatus, ...> 保证 —— 漏写任何一个 status 都会
// 在 typecheck 阶段就被挡住。

export type OwnershipBucket = 'held' | 'external' | 'departed';

export const OWNERSHIP_STATUS_MAP: Record<
  EditionStatus,
  { bucket: OwnershipBucket; degenerate: boolean }
> = {
  in_production: { bucket: 'held', degenerate: false },
  in_studio: { bucket: 'held', degenerate: false },
  at_gallery: { bucket: 'external', degenerate: false },
  at_museum: { bucket: 'external', degenerate: false },
  in_transit: { bucket: 'external', degenerate: false },
  sold: { bucket: 'departed', degenerate: false },
  gifted: { bucket: 'departed', degenerate: false },
  lost: { bucket: 'departed', degenerate: true },
  damaged: { bucket: 'departed', degenerate: true },
};

export interface ArtworkOwnershipState {
  bucket: OwnershipBucket;
  isDegenerate: boolean;
}

// 聚合优先级（"最外溢"优先）：
//   有 DEPARTED edition → DEPARTED
//   否则有 EXTERNAL    → EXTERNAL
//   否则全部 HELD       → HELD
// 没有 edition 的作品默认归 HELD（仍在艺术家手里 / 未实例化）。
// degenerate 独立：只要任意 edition 是 lost / damaged，整件作品标 degenerate。
const BUCKET_PRIORITY: Record<OwnershipBucket, number> = {
  held: 0,
  external: 1,
  departed: 2,
};

export function getArtworkOwnershipState(
  artwork: Pick<VizArtwork, 'id'>,
  editions: VizEdition[]
): ArtworkOwnershipState {
  let topBucket: OwnershipBucket = 'held';
  let topPriority = -1; // -1 表示还没有 edition，最终如果没找到任何 edition 就保持 held
  let isDegenerate = false;

  for (const ed of editions) {
    if (ed.artwork_id !== artwork.id) continue;
    const entry = OWNERSHIP_STATUS_MAP[ed.status];
    if (!entry) continue; // 防御：未来如果 DB 加了新 status 但 map 漏了，不崩溃
    if (entry.degenerate) isDegenerate = true;
    const prio = BUCKET_PRIORITY[entry.bucket];
    if (prio > topPriority) {
      topPriority = prio;
      topBucket = entry.bucket;
    }
  }

  return { bucket: topBucket, isDegenerate };
}

// ─── 缺失年份 ───────────────────────────────────────────────────────────────
// 返回 year 无法解析为 anchor 的作品列表 —— 它们在主 swimlane 区域之外的特殊列展示，
// 强制 stroke-only 渲染（缺失态优先级高于 ownership）。
export function getUnknownYearArtworks(artworks: VizArtwork[]): VizArtwork[] {
  return artworks.filter((a) => parseYearAnchor(a.year) === null);
}

// 缺失年份列内部 key（沿用 swimlane key 风格，避免与真实 year 冲突）
export const UNKNOWN_YEAR_KEY = '__unknown_year__';


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
