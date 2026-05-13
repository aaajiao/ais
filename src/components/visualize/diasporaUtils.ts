import type {
  VizEdition,
  VizLocation,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';
import type { LocationType } from '@/lib/database.types';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface LocationNode {
  id: string;
  name: string;
  type: 'studio' | 'gallery' | 'museum' | 'private_collection' | 'other';
  city: string | null;
  country: string | null;
  editionCount: number;
  editionIds: string[];
}

// ─── M6 / v1.6 Constellation data model ──────────────────────────────────────
//
// Diaspora 视图采用 "artist center + time-spiral" 形态。i18n key / 文件名 / UI
// heading 保留 "diaspora"（与 Strata / Markets / Terminal 同列诗意名）。
//
// 数据归类只处理 outflow：edition.status ∈ ('sold', 'gifted')。其他 status
// 不进 Constellation —— 在 artist 手里或 still external 的 editions 不算
// "流出去"，由 Strata / Markets 各自承担它们的故事。
//
// 归类优先级（严格顺序）：
//   1. location_id 指向 location 且 location.type !== 'studio' → LocationConstellationNode
//   2. buyer_name 非空 → NamedPrivateNode（key = buyer_name 字面值，不归一化）
//   3. location_id 指向 studio 类型 + buyer_name 兜底为空 → 不太可能命中，
//      但若发生，仍归 NamedPrivateNode（避免 "卖给 studio" 的 phantom 节点）
//   4. 都没有 → AnonymousAggregate
//
// 注意：buyer_name 故意按字面值聚合 —— "Liliana Gao" 与 "Liliana Gao / 林奇"
// 是两个节点，不强行 dedupe（避免对 Akeroyd / Sigg 类合作买家的归一化错误）。
//
// 视觉布局：抛弃原 type-arc 同心环模型，改用 time-spiral —— 径向距离表示
// 第一次交易时间（老→近 center），节点 size 表示 type + editionCount。
// 见 layoutTimeSpiralConstellation。

export interface ArtistCenterNode {
  kind: 'artist';
  id: 'aaajiao';
  /** 流出去的 editions 总数（sold + gifted），用于中心 label */
  totalOutflowCount: number;
}

export interface LocationConstellationNode {
  kind: 'location';
  id: string;
  name: string;
  type: LocationType;
  city: string | null;
  country: string | null;
  editionCount: number;
  editionIds: string[];
  /** 经 editions join 后该 location 关联的 artwork id 集合（去重） */
  artworkIds: string[];
  /**
   * 该 entity 所有 outflow editions 里 sale_date 非空值的最小值 (ISO YYYY-MM-DD)。
   * 全部缺 sale_date → null（"undated"，layout 时推到 R_GHOST 外圈）。
   */
  firstSaleDate: string | null;
}

export interface NamedPrivateNode {
  kind: 'named_private';
  /** 用 buyer_name 字面值做 id，不归一化、不合并大小写 */
  id: string;
  name: string;
  editionCount: number;
  editionIds: string[];
  /** 该私人买家关联的 artwork id 集合（去重） */
  artworkIds: string[];
  /**
   * 该 buyer 所有 outflow editions 里 sale_date 非空值的最小值 (ISO YYYY-MM-DD)。
   * 全部缺 sale_date → null（"undated"，layout 时推到 R_GHOST 外圈）。
   */
  firstSaleDate: string | null;
}

export interface AnonymousAggregate {
  kind: 'anonymous';
  count: number;
  editionIds: string[];
  /** 匿名流出对应的 artwork id 集合（去重） */
  artworkIds: string[];
  /**
   * 每条匿名 outflow edition 一项（不聚合）。v1.6 起 anonymous editions 也按
   * sale_date 进 time-spiral —— 每个 dot 独立落点，缺 sale_date 推 R_GHOST。
   * editionIds[i] / items[i].editionId 一一对应（同序）。
   */
  items: AnonymousItem[];
}

/** 单条匿名 outflow edition 的最小元数据（用于 time-spiral 落点） */
export interface AnonymousItem {
  editionId: string;
  artworkId: string;
  /** ISO YYYY-MM-DD 或 null（缺 sale_date 推 R_GHOST 外圈） */
  sale_date: string | null;
}

export interface ConstellationData {
  artist: ArtistCenterNode;
  locations: LocationConstellationNode[];
  namedPrivateBuyers: NamedPrivateNode[];
  anonymous: AnonymousAggregate;
}

/** Outflow 判定：sold / gifted 算流出去；其他 status 不进 Constellation */
function isOutflow(status: VizEdition['status']): boolean {
  return status === 'sold' || status === 'gifted';
}

/**
 * 构造 Constellation 三环数据。
 *
 * 严格按优先级把每条 outflow edition 归到唯一一个节点：
 *   1. non-studio location（机构层）
 *   2. named buyer（私人买家层）
 *   3. studio + named buyer（仍归私人买家，避免 phantom"卖给 studio"）
 *   4. anonymous（匿名）
 *
 * - locations 按 editionCount desc 排
 * - namedPrivateBuyers 按 editionCount desc 排（视觉上重要的在前）
 * - artworkIds 去重（同一买家买同一作品多个版本只 count 一个 artwork）
 * - editionIds 不去重（每个 edition 是独立流出实例）
 */
export function buildConstellation(
  editions: VizEdition[],
  locations: VizLocation[]
): ConstellationData {
  // location id → location 映射
  const locById = new Map<string, VizLocation>();
  for (const loc of locations) locById.set(loc.id, loc);

  // 各桶 builder（用 string key + Map 累加）
  const locationBuckets = new Map<
    string,
    {
      meta: VizLocation;
      editionIds: string[];
      artworkIds: Set<string>;
      saleDates: string[];
    }
  >();
  const namedBuckets = new Map<
    string,
    {
      name: string;
      editionIds: string[];
      artworkIds: Set<string>;
      saleDates: string[];
    }
  >();
  const anonEditionIds: string[] = [];
  const anonArtworkIds = new Set<string>();
  const anonItems: AnonymousItem[] = [];
  let totalOutflowCount = 0;

  for (const ed of editions) {
    if (!isOutflow(ed.status)) continue;
    totalOutflowCount++;

    const loc = ed.location_id ? locById.get(ed.location_id) ?? null : null;
    const buyerName = ed.buyer_name?.trim() ? ed.buyer_name.trim() : null;
    const saleDate = ed.sale_date && ed.sale_date.trim() ? ed.sale_date : null;

    // 优先级 1: non-studio location
    if (loc && loc.type !== 'studio') {
      let bucket = locationBuckets.get(loc.id);
      if (!bucket) {
        bucket = {
          meta: loc,
          editionIds: [],
          artworkIds: new Set(),
          saleDates: [],
        };
        locationBuckets.set(loc.id, bucket);
      }
      bucket.editionIds.push(ed.id);
      bucket.artworkIds.add(ed.artwork_id);
      if (saleDate) bucket.saleDates.push(saleDate);
      continue;
    }

    // 优先级 2 / 3: named buyer (含 studio + buyer_name 边界 case)
    if (buyerName) {
      let bucket = namedBuckets.get(buyerName);
      if (!bucket) {
        bucket = {
          name: buyerName,
          editionIds: [],
          artworkIds: new Set(),
          saleDates: [],
        };
        namedBuckets.set(buyerName, bucket);
      }
      bucket.editionIds.push(ed.id);
      bucket.artworkIds.add(ed.artwork_id);
      if (saleDate) bucket.saleDates.push(saleDate);
      continue;
    }

    // 优先级 4: anonymous
    anonEditionIds.push(ed.id);
    anonArtworkIds.add(ed.artwork_id);
    anonItems.push({
      editionId: ed.id,
      artworkId: ed.artwork_id,
      sale_date: saleDate,
    });
  }

  /** 取 ISO date 字符串数组的最小值（字典序对 YYYY-MM-DD 等价数值排序）。空数组返 null。 */
  function minSaleDate(dates: string[]): string | null {
    if (dates.length === 0) return null;
    let m = dates[0];
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < m) m = dates[i];
    }
    return m;
  }

  // 物化 + 排序
  const locationsArr: LocationConstellationNode[] = Array.from(
    locationBuckets.values()
  )
    .map((b) => ({
      kind: 'location' as const,
      id: b.meta.id,
      name: b.meta.name,
      type: b.meta.type,
      city: b.meta.city,
      country: b.meta.country,
      editionCount: b.editionIds.length,
      editionIds: b.editionIds,
      artworkIds: Array.from(b.artworkIds),
      firstSaleDate: minSaleDate(b.saleDates),
    }))
    .sort((a, b) => b.editionCount - a.editionCount);

  const namedArr: NamedPrivateNode[] = Array.from(namedBuckets.values())
    .map((b) => ({
      kind: 'named_private' as const,
      id: b.name,
      name: b.name,
      editionCount: b.editionIds.length,
      editionIds: b.editionIds,
      artworkIds: Array.from(b.artworkIds),
      firstSaleDate: minSaleDate(b.saleDates),
    }))
    .sort((a, b) => b.editionCount - a.editionCount);

  return {
    artist: {
      kind: 'artist',
      id: 'aaajiao',
      totalOutflowCount,
    },
    locations: locationsArr,
    namedPrivateBuyers: namedArr,
    anonymous: {
      kind: 'anonymous',
      count: anonEditionIds.length,
      editionIds: anonEditionIds,
      artworkIds: Array.from(anonArtworkIds),
      items: anonItems,
    },
  };
}

