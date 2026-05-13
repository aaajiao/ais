import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pin, X } from 'lucide-react';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
  VizArtwork,
} from '@/hooks/queries/useVisualizationData';
import {
  buildNodes,
  pickCenterNode,
  radialLayout,
  buildEdges,
  computeTrackedStat,
  countryToISO2,
  nodeRadius,
  TYPE_OPACITY,
  type LocationNode,
} from './diasporaUtils';

export interface DiasporaViewProps {
  artworks?: VizArtwork[];
  editions: VizEdition[];
  locations: VizLocation[];
  history: VizHistory[];
}

// SVG 内部坐标系（固定，用 viewBox 响应式缩放）
const W = 800;
const H = 560;

// 同心环辅助圆半径（纯视觉参考）—— 必须与 diasporaUtils.ts 的 RING_RADII 同步
// 外环 0.42 留出节点半径 + label 高度的安全边距，避免上下边缘节点被裁
const RING_GUIDE_RADII = [
  Math.min(W, H) * 0.22,
  Math.min(W, H) * 0.34,
  Math.min(W, H) * 0.42,
];

/** 二次贝塞尔控制点：把 from→to 曲线偏向中心以外，避免所有线交叉在原点 */
function curvedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number
): string {
  // 控制点 = 中点偏离圆心方向，让曲线向外弧出
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // 从圆心到中点的方向
  const dx = mx - cx;
  const dy = my - cy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // 控制点稍微向外偏
  const qx = mx + (dx / len) * 30;
  const qy = my + (dy / len) * 30;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** 从 VizArtwork 数组取得 artwork_id → artwork 的 Map */
function buildArtworkMap(artworks: VizArtwork[]): Map<string, VizArtwork> {
  const m = new Map<string, VizArtwork>();
  for (const a of artworks) m.set(a.id, a);
  return m;
}

export default function DiasporaView({
  artworks = [],
  editions,
  locations,
  history,
}: DiasporaViewProps) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();

  // ─── 交互状态 ──────────────────────────────────────────────────────────────
  // pinnedNodeId: 点击固定的节点 id（null = 无 pin）
  // hoveredNodeId: hover 的节点 id（仅 pin 为 null 时有效）
  // 当前展示节点 = pinnedNodeId ?? hoveredNodeId
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // ─── 数据变换 ──────────────────────────────────────────────────────────────
  const artworkMap = useMemo(() => buildArtworkMap(artworks), [artworks]);
  const nodes = useMemo(() => buildNodes(editions, locations), [editions, locations]);
  const centerNode = useMemo(() => pickCenterNode(nodes), [nodes]);
  const outerNodes = useMemo(
    () => (centerNode ? nodes.filter((n) => n.id !== centerNode.id) : nodes),
    [nodes, centerNode]
  );
  const layout = useMemo(
    () =>
      centerNode
        ? radialLayout(centerNode, outerNodes, { width: W, height: H })
        : null,
    [centerNode, outerNodes]
  );
  const edges = useMemo(() => buildEdges(history, nodes), [history, nodes]);
  const stat = useMemo(() => computeTrackedStat(editions, locations), [editions, locations]);

  // 节点 id → 坐标（用于边的起止点查找）
  const coordMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    if (!layout) return m;
    m.set(layout.center.node.id, { x: layout.center.x, y: layout.center.y });
    for (const p of layout.ring) {
      m.set(p.node.id, { x: p.x, y: p.y });
    }
    return m;
  }, [layout]);

  // 当前激活节点 id（pin 优先，否则 hover 预览）
  const activeNodeId = pinnedNodeId ?? hoveredNodeId;

  // pin 卡片用的 edition 列表（按 location 过滤，附带 artwork 信息）
  const pinnedEditions = useMemo(() => {
    if (!pinnedNodeId) return [];
    return editions
      .filter((e) => e.location_id === pinnedNodeId)
      .map((e) => ({
        edition: e,
        artwork: artworkMap.get(e.artwork_id),
        displayId: e.inventory_number ?? `${e.id.slice(0, 8)}${t('diaspora.pin.noInventory')}`,
      }));
  }, [pinnedNodeId, editions, artworkMap, t]);

  // hover 预览用的 node（仅无 pin 时显示）
  const previewNode: LocationNode | null = useMemo(() => {
    if (pinnedNodeId) return null; // pin 时不显示预览
    if (!hoveredNodeId) return null;
    return nodes.find((n) => n.id === hoveredNodeId) ?? null;
  }, [pinnedNodeId, hoveredNodeId, nodes]);

  // pin 节点对应的 LocationNode
  const pinnedNode: LocationNode | null = useMemo(() => {
    if (!pinnedNodeId) return null;
    return nodes.find((n) => n.id === pinnedNodeId) ?? null;
  }, [pinnedNodeId, nodes]);

  // ─── 事件处理 ──────────────────────────────────────────────────────────────
  function handleNodeClick(nodeId: string) {
    setPinnedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }

  function handleNodeMouseEnter(nodeId: string) {
    setHoveredNodeId(nodeId);
  }

  function handleNodeMouseLeave() {
    setHoveredNodeId(null);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    // 只有点击 SVG 背景（target 是 svg 或 circle/path 等非交互元素）才取消 pin
    // 节点 <g> 已阻止冒泡，所以这里只有"真正点 SVG 空白"才会触发
    const target = e.target as Element;
    // 如果 target 是节点 g 或其子元素，不取消 pin（节点自己处理）
    if (target.closest('g[data-node]')) return;
    setPinnedNodeId(null);
  }

  // ─── 空状态 ────────────────────────────────────────────────────────────────
  if (nodes.length === 0) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-bold uppercase tracking-wider">
            {t('diaspora.heading')}
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {t('diaspora.description')}
          </p>
        </header>
        <div className="border border-border p-3 text-sm space-y-1">
          <div className="font-mono">
            {t('diaspora.stat.trackedRatio', {
              tracked: stat.tracked,
              total: stat.total,
              percent: stat.percent,
            })}
          </div>
          <div className="text-xs text-muted-foreground italic">
            {t('diaspora.stateHint')}
          </div>
        </div>
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="space-y-1">
        <h2 className="text-base font-bold uppercase tracking-wider">
          {t('diaspora.heading')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t('diaspora.description')}
        </p>
      </header>

      {/* ─── 档案薄声明 ──────────────────────────────────────────────── */}
      <div className="border border-border p-3 text-sm space-y-1">
        <div className="font-mono">
          {t('diaspora.stat.trackedRatio', {
            tracked: stat.tracked,
            total: stat.total,
            percent: stat.percent,
          })}
        </div>
        <div className="text-xs text-muted-foreground italic">
          {t('diaspora.stateHint')}
        </div>
      </div>

      {/* ─── Legend ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">
          type
        </span>
        {(
          [
            ['studio', 1.0],
            ['gallery', 0.7],
            ['museum', 0.7],
            ['other', 0.4],
          ] as Array<[LocationNode['type'], number]>
        ).map(([type, opacity]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full bg-foreground"
              style={{ opacity }}
            />
            <span className="text-muted-foreground">
              {t(`diaspora.legend.${type}`)}
            </span>
          </span>
        ))}
      </div>

      {/* ─── SVG 同心环关系图 ────────────────────────────────────────── */}
      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ maxHeight: '70vh' }}
          role="img"
          aria-label={t('diaspora.heading')}
          onClick={handleSvgClick}
        >
          {/* 同心环辅助圆（弱色参考线，提升对比让节点压住时仍能看清环路） */}
          {RING_GUIDE_RADII.map((r, i) => (
            <circle
              key={i}
              cx={W / 2}
              cy={H / 2}
              r={r}
              fill="none"
              className="stroke-foreground"
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.25}
            />
          ))}

          {/* ─── edges ──────────────────────────────────────────── */}
          {layout &&
            edges.map((edge, i) => {
              const from = coordMap.get(edge.fromNodeId);
              const to = coordMap.get(edge.toNodeId);
              if (!from || !to) return null;
              const opacity = Math.min(1, edge.count * 0.3);
              const d = curvedPath(from.x, from.y, to.x, to.y, W / 2, H / 2);
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  className="stroke-foreground"
                  strokeWidth={1}
                  strokeOpacity={opacity}
                />
              );
            })}

          {/* ─── outer nodes ────────────────────────────────────── */}
          {layout &&
            layout.ring.map(({ x, y, node }) => {
              const r = nodeRadius(node.editionCount);
              const opacity = TYPE_OPACITY[node.type];
              const isHovered = hoveredNodeId === node.id && !pinnedNodeId;
              const isPinned = pinnedNodeId === node.id;
              const isActive = activeNodeId === node.id;
              const iso2 = countryToISO2(node.country);

              // 节点 label 偏移：让文字不覆盖节点本体
              // 相对中心方向决定 label 放哪侧
              const dx = x - W / 2;
              const dy = y - H / 2;
              const angle = Math.atan2(dy, dx);
              const labelDist = r + 5;
              const lx = x + Math.cos(angle) * labelDist;
              const ly = y + Math.sin(angle) * labelDist;
              const anchor =
                Math.abs(dx) < 20
                  ? 'middle'
                  : dx > 0
                    ? 'start'
                    : 'end';

              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  className="cursor-pointer focus:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name} — ${t('diaspora.tooltip.editions', { count: node.editionCount })}`}
                  aria-pressed={isPinned}
                  onMouseEnter={() => handleNodeMouseEnter(node.id)}
                  onMouseLeave={handleNodeMouseLeave}
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNodeClick(node.id);
                    }
                  }}
                >
                  {/* SVG 原生 tooltip：hover 显示完整 name（label 被截断时尤其重要） */}
                  <title>{node.name}</title>
                  {/* pin 外圈（仅 pin 状态显示，动态脉冲） */}
                  {isPinned && (
                    <circle
                      cx={x}
                      cy={y}
                      r={r + 6}
                      fill="none"
                      className="stroke-foreground diaspora-pin-pulse"
                      strokeWidth={1.5}
                    />
                  )}
                  {/* hover ring（仅 hover 预览时，细线） */}
                  {isHovered && !isPinned && (
                    <circle
                      cx={x}
                      cy={y}
                      r={r + 4}
                      fill="none"
                      className="stroke-foreground"
                      strokeWidth={0.5}
                      opacity={0.4}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    className="fill-foreground"
                    opacity={isPinned ? 1 : opacity}
                  />
                  {/* 节点名 */}
                  <text
                    x={lx}
                    y={ly - 3}
                    textAnchor={anchor}
                    className="fill-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                    opacity={isActive ? 1 : 0.75}
                  >
                    {node.name.length > 18
                      ? node.name.slice(0, 16) + '…'
                      : node.name}
                  </text>
                  {/* ISO-2 国家码 */}
                  <text
                    x={lx}
                    y={ly + 8}
                    textAnchor={anchor}
                    className="fill-muted-foreground"
                    fontSize="8"
                    fontFamily="ui-monospace, monospace"
                  >
                    {iso2}
                  </text>
                </g>
              );
            })}

          {/* ─── center node ────────────────────────────────────── */}
          {layout && (() => {
            const centerNodeObj = layout.center.node;
            const isCenterHovered = hoveredNodeId === centerNodeObj.id && !pinnedNodeId;
            const isCenterPinned = pinnedNodeId === centerNodeObj.id;

            return (
              <g
                data-node={centerNodeObj.id}
                className="cursor-pointer focus:outline-none"
                role="button"
                tabIndex={0}
                aria-label={`${centerNodeObj.name} — ${t('diaspora.tooltip.editions', { count: centerNodeObj.editionCount })}`}
                aria-pressed={isCenterPinned}
                onMouseEnter={() => handleNodeMouseEnter(centerNodeObj.id)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(centerNodeObj.id); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(centerNodeObj.id);
                  }
                }}
              >
                {/* SVG 原生 tooltip：center node label 截断时也能看完整名 */}
                <title>{centerNodeObj.name}</title>
                {/* pin outer ring for center —— 动态脉冲 */}
                {isCenterPinned && (
                  <circle
                    cx={layout.center.x}
                    cy={layout.center.y}
                    r={30}
                    fill="none"
                    className="stroke-foreground diaspora-pin-pulse"
                    strokeWidth={1.5}
                  />
                )}
                {/* pulse ring */}
                <circle
                  cx={layout.center.x}
                  cy={layout.center.y}
                  r={26}
                  fill="none"
                  className="stroke-foreground"
                  strokeWidth={isCenterHovered ? 1 : 0.5}
                  opacity={isCenterHovered ? 0.4 : 0.2}
                />
                <circle
                  cx={layout.center.x}
                  cy={layout.center.y}
                  r={18}
                  className="fill-foreground"
                  opacity={1}
                />
                {/* center label */}
                <text
                  x={layout.center.x}
                  y={layout.center.y + 32}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {centerNodeObj.name.length > 20
                    ? centerNodeObj.name.slice(0, 18) + '…'
                    : centerNodeObj.name}
                </text>
                <text
                  x={layout.center.x}
                  y={layout.center.y + 42}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="8"
                  fontFamily="ui-monospace, monospace"
                >
                  {countryToISO2(centerNodeObj.country)}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ─── Tooltip / Info bar（hover 预览或 pin 卡片）──────────────── */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {pinnedNode ? (
          /* ── Pin 卡片 ───────────────────────────────────────────── */
          <div className="relative space-y-2 pr-6">
            <button
              type="button"
              aria-label={t('diaspora.pin.unpinAria')}
              className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setPinnedNodeId(null);
              }}
            >
              <X className="w-3 h-3" />
            </button>
            {/* 标题行 */}
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-bold">{pinnedNode.name}</span>
                <span className="text-muted-foreground ml-2">
                  {pinnedNode.type}
                  {pinnedNode.city ? ` · ${pinnedNode.city}` : ''}
                  {pinnedNode.country ? ` · ${pinnedNode.country}` : ''}
                </span>
              </div>
            </div>

            {/* Edition 列表 —— 横排 chips */}
            {pinnedEditions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-muted-foreground">
                  {t('diaspora.pin.editionsAt', { count: pinnedEditions.length })}:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pinnedEditions.map(({ edition, displayId }) => (
                    <button
                      key={edition.id}
                      type="button"
                      title={edition.status}
                      className="font-mono border border-border px-1.5 py-0.5 hover:bg-muted/50 hover:border-foreground transition-colors cursor-pointer"
                      onClick={(e) => {
                        // 防御性 stopPropagation：pin 卡片在 SVG 外，理论上不会冒泡到 SVG unpin，
                        // 但未来重构若把卡片移入 <foreignObject> 就会触发。预防为主。
                        e.stopPropagation();
                        navigate(`/editions/${edition.id}`);
                      }}
                    >
                      {displayId}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* View all 链接 */}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/editions?locationId=${pinnedNodeId}`);
              }}
            >
              {t('diaspora.pin.viewAll')}
            </button>
          </div>
        ) : previewNode ? (
          /* ── Hover 预览 ─────────────────────────────────────────── */
          <div className="relative pr-6">
            <Pin
              className="absolute top-0 right-0 w-3 h-3 text-muted-foreground opacity-60"
              aria-hidden="true"
            />
            <div className="font-bold">{previewNode.name}</div>
            <div className="text-muted-foreground">
              {t('diaspora.tooltip.editions', {
                count: previewNode.editionCount,
              })}
              {previewNode.city ? ` · ${previewNode.city}` : ''}
              {previewNode.country ? ` · ${previewNode.country}` : ''}
            </div>
            <div className="text-muted-foreground">
              {previewNode.type}
            </div>
          </div>
        ) : (
          /* ── 默认提示 ───────────────────────────────────────────── */
          <div className="text-muted-foreground">
            {t('diaspora.summary.overview', {
              nodes: nodes.length,
              edges: edges.length,
            })}
          </div>
        )}
      </div>
    </div>
  );
}
