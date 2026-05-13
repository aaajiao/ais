import type {
  VizArtwork,
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
 * 几何常量（坐标在 1200×680 viewBox 内，v1.6.x 第四轮椭圆化），
 * 固定值便于测试断言精确。
 *
 * v1.6.x 一/二轮：viewBox 600 高，R 60/190/220。实测 37 个 entity 在 R_INNER=60
 * 附近圆周太挤，跨类（location ↔ named_private）仍出现严重重叠。
 *
 * 第三轮：主圈整体放大 ~37%（R_INNER 60→80 / R_OUTER_DATA 190→260 / R_GHOST 220→
 * 300）+ 碰撞推开 step/iters/pad 加力。viewBox 高 600→760。
 *
 * **第四轮：viewBox 横向化 + 椭圆 layout**。第三轮 viewBox 800×760 接近正方形，
 * 页面 container ≈ 1280 横宽但 maxHeight: 70vh ≈ 740 → 横向空间浪费严重。第四轮
 * 改 viewBox 为 **1200×680**（16:9 黄金近似），并加 `ASPECT_X` 让所有 spiral 点的
 * x 坐标乘 ~1.55 —— **R 不变，layout 椭圆化**。节点的 organic blob 形状不变
 * （只对 layout 拉伸，不对 shape 拉伸）；anonymous / ghost dust 仍是规则几何圆。
 * "椭圆化是 organic 哲学的扩展：节点不规则 + 整体不规则圆 = 两层 brutalist organic"。
 *
 * `ANONYMOUS_R` 保留导出仅向后兼容 —— anonymous 不再单独 ring，每条 anonymous
 * edition 走时间螺旋（参见 layoutConstellation）。
 */
export const TIME_SPIRAL_GEOMETRY = {
  /** 离 artist center 最近的有数据 entity 半径（径向，未经 x 拉伸） */
  R_INNER: 80,
  /** 有 sale_date 数据的 entity 最远径向距离（径向，未经 x 拉伸） */
  R_OUTER_DATA: 260,
  /** 缺 sale_date 的 entity 推到这个外圈（径向，未经 x 拉伸） */
  R_GHOST: 300,
  /**
   * x 维度拉伸系数（v1.6.x 第四轮）—— viewBox 是 1200×680 横向宽，主圈变椭圆。
   * 节点 x 坐标 = cx + r·cos·ASPECT_X，y 坐标 = cy + r·sin（不变）。
   * 1.55 ≈ 1200/680 ≈ viewBox aspect ratio，让圆环填满 viewBox 横向。
   *
   * **碰撞推开**：因为 x 拉伸了，两节点真实笛卡尔距离 = √((Δx)²+(Δy)²) 仍正确
   * （Δx 已含 ASPECT_X 放大效果）。推开后 j 的 angle 改变 → 重新算 x 时仍乘
   * ASPECT_X，闭环一致。
   */
  ASPECT_X: 1.55,
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

/** 黄金角（rad）：phyllotaxis 分布关键常数，~2.3999 rad（137.5°） */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 碰撞推开：每次迭代把后落点的 entity 推开的角度增量（rad）。
 * v1.6.x 第三轮：0.06 → 0.10。旧 step × 8 iters = 27° 累计推开不足，跨类
 * （location r≈14 ↔ named_private r≈7）实测仍留 gap=-12.7 px 重叠。
 */
const COLLISION_REPEL_STEP = 0.10;

/**
 * 碰撞推开：最多迭代次数（足够大避免漂移，但有限避免病态死循环）。
 * v1.6.x 第三轮：8 → 16。配合更大的 step + 更大的圆周（R_INNER 60→80），
 * 总推开能力达 ~92° 累计，覆盖最严重 N=37 时间密集 case。
 */
const COLLISION_REPEL_MAX_ITERS = 16;

/**
 * 碰撞检测时两节点视觉半径之外的 padding（px），留出视觉呼吸距离。
 * v1.6.x 第三轮：4 → 6，相邻 entity 之间留出更可读的空隙。
 */
const COLLISION_PAD = 6;

/** 取 entity 节点视觉半径（与 view 渲染保持一致；anonymous 走升级后的 3.5） */
function visualRadiusOf(
  ref:
    | { kind: 'location'; node: LocationConstellationNode }
    | { kind: 'named'; node: NamedPrivateNode }
    | { kind: 'anonymous'; item: AnonymousItem }
): number {
  if (ref.kind === 'location') {
    return getNodeVisual('location', ref.node.type, ref.node.editionCount).r;
  }
  if (ref.kind === 'named') {
    return getNodeVisual('named_private', null, ref.node.editionCount).r;
  }
  return getNodeVisual('anonymous', null, 1).r;
}

/**
 * Time-spiral 布局。
 *
 * 算法（v1.6.x 第二轮重写：phyllotaxis + 碰撞推开，解决时间相邻 entity 在
 * sorted-index 上也相邻造成的 r/angle 双重接近重叠）：
 *
 * 1. 三类 ref 合并：locations / namedPrivate / anonymous.items
 *    按 sale_date 是否非空分 `dated[]` / `undated[]`。
 *
 * 2. dated 按 ms 升序排。**r 由真实时间** 决定 —— A 方向语义不变：
 *    earliest → R_INNER，latest → R_OUTER_DATA。
 *
 * 3. **angle 由 phyllotaxis 黄金角分配**（核心修复）：
 *    第 i 个 dated point `angle = -π/2 + i × GOLDEN_ANGLE`（mod 2π 由
 *    cos/sin 自然处理）。GOLDEN_ANGLE ≈ 2.3999 rad ≈ 137.5°，与 2π 不可
 *    通约 → 任意 N 下相邻 index 在角度上散得最开（向日葵种子密堆原理）。
 *    时间相邻的两 entity 不再在 angle 上也相邻。
 *
 * 4. **碰撞推开**：phyllotaxis 已显著减少重叠，但 R_INNER 附近圆周短、
 *    r 又接近 → 仍可能 chord 不足。最多 8 轮迭代：对每对 (i, j)（j>i，
 *    时间更晚）若 chord 距离 < r_i + r_j + COLLISION_PAD，把 j 的 angle
 *    递增 COLLISION_REPEL_STEP rad（j 始终推走，i 锚定时间）。
 *    deterministic：固定迭代顺序 + 固定步长 → 相同输入相同输出。
 *
 * 5. dated 只 1 个或全 same date → span=0，r 取径向中点、angle=-π/2
 *    （12 点钟，保留 v1.6.x 第一轮契约）。
 *
 * 6. undated 全 r = R_GHOST，沿 -π/2 起均匀分布 360°（同 v1.6.x 第一轮）。
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
  const { R_INNER, R_OUTER_DATA, R_GHOST, ANONYMOUS_R, ASPECT_X } =
    TIME_SPIRAL_GEOMETRY;

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

  // dated 按时间升序排（earliest 在前）—— 决定 r 与 phyllotaxis index
  dated.sort((a, b) => a.ms - b.ms);

  // ─── 2/3/5. 计算每个 dated entity 的 (r, angle) ─────────────────────────
  // 用平行数组保存几何中间结果，碰撞推开阶段就地改 angle。
  const datedR: number[] = new Array(dated.length);
  const datedAngle: number[] = new Array(dated.length);
  const datedRadius: number[] = new Array(dated.length); // 视觉半径，碰撞用

  if (dated.length > 0) {
    const earliestMs = dated[0].ms;
    const latestMs = dated[dated.length - 1].ms;
    const spanMs = latestMs - earliestMs;
    const N = dated.length;

    if (spanMs === 0) {
      // edge case：dated 只 1 个 / 全 same date —— 落径向中点 + 12 点钟方向
      // （契约保留：保留 v1.6.x 第一轮的测试断言）
      const r = R_INNER + (R_OUTER_DATA - R_INNER) / 2;
      const angle = -Math.PI / 2;
      for (let i = 0; i < N; i++) {
        datedR[i] = r;
        datedAngle[i] = angle;
        datedRadius[i] = visualRadiusOf(dated[i]);
      }
    } else {
      // r 由真实时间 t 决定；angle 用 phyllotaxis 黄金角 step
      for (let i = 0; i < N; i++) {
        const ref = dated[i];
        const t = (ref.ms - earliestMs) / spanMs;
        datedR[i] = R_INNER + t * (R_OUTER_DATA - R_INNER);
        datedAngle[i] = -Math.PI / 2 + i * GOLDEN_ANGLE;
        datedRadius[i] = visualRadiusOf(ref);
      }

      // ─── 4. 碰撞推开（迭代）─────────────────────────────────────────
      // chord 检查用真实渲染距离（含 ASPECT_X 椭圆化）—— 不然 repel 会和
      // 屏幕上看到的间距不一致，pre-stretch 圆距下"夹紧"的两点 stretch 后
      // 其实 x 已松开，repel 会过度推开 angle。第四轮椭圆化后必须用 stretched x。
      for (let iter = 0; iter < COLLISION_REPEL_MAX_ITERS; iter++) {
        let movedAny = false;
        for (let i = 0; i < N; i++) {
          const xi = datedR[i] * Math.cos(datedAngle[i]) * ASPECT_X;
          const yi = datedR[i] * Math.sin(datedAngle[i]);
          for (let j = i + 1; j < N; j++) {
            const xj = datedR[j] * Math.cos(datedAngle[j]) * ASPECT_X;
            const yj = datedR[j] * Math.sin(datedAngle[j]);
            const dx = xj - xi;
            const dy = yj - yi;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const needed = datedRadius[i] + datedRadius[j] + COLLISION_PAD;
            if (dist < needed) {
              // 推开 j（时间更晚，时间锚 i）
              datedAngle[j] += COLLISION_REPEL_STEP;
              movedAny = true;
            }
          }
        }
        if (!movedAny) break;
      }
    }
  }

  // ─── 6. undated 全 r = R_GHOST，均匀分布 360° ───────────────────────────
  const locationPoints: ConstellationLocationPoint[] = [];
  const namedPoints: ConstellationNamedPoint[] = [];
  const anonymousPoints: ConstellationAnonymousPoint[] = [];

  for (let i = 0; i < dated.length; i++) {
    const ref = dated[i];
    const r = datedR[i];
    const angle = datedAngle[i];
    // v1.6.x 第四轮：x 维度乘 ASPECT_X 把圆环拉成椭圆，利用 viewBox 横向空间
    const x = cx + r * Math.cos(angle) * ASPECT_X;
    const y = cy + r * Math.sin(angle);
    if (ref.kind === 'location') {
      locationPoints.push({ node: ref.node, x, y, angle, r, isUndated: false });
    } else if (ref.kind === 'named') {
      namedPoints.push({ node: ref.node, x, y, angle, r, isUndated: false });
    } else {
      anonymousPoints.push({
        editionId: ref.item.editionId,
        artworkId: ref.item.artworkId,
        x,
        y,
        angle,
        r,
        isUndated: false,
        sale_date: ref.item.sale_date,
      });
    }
  }

  const undatedN = undated.length;
  for (let i = 0; i < undatedN; i++) {
    const ref = undated[i];
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, undatedN);
    const r = R_GHOST;
    // v1.6.x 第四轮：同样椭圆化（保持与 dated entity 一致的 x 拉伸）
    const x = cx + r * Math.cos(angle) * ASPECT_X;
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
    // v1.6.x 第二轮：r 1.5→3.5, opacity 0.3→0.55
    // 视觉词汇升级 —— 灰实心几何小圆，"看得见但无名"。
    return { r: 3.5, style: 'dust', opacity: 0.55, innerRingR: null };
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
// (seed) 生成 quadratic-bezier 平滑闭合的有机轮廓。视觉用意：跟 Strata
// 严格 geometric 方块、Markets 抽象 dot 形成对照 —— Diaspora 节点表达"具象的
// 个体性"，每个机构/人是独一无二的轮廓。
//
// 不引入 lib / 动画 / morph：~30 行 deterministic hash 函数 + path 替换。
// anonymous dust 仍是 `<circle>`（太小 organic 看不出来，徒增 noise）。
//
// v1.6.x 第二轮：扰动 ±15→±25%, 段 12→8 —— 让 r=7-14 节点形状肉眼可见。
// 旧 12 段 + ±15% 在小节点 (named_private r≈7-9) 上扰动只 1-2px，视觉上仍是
// 规则圆。新的 8 段 + ±25% 在同尺寸下扰动达 1.75-3.5px，blob 形态清晰。

/**
 * 生成 deterministic organic blob SVG path。
 *
 * 字符 hash → 每个控制点径向扰动 [-25%, +25%] → 8 段 quadratic bezier 闭合。
 * 同 seed + 同 (cx, cy, baseR) → 同字符串（render 间稳定，便于 React diff）。
 */
export function generateOrganicPath(
  cx: number,
  cy: number,
  baseR: number,
  seed: string
): string {
  const segments = 8;

  /** 字符 hash → [-0.25, +0.25] 范围扰动比例 */
  const hashOffset = (i: number): number => {
    const s = `${seed}:${i}`;
    let h = 0;
    for (let c = 0; c < s.length; c++) {
      h = ((h * 31) + s.charCodeAt(c)) | 0;
    }
    return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.5; // -0.25..+0.25
  };

  // segments 个径向扰动后的控制点（v1.6.x 第二轮：8 段，让小节点 blob 可见）
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const r = baseR * (1 + hashOffset(i));
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  // v1.6.x 第六轮：Catmull-Rom spline 转 cubic bezier，path 平滑经过每个
  // perturbed point。
  //
  // 演化轨迹：
  // - 一轮 Q midpoint bezier → 扰动被 midpoint 平均化 → 形状似圆
  // - 五轮 L polygon → 扰动完整体现但棱角太硬 → 不是 organic 流体
  // - 六轮 Catmull-Rom C cubic → smooth flow + 扰动完整体现 = 流体不规则形
  //
  // Catmull-Rom 公式（tension=1/6 标准值）：
  //   段 i 从 p_i 到 p_{i+1}：
  //   ctrl1 = p_i + (p_{i+1} - p_{i-1}) / 6
  //   ctrl2 = p_{i+1} - (p_{i+2} - p_i) / 6
  //   C ctrl1 ctrl2 p_{i+1}
  // 跨边界用 modulo 取环形邻居（首尾 perturbed point 平滑闭合）。
  const tension = 1 / 6;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < segments; i++) {
    const p0 = points[(i - 1 + segments) % segments];
    const p1 = points[i];
    const p2 = points[(i + 1) % segments];
    const p3 = points[(i + 2) % segments];
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    path +=
      ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}` +
      ` ${c2x.toFixed(2)} ${c2y.toFixed(2)}` +
      ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
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

/**
 * @deprecated v1.6.x 第二轮起 ghost 改成 per-edition 可点击 inbox
 * （见 `buildGhostEditions` / `layoutGhostRing`），不再走匿名 ring。
 * 保留导出仅向后兼容；新代码不要用。
 */
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

// ─── v1.6.x 第二轮: Ghost editions inbox ─────────────────────────────────
//
// 系统化"待补全档案"机制：edition 没 location 且没有出库（non-outflow）—— 这
// 是 archive 里**等待补 location 元数据**的项。视觉上画在 R=245 外圈，**空心**
// 几何小圆 r=4 opacity=0.55，**可点击**直接跳到 `/editions/:id` 让用户去补
// location。三档信息密度的最外层，呼应 brutalist "缺失态画出来不藏" 的设计原则。
//
// 与匿名 dust（灰实心，看得见但无名）形成对照 ——
//   - anonymous outflow = 已离开 + 无买家信息（hover 看 sale_date，**不可点击**）
//   - ghost edition     = 未离开 + 无 location（**可点击**去补全）
//
// 旧 `getGhostNodes` 已 @deprecated；新代码走这套。

/**
 * 待补全档案的最小元数据，足够 view 渲染 + 跳转 + tooltip。
 */
export interface GhostEdition {
  editionId: string;
  artworkId: string;
  /** artwork.title_en || title_cn || null */
  title: string | null;
  /** edition.inventory_number 或 null */
  inventoryNumber: string | null;
  /** edition.status 字面值（不归一化） */
  status: string;
}

/** Ghost editions 排序时各 status 的优先级（小 = 先） —— 越紧迫的越靠前 */
const GHOST_STATUS_PRIORITY: Record<string, number> = {
  in_production: 0,
  in_studio: 1,
  in_transit: 2,
  at_gallery: 3,
  at_museum: 4,
};

/**
 * 收集 "non-outflow + 无 location" 的 edition，组装成可渲染 / 可跳转的列表。
 *
 * - 过滤：`location_id == null && status !== 'sold' && status !== 'gifted'`
 * - 排序：按 status 优先级（in_production → in_studio → in_transit →
 *   at_gallery → at_museum → 其他），组内按 `created_at` desc（晚创建在前
 *   —— 最新被忽视的更优先补全）
 * - artwork 不存在时 title=null，但 GhostEdition 仍出现 —— 缺失态不藏
 *
 * 测试：见 diasporaUtils.test.ts `buildGhostEditions`。
 */
export function buildGhostEditions(
  editions: VizEdition[],
  artworks: VizArtwork[]
): GhostEdition[] {
  // artworkId → artwork 映射（title 查表用）
  const artworkById = new Map<string, VizArtwork>();
  for (const a of artworks) artworkById.set(a.id, a);

  const ghosts: GhostEdition[] = [];
  for (const e of editions) {
    if (e.location_id) continue;
    if (e.status === 'sold' || e.status === 'gifted') continue;
    const aw = artworkById.get(e.artwork_id) ?? null;
    const title = aw ? aw.title_en || aw.title_cn || null : null;
    ghosts.push({
      editionId: e.id,
      artworkId: e.artwork_id,
      title: title && title.length > 0 ? title : null,
      inventoryNumber: e.inventory_number ?? null,
      status: e.status,
    });
  }

  // 按 status 优先级升序，相同 status 按 created_at desc（晚创建在前）
  ghosts.sort((a, b) => {
    const pa = GHOST_STATUS_PRIORITY[a.status] ?? 99;
    const pb = GHOST_STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    // 组内：晚 created_at 先（用原 editions 数组取 created_at）
    const ea = editions.find((e) => e.id === a.editionId);
    const eb = editions.find((e) => e.id === b.editionId);
    const ta = ea?.created_at ?? '';
    const tb = eb?.created_at ?? '';
    if (ta === tb) return 0;
    return ta < tb ? 1 : -1; // desc
  });

  return ghosts;
}

export interface GhostRingPoint {
  ghost: GhostEdition;
  x: number;
  y: number;
  angle: number;
}

export interface GhostRingLayoutOptions {
  width: number;
  height: number;
  /**
   * 默认 340 —— Diaspora SVG 内部约定（R_GHOST=300 之外再外圈）。
   * v1.6.x 第三轮：245 → 340，跟主圈整体放大（R 60→80 / 190→260 / 220→300）+
   * viewBox H 600→760 同步。
   */
  radius?: number;
}

/**
 * Ghost editions 沿外圈均匀分布。
 *
 * - 中心 = (width/2, height/2)
 * - 默认半径 340（在 R_GHOST=300 与 viewBox 边之间，v1.6.x 第三轮）
 * - 起点 12 点钟（-π/2），均匀分布 360°
 * - N=0 → 空数组（view 据此不渲染）
 *
 * 与 `getGhostNodes` 的关键差异：每点带 ghost meta（用于 click 跳转 / tooltip）。
 */
export function layoutGhostRing(
  ghosts: GhostEdition[],
  options: GhostRingLayoutOptions
): GhostRingPoint[] {
  const N = ghosts.length;
  if (N === 0) return [];
  const cx = options.width / 2;
  const cy = options.height / 2;
  const radius = options.radius ?? 340;
  // v1.6.x 第四轮：跟 layoutConstellation 同步用 ASPECT_X 椭圆化 x 坐标，
  // 保持 ghost ring 与主时间螺旋的视觉同源（都是 ellipse 不是 circle）。
  const { ASPECT_X } = TIME_SPIRAL_GEOMETRY;

  const points: GhostRingPoint[] = [];
  for (let i = 0; i < N; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
    points.push({
      ghost: ghosts[i],
      x: cx + radius * Math.cos(angle) * ASPECT_X,
      y: cy + radius * Math.sin(angle),
      angle,
    });
  }
  return points;
}