// ─── v1.6 Time-spiral Constellation 布局 ──────────────────────────────────
//
// 抛弃 type-arc 同心环模型。新布局只用两个数据轴：
//   - **径向距离** = 第一次交易时间（老 entity 在内圈紧贴 artist，新 entity 在外）
//   - **节点 size** = type + editionCount（museum 大 / private_collection 中 /
//     named_private 小 / anonymous 极小），通过 getNodeVisual 解决
//
// 角度沿时间轴顺时针绕一圈（earliest = 12 点钟方向 = -90°，latest = -90° + 360°
// = 同样 12 点钟方向）。span 是一年时角度近，span 是十年时角度差大，时间密度
// 用角度密度直接表达。
//
// 缺 sale_date 的 entity 推到 R_GHOST 外圈均匀分布 —— "缺失数据不藏"原则的
// 几何化（呼应 ghost 圆环 / Strata DegenerateGlyph）。
//
// v1.6 anonymous 也按 sale_date 进 time-spiral —— 每条匿名 outflow edition 一个
// 独立 dust dot（r=1.5），跟 location / namedPrivate entity 共享同一份
// earliest/latest 时间范围。缺 sale_date 的 anonymous edition 推 R_GHOST 外圈。
// 设计意图：「虽然没名字，但每件作品的购买时间和事实都该画出来」—— anonymous
// 不再是整体一圈，而是 archive 里 N 件具体的"匿名但有时间"的流出。
// 历史 ANONYMOUS_R = 310 常量保留导出（向后兼容），但 layout 不再使用。

