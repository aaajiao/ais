import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Pin, X, Plus, Minus, RotateCcw } from 'lucide-react';
import { useSvgZoomPan } from '@/hooks/useSvgZoomPan';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
  VizArtwork,
} from '@/hooks/queries/useVisualizationData';
import {
  buildConstellation,
  layoutConstellation,
  getNodeVisual,
  generateOrganicPath,
  buildNodes,
  computeTrackedStat,
  countryToISO2,
  buildGhostEditions,
  layoutGhostRing,
  type LocationConstellationNode,
  type NamedPrivateNode,
} from './diasporaUtils';
import type { LocationType } from '@/lib/database.types';

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
// v1.6.x: H 从 560 → 600 给 top/bottom 节点 label 留余裕（R_GHOST 内缩同时进行）
// v1.6.x 第三轮：H 600 → 760，配合主圈整体放大（R 60→80 / 190→260 / 220→300）
//   + ghost ring 245→340，给跨类碰撞 (location ↔ named_private) 更大圆周散开。
// v1.6.x 第四轮：**viewBox 椭圆化** —— W 800 → 1200，H 760 → 680（16:9 黄金近似）。
//   第三轮 800×760 接近正方形，但页面容器 ≈ 1280 横宽 vs maxHeight: 70vh ≈ 740 →
//   横向空间浪费严重。第四轮把 viewBox 拉成 1200×680，配合
//   `TIME_SPIRAL_GEOMETRY.ASPECT_X = 1.55` 把 spiral 的 x 坐标拉伸 —— 主圈变椭圆，
//   填满 viewBox 横向。**节点的 organic blob 形状不变**（只对 layout 拉伸，不对
//   shape 拉伸）；anonymous / ghost dust 仍是规则几何圆。"椭圆化是 organic 哲学
//   的扩展：节点不规则 + 整体不规则圆 = 两层 brutalist organic"。
// artist center r=12 不变（在 center 点，不受 ASPECT_X 影响）。
const W = 1200;
const H = 680;

/** 从 VizArtwork 数组取得 artwork_id → artwork 的 Map */
function buildArtworkMap(artworks: VizArtwork[]): Map<string, VizArtwork> {
  const m = new Map<string, VizArtwork>();
  for (const a of artworks) m.set(a.id, a);
  return m;
}

/** 中心点 pin key —— 跟 location:/named: 同构的复合 id（hard-coded 单值） */
const ARTIST_NODE_KEY = 'artist:center';

/** 当前激活节点 metadata（用于底部 info bar） */
type ActiveNodeMeta =
  | { kind: 'location'; node: LocationConstellationNode }
  | { kind: 'named_private'; node: NamedPrivateNode }
  | { kind: 'artist' };

