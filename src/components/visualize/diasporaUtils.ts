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

// ─── M6: Constellation data model ────────────────────────────────────────────
//
// Diaspora 视图升级为三环 + center 的 Constellation 形态。i18n key /
// 文件名保留 "diaspora"（与 Strata / Markets / Terminal 同列诗意名），
// 但内部数据 model 叫 ConstellationData，对应"机构 / 私人 / 匿名" 三层节点。
//
// 数据归类只处理 outflow：edition.status ∈ ('sold', 'gifted')。其他 status
// 不进 Constellation —— 在 artist 手里或 still external 的 editions 不算
// "流出去"，由 Strata / Markets 各自承担它们的故事。
//
// 优先级（严格顺序）：
//   1. location_id 指向 location 且 location.type !== 'studio' → LocationNode
//   2. buyer_name 非空 → NamedPrivateNode（key = buyer_name 字面值，不归一化）
//   3. location_id 指向 studio 类型 + buyer_name 兜底为空 → 不太可能命中，
//      但若发生，仍归 NamedPrivateNode（buyer_name 用 location.name 兜底，
//      避免 "卖给 studio" 的 phantom 节点出现在 Inner ring）
//   4. 都没有 → AnonymousAggregate
//
// 注意：buyer_name 故意按字面值聚合 —— "Liliana Gao" 与 "Liliana Gao / 林奇"
// 是两个节点，不强行 dedupe（避免对 Akeroyd / Sigg 类合作买家的归一化错误）。

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
}

export interface AnonymousAggregate {
  kind: 'anonymous';
  count: number;
  editionIds: string[];
  /** 匿名流出对应的 artwork id 集合（去重） */
  artworkIds: string[];
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
    }
  >();
  const namedBuckets = new Map<
    string,
    {
      name: string;
      editionIds: string[];
      artworkIds: Set<string>;
    }
  >();
  const anonEditionIds: string[] = [];
  const anonArtworkIds = new Set<string>();
  let totalOutflowCount = 0;

  for (const ed of editions) {
    if (!isOutflow(ed.status)) continue;
    totalOutflowCount++;

    const loc = ed.location_id ? locById.get(ed.location_id) ?? null : null;
    const buyerName = ed.buyer_name?.trim() ? ed.buyer_name.trim() : null;

    // 优先级 1: non-studio location
    if (loc && loc.type !== 'studio') {
      let bucket = locationBuckets.get(loc.id);
      if (!bucket) {
        bucket = {
          meta: loc,
          editionIds: [],
          artworkIds: new Set(),
        };
        locationBuckets.set(loc.id, bucket);
      }
      bucket.editionIds.push(ed.id);
      bucket.artworkIds.add(ed.artwork_id);
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
        };
        namedBuckets.set(buyerName, bucket);
      }
      bucket.editionIds.push(ed.id);
      bucket.artworkIds.add(ed.artwork_id);
      continue;
    }

    // 优先级 4: anonymous
    anonEditionIds.push(ed.id);
    anonArtworkIds.add(ed.artwork_id);
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
    },
  };
}

// ─── M6: Constellation 视觉布局 ─────────────────────────────────────────────
//
// 弧度区间按 location.type 分配（顺时针，−π/2 = 12 点钟方向，0 = 3 点钟方向）：
//   studio              → 顶部弧 (-30°, 30°)  紧贴 artist center
//   gallery             → 左侧弧 (120°, 200°) 商业代理
//   museum              → 右上弧 (-90°, -30°) 公共收藏
//   private_collection  → 右下弧 (-150°, -90°) 私人 collection
//                         注：右下 = (270°, 330°) = (-90°, -30°) 与 museum 冲突，
//                         我们用 (30°, 90°) 让 private collection 落在右下偏下，
//                         museum 偏右上（见下方常量）
//   other               → 底部弧 (210°, 270°) fallback
//
// 实现里用 [startRad, endRad]，按 type 内 editionCount desc 排列后 evenly 分布
// 在该区间。区间方向均按"角度递增"画。

/** 弧度区间（rad），按 SVG 习惯：-π/2 = 12 点钟，0 = 3 点钟，π/2 = 6 点钟 */
export const TYPE_ARC_RANGES: Record<
  LocationConstellationNode['type'],
  { start: number; end: number }
> = {
  // 顶部弧：-π/6 ~ π/6（即 -30° ~ 30°）
  studio: { start: -Math.PI / 6, end: Math.PI / 6 },
  // 右上弧：-π/2 ~ -π/6（即 -90° ~ -30°），museum 偏右上
  museum: { start: -Math.PI / 2, end: -Math.PI / 6 },
  // 左侧弧：2π/3 ~ 10π/9（即 120° ~ 200°），gallery 商业代理
  gallery: { start: (2 * Math.PI) / 3, end: (10 * Math.PI) / 9 },
  // 右下弧：π/6 ~ π/2（即 30° ~ 90°），private collection 跟 museum 同侧但下方
  private_collection: { start: Math.PI / 6, end: Math.PI / 2 },
  // 底部弧：7π/6 ~ 3π/2（即 210° ~ 270°），fallback / other
  other: { start: (7 * Math.PI) / 6, end: (3 * Math.PI) / 2 },
};

