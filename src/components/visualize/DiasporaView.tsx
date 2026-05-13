import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Pin, X } from 'lucide-react';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
  VizArtwork,
} from '@/hooks/queries/useVisualizationData';
import {
  buildConstellation,
  layoutConstellation,
  namedNodeRadius,
  buildNodes,
  computeTrackedStat,
  countryToISO2,
  nodeRadius,
  getGhostNodes,
  TYPE_OPACITY,
  type LocationNode,
  type LocationConstellationNode,
  type NamedPrivateNode,
} from './diasporaUtils';

export interface DiasporaViewProps {
  artworks?: VizArtwork[];
  editions: VizEdition[];
  locations: VizLocation[];
  history: VizHistory[];
  /** 跨视图选中的 artwork id（Phase 2: M3a），驱动 selection ring + dashed edges */
  selectedArtworkId?: string | null;
  /** 选中作品的回调（点击 location / named buyer 节点时可选触发；当前实现仅作 prop 通透） */
  onArtworkSelect?: (artworkId: string | null) => void;
}

// SVG 内部坐标系（固定，用 viewBox 响应式缩放）
const W = 800;
const H = 560;

/** 从 VizArtwork 数组取得 artwork_id → artwork 的 Map */
function buildArtworkMap(artworks: VizArtwork[]): Map<string, VizArtwork> {
  const m = new Map<string, VizArtwork>();
  for (const a of artworks) m.set(a.id, a);
  return m;
}

/** 当前激活节点 metadata（用于底部 info bar） */
type ActiveNodeMeta =
  | { kind: 'location'; node: LocationConstellationNode }
  | { kind: 'named_private'; node: NamedPrivateNode };