/**
 * 几何常量（坐标在 800×600 viewBox 内），固定值便于测试断言精确。
 *
 * v1.6.x 起 R 全部内缩：旧值（70 / 240 / 280 / 310）让 R_GHOST=280 + node r=14-20
 * + label 直接出 viewBox（顶部/底部）。新值给 label 留 padding，时间螺旋整体居中
 * 不抵边。`ANONYMOUS_R` 保留导出仅向后兼容 —— anonymous 不再单独 ring，每条
 * anonymous edition 走时间螺旋（参见 layoutConstellation）。
 */
export const TIME_SPIRAL_GEOMETRY = {
  /** 离 artist center 最近的有数据 entity 半径 */
  R_INNER: 60,
  /** 有 sale_date 数据的 entity 最远径向距离 */
  R_OUTER_DATA: 190,
  /** 缺 sale_date 的 entity 推到这个外圈 */
  R_GHOST: 220,
  /** @deprecated v1.6.x anonymous 走时间螺旋；常量保留向后兼容仅 */
  ANONYMOUS_R: 310,
} as const;

export interface ConstellationLocationPoint {
  node: LocationConstellationNode;
  x: number;
  y: number;
  /** 极坐标角度（rad），仅供调试 / 测试断言 */
  angle: number;
  /** 该节点到 center 的径向距离（rad 圆半径），用于 stable testing */
  r: number;
  /** 是否缺 sale_date（true → 放在 R_GHOST 外圈） */
  isUndated: boolean;
}

export interface ConstellationNamedPoint {
  node: NamedPrivateNode;
  x: number;
  y: number;
  angle: number;
  r: number;
  isUndated: boolean;
}

export interface ConstellationAnonymousPoint {
  /** 跟 `AnonymousAggregate.items[i].editionId` 对应 */
  editionId: string;
  /** 跟 `AnonymousAggregate.items[i].artworkId` 对应（selection ring 用） */
  artworkId: string;
  x: number;
  y: number;
  /** 极坐标角度（rad），仅供调试 / 测试断言 */
  angle: number;
  /** 该点到 center 的径向距离 */
  r: number;
  /** 是否缺 sale_date（true → 推 R_GHOST 外圈） */
  isUndated: boolean;
  /** 原始 ISO date 或 null（用于 hover/debug） */
  sale_date: string | null;
}

