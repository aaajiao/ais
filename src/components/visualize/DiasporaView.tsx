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
  getNodeVisual,
  generateOrganicPath,
  buildNodes,
  computeTrackedStat,
  countryToISO2,
  buildGhostEditions,
  layoutGhostRing,
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
        三档视觉词汇在 Legend 上必须 visible 区分：
        - type chips（entity）→ inline SVG organic blob（跟主图 location 节点同源
          generateOrganicPath，每 type 用自己字面值做 seed → 稳定不同形状）
        - anonymous → 灰实心几何小圆（rounded-full + opacity 0.55）
        - untracked → 空心几何小圆（border-only）
        opacity 与主图 NODE_VISUAL_SPEC 对齐，让 chip 直接读图。
      */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">
          type
        </span>
        {(
          [
            ['studio', 0.85],
            ['gallery', 0.7],
            ['museum', 1.0],
            ['private_collection', 0.85],
            ['other', 0.6],
          ] as Array<[LocationNode['type'], number]>
        ).map(([type, opacity]) => (
          <span key={type} className="flex items-center gap-1.5">
            {/*
              chip 放大到 20×20 + baseR=8 让 ±25% organic 扰动可见
              (12×12 baseR=5 → 视觉扰动 1.25px 太小看不出；20×20 baseR=8
              → 视觉扰动 2px，肉眼能识别 5 个 type 各自的 organic 指纹)。
            */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="text-foreground shrink-0"
            >
              <path
                d={generateOrganicPath(10, 10, 8, type)}
                fill="currentColor"
                opacity={opacity}
              />
            </svg>
            <span className="text-muted-foreground">
              {t(`diaspora.legend.${type}`)}
            </span>
          </span>
        ))}
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
      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ maxHeight: '70vh' }}
          role="img"
          aria-label={t('diaspora.heading')}
          onClick={handleSvgClick}
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
                status: ghost.status,
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
              <title>{`${ghost.title ?? '—'} · ${ghost.inventoryNumber ?? '—'} · ${ghost.status}`}</title>
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
                  v1.6.x: 把规则 circle 换成 deterministic organic blob path —
                  跟 Strata 方块 / Markets dot 形成视觉对照。每个 entity 按 id
                  (seed) 算 12 段 quadratic-bezier 闭合轮廓，render 间稳定。
                  pointerEvents="all" 保 a11y / click 流。
                */}
                <path
                  d={generateOrganicPath(x, y, r, node.id)}
                  className="fill-foreground"
                  opacity={isPinned ? 1 : visual.opacity}
                  pointerEvents="all"
                />
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