export default function DiasporaView({
  artworks = [],
  editions,
  locations,
  history,
  selectedArtworkId = null,
  onArtworkSelect: _onArtworkSelect,
}: DiasporaViewProps) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();

  // ─── 交互状态 ──────────────────────────────────────────────────────────────
  // pinnedNodeId / hoveredNodeId 用 "kind:id" 复合 key 区分 location vs named_private
  // 形式："location:{loc.id}" / "named:{buyer_name}"
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // 兜底（暂未在 UI 用，prop 仅用于跨视图同步）
  void _onArtworkSelect;

  // ─── 数据变换 ──────────────────────────────────────────────────────────────
  const artworkMap = useMemo(() => buildArtworkMap(artworks), [artworks]);
  const constellation = useMemo(
    () => buildConstellation(editions, locations),
    [editions, locations]
  );
  const layout = useMemo(
    () => layoutConstellation(constellation, { width: W, height: H }),
    [constellation]
  );
  // 保留旧 stat —— "X / Y editions have known location"
  const stat = useMemo(
    () => computeTrackedStat(editions, locations),
    [editions, locations]
  );

  // M2 残留：保留 ghost 环（无 location_id 且非 outflow 的 edition 仍可能存在）。
  // 改成只对"非 outflow + 无 location"的 editions 显示，避免和 Outer ring (anonymous outflow)
  // 视觉冲突。outflow + 无 location 的已经在 anonymous ring 表达了。
  const nonOutflowNoLoc = useMemo(
    () =>
      editions.filter(
        (e) =>
          !e.location_id &&
          e.status !== 'sold' &&
          e.status !== 'gifted'
      ),
    [editions]
  );
  const ghost = useMemo(
    () =>
      getGhostNodes(nonOutflowNoLoc, locations, {
        cx: W / 2,
        cy: H / 2,
        radius: Math.min(W, H) * 0.52,
      }),
    [nonOutflowNoLoc, locations]
  );

  // 旧 buildNodes（仅供 empty-state 判断 fallback；Constellation 数据空时仍可能
  // 有 in_studio editions 让 stat 的 tracked > 0，但 view body 空白）
  const fallbackNodes = useMemo(
    () => buildNodes(editions, locations),
    [editions, locations]
  );

  // ─── pin / hover 解析 ─────────────────────────────────────────────────────
  const activeNodeId = pinnedNodeId ?? hoveredNodeId;

  const activeMeta = useMemo<ActiveNodeMeta | null>(() => {
    if (!activeNodeId) return null;
    if (activeNodeId.startsWith('location:')) {
      const id = activeNodeId.slice('location:'.length);
      const node = constellation.locations.find((n) => n.id === id);
      if (node) return { kind: 'location', node };
      return null;
    }
    if (activeNodeId.startsWith('named:')) {
      const id = activeNodeId.slice('named:'.length);
      const node = constellation.namedPrivateBuyers.find((n) => n.id === id);
      if (node) return { kind: 'named_private', node };
      return null;
    }
    return null;
  }, [activeNodeId, constellation]);

  // pin 卡片显示用的 edition 列表（按节点过滤，附带 artwork 信息）
  const pinnedEditions = useMemo(() => {
    if (!pinnedNodeId || !activeMeta) return [];
    const ids = activeMeta.node.editionIds;
    return editions
      .filter((e) => ids.includes(e.id))
      .map((e) => ({
        edition: e,
        artwork: artworkMap.get(e.artwork_id),
        displayId:
          e.inventory_number ??
          `${e.id.slice(0, 8)}${t('diaspora.pin.noInventory')}`,
      }));
  }, [pinnedNodeId, activeMeta, editions, artworkMap, t]);

  // ─── Selection (Phase 2: M3a) ───────────────────────────────────────────────
  // 选中 artwork → 找该 artwork 所有 editions → 这些 editions 归类到哪些 node。
  // 每种 node 加 selection ring；从 artist center 画 dashed edge 到选中节点。
  // anonymous 是聚合圈，整体不加 ring（无个体性）。
  const selectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedArtworkId) return set;
    for (const loc of constellation.locations) {
      if (loc.artworkIds.includes(selectedArtworkId)) {
        set.add(`location:${loc.id}`);
      }
    }
    for (const named of constellation.namedPrivateBuyers) {
      if (named.artworkIds.includes(selectedArtworkId)) {
        set.add(`named:${named.id}`);
      }
    }
    return set;
  }, [selectedArtworkId, constellation]);

  // ─── 事件处理 ──────────────────────────────────────────────────────────────
  function handleNodeClick(key: string) {
    setPinnedNodeId((prev) => (prev === key ? null : key));
  }

  function handleNodeMouseEnter(key: string) {
    setHoveredNodeId(key);
  }

  function handleNodeMouseLeave() {
    setHoveredNodeId(null);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    const target = e.target as Element;
    if (target.closest('g[data-node]')) return;
    setPinnedNodeId(null);
  }

  // ─── 空状态 ────────────────────────────────────────────────────────────────
  // Constellation 完全空时退化到原 empty 信息条；保留旧 stat（"X / Y editions
  // have known location"）始终显示
  const constellationEmpty =
    constellation.locations.length === 0 &&
    constellation.namedPrivateBuyers.length === 0 &&
    constellation.anonymous.count === 0;

  const totallyEmpty = constellationEmpty && fallbackNodes.length === 0;

  if (totallyEmpty) {
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
            ['private_collection', 0.7],
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
        <span aria-hidden="true" className="opacity-30 px-1">
          │
        </span>
        <span
          key="ghost"
          className="flex items-center gap-1.5"
          data-testid="diaspora-legend-ghost"
        >
          <span
            className="inline-block w-3 h-3 rounded-full border-[1.5px] border-foreground opacity-60"
          />
          <span className="text-muted-foreground">
            {t('diaspora.legend.ghost')}
          </span>
        </span>
      </div>

      {/* ─── SVG Constellation 图 ────────────────────────────────────── */}
      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ maxHeight: '70vh' }}
          role="img"
          aria-label={t('diaspora.heading')}
          onClick={handleSvgClick}
        >
          {/* ─── 三环参考线（弱色） ───────────────────────────── */}
          {(
            ['inner', 'middle', 'outer'] as Array<keyof typeof layout.radii>
          ).map((ring) => (
            <circle
              key={ring}
              cx={layout.center.x}
              cy={layout.center.y}
              r={layout.radii[ring]}
              fill="none"
              className="stroke-foreground"
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.2}
            />
          ))}

          {/* ─── M2 残留: ghost 环（非 outflow 无 location 的 edition） ─── */}
          {ghost.count > 0 && (
            <g data-testid="diaspora-ghost-ring" aria-hidden="true">
              {ghost.positions.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill="none"
                  className="stroke-foreground"
                  strokeWidth={1}
                  opacity={0.3}
                />
              ))}
            </g>
          )}

          {/* ─── Edges: 只画 location ↔ artist ───────────────────── */}
          {layout.locationPoints.map((p) => {
            const sw = Math.max(
              0.5,
              Math.min(2, p.node.editionCount / 5)
            );
            return (
              <line
                key={`edge-${p.node.id}`}
                x1={layout.center.x}
                y1={layout.center.y}
                x2={p.x}
                y2={p.y}
                className="stroke-foreground"
                strokeWidth={sw}
                opacity={0.3}
              />
            );
          })}

          {/* ─── Phase 2 selection edges: dashed line from center to selected node ─── */}
          {selectedArtworkId &&
            layout.locationPoints
              .filter((p) => selectedNodeIds.has(`location:${p.node.id}`))
              .map((p) => (
                <line
                  key={`sel-edge-loc-${p.node.id}`}
                  data-testid={`constellation-selection-edge-${p.node.id}`}
                  x1={layout.center.x}
                  y1={layout.center.y}
                  x2={p.x}
                  y2={p.y}
                  className="stroke-foreground"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  opacity={0.85}
                />
              ))}
          {selectedArtworkId &&
            layout.namedPoints
              .filter((p) => selectedNodeIds.has(`named:${p.node.id}`))
              .map((p) => (
                <line
                  key={`sel-edge-named-${p.node.id}`}
                  data-testid={`constellation-selection-edge-named-${p.node.id}`}
                  x1={layout.center.x}
                  y1={layout.center.y}
                  x2={p.x}
                  y2={p.y}
                  className="stroke-foreground"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  opacity={0.85}
                />
              ))}

          {/* ─── Outer ring: anonymous dots (不可点击) ───────────── */}
          {layout.anonymousPoints.map((p) => (
            <circle
              key={`anon-${p.index}`}
              data-testid={`constellation-anon-${p.index}`}
              cx={p.x}
              cy={p.y}
              r={1.5}
              className="fill-foreground"
              opacity={0.3}
            />
          ))}

          {/* ─── Inner ring: location nodes ────────────────────── */}
          {layout.locationPoints.map(({ x, y, node }) => {
            const r = nodeRadius(node.editionCount);
            const opacity = TYPE_OPACITY[node.type] ?? 0.7;
            const nodeKey = `location:${node.id}`;
            const isHovered =
              hoveredNodeId === nodeKey && !pinnedNodeId;
            const isPinned = pinnedNodeId === nodeKey;
            const isActive = activeNodeId === nodeKey;
            const isSelected = selectedNodeIds.has(nodeKey);
            const iso2 = countryToISO2(node.country);

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
                data-testid={`constellation-location-${node.id}`}
                className="cursor-pointer focus:outline-none"
                role="button"
                tabIndex={0}
                aria-label={`${node.name} — ${t('diaspora.tooltip.editions', { count: node.editionCount })}`}
                aria-pressed={isPinned}
                onMouseEnter={() => handleNodeMouseEnter(nodeKey)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(nodeKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(nodeKey);
                  }
                }}
              >
                <title>{node.name}</title>
                {/* selection ring: dashed outer ring (Phase 2) */}
                {isSelected && (
                  <circle
                    data-testid={`constellation-selection-ring-${node.id}`}
                    cx={x}
                    cy={y}
                    r={r + 5}
                    fill="none"
                    className="stroke-foreground"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}
                {isPinned && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 8}
                    fill="none"
                    className="stroke-foreground diaspora-pin-pulse"
                    strokeWidth={1.5}
                  />
                )}
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

          {/* ─── Middle ring: named private buyers ──────────────── */}
          {layout.namedPoints.map(({ x, y, node }) => {
            const r = namedNodeRadius(node.editionCount);
            const nodeKey = `named:${node.id}`;
            const isHovered =
              hoveredNodeId === nodeKey && !pinnedNodeId;
            const isPinned = pinnedNodeId === nodeKey;
            const isSelected = selectedNodeIds.has(nodeKey);

            const dx = x - W / 2;
            const dy = y - H / 2;
            const angle = Math.atan2(dy, dx);
            const labelDist = r + 6;
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
                key={`named-${node.id}`}
                data-node={`named-${node.id}`}
                data-testid={`constellation-named-${node.id}`}
                className="cursor-pointer focus:outline-none"
                role="button"
                tabIndex={0}
                aria-label={t('diaspora.constellation.aria.namedPrivate', {
                  name: node.name,
                  count: node.editionCount,
                })}
                aria-pressed={isPinned}
                onMouseEnter={() => handleNodeMouseEnter(nodeKey)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(nodeKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(nodeKey);
                  }
                }}
              >
                <title>{node.name}</title>
                {isSelected && (
                  <circle
                    data-testid={`constellation-selection-ring-named-${node.id}`}
                    cx={x}
                    cy={y}
                    r={r + 4}
                    fill="none"
                    className="stroke-foreground"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}
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
                {isHovered && !isPinned && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 3}
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
                  opacity={isPinned ? 0.9 : 0.5}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor={anchor}
                  className="fill-muted-foreground"
                  fontSize="7"
                  fontFamily="ui-monospace, monospace"
                  opacity={0.7}
                >
                  {node.name.length > 14
                    ? node.name.slice(0, 12) + '…'
                    : node.name}
                </text>
              </g>
            );
          })}

          {/* ─── Center: artist node ────────────────────────────── */}
          <g
            data-node="aaajiao"
            data-testid="constellation-artist"
            aria-label={t('diaspora.constellation.aria.artist')}
          >
            <title>{t('diaspora.constellation.centerLabel')}</title>
            <circle
              cx={layout.center.x}
              cy={layout.center.y}
              r={14}
              fill="none"
              className="stroke-foreground"
              strokeWidth={0.5}
              opacity={0.4}
            />
            <circle
              cx={layout.center.x}
              cy={layout.center.y}
              r={12}
              className="fill-foreground"
              opacity={1}
            />
            <text
              x={layout.center.x}
              y={layout.center.y + 26}
              textAnchor="middle"
              className="fill-foreground"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
            >
              {t('diaspora.constellation.centerLabel')}
            </text>
            <text
              x={layout.center.x}
              y={layout.center.y + 36}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              {constellation.artist.totalOutflowCount}
            </text>
          </g>
        </svg>
      </div>

      {/* ─── Tooltip / Info bar ──────────────────────────────────────── */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {pinnedNodeId && activeMeta ? (
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
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-bold">{activeMeta.node.name}</span>
                <span className="text-muted-foreground ml-2">
                  {activeMeta.kind === 'location' ? activeMeta.node.type : 'private'}
                  {activeMeta.kind === 'location' && activeMeta.node.city
                    ? ` · ${activeMeta.node.city}`
                    : ''}
                  {activeMeta.kind === 'location' && activeMeta.node.country
                    ? ` · ${activeMeta.node.country}`
                    : ''}
                </span>
              </div>
            </div>

            {pinnedEditions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-muted-foreground">
                  {t('diaspora.pin.editionsAt', {
                    count: pinnedEditions.length,
                  })}
                  :
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pinnedEditions.map(({ edition, displayId }) => (
                    <button
                      key={edition.id}
                      type="button"
                      title={edition.status}
                      className="font-mono border border-border px-1.5 py-0.5 hover:bg-muted/50 hover:border-foreground transition-colors cursor-pointer"
                      onClick={(e) => {
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

            {activeMeta.kind === 'location' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  aria-label={t('diaspora.pin.viewAllAria')}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(
                      `/editions?locationId=${activeMeta.node.id}`
                    );
                  }}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : activeMeta ? (
          /* ── Hover 预览 ─────────────────────────────────────────── */
          <div className="relative pr-6">
            <Pin
              className="absolute top-0 right-0 w-3 h-3 text-muted-foreground opacity-60"
              aria-hidden="true"
            />
            <div className="font-bold">{activeMeta.node.name}</div>
            {activeMeta.kind === 'location' ? (
              <>
                <div className="text-muted-foreground">
                  {t('diaspora.tooltip.editions', {
                    count: activeMeta.node.editionCount,
                  })}
                  {activeMeta.node.city ? ` · ${activeMeta.node.city}` : ''}
                  {activeMeta.node.country
                    ? ` · ${activeMeta.node.country}`
                    : ''}
                </div>
                <div className="text-muted-foreground">
                  {activeMeta.node.type}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">
                {t('diaspora.constellation.tooltip.namedPrivate', {
                  name: activeMeta.node.name,
                  count: activeMeta.node.editionCount,
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── 默认提示：Constellation 总览 ─────────────────────── */
          <div className="text-muted-foreground">
            {t('diaspora.constellation.summary.overview', {
              locations: constellation.locations.length,
              namedPrivate: constellation.namedPrivateBuyers.length,
              anonymous: constellation.anonymous.count,
            })}
          </div>
        )}

        {/* 历史 flow 数量保留作为副标注（不抢主信息） */}
        {!pinnedNodeId && !activeMeta && history.length > 0 && (
          <div className="text-muted-foreground opacity-60">
            {t('diaspora.summary.overview', {
              nodes:
                constellation.locations.length +
                constellation.namedPrivateBuyers.length,
              edges: countLocationChanges(history),
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 计算 history 里 location_change 事件数（保留旧 stat 的 edges 概念） */
function countLocationChanges(history: VizHistory[]): number {
  return history.filter((h) => h.action === 'location_change').length;
}