export interface ConstellationLayout {
  center: { x: number; y: number };
  locationPoints: ConstellationLocationPoint[];
  namedPoints: ConstellationNamedPoint[];
  anonymousPoints: ConstellationAnonymousPoint[];
  /** Geometry 常量（暴露给 view 做参考/legend，可直接读 TIME_SPIRAL_GEOMETRY） */
  geometry: {
    rInner: number;
    rOuterData: number;
    rGhost: number;
    rAnonymous: number;
  };
}

export interface ConstellationLayoutOptions {
  width: number;
  height: number;
}

/** ISO YYYY-MM-DD → ms（仅取 epoch），用于时间径向插值 */
function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Time-spiral 布局。
 *
 * 算法（v1.6.x 重写：anonymous 也进 spiral；解决时间密集区重叠 bug）：
 *
 * 1. 收集 dated points: locations + namedPrivate + anonymous.items
 *    where sale_date != null。collected as 单一 `dated[]` 数组。
 *    收集 undated points: 同 3 类，sale_date == null 的部分。
 *
 * 2. dated 非空时：earliestMs = min(ms), latestMs = max(ms), spanMs = latest - earliest
 *
 * 3. 关键修复（避免时间密集区重叠）：
 *    - r 仍 by **真实时间**：t = (ms - earliestMs) / spanMs，r = R_INNER + t·(R_OUTER_DATA - R_INNER)
 *      （A 方向语义不变：earliest 老 → 近 center，latest 新 → 外圈）
 *    - angle 改 by **sorted-by-time index** 均匀 360°：先按 ms 升序排，第 i 个 point
 *      angle = -π/2 + (i / N) · 2π
 *    - 时间密集区（同年成交多 entity）r 接近、angle 分散 → 不再重叠
 *
 * 4. dated 只 1 个或全 same date → span=0，r 取中点、angle=-π/2（12 点钟）
 *
 * 5. undated 全 r = R_GHOST，按 -π/2 起均匀分布 360°
 *
 * anonymous 不再单独占外圈（ANONYMOUS_R 仍导出但 layout 不用）。
 */