export interface ConstellationLocationPoint {
  node: LocationConstellationNode;
  x: number;
  y: number;
  angle: number;
}

export interface ConstellationNamedPoint {
  node: NamedPrivateNode;
  x: number;
  y: number;
  angle: number;
}

export interface ConstellationAnonymousPoint {
  index: number;
  x: number;
  y: number;
}

export interface ConstellationLayout {
  center: { x: number; y: number };
  /** Inner ring (R1) location 节点 */
  locationPoints: ConstellationLocationPoint[];
  /** Middle ring (R2) named private buyer 节点 */
  namedPoints: ConstellationNamedPoint[];
  /** Outer ring (R3) anonymous dot dust */
  anonymousPoints: ConstellationAnonymousPoint[];
  /** 三环半径，便于 view 渲染参考线 */
  radii: { inner: number; middle: number; outer: number };
}

export interface ConstellationLayoutOptions {
  width: number;
  height: number;
  /** 半径系数（占 min(w,h) 的比例），默认 inner=0.25 / middle=0.37 / outer=0.47 */
  innerRatio?: number;
  middleRatio?: number;
  outerRatio?: number;
}

/**
 * 计算 Constellation 三环坐标。
 *
 * - location 按 type 落到对应弧度区间，区间内按 editionCount desc 排
 *   evenly 分布
 * - named private 在 middle ring 整圆均匀分布（不按 type 分弧），按 editionCount
 *   desc 排，重要的落在 12 点钟方向附近
 * - anonymous dots 在 outer ring 整圆均匀分布，从 12 点钟方向顺时针
 */
export function layoutConstellation(
  data: ConstellationData,
  options: ConstellationLayoutOptions
): ConstellationLayout {
  const { width, height } = options;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);

  const innerR = minDim * (options.innerRatio ?? 0.25);
  const middleR = minDim * (options.middleRatio ?? 0.37);
  const outerR = minDim * (options.outerRatio ?? 0.47);

  // ─── Inner ring: locations by type arc ─────────────────────────────────
  // 按 type 分桶，桶内按 editionCount desc 排
  const byType = new Map<
    LocationConstellationNode['type'],
    LocationConstellationNode[]
  >();
  for (const loc of data.locations) {
    if (!byType.has(loc.type)) byType.set(loc.type, []);
    byType.get(loc.type)!.push(loc);
  }
  for (const arr of byType.values()) {
    arr.sort((a, b) => b.editionCount - a.editionCount);
  }

  const locationPoints: ConstellationLocationPoint[] = [];
  // 遍历 enum 顺序保证布局稳定（与 TYPE_ARC_RANGES 同 key 集合）
  const typeOrder: LocationConstellationNode['type'][] = [
    'studio',
    'gallery',
    'museum',
    'private_collection',
    'other',
  ];
  for (const type of typeOrder) {
    const nodes = byType.get(type);
    if (!nodes || nodes.length === 0) continue;
    const range = TYPE_ARC_RANGES[type];
    const span = range.end - range.start;
    for (let i = 0; i < nodes.length; i++) {
      // 单节点居中；多节点把端点也留点内边距，避免压到弧边
      const t =
        nodes.length === 1 ? 0.5 : i / (nodes.length - 1);
      // 单节点 t=0.5 时直接落中点
      const angle =
        nodes.length === 1
          ? range.start + span * 0.5
          : range.start + span * t;
      locationPoints.push({
        node: nodes[i],
        x: cx + innerR * Math.cos(angle),
        y: cy + innerR * Math.sin(angle),
        angle,
      });
    }
  }

  // ─── Middle ring: named private buyers (整圆均匀) ───────────────────────
  const namedPoints: ConstellationNamedPoint[] = [];
  const namedSorted = [...data.namedPrivateBuyers].sort(
    (a, b) => b.editionCount - a.editionCount
  );
  const namedN = namedSorted.length;
  for (let i = 0; i < namedN; i++) {
    // 从 12 点钟方向开始（-π/2），顺时针
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, namedN);
    namedPoints.push({
      node: namedSorted[i],
      x: cx + middleR * Math.cos(angle),
      y: cy + middleR * Math.sin(angle),
      angle,
    });
  }

  // ─── Outer ring: anonymous dots (整圆均匀, 不可点击) ────────────────────
  const anonymousPoints: ConstellationAnonymousPoint[] = [];
  const anonN = data.anonymous.count;
  for (let i = 0; i < anonN; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, anonN);
    anonymousPoints.push({
      index: i,
      x: cx + outerR * Math.cos(angle),
      y: cy + outerR * Math.sin(angle),
    });
  }

  return {
    center: { x: cx, y: cy },
    locationPoints,
    namedPoints,
    anonymousPoints,
    radii: { inner: innerR, middle: middleR, outer: outerR },
  };
}

/** 命名 private buyer node 半径：sqrt(editionCount) * 2.5 + 4，clamp [4, 10] */
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
