import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
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
  editions: VizEdition[];
  locations: VizLocation[];
  history: VizHistory[];
}

// SVG 内部坐标系（固定，用 viewBox 响应式缩放）
const W = 800;
const H = 560;

// 同心环辅助圆半径（纯视觉参考）
const RING_GUIDE_RADII = [
  Math.min(W, H) * 0.22,
  Math.min(W, H) * 0.38,
  Math.min(W, H) * 0.50,
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

export default function DiasporaView({
  editions,
  locations,
  history,
}: DiasporaViewProps) {
  const { t } = useTranslation('visualize');

  // hover / click 状态
  const [hoveredNode, setHoveredNode] = useState<LocationNode | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  // ─── 数据变换 ──────────────────────────────────────────────────────────────
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

  // 展开节点的 inventory_numbers
  const expandedInventoryNumbers = useMemo(() => {
    if (!expandedNodeId) return [];
    const node = nodes.find((n) => n.id === expandedNodeId);
    if (!node) return [];
    return editions
      .filter((e) => e.location_id === expandedNodeId)
      .map((e) => e.inventory_number ?? e.id)
      .filter(Boolean);
  }, [expandedNodeId, nodes, editions]);

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
        >
          {/* 同心环辅助圆（弱色参考线） */}
          {RING_GUIDE_RADII.map((r, i) => (
            <circle
              key={i}
              cx={W / 2}
              cy={H / 2}
              r={r}
              fill="none"
              className="stroke-border"
              strokeWidth={0.5}
              strokeDasharray="3 4"
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
              const isHovered = hoveredNode?.id === node.id;
              const isExpanded = expandedNodeId === node.id;
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
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() =>
                    setExpandedNodeId(
                      expandedNodeId === node.id ? null : node.id
                    )
                  }
                >
                  {/* hover ring */}
                  {(isHovered || isExpanded) && (
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
                    opacity={opacity}
                  />
                  {/* 节点名 */}
                  <text
                    x={lx}
                    y={ly - 3}
                    textAnchor={anchor}
                    className="fill-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                    opacity={isHovered || isExpanded ? 1 : 0.75}
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
          {layout && (
            <g
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(layout.center.node)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() =>
                setExpandedNodeId(
                  expandedNodeId === layout.center.node.id
                    ? null
                    : layout.center.node.id
                )
              }
            >
              {/* pulse ring */}
              <circle
                cx={layout.center.x}
                cy={layout.center.y}
                r={26}
                fill="none"
                className="stroke-foreground"
                strokeWidth={0.5}
                opacity={0.2}
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
                {layout.center.node.name.length > 20
                  ? layout.center.node.name.slice(0, 18) + '…'
                  : layout.center.node.name}
              </text>
              <text
                x={layout.center.x}
                y={layout.center.y + 42}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="8"
                fontFamily="ui-monospace, monospace"
              >
                {countryToISO2(layout.center.node.country)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ─── Tooltip / Info bar ──────────────────────────────────────── */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {hoveredNode ? (
          <>
            <div className="font-bold">{hoveredNode.name}</div>
            <div className="text-muted-foreground">
              {t('diaspora.tooltip.editions', {
                count: hoveredNode.editionCount,
              })}
              {hoveredNode.city ? ` · ${hoveredNode.city}` : ''}
              {hoveredNode.country ? ` · ${hoveredNode.country}` : ''}
            </div>
            <div className="text-muted-foreground">
              {hoveredNode.type} · click to expand
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            {t('strata.tooltip.click')}
          </div>
        )}
      </div>

      {/* ─── Expanded node: inventory numbers ───────────────────────── */}
      {expandedNodeId && expandedInventoryNumbers.length > 0 && (
        <div className="border border-border p-3 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider">
            {nodes.find((n) => n.id === expandedNodeId)?.name}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {expandedInventoryNumbers.map((inv) => (
              <span
                key={inv}
                className="font-mono text-xs border border-border px-1.5 py-0.5 text-foreground"
              >
                {inv}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
