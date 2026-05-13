import type {
  VizEdition,
  VizLocation,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface LocationNode {
  id: string;
  name: string;
  type: 'studio' | 'gallery' | 'museum' | 'other';
  city: string | null;
  country: string | null;
  editionCount: number;
  editionIds: string[];
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