export function layoutConstellation(
  data: ConstellationData,
  options: ConstellationLayoutOptions
): ConstellationLayout {
  const { width, height } = options;
  const cx = width / 2;
  const cy = height / 2;
  const { R_INNER, R_OUTER_DATA, R_GHOST, ANONYMOUS_R } = TIME_SPIRAL_GEOMETRY;

  // ─── 1. 三类 entity 合并收集（dated / undated 分桶）──────────────────────
  type DatedRef =
    | { kind: 'location'; node: LocationConstellationNode; ms: number }
    | { kind: 'named'; node: NamedPrivateNode; ms: number }
    | { kind: 'anonymous'; item: AnonymousItem; ms: number };
  type UndatedRef =
    | { kind: 'location'; node: LocationConstellationNode }
    | { kind: 'named'; node: NamedPrivateNode }
    | { kind: 'anonymous'; item: AnonymousItem };

  const dated: DatedRef[] = [];
  const undated: UndatedRef[] = [];

  for (const loc of data.locations) {
    if (loc.firstSaleDate) {
      dated.push({ kind: 'location', node: loc, ms: isoToMs(loc.firstSaleDate) });
    } else {
      undated.push({ kind: 'location', node: loc });
    }
  }
  for (const np of data.namedPrivateBuyers) {
    if (np.firstSaleDate) {
      dated.push({ kind: 'named', node: np, ms: isoToMs(np.firstSaleDate) });
    } else {
      undated.push({ kind: 'named', node: np });
    }
  }
  for (const item of data.anonymous.items) {
    if (item.sale_date) {
      dated.push({ kind: 'anonymous', item, ms: isoToMs(item.sale_date) });
    } else {
      undated.push({ kind: 'anonymous', item });
    }
  }

  // dated 按时间升序排（earliest 在前）—— 同时决定 r（时间）与 angle（index）
  dated.sort((a, b) => a.ms - b.ms);

  const locationPoints: ConstellationLocationPoint[] = [];
  const namedPoints: ConstellationNamedPoint[] = [];
  const anonymousPoints: ConstellationAnonymousPoint[] = [];

  /** 把一个 DatedRef 落到 (r, angle) 上，分流到对应的 points 数组 */
  function placeDated(ref: DatedRef, r: number, angle: number, isUndated: boolean) {
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (ref.kind === 'location') {
      locationPoints.push({ node: ref.node, x, y, angle, r, isUndated });
    } else if (ref.kind === 'named') {
      namedPoints.push({ node: ref.node, x, y, angle, r, isUndated });
    } else {
      anonymousPoints.push({
        editionId: ref.item.editionId,
        artworkId: ref.item.artworkId,
        x,
        y,
        angle,
        r,
        isUndated,
        sale_date: ref.item.sale_date,
      });
    }
  }

  // ─── 2/3/4. dated 时间→r + sorted-index→angle 映射 ─────────────────────
  if (dated.length > 0) {
    const earliestMs = dated[0].ms;
    const latestMs = dated[dated.length - 1].ms;
    const spanMs = latestMs - earliestMs;
    const N = dated.length;

    if (spanMs === 0) {
      // edge case：dated 只 1 个 / 全 same date —— 落径向中点 + 12 点钟方向
      const r = R_INNER + (R_OUTER_DATA - R_INNER) / 2;
      const angle = -Math.PI / 2;
      for (const ref of dated) {
        placeDated(ref, r, angle, false);
      }
    } else {
      // r 由真实时间 t 决定（保留 A 方向语义）；angle 由 sorted index 均匀分 360°
      // → 时间密集区 r 接近但 angle 分散，避免节点重叠
      for (let i = 0; i < N; i++) {
        const ref = dated[i];
        const t = (ref.ms - earliestMs) / spanMs;
        const r = R_INNER + t * (R_OUTER_DATA - R_INNER);
        const angle = -Math.PI / 2 + (i / N) * 2 * Math.PI;
        placeDated(ref, r, angle, false);
      }
    }
  }

  // ─── 5. undated 全 r = R_GHOST，均匀分布 360° ───────────────────────────
  const undatedN = undated.length;
  for (let i = 0; i < undatedN; i++) {
    const ref = undated[i];
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, undatedN);
    const r = R_GHOST;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (ref.kind === 'location') {
      locationPoints.push({ node: ref.node, x, y, angle, r, isUndated: true });
    } else if (ref.kind === 'named') {
      namedPoints.push({ node: ref.node, x, y, angle, r, isUndated: true });
    } else {
      anonymousPoints.push({
        editionId: ref.item.editionId,
        artworkId: ref.item.artworkId,
        x,
        y,
        angle,
        r,
        isUndated: true,
        sale_date: null,
      });
    }
  }

  return {
    center: { x: cx, y: cy },
    locationPoints,
    namedPoints,
    anonymousPoints,
    geometry: {
      rInner: R_INNER,
      rOuterData: R_OUTER_DATA,
      rGhost: R_GHOST,
      rAnonymous: ANONYMOUS_R,
    },
  };
}

// ─── Node visual encoding（替代 nodeRadius / namedNodeRadius / TYPE_OPACITY）──
//
// 每个节点的视觉用 `getNodeVisual(kind, type, editionCount)` 统一决定：
//   - r = base + sqrt(max(0, editionCount-1)) * weight
//   - opacity 按 kind+type 固定
//   - private_collection 加一层 inner stroke ring （"双圆嵌套"）表达
//     "私人但机构化" 的不对称地位
//   - anonymous 是 dust，固定 r=1.5

export interface NodeVisual {
  r: number;
  /** 'solid' = fill-foreground 实心；'dust' = anonymous 极小点 */
  style: 'solid' | 'dust';
  opacity: number;
  /** private_collection 双圆嵌套时的内部 stroke ring 半径（null 表示不画） */
  innerRingR: number | null;
}

/** 内部 spec 表：base r / weight / opacity / 是否画 inner stroke ring */
const NODE_VISUAL_SPEC: Record<
  string,
  { base: number; weight: number; opacity: number; innerRingFactor: number | null }
> = {
  'location:museum': { base: 14, weight: 2.5, opacity: 1.0, innerRingFactor: null },
  'location:private_collection': {
    base: 12,
    weight: 2.5,
    opacity: 0.85,
    innerRingFactor: 0.45,
  },
  'location:gallery': { base: 12, weight: 2.5, opacity: 0.7, innerRingFactor: null },
  'location:studio': { base: 12, weight: 2.5, opacity: 0.85, innerRingFactor: null },
  'location:other': { base: 11, weight: 2.0, opacity: 0.6, innerRingFactor: null },
  named_private: { base: 7, weight: 1.8, opacity: 0.55, innerRingFactor: null },
};

/** 任何未知 kind/type 的安全 fallback —— 与 location:other 同档但更暗 */
const NODE_VISUAL_FALLBACK = {
  base: 10,
  weight: 1.5,
  opacity: 0.5,
  innerRingFactor: null as number | null,
};