export default function DiasporaView({
  artworks = [],
  editions,
  locations,
  history,
  selectedArtworkId = null,
  onArtworkSelect: _onArtworkSelect,
}: DiasporaViewProps) {
  const { t } = useTranslation('visualize');
  const { t: tStatus } = useTranslation('status');
  const navigate = useNavigate();

  // ─── 交互状态 ──────────────────────────────────────────────────────────────
  // pinnedNodeId / hoveredNodeId 用 "kind:id" 复合 key 区分 location vs named_private
  // 形式："location:{loc.id}" / "named:{buyer_name}"
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // ─── Zoom（v1.6.x 第十轮：删手势 / wheel，改右上 + - reset 按钮） ──────────
  // 第九轮的 wheel + pinch + drag pan 体验不好（wheel 跟页面滚动冲突、pinch
  // 灵敏度难调、drag pan 易误触发节点 click）。改成最简：按钮离散 step 缩放，
  // 以 viewBox 中心为 anchor，无 pan。
  const {
    svgRef: zoomSvgRef,
    viewBoxStr: zoomViewBox,
    zoom: zoomLevel,
    isZoomed,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    reset: resetZoom,
    handlers: zoomHandlers,
  } = useSvgZoomPan({
    initialWidth: W,
    initialHeight: H,
    minZoom: 0.5,
    maxZoom: 4,
  });

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

  // v1.6.x 第二轮：Ghost editions 改成"待补全档案 inbox" —— per-edition 可点击
  // 跳到 /editions/:id 让用户补 location。空心几何小圆 r=4 落 R=245 外圈，区别
  // 于灰实心 anonymous dust（已离开但无买家信息）。
  const ghostEditions = useMemo(
    () => buildGhostEditions(editions, artworks),
    [editions, artworks]
  );
  const ghostPoints = useMemo(
    () => layoutGhostRing(ghostEditions, { width: W, height: H }),
    [ghostEditions]
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
    if (activeNodeId === ARTIST_NODE_KEY) {
      return { kind: 'artist' };
    }
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
  // artist 中心点 → constellation.artist.heldEditionIds（在库 + 制作中 + 在途）
  // location / named_private → 该节点 editionIds（流出去的）
  const pinnedEditions = useMemo(() => {
    if (!pinnedNodeId || !activeMeta) return [];
    const ids =
      activeMeta.kind === 'artist'
        ? constellation.artist.heldEditionIds
        : activeMeta.node.editionIds;
    return editions
      .filter((e) => ids.includes(e.id))
      .map((e) => ({
        edition: e,
        artwork: artworkMap.get(e.artwork_id),
        displayId:
          e.inventory_number ??
          `${e.id.slice(0, 8)}${t('diaspora.pin.noInventory')}`,
      }));
  }, [
    pinnedNodeId,
    activeMeta,
    editions,
    artworkMap,
    constellation.artist.heldEditionIds,
    t,
  ]);

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

  // description 拆双量词：机构走 "处"，私人买家走 "位"，跟下方
  // constellation.summary.overview 同源数据
  const descriptionVars = {
    locations: constellation.locations.length,
    namedPrivate: constellation.namedPrivateBuyers.length,
  };

  if (totallyEmpty) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-bold uppercase tracking-wider">
            {t('diaspora.heading')}
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {t('diaspora.description', descriptionVars)}
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
          {t('diaspora.description', descriptionVars)}
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
        <div className="text-xs text-muted-foreground">
          {t('diaspora.constellation.timelineLegend')}
        </div>
        {ghostPoints.length > 0 && (
          <div
            className="text-xs"
            data-testid="diaspora-stat-untracked-hint"
          >
            {t('diaspora.stat.untrackedHint', { count: ghostPoints.length })}
          </div>
        )}
      </div>

      {/* ─── Legend ──────────────────────────────────────────────────── */}
      {/*
        v1.8.x: Legend 跟主图节点 1-1 对应（mono palette + shape/fill 区分）。
          - 满足 5 类 satellite location 类型 + named_private（外加 anonymous /
            untracked）
          - 删除 studio chip（studio 版本聚合到 artist center，外圈不画）
          - 新增 namedBuyer chip（之前 24 个 named_private 节点对 legend
            读者完全 invisible —— 这是用户原始诉求里"实际每一块都不一样"
            最直接的漏项）
          - rename other → 其他场所（用户语义疏通：别跟"私人"那一档混淆）
        每个 chip 的 SVG 用 visual.shape 分支渲染，跟主图节点同源（不再统一
        画 organic path，否则 square 类型对不上）。
      */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {(
          [
            ['museum', 'location', 'museum'],
            ['gallery', 'location', 'gallery'],
            ['private_collection', 'location', 'private_collection'],
            ['other', 'location', 'other'],
            ['namedBuyer', 'named_private', null],
          ] as Array<
            [
              string,
              'location' | 'named_private',
              LocationType | null,
            ]
          >
        ).map(([labelKey, kind, type]) => {
          const visual = getNodeVisual(kind, type, 1);
          // chip viewBox 20×20，统一用 cx=cy=10；blob 类用 baseR=8 让 organic
          // 扰动肉眼可见（小于 8 看不出 hash 差异），square 用 14×14 ≈ 同视觉重量
          const seed =
            kind === 'location' && type ? type : 'namedBuyer-chip';
          return (
            <span
              key={labelKey}
              data-testid={`diaspora-legend-${labelKey}`}
              className="flex items-center gap-1.5"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="text-foreground shrink-0"
              >
                {visual.shape === 'square' ? (
                  <rect
                    data-shape={visual.shape}
                    x={3}
                    y={3}
                    width={14}
                    height={14}
                    fill="currentColor"
                    opacity={visual.opacity}
                  />
                ) : visual.shape === 'blob-outline' ? (
                  <path
                    data-shape={visual.shape}
                    d={generateOrganicPath(10, 10, 8, seed)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    opacity={visual.opacity}
                  />
                ) : (
                  <>
                    <path
                      data-shape={visual.shape}
                      d={generateOrganicPath(10, 10, 8, seed)}
                      fill="currentColor"
                      opacity={visual.opacity}
                    />
                    {/* private_collection：内部 negative ring，跟主图同 spec */}
                    {visual.shape === 'blob-with-ring' && (
                      <circle
                        cx={10}
                        cy={10}
                        r={8 * 0.45}
                        fill="none"
                        className="stroke-background"
                        strokeWidth={1.2}
                        opacity={visual.opacity}
                      />
                    )}
                  </>
                )}
              </svg>
              <span className="text-muted-foreground">
                {t(`diaspora.legend.${labelKey}`)}
              </span>
            </span>
          );
        })}
        <span aria-hidden="true" className="opacity-30 px-1">
          │
        </span>
        {/* v1.6.x 第二轮：三档视觉词汇 —— anonymous（灰实心 dust）+ ghost
            editions inbox（空心待补全）。"无 location 鬼影" 旧 chip 删除，
            语义被新的 untracked inbox 取代。 */}
        <span
          data-testid="diaspora-legend-anonymous"
          className="flex items-center gap-1.5"
        >
          <span
            className="inline-block w-3 h-3 rounded-full bg-foreground"
            style={{ opacity: 0.55 }}
          />
          <span className="text-muted-foreground">
            {t('diaspora.legend.anonymous')}
          </span>
        </span>
        <span aria-hidden="true" className="opacity-30 px-1">
          │
        </span>
        <span
          data-testid="diaspora-legend-untracked"
          className="flex items-center gap-1.5"
        >
          <span className="inline-block w-3 h-3 rounded-full border border-foreground opacity-60" />
          <span className="text-muted-foreground">
            {t('diaspora.legend.untracked')}
          </span>
        </span>
      </div>

      {/* ─── SVG Constellation 图 ────────────────────────────────────── */}
      <div className="relative overflow-hidden border border-border">
        {/* Zoom 控件：右上角 + / − / reset 按钮，无手势 */}
        <div className="absolute top-2 right-2 z-10 flex flex-col bg-background/90 border border-border font-mono text-xs">
          <button
            type="button"
            onClick={zoomIn}
            disabled={!canZoomIn}
            aria-label={t('diaspora.zoom.inAria')}
            className="px-2 py-1 cursor-pointer hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-b border-border"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 py-1 text-center border-b border-border tabular-nums">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomOut}
            disabled={!canZoomOut}
            aria-label={t('diaspora.zoom.outAria')}
            className="px-2 py-1 cursor-pointer hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          {isZoomed && (
            <button
              type="button"
              onClick={resetZoom}
              aria-label={t('diaspora.zoom.resetAria')}
              className="px-2 py-1 cursor-pointer hover:bg-muted transition-colors border-t border-border"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <svg
          ref={zoomSvgRef}
          viewBox={zoomViewBox}
          className="block w-full"
          style={{
            maxHeight: '70vh',
            cursor: isZoomed ? 'grab' : 'default',
          }}
          role="img"
          aria-label={t('diaspora.heading')}
          onClick={handleSvgClick}
          {...zoomHandlers}
        >
          {/* ─── Time-spiral 参考圆（仅画 inner / outer-data / ghost；anonymous 不画） */}
          {(
            [
              ['rInner', layout.geometry.rInner],
              ['rOuterData', layout.geometry.rOuterData],
              ['rGhost', layout.geometry.rGhost],
            ] as Array<[string, number]>
          ).map(([key, r]) => (
            <circle
              key={key}
              cx={layout.center.x}
              cy={layout.center.y}
              r={r}
              fill="none"
              className="stroke-foreground"
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.15}
            />
          ))}

          {/* ─── Ghost editions inbox（v1.6.x 第二轮）─────────────────
              non-outflow + 无 location 的 edition，画在 R=245 外圈：空心
              几何小圆 r=4 opacity=0.55，**可点击** → /editions/:id 让用户
              去补 location。与 anonymous dust（灰实心，已离开但无买家）形成
              对照。设计哲学：信息密度递减的三档视觉规范。 */}
          {ghostPoints.map(({ ghost, x, y }) => (
            <g
              key={`ghost-${ghost.editionId}`}
              data-testid={`constellation-ghost-${ghost.editionId}`}
              role="button"
              tabIndex={0}
              className="cursor-pointer focus:outline-none"
              aria-label={t('diaspora.constellation.aria.ghost', {
                title: ghost.title ?? '—',
                inv: ghost.inventoryNumber ?? '—',
                status: tStatus(ghost.status),
              })}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/editions/${ghost.editionId}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/editions/${ghost.editionId}`);
                }
              }}
            >
              <title>{`${ghost.title ?? '—'} · ${ghost.inventoryNumber ?? '—'} · ${tStatus(ghost.status)}`}</title>
              <circle
                cx={x}
                cy={y}
                r={4}
                fill="none"
                className="stroke-foreground"
                strokeWidth={1}
                opacity={0.55}
                pointerEvents="all"
              />
            </g>
          ))}

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

          {/* ─── Anonymous dust (按 sale_date 进 time-spiral，v1.6.x 第三轮可点击) ─── */}
          {/*
            v1.6.x：anonymous 不再聚合成外圈 ring，每条 anonymous outflow edition
            一个独立 dot，跟 location / namedPrivate 共享同一份时间映射。缺
            sale_date 的 anonymous 推 R_GHOST 外圈。
            v1.6.x 第二轮：r 升级 1.5→3.5 + opacity 0.3→0.55，灰实心几何小圆——
            "信息密度递减"三档视觉的中档（具象 blob > 灰实心 dust > 空心 ghost）。
            **v1.6.x 第三轮：可点击** → /editions/:id 让用户补 buyer_name，跟
            ghost click 补 location 是同构的"档案补全 inbox"语义。视觉差异保住
            （灰实心 = 已售但匿名 / 空心 = 未售无 location）。selection 命中时
            opacity=1（不画 ring：聚合 dust 无 entity 身份）。
          */}
          {layout.anonymousPoints.map((p) => {
            const visual = getNodeVisual('anonymous', null, 1);
            const isSelected =
              !!selectedArtworkId && p.artworkId === selectedArtworkId;
            return (
              <g
                key={`anon-${p.editionId}`}
                role="button"
                tabIndex={0}
                className="cursor-pointer focus:outline-none"
                aria-label={t('diaspora.constellation.aria.anonymous', {
                  date: p.sale_date ?? '—',
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/editions/${p.editionId}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/editions/${p.editionId}`);
                  }
                }}
              >
                <title>
                  {p.sale_date
                    ? t('diaspora.tooltip.anonymousWithDate', {
                        date: p.sale_date,
                      })
                    : t('diaspora.tooltip.anonymousNoDate')}
                </title>
                <circle
                  data-testid={`constellation-anon-${p.editionId}`}
                  cx={p.x}
                  cy={p.y}
                  r={visual.r}
                  className="fill-foreground"
                  opacity={isSelected ? 1 : visual.opacity}
                  pointerEvents="all"
                />
              </g>
            );
          })}

          {/* ─── Location nodes (time-spiral，size 由 getNodeVisual 决定) ─── */}
          {layout.locationPoints.map(({ x, y, node }) => {
            const visual = getNodeVisual(
              'location',
              node.type,
              node.editionCount
            );
            const r = visual.r;
            const nodeKey = `location:${node.id}`;
            const isHovered =
              hoveredNodeId === nodeKey && !pinnedNodeId;
            const isPinned = pinnedNodeId === nodeKey;
            const isActive = activeNodeId === nodeKey;
            const isSelected = selectedNodeIds.has(nodeKey);
            const iso2 = countryToISO2(node.country);

            // Label radial anchor：节点 angle ∈ [-π/2, π/2]（右半圆 + 顶部）
            // → textAnchor='start'，label 放节点右侧 r + 4 px；否则放左侧。
            const dx = x - W / 2;
            const isRightHalf = dx >= 0;
            const labelX = isRightHalf ? x + r + 4 : x - r - 4;
            const labelY = y + 3; // baseline 微调
            const anchor: 'start' | 'end' = isRightHalf ? 'start' : 'end';

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
                {/*
                  v1.6.x: organic blob path 取代规则 circle —— Strata 方块 /
                  Markets dot / Diaspora blob 形成视觉对照。
                  v1.8.x: 节点形态按 visual.shape 分支（mono palette 下用
                  fill style + 几何 primitive 区分 5 个 location 类型；颜色
                  全部 foreground）：
                    - blob-solid     museum: 实心 organic（公共最实）
                    - blob-outline   gallery: 描边 organic（中空有边界）
                    - blob-with-ring private_collection: 实心 + 内 negative ring
                    - square         other: 实心方块（geometric primitive）
                  每个分支共享同一 hover/pin/selection ring + label，节点本体
                  用 data-shape attribute 暴露给测试断言。
                */}
                {visual.shape === 'square' ? (
                  <rect
                    data-shape={visual.shape}
                    x={x - r * 0.85}
                    y={y - r * 0.85}
                    width={r * 1.7}
                    height={r * 1.7}
                    className="fill-foreground"
                    opacity={isPinned ? 1 : visual.opacity}
                    pointerEvents="all"
                  />
                ) : visual.shape === 'blob-outline' ? (
                  <path
                    data-shape={visual.shape}
                    d={generateOrganicPath(x, y, r, node.id)}
                    fill="none"
                    className="stroke-foreground"
                    strokeWidth={1.5}
                    opacity={isPinned ? 1 : visual.opacity}
                    pointerEvents="all"
                  />
                ) : (
                  <path
                    data-shape={visual.shape}
                    d={generateOrganicPath(x, y, r, node.id)}
                    className="fill-foreground"
                    opacity={isPinned ? 1 : visual.opacity}
                    pointerEvents="all"
                  />
                )}
                {/* private_collection：内部反差色环（仍是几何 circle，"有机壳 + 几何核"对照）*/}
                {visual.innerRingR !== null && (
                  <circle
                    data-testid={`constellation-private-inner-${node.id}`}
                    cx={x}
                    cy={y}
                    r={visual.innerRingR}
                    fill="none"
                    className="stroke-background"
                    strokeWidth={1.2}
                    opacity={visual.opacity}
                  />
                )}
                <text
                  x={labelX}
                  y={labelY - 5}
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
                  x={labelX}
                  y={labelY + 6}
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

          {/* ─── Named private buyer nodes (time-spiral，与 location 混排) ─── */}
          {layout.namedPoints.map(({ x, y, node }) => {
            const visual = getNodeVisual('named_private', null, node.editionCount);
            const r = visual.r;
            const nodeKey = `named:${node.id}`;
            const isHovered =
              hoveredNodeId === nodeKey && !pinnedNodeId;
            const isPinned = pinnedNodeId === nodeKey;
            const isSelected = selectedNodeIds.has(nodeKey);

            const dx = x - W / 2;
            const isRightHalf = dx >= 0;
            const labelX = isRightHalf ? x + r + 4 : x - r - 4;
            const labelY = y + 3;
            const anchor: 'start' | 'end' = isRightHalf ? 'start' : 'end';

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
                {/* v1.6.x: organic blob，seed = buyer_name 字面值 */}
                <path
                  d={generateOrganicPath(x, y, r, node.id)}
                  className="fill-foreground"
                  opacity={isPinned ? 0.9 : visual.opacity}
                  pointerEvents="all"
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={anchor}
                  className="fill-foreground"
                  fontSize="9"
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

          {/* ─── Center: artist node ──────────────────────────────
              点击 → pin 卡片显示 studios + 当前持有版本（status ∈ in_studio
              / in_production / in_transit）。视觉保持原 brutalist 调子，
              加 hover ring / pinned pulse 跟其他节点对齐。 */}
          {(() => {
            const isArtistPinned = pinnedNodeId === ARTIST_NODE_KEY;
            const isArtistHovered =
              hoveredNodeId === ARTIST_NODE_KEY && !pinnedNodeId;
            const heldCount = constellation.artist.heldEditionIds.length;
            const studioCount = constellation.artist.studios.length;
            const outflow = constellation.artist.totalOutflowCount;
            const onLoan = constellation.artist.totalOnLoanCount;
            // v1.8.x：4 段独立 segment 组合，避免 3 模板 → 4 字段时 2^4=16 permutation
            // 爆炸。0 值的段省略；全 0 才走 fallback「暂无在库」。
            const subSegments: string[] = [];
            if (studioCount > 0)
              subSegments.push(
                t('diaspora.constellation.centerSubSegStudios', {
                  count: studioCount,
                })
              );
            if (heldCount > 0)
              subSegments.push(
                t('diaspora.constellation.centerSubSegHeld', {
                  count: heldCount,
                })
              );
            if (onLoan > 0)
              subSegments.push(
                t('diaspora.constellation.centerSubSegOnLoan', {
                  count: onLoan,
                })
              );
            if (outflow > 0)
              subSegments.push(
                t('diaspora.constellation.centerSubSegOutflow', {
                  count: outflow,
                })
              );
            const subLabel =
              subSegments.length > 0
                ? subSegments.join(' · ')
                : t('diaspora.constellation.centerSubLabelEmpty');
            return (
              <g
                data-node="aaajiao"
                data-testid="constellation-artist"
                role="button"
                tabIndex={0}
                aria-label={t('diaspora.constellation.aria.artistAction')}
                aria-pressed={isArtistPinned}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => handleNodeMouseEnter(ARTIST_NODE_KEY)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(ARTIST_NODE_KEY);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(ARTIST_NODE_KEY);
                  }
                }}
              >
                <title>{t('diaspora.constellation.centerLabel')}</title>
                {isArtistPinned && (
                  <circle
                    cx={layout.center.x}
                    cy={layout.center.y}
                    r={20}
                    fill="none"
                    className="stroke-foreground diaspora-pin-pulse"
                    strokeWidth={1.5}
                  />
                )}
                {isArtistHovered && (
                  <circle
                    cx={layout.center.x}
                    cy={layout.center.y}
                    r={17}
                    fill="none"
                    className="stroke-foreground"
                    strokeWidth={0.5}
                    opacity={0.5}
                  />
                )}
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
                  pointerEvents="all"
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
                  {subLabel}
                </text>
              </g>
            );
          })()}
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

            {activeMeta.kind === 'artist' ? (
              /* ── Artist center pin card ─────────────────────────── */
              <div data-testid="diaspora-pin-artist" className="space-y-2">
                <div>
                  <span className="font-bold">
                    {t('diaspora.constellation.centerLabel')}
                  </span>
                </div>

                {constellation.artist.studios.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">
                      {t('diaspora.pin.studios', {
                        count: constellation.artist.studios.length,
                      })}
                      :
                    </div>
                    <ul className="space-y-1">
                      {constellation.artist.studios.map((studio) => (
                        <li key={studio.id}>
                          <button
                            type="button"
                            data-testid={`diaspora-pin-studio-${studio.id}`}
                            aria-label={t('diaspora.pin.viewStudioAria', {
                              name: studio.name,
                            })}
                            className="group inline-flex items-center gap-1.5 text-left hover:text-foreground transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/editions?locationId=${studio.id}`
                              );
                            }}
                          >
                            <span className="text-muted-foreground">·</span>
                            <span>
                              {studio.city
                                ? t('diaspora.pin.studioRowWithCity', {
                                    name: studio.name,
                                    city: studio.city,
                                    count: studio.heldEditionCount,
                                  })
                                : t('diaspora.pin.studioRow', {
                                    name: studio.name,
                                    count: studio.heldEditionCount,
                                  })}
                            </span>
                            <ArrowRight
                              className="w-3 h-3 text-muted-foreground/60 group-hover:text-foreground transition-colors"
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">
                    {t('diaspora.pin.noStudios')}
                  </div>
                )}

                {pinnedEditions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-muted-foreground">
                      {t('diaspora.pin.heldEditions', {
                        count: pinnedEditions.length,
                      })}
                      :
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pinnedEditions.map(({ edition, displayId }) => (
                        <button
                          key={edition.id}
                          type="button"
                          title={tStatus(edition.status)}
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
              </div>
            ) : (
              /* ── Location / Named-private pin card ─────────────── */
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="font-bold">{activeMeta.node.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {activeMeta.kind === 'location'
                        ? t(`diaspora.legend.${activeMeta.node.type}`)
                        : t('diaspora.legend.namedPrivateBadge')}
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
                          title={tStatus(edition.status)}
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

                {activeMeta.kind === 'named_private' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      data-testid="diaspora-pin-view-all-buyer"
                      aria-label={t('diaspora.pin.viewAllBuyerAria', {
                        name: activeMeta.node.name,
                      })}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(
                          `/editions?buyerName=${encodeURIComponent(activeMeta.node.name)}`
                        );
                      }}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : activeMeta ? (
          /* ── Hover 预览 ─────────────────────────────────────────── */
          <div className="relative pr-6">
            <Pin
              className="absolute top-0 right-0 w-3 h-3 text-muted-foreground opacity-60"
              aria-hidden="true"
            />
            {activeMeta.kind === 'artist' ? (
              <>
                <div className="font-bold">
                  {t('diaspora.constellation.centerLabel')}
                </div>
                <div className="text-muted-foreground">
                  {t('diaspora.constellation.aria.artistAction')}
                </div>
              </>
            ) : activeMeta.kind === 'location' ? (
              <>
                <div className="font-bold">{activeMeta.node.name}</div>
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
                  {t(`diaspora.legend.${activeMeta.node.type}`)}
                </div>
              </>
            ) : (
              <>
                <div className="font-bold">{activeMeta.node.name}</div>
                <div className="text-muted-foreground">
                  {t('diaspora.constellation.tooltip.namedPrivate', {
                    name: activeMeta.node.name,
                    count: activeMeta.node.editionCount,
                  })}
                </div>
              </>
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