export function getNodeVisual(
  kind: 'location' | 'named_private' | 'anonymous',
  type: LocationType | null,
  editionCount: number
): NodeVisual {
  if (kind === 'anonymous') {
    return { r: 1.5, style: 'dust', opacity: 0.3, innerRingR: null };
  }
  const specKey = kind === 'location' && type ? `location:${type}` : kind;
  const spec = NODE_VISUAL_SPEC[specKey] ?? NODE_VISUAL_FALLBACK;
  const r = spec.base + Math.sqrt(Math.max(0, editionCount - 1)) * spec.weight;
  const innerRingR = spec.innerRingFactor === null ? null : r * spec.innerRingFactor;
  return {
    r,
    style: 'solid',
    opacity: spec.opacity,
    innerRingR,
  };
}

// ─── v1.6.x Organic blob shape ─────────────────────────────────────────────
//
// 每个 location / named_private 节点不再用规则 `<circle>`，而是按 entity id
// (seed) 生成 12 段 quadratic-bezier 平滑闭合的有机轮廓。视觉用意：跟 Strata
// 严格 geometric 方块、Markets 抽象 dot 形成对照 —— Diaspora 节点表达"具象的
// 个体性"，每个机构/人是独一无二的轮廓。
//
// 不引入 lib / 动画 / morph：~30 行 deterministic hash 函数 + path 替换。
// anonymous dust 仍是 `<circle r=1.5>`（太小 organic 看不出来，徒增 noise）。

/**
 * 生成 deterministic organic blob SVG path。
 *
 * 字符 hash → 每个控制点径向扰动 [-15%, +15%] → 12 段 quadratic bezier 闭合。
 * 同 seed + 同 (cx, cy, baseR) → 同字符串（render 间稳定，便于 React diff）。
 */
export function generateOrganicPath(
  cx: number,
  cy: number,
  baseR: number,
  seed: string
): string {
  const segments = 12;

  /** 字符 hash → [-0.15, +0.15] 范围扰动比例 */
  const hashOffset = (i: number): number => {
    const s = `${seed}:${i}`;
    let h = 0;
    for (let c = 0; c < s.length; c++) {
      h = ((h * 31) + s.charCodeAt(c)) | 0;
    }
    return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.3; // -0.15..+0.15
  };

  // 12 个径向扰动后的控制点
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const r = baseR * (1 + hashOffset(i));
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  // Quadratic bezier 平滑：M start → Q ctrl=cur midpoint=midNext → ... → Z
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < segments; i++) {
    const cur = points[i];
    const next = points[(i + 1) % segments];
    const midX = (cur.x + next.x) / 2;
    const midY = (cur.y + next.y) / 2;
    path += ` Q ${cur.x.toFixed(2)} ${cur.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  return path + ' Z';
}

/**
 * @deprecated v1.6 起 Constellation 节点视觉走 getNodeVisual；该函数仅服务
 * 旧 LocationNode（radialLayout 路径），保留是为了不动 buildNodes/radialLayout
 * 系列的 LocationNode 测试。新代码不要用。
 */
export function namedNodeRadius(editionCount: number): number {
  const r = Math.sqrt(editionCount) * 2.5 + 4;
  return Math.max(4, Math.min(10, r));
}

export interface RadialCenter {
  x: number;
  y: number;
  node: LocationNode;
}

export interface RadialPoint {
  x: number;
  y: number;
  node: LocationNode;
  ringIndex: number; // 0 = 最内圈，1 = 中圈，2 = 外圈
}

export interface RadialLayout {
  center: RadialCenter;
  ring: RadialPoint[];
}

export interface DiasporaEdge {
  fromNodeId: string;
  toNodeId: string;
  count: number;
}

export interface TrackedStat {
  tracked: number;
  total: number;
  percent: number;
}

// ─── buildNodes ──────────────────────────────────────────────────────────────

/**
 * 把 editions + locations 关联，生成按 editionCount 降序的节点列表。
 * 过滤掉没有任何 edition 的 location。
 */
export function buildNodes(
  editions: VizEdition[],
  locations: VizLocation[]
): LocationNode[] {
  // 建立 locationId → editionIds 的映射
  const editionsByLoc = new Map<string, string[]>();
  for (const e of editions) {
    if (!e.location_id) continue;
    if (!editionsByLoc.has(e.location_id)) {
      editionsByLoc.set(e.location_id, []);
    }
    editionsByLoc.get(e.location_id)!.push(e.id);
  }

  const nodes: LocationNode[] = [];
  for (const loc of locations) {
    const editionIds = editionsByLoc.get(loc.id) ?? [];
    if (editionIds.length === 0) continue; // 无作品的地方不画
    nodes.push({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      city: loc.city,
      country: loc.country,
      editionCount: editionIds.length,
      editionIds,
    });
  }

  // 按 editionCount 降序
  nodes.sort((a, b) => b.editionCount - a.editionCount);
  return nodes;
}

// ─── pickCenterNode ───────────────────────────────────────────────────────────

/**
 * 启发式找中心节点：editionCount 最大；如果并列，name 包含 'Studio' 优先。
 * 返回 null 若节点列表为空。
 */
export function pickCenterNode(nodes: LocationNode[]): LocationNode | null {
  if (nodes.length === 0) return null;
  const maxCount = nodes[0].editionCount;
  const tied = nodes.filter((n) => n.editionCount === maxCount);
  // tie-breaker：name 包含 'Studio'（大小写不敏感）的优先
  const studioNode = tied.find((n) =>
    n.name.toLowerCase().includes('studio')
  );
  return studioNode ?? tied[0];
}

// ─── radialLayout ─────────────────────────────────────────────────────────────

/**
 * 把节点布局到同心环坐标系。
 * - center 放 viewport 正中
 * - outerNodes 按 editionCount 分 3 桶（分位数），高的内圈、低的外圈
 * - 每个环上节点等角度分布，相邻环错开 half-step 减少视觉重叠
 */
export function radialLayout(
  centerNode: LocationNode,
  outerNodes: LocationNode[],
  viewport: { width: number; height: number }
): RadialLayout {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  const center: RadialCenter = { x: cx, y: cy, node: centerNode };

  if (outerNodes.length === 0) {
    return { center, ring: [] };
  }

  // 半径桶：内圈 / 中圈 / 外圈 —— 与 DiasporaView.tsx 的 RING_GUIDE_RADII 同步
  // 外环 0.42 留出 ~45px 给节点 + label，避免上下边缘节点被 viewBox 裁切
  const RING_RADII = [
    Math.min(viewport.width, viewport.height) * 0.22,
    Math.min(viewport.width, viewport.height) * 0.34,
    Math.min(viewport.width, viewport.height) * 0.42,
  ];

  // 按 editionCount 降序的外环节点，分三桶
  const sorted = [...outerNodes].sort((a, b) => b.editionCount - a.editionCount);
  const n = sorted.length;
  // 大致三等分：高分位入内圈，中位入中圈，低分位入外圈
  const tier0End = Math.ceil(n / 3);
  const tier1End = Math.ceil((n * 2) / 3);

  const ring: RadialPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    let ringIndex: number;
    if (i < tier0End) ringIndex = 0;
    else if (i < tier1End) ringIndex = 1;
    else ringIndex = 2;

    const radius = RING_RADII[ringIndex];

    // 同一 ring 内节点数量
    const ringNodes = sorted.filter((_, j) => {
      if (i < tier0End) return j < tier0End;
      if (i < tier1End) return j >= tier0End && j < tier1End;
      return j >= tier1End;
    });
    const posInRing = ringNodes.indexOf(node);
    const totalInRing = ringNodes.length;

    // 角度：均匀分布，不同 ring 错开偏移减少重叠
    const angleOffset = ringIndex * (Math.PI / (totalInRing + 1));
    const angle =
      (2 * Math.PI * posInRing) / totalInRing + angleOffset - Math.PI / 2;

    ring.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      node,
      ringIndex,
    });
  }

  return { center, ring };
}

// ─── buildEdges ───────────────────────────────────────────────────────────────

/**
 * 从 edition_history 抽取 location_change 事件，生成 from→to 边。
 * 注意：edition_history.from_location / to_location 存储的是 location name（text），
 *       需要用 name → id 的反向映射。
 */
export function buildEdges(
  history: VizHistory[],
  nodes: LocationNode[]
): DiasporaEdge[] {
  // 建立 location name → node id 的映射
  const nameToId = new Map<string, string>();
  for (const n of nodes) {
    nameToId.set(n.name, n.id);
  }

  // 聚合同向 from→to
  const edgeMap = new Map<string, number>();
  for (const h of history) {
    if (h.action !== 'location_change') continue;
    if (!h.from_location || !h.to_location) continue;
    const fromId = nameToId.get(h.from_location);
    const toId = nameToId.get(h.to_location);
    if (!fromId || !toId) continue;
    if (fromId === toId) continue; // 无意义的自环
    const key = `${fromId}→${toId}`;
    edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
  }

  const edges: DiasporaEdge[] = [];
  for (const [key, count] of edgeMap.entries()) {
    const [fromNodeId, toNodeId] = key.split('→');
    edges.push({ fromNodeId, toNodeId, count });
  }
  return edges;
}

// ─── computeTrackedStat ───────────────────────────────────────────────────────

/**
 * 计算有 location_id 的 edition 比例。
 */
export function computeTrackedStat(
  editions: VizEdition[],
  // locations 参数保留供未来拓展（例如只统计有已知 location 记录的 editions）
  locations: VizLocation[]
): TrackedStat {
  void locations;
  const total = editions.length;
  const tracked = editions.filter((e) => !!e.location_id).length;
  const percent = total === 0 ? 0 : Math.round((tracked / total) * 100);
  return { tracked, total, percent };
}

// ─── countryToISO2 ────────────────────────────────────────────────────────────

const COUNTRY_ISO2: Record<string, string> = {
  China: 'CN',
  'United Kingdom': 'GB',
  Germany: 'DE',
  France: 'FR',
  Australia: 'AU',
  Switzerland: 'CH',
  'Hong Kong': 'HK',
  Japan: 'JP',
  USA: 'US',
  'United States': 'US',
  'United States of America': 'US',
  Italy: 'IT',
  Spain: 'ES',
  Netherlands: 'NL',
  Belgium: 'BE',
  Austria: 'AT',
  'South Korea': 'KR',
  Korea: 'KR',
  Singapore: 'SG',
  Taiwan: 'TW',
  Canada: 'CA',
  'New Zealand': 'NZ',
  Brazil: 'BR',
  Mexico: 'MX',
  India: 'IN',
  Russia: 'RU',
  Poland: 'PL',
  Sweden: 'SE',
  Norway: 'NO',
  Denmark: 'DK',
  Finland: 'FI',
  Portugal: 'PT',
  Greece: 'GR',
  'Czech Republic': 'CZ',
  Hungary: 'HU',
  Romania: 'RO',
};

/**
 * 国家名 → ISO-2 代码。不在列表里则取前两个字母大写。
 */
export function countryToISO2(country: string | null): string {
  if (!country) return '─';
  return COUNTRY_ISO2[country] ?? country.slice(0, 2).toUpperCase();
}

// ─── nodeRadius ───────────────────────────────────────────────────────────────

/** 节点半径：按 editionCount 缩放，6 ≤ r ≤ 18 */
export function nodeRadius(editionCount: number): number {
  const r = Math.sqrt(editionCount) * 3 + 6;
  return Math.max(6, Math.min(18, r));
}

/** location.type → fill opacity */
export const TYPE_OPACITY: Record<LocationNode['type'], number> = {
  studio: 1.0,
  gallery: 0.7,
  museum: 0.7,
  private_collection: 0.7,
  other: 0.4,
};

// ─── Ghost nodes (M2 缺失数据态) ──────────────────────────────────────────────
// 没有 location_id 的 edition —— 在最外环外铺一圈鬼影小圆。
// 视觉本意：用空间表达"档案里有 N 件作品我们不知道在哪"，把 stat 文案的"X / Y"
// 翻译成图形。鬼影圆**不可点击**（无 navigate 目标），**不进 hover 状态机**。
//
// 位置：从顶部 12 点钟方向开始顺时针均匀分布在大半径上。
// 0 个时返回空数组——调用方据此决定不渲染这一环（避免画空环）。
export interface GhostNodePosition {
  x: number;
  y: number;
}

export interface GhostNodes {
  count: number;
  positions: GhostNodePosition[];
}

export function getGhostNodes(
  editions: VizEdition[],
  // locations 暂未使用，但保留入参形状以匹配 buildNodes / computeTrackedStat，
  // 方便未来扩展（比如"有 location 但 location 不在 nodes 集合里的孤儿"）。
  locations: VizLocation[],
  options?: {
    cx?: number;
    cy?: number;
    radius?: number;
  }
): GhostNodes {
  void locations;
  const ghostEditions = editions.filter((e) => !e.location_id);
  const count = ghostEditions.length;
  if (count === 0) return { count: 0, positions: [] };

  const cx = options?.cx ?? 400;
  const cy = options?.cy ?? 280;
  const radius = options?.radius ?? Math.min(800, 560) * 0.48;

  const positions: GhostNodePosition[] = [];
  // 从 -π/2（12 点方向）开始，顺时针均匀分布
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return { count, positions };
}
