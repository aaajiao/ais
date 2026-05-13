import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type {
  VizArtwork,
  VizEdition,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';
import {
  buildHistoryMonthBuckets,
  buildHistoryDensityYear,
  buildSwimlanes,
  swimlaneHeight,
  stackPositionFor,
  getArtworkOwnershipState,
  getUnknownYearArtworks,
  buildLaneStats,
  type ArtworkOwnershipState,
} from './strataUtils';
import StrataTimelineRibbon from './StrataTimelineRibbon';
import { Legend } from './Legend';
import {
  HeldGlyph,
  ExternalGlyph,
  DepartedGlyph,
  DegenerateGlyph,
  UnknownYearGlyph,
} from './legendGlyphs';

interface Props {
  artworks: VizArtwork[];
  editions?: VizEdition[];
  history: VizHistory[];
  /** Phase 2: M3a — 跨视图选中的 artwork id；选中作品的方块加 dashed ring */
  selectedArtworkId?: string | null;
  /** 选中作品的 callback —— 当前 Strata 仍走 navigate 模式不主动 setSelection */
  onArtworkSelect?: (artworkId: string | null) => void;
}

// ─── M2 状态编码 ────────────────────────────────────────────────────────────
// SVG defs 里的 dot pattern id —— 与 Markets 隔离避免重名（v1.6 共享 viewBox 同根 SVG 时此名都可见）
const DOT_PATTERN_ID = 'viz-strata-pattern-dots';
// X 标记：画在 solid fill-foreground 方块之上，必须用 stroke-background 形成
// 反差（同色 stroke-foreground 会跟 fill 合并不可见）。宽度调到比 stroke 略粗
// 提升小尺寸（BLOCK=8px）下的可读性。
const X_MARK_STROKE = 1.2;
const X_MARK_OPACITY = 0.9;

// ─── 几何常量 ────────────────────────────────────────────────────────────────
const BLOCK = 8;          // 方块边长
const BLOCK_GAP = 2;      // 方块间距
const SWIMLANE_MIN_H = 16;
const SWIMLANE_MAX_H = 64;
const LANE_GAP = 4;       // swimlane 行间距
const LABEL_W = 164;      // 左侧 type label 列宽
const RIGHT_PAD = 16;
const HISTORY_H = 30;     // 顶部 history bar 高度
const HISTORY_GAP = 24;   // history bar 与 swimlane 区域之间的间距
const YEAR_LABEL_H = 20;  // 底部 year label 行高
const TOP_PAD = 12;
const BOTTOM_PAD = 8;
// 顶层时间播头 ribbon —— 嵌入 SVG 内（取代 v1.5 之前的 widget Timeline）。
// height 含 marker label 上方文字 + ▼ marker + baseline；不含 ribbon→history 间距，由 RIBBON_GAP 控。
const RIBBON_H = 32;
const RIBBON_GAP = 8;

// ─── 方块状态 → Tailwind className ────────────────────────────────────────────
// 用 Tailwind opacity 而非 SVG `fillOpacity` attribute，这样 dark 模式可以单独提暗。
// `hover:opacity-100` 由 Tailwind 默认 gated 在 `@media (hover: hover) and (pointer: fine)` 下，
// touch 设备 tap 不会触发该效果，tap 直接 navigate。
const BLOCK_DEFAULT_CLS = 'opacity-[0.65] dark:opacity-[0.8] hover:opacity-100';
const BLOCK_FOCUSED_LANE_CLS = 'opacity-100';
const BLOCK_OTHER_LANE_CLS = 'opacity-[0.3] dark:opacity-[0.4]';
// 播头之后的"未来"方块：保留鬼影，0.15 让形状仍可见但不抢视觉重心
const BLOCK_FUTURE_CLS = 'opacity-[0.15] dark:opacity-[0.2]';

export default function StrataView({
  artworks,
  editions = [],
  history,
  selectedArtworkId = null,
  onArtworkSelect: _onArtworkSelect,
}: Props) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 当前 selection 由 URL state 驱动（不在 view 内 setSelection）；prop 占位为 future hook
  void _onArtworkSelect;

  const [hoveredArtwork, setHoveredArtwork] = useState<VizArtwork | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null); // swimlane.type key
  // pinnedLane：点击 type label 钉住的 lane。`effectiveLane = pinnedLane ?? hoveredLane`
  // —— hover 仍然工作，被 pin 时 pin 占主。所有 visual lane 维度判断（block dim /
  // label opacity / 底部 panel 优先级）都走 effectiveLane。
  const [pinnedLane, setPinnedLane] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const effectiveLane = pinnedLane ?? hoveredLane;

  // ─── 数据变换 ──────────────────────────────────────────────────────────────
  const { swimlanes, yearRange } = useMemo(
    () => buildSwimlanes(artworks),
    [artworks]
  );
  const historyMonths = useMemo(
    () => buildHistoryMonthBuckets(history),
    [history]
  );
  // gapNote 数据：历史记录最密集的那一年（recent / total / year）。
  // 返回 null 时组件隐藏 gapNote（避免显示 "0 / 0 条历史在 NaN 年..."）。
  const historyDensity = useMemo(
    () => buildHistoryDensityYear(history),
    [history]
  );

  const maxCount = swimlanes.length > 0 ? swimlanes[0].count : 1;
  const yearCount = yearRange.length;

  // ─── 时间播头 cutoff year ──────────────────────────────────────────────────
  // 默认 = 数据 max year（"现在"），URL `?t=YYYY` 可覆盖。
  // 解析失败 / 越界 → fall back 到 max，确保不破坏现有快照视觉。
  const maxYear = yearCount > 0 ? yearRange[yearRange.length - 1] : null;
  const cutoffYear = useMemo(() => {
    if (maxYear === null) return null;
    const raw = searchParams.get('t');
    if (raw) {
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && yearRange.includes(parsed)) {
        return parsed;
      }
    }
    return maxYear;
  }, [searchParams, yearRange, maxYear]);

  const setCutoffYear = useCallback(
    (year: number, opts: { writeUrl: boolean } = { writeUrl: true }) => {
      if (!opts.writeUrl) return;
      const next = new URLSearchParams(searchParams);
      if (maxYear !== null && year === maxYear) {
        next.delete('t');
      } else {
        next.set('t', String(year));
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, maxYear]
  );

  // play 中只在内存里推进 cutoff（avoid URL pollution per spec），暂存在 local state；
  // stop play 时把最后一帧落进 URL，然后清掉 playingCutoff（在 play toggle / complete 回调里直接清，不用 effect）
  const [playingCutoff, setPlayingCutoff] = useState<number | null>(null);
  const effectiveCutoff = playing ? playingCutoff ?? cutoffYear : cutoffYear;

  // ─── swimlane 高度计算 ────────────────────────────────────────────────────
  const laneHeights = useMemo(
    () =>
      swimlanes.map((sl) =>
        swimlaneHeight(sl.count, maxCount, SWIMLANE_MIN_H, SWIMLANE_MAX_H)
      ),
    [swimlanes, maxCount]
  );

  // swimlane 顶部 y 坐标（相对于 swimlane 区域顶端）
  const laneTops = useMemo(() => {
    const tops: number[] = [];
    let y = 0;
    for (const h of laneHeights) {
      tops.push(y);
      y += h + LANE_GAP;
    }
    return tops;
  }, [laneHeights]);

  const totalLanesH =
    laneHeights.reduce((s, h) => s + h + LANE_GAP, 0) - LANE_GAP;

  // ─── M2: ownership state per artwork (artworkId → state) ─────────────────
  // 一次性算好，避免每个方块重复扫 editions。空 editions 时所有作品 fallback held。
  const ownershipMap = useMemo(() => {
    const m = new Map<string, ArtworkOwnershipState>();
    for (const a of artworks) {
      m.set(a.id, getArtworkOwnershipState(a, editions));
    }
    return m;
  }, [artworks, editions]);

  // ─── M2: per-lane aggregate stats（Y 轴 pin 信息面板）─────────────────────
  // 依赖 ownershipMap，所以在它之后；与 swimlanes / editions 同步失效。
  const laneStatsMap = useMemo(
    () => buildLaneStats(swimlanes, ownershipMap, editions),
    [swimlanes, ownershipMap, editions]
  );

  // ─── M2: 缺失 year 作品（年表外的特殊列）───────────────────────────────────
  const unknownYearArtworks = useMemo(
    () => getUnknownYearArtworks(artworks),
    [artworks]
  );

  // unknown year 作品按 swimlane.type 分桶，方便在该列内按 type 排列
  const unknownYearBySwimlane = useMemo(() => {
    const m = new Map<string, VizArtwork[]>();
    for (const a of unknownYearArtworks) {
      const key = a.type ?? '__untyped__';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return m;
  }, [unknownYearArtworks]);

  // ─── x 轴：year column 宽度自适应 ─────────────────────────────────────────
  // viewBox 内部坐标：保留 800 为最小逻辑宽度，由 yearCount 决定向上扩展
  // SVG 外层用 className="w-full" 响应式缩放（参考 Diaspora）；
  // overflow-x-auto 兜底极端窄屏（虽然 w-full 缩放后通常不触发）
  //
  // M2: unknown-year 列宽度 = colW，添加在最后；只在有 unknown-year 作品时占位
  const hasUnknownYearCol = unknownYearArtworks.length > 0;
  const extraCols = hasUnknownYearCol ? 1 : 0;
  const CANVAS_W = Math.max(
    800,
    LABEL_W + (yearCount + extraCols) * 20 + RIGHT_PAD
  );
  const colW =
    yearCount + extraCols > 0
      ? Math.max(
          14,
          Math.floor((CANVAS_W - LABEL_W - RIGHT_PAD) / (yearCount + extraCols))
        )
      : 20;
  // unknown-year 列 x 起点（在所有 year 列之后）
  const unknownColX = LABEL_W + yearCount * colW;

  // ─── SVG 总高度 ───────────────────────────────────────────────────────────
  // ribbon 仅在 yearRange.length > 1 时显示（与原 Timeline 单点隐藏行为一致）。
  // ribbon 不显示时 ribbonOffset = 0，所有原有元素位置不变 —— 默认 t=max 视觉无 regression。
  const showRibbon = yearRange.length > 1;
  const ribbonOffset = showRibbon ? RIBBON_H + RIBBON_GAP : 0;

  const totalH =
    TOP_PAD +
    ribbonOffset +
    HISTORY_H +
    HISTORY_GAP +
    totalLanesH +
    YEAR_LABEL_H +
    BOTTOM_PAD;

  // swimlane 区域顶部 y（相对 SVG）
  const laneAreaTop = TOP_PAD + ribbonOffset + HISTORY_H + HISTORY_GAP;

  // ─── 按 (type, year) 建索引 ───────────────────────────────────────────────
  // Map<type_key, Map<year, VizArtwork[]>>
  const cellMap = useMemo(() => {
    const m = new Map<string, Map<number, VizArtwork[]>>();
    for (const sl of swimlanes) {
      const inner = new Map<number, VizArtwork[]>();
      for (const a of sl.artworks) {
        const y = parseYearFromArtwork(a);
        if (y === null) continue;
        if (!inner.has(y)) inner.set(y, []);
        inner.get(y)!.push(a);
      }
      m.set(sl.type, inner);
    }
    return m;
  }, [swimlanes]);

  // ─── 空状态 ────────────────────────────────────────────────────────────────
  if (swimlanes.length === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        {t('empty')}
      </div>
    );
  }

  // ─── year column hover: count artworks in that year ───────────────────────
  const artworksInHoveredYear =
    hoveredYear !== null
      ? artworks.filter((a) => parseYearFromArtwork(a) === hoveredYear).length
      : 0;

  // ─── 跳转处理 ──────────────────────────────────────────────────────────────
  // 防御：id 缺失就不 navigate（理论上 DB 保证 NOT NULL，但 schema 类型仍是可空）
  function handleBlockActivate(a: VizArtwork) {
    if (!a.id) return;
    navigate(`/artworks/${a.id}`);
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-1">
        <h2 className="text-base font-bold uppercase tracking-wider">
          {t('strata.heading')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t('strata.description')}
        </p>
      </header>

      {/* ─── SVG ────────────────────────────────────────────────────────── */}
      {/* Time scrubber 不再是独立 widget —— 嵌入 SVG 内部作为最顶层"年份地层"
          （见 <StrataTimelineRibbon /> 在 SVG 子树里的位置）。 */}
      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${CANVAS_W} ${totalH}`}
          className="block w-full"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={t('strata.heading')}
        >
          {/* ─── M2: dot pattern for EXTERNAL state ──────────────────── */}
          {/* 颜色用 currentColor，让 dark mode 自动适配 fill-foreground 的 CSS 变量 */}
          <defs>
            <pattern
              id={DOT_PATTERN_ID}
              patternUnits="userSpaceOnUse"
              width="3"
              height="3"
            >
              <circle cx="1" cy="1" r="0.7" fill="currentColor" />
            </pattern>
          </defs>

          {/* ─── Time scrubber ribbon (M1.5) ─────────────────────────── */}
          {/* ribbon 占据 SVG 顶部 RIBBON_H 高度 + RIBBON_GAP 间距，drop line
              贯穿 history bar + 整片 swimlane 区 + year label，让"现在的切片"可见。
              单年份数据时 ribbon 不渲染，ribbonOffset=0，原有元素位置不变。 */}
          {showRibbon && effectiveCutoff !== null && (
            <StrataTimelineRibbon
              years={yearRange}
              currentYear={effectiveCutoff}
              onYearChange={(y) => {
                if (playing) {
                  setPlayingCutoff(y);
                } else {
                  setCutoffYear(y);
                }
              }}
              xOffset={LABEL_W}
              // axisWidth = yearCount × colW，让 ribbon tick 跟下方 year column 严格对齐
              // （drop line 必须正中落在 cutoff year 的列上）。
              axisWidth={yearCount * colW}
              // Play 按钮：axis 之后留 4px gap；当有 unknown-year 列时贴在其右侧（避开列）；
              // 其他情况下落在 RIGHT_PAD 内（CANVAS_W 已经包了 RIGHT_PAD）。
              // 注意：相对 ribbon <g>（已经 translate 到 LABEL_W），所以不再减 LABEL_W。
              playBtnX={yearCount * colW + (hasUnknownYearCol ? colW : 0) + 4}
              yTop={TOP_PAD}
              ribbonH={RIBBON_H}
              dropLineH={
                RIBBON_GAP + HISTORY_H + HISTORY_GAP + totalLanesH + YEAR_LABEL_H
              }
              playing={playing}
              onPlayToggle={() => {
                if (playing) {
                  if (playingCutoff !== null) setCutoffYear(playingCutoff);
                  setPlayingCutoff(null);
                  setPlaying(false);
                } else {
                  setPlayingCutoff(cutoffYear);
                  setPlaying(true);
                }
              }}
              onPlayComplete={() => {
                if (playingCutoff !== null) setCutoffYear(playingCutoff);
                setPlayingCutoff(null);
                setPlaying(false);
              }}
            />
          )}

          {/* ─── History bar ─────────────────────────────────────────── */}
          {historyMonths.entries.length > 0 && (
            <>
              <text
                x={LABEL_W}
                y={TOP_PAD + ribbonOffset + 10}
                className="fill-muted-foreground"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {t('strata.axisHistory')}
              </text>
              {historyMonths.entries.map(([month, count], i) => {
                const barW = Math.max(4, Math.floor((CANVAS_W - LABEL_W - RIGHT_PAD) / historyMonths.entries.length) - 2);
                const x = LABEL_W + i * (barW + 2);
                const h = historyMonths.max > 0
                  ? Math.max(2, (count / historyMonths.max) * (HISTORY_H - 12))
                  : 0;
                const barY = TOP_PAD + ribbonOffset + HISTORY_H - h;
                return (
                  <g key={month}>
                    <rect
                      x={x}
                      y={barY}
                      width={barW}
                      height={h}
                      className="fill-foreground opacity-50 dark:opacity-70"
                    />
                    <title>{`${month}: ${count}`}</title>
                  </g>
                );
              })}
            </>
          )}

          {/* ─── Year column backgrounds (hover highlight) ───────────── */}
          {yearRange.map((year, colIdx) => {
            const x = LABEL_W + colIdx * colW;
            const isYearHovered = hoveredYear === year;
            return (
              <rect
                key={year}
                x={x}
                y={laneAreaTop}
                width={colW}
                height={totalLanesH + YEAR_LABEL_H}
                className={isYearHovered ? 'fill-foreground/5' : 'fill-transparent'}
                onMouseEnter={() => setHoveredYear(year)}
                onMouseLeave={() => setHoveredYear(null)}
              />
            );
          })}

          {/* ─── Swimlanes ───────────────────────────────────────────── */}
          {swimlanes.map((sl, laneIdx) => {
            const laneH = laneHeights[laneIdx];
            const laneY = laneAreaTop + laneTops[laneIdx];
            // effectiveLane = pinnedLane ?? hoveredLane —— hover 与 pin 共享视觉
            const isFocusedLane =
              effectiveLane !== null && effectiveLane === sl.type;
            const isOtherLane =
              effectiveLane !== null && effectiveLane !== sl.type;
            const isPinned = pinnedLane === sl.type;

            // Lane separator line (between lanes)
            const showSep = laneIdx > 0;

            const togglePin = () => {
              setPinnedLane((prev) => (prev === sl.type ? null : sl.type));
            };

            return (
              <g key={sl.type}>
                {showSep && (
                  <line
                    x1={LABEL_W}
                    y1={laneY - LANE_GAP / 2}
                    x2={CANVAS_W - RIGHT_PAD}
                    y2={laneY - LANE_GAP / 2}
                    className="stroke-border"
                    strokeWidth={0.5}
                    opacity={0.5}
                  />
                )}

                {/* Type label —— 字体与 Diaspora 节点 label 对齐：9px mono +
                    fill-foreground + opacity 0.75/1.0。点击 toggle pinnedLane，
                    Enter/Space 同效；外层 <g role="button" aria-pressed> 让屏幕
                    阅读器读到"按钮"状态。 */}
                <g
                  role="button"
                  tabIndex={0}
                  aria-pressed={isPinned}
                  aria-label={t('strata.lane.pin.aria', {
                    type: sl.displayLabel,
                  })}
                  data-testid={`lane-label-${sl.type}`}
                  className="focus:outline-none focus-visible:outline-2 focus-visible:outline-foreground cursor-pointer"
                  onClick={togglePin}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      togglePin();
                    }
                  }}
                  onMouseEnter={() => setHoveredLane(sl.type)}
                  onMouseLeave={() => setHoveredLane(null)}
                >
                  {/* Pin marker：靠 SVG 内 absolute 位置（x=4）而非贴文字宽度，
                      避免依赖 textWidth 测量。短粗竖条，仅在 pinned 时渲染。 */}
                  {isPinned && (
                    <rect
                      data-testid={`lane-pin-marker-${sl.type}`}
                      x={4}
                      y={laneY + laneH / 2 - 4.5}
                      width={1.5}
                      height={9}
                      className="fill-foreground"
                    />
                  )}
                  <text
                    x={LABEL_W - 8}
                    y={laneY + laneH / 2 + 4}
                    textAnchor="end"
                    className="fill-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                    opacity={isFocusedLane ? 1 : 0.75}
                  >
                    {sl.displayLabel} · {sl.count}
                  </text>
                </g>

                {/* Blocks per year column */}
                {yearRange.map((year, colIdx) => {
                  const innerMap = cellMap.get(sl.type);
                  const cellArtworks = innerMap?.get(year) ?? [];
                  if (cellArtworks.length === 0) return null;

                  const positions = stackPositionFor(
                    cellArtworks.length,
                    BLOCK,
                    BLOCK_GAP,
                    laneH
                  );

                  const colX = LABEL_W + colIdx * colW;

                  return cellArtworks.map((a, i) => {
                    const pos = positions[i];
                    // 竖直堆叠：从 swimlane 底部向上
                    const blockX = colX + pos.col * (BLOCK + BLOCK_GAP) + 1;
                    const blockY =
                      laneY + laneH - (pos.row + 1) * (BLOCK + BLOCK_GAP) + BLOCK_GAP;

                    // 状态优先级：future-dim > hovered (rect:hover) > focused lane > other lane > default
                    // hovered 通过 Tailwind `hover:opacity-100` 由 CSS 直接驱动（gated 在 hover-capable device），
                    // 这里只用 JS 状态处理 lane 维度
                    const isFuture =
                      effectiveCutoff !== null && year > effectiveCutoff;
                    const stateCls = isFuture
                      ? BLOCK_FUTURE_CLS
                      : isFocusedLane
                      ? BLOCK_FOCUSED_LANE_CLS
                      : isOtherLane
                      ? BLOCK_OTHER_LANE_CLS
                      : BLOCK_DEFAULT_CLS;

                    const disabled = !a.id;
                    const title =
                      a.title_en || a.title_cn || t('strata.aria.untitled');
                    const ariaLabel = t('strata.aria.blockLabel', {
                      type: sl.displayLabel,
                      year,
                      title,
                    });

                    const ownership =
                      ownershipMap.get(a.id) ?? {
                        bucket: 'held' as const,
                        isDegenerate: false,
                      };

                    const isSelected =
                      selectedArtworkId !== null && a.id === selectedArtworkId;

                    return (
                      <g
                        key={a.id ?? `${sl.type}-${year}-${i}`}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-label={ariaLabel}
                        aria-disabled={disabled || undefined}
                        data-block="true"
                        data-ownership={ownership.bucket}
                        data-degenerate={ownership.isDegenerate || undefined}
                        data-selected={isSelected || undefined}
                        className={cn(
                          'focus:outline-none focus-visible:outline-2 focus-visible:outline-foreground',
                          !disabled && 'cursor-pointer'
                        )}
                        onMouseEnter={() => {
                          setHoveredArtwork(a);
                          setHoveredYear(year);
                        }}
                        onMouseLeave={() => {
                          setHoveredArtwork(null);
                          setHoveredYear(null);
                        }}
                        onClick={() => handleBlockActivate(a)}
                        onKeyDown={(e) => {
                          if (disabled) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleBlockActivate(a);
                          }
                        }}
                      >
                        <OwnershipBlock
                          x={blockX}
                          y={blockY}
                          size={BLOCK}
                          ownership={ownership}
                          stateCls={stateCls}
                          forceStrokeOnly={false}
                        />
                        {/* Phase 2 selection ring: dashed rect 包住方块外缘 */}
                        {isSelected && (
                          <rect
                            data-testid={`strata-selection-ring-${a.id}`}
                            x={blockX - 1.5}
                            y={blockY - 1.5}
                            width={BLOCK + 3}
                            height={BLOCK + 3}
                            fill="none"
                            className="stroke-foreground pointer-events-none"
                            strokeWidth={1.2}
                            strokeDasharray="2 2"
                          />
                        )}
                      </g>
                    );
                  });
                })}
              </g>
            );
          })}

          {/* ─── M2: Unknown year column ─────────────────────────────── */}
          {/* 时间播头 cutoff 不过滤这一列（year 缺失 = 时间维度不存在）。
              整列方块强制 stroke-only —— 缺失态优先级高于 ownership。 */}
          {hasUnknownYearCol && (
            <g data-testid="strata-unknown-year-col">
              {/* 列 header："?" 单字符，居中，低透明度，与 year label 同字号 */}
              <text
                x={unknownColX + colW / 2}
                y={laneAreaTop + totalLanesH + YEAR_LABEL_H - 4}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                opacity={0.6}
              >
                ?
              </text>

              {/* 每个 swimlane 把缺 year 的同类型作品堆在这一列底部 */}
              {swimlanes.map((sl, laneIdx) => {
                const cellArtworks = unknownYearBySwimlane.get(sl.type) ?? [];
                if (cellArtworks.length === 0) return null;
                const laneH = laneHeights[laneIdx];
                const laneY = laneAreaTop + laneTops[laneIdx];
                const positions = stackPositionFor(
                  cellArtworks.length,
                  BLOCK,
                  BLOCK_GAP,
                  laneH
                );
                return cellArtworks.map((a, i) => {
                  const pos = positions[i];
                  const blockX = unknownColX + pos.col * (BLOCK + BLOCK_GAP) + 1;
                  const blockY =
                    laneY + laneH - (pos.row + 1) * (BLOCK + BLOCK_GAP) + BLOCK_GAP;
                  const ownership =
                    ownershipMap.get(a.id) ?? {
                      bucket: 'held' as const,
                      isDegenerate: false,
                    };
                  const disabled = !a.id;
                  const title =
                    a.title_en || a.title_cn || t('strata.aria.untitled');
                  const ariaLabel = t('strata.aria.blockLabel', {
                    type: sl.displayLabel,
                    year: '?',
                    title,
                  });
                  const isSelected =
                    selectedArtworkId !== null && a.id === selectedArtworkId;
                  return (
                    <g
                      key={a.id ?? `${sl.type}-unknown-${i}`}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-label={ariaLabel}
                      aria-disabled={disabled || undefined}
                      data-block="true"
                      data-ownership={ownership.bucket}
                      data-degenerate={ownership.isDegenerate || undefined}
                      data-unknown-year="true"
                      data-selected={isSelected || undefined}
                      className={cn(
                        'focus:outline-none focus-visible:outline-2 focus-visible:outline-foreground',
                        !disabled && 'cursor-pointer'
                      )}
                      onMouseEnter={() => setHoveredArtwork(a)}
                      onMouseLeave={() => setHoveredArtwork(null)}
                      onClick={() => handleBlockActivate(a)}
                      onKeyDown={(e) => {
                        if (disabled) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleBlockActivate(a);
                        }
                      }}
                    >
                      <OwnershipBlock
                        x={blockX}
                        y={blockY}
                        size={BLOCK}
                        ownership={ownership}
                        stateCls={BLOCK_DEFAULT_CLS}
                        forceStrokeOnly={true}
                      />
                      {isSelected && (
                        <rect
                          data-testid={`strata-selection-ring-${a.id}`}
                          x={blockX - 1.5}
                          y={blockY - 1.5}
                          width={BLOCK + 3}
                          height={BLOCK + 3}
                          fill="none"
                          className="stroke-foreground pointer-events-none"
                          strokeWidth={1.2}
                          strokeDasharray="2 2"
                        />
                      )}
                    </g>
                  );
                });
              })}
            </g>
          )}

          {/* ─── Year labels (x axis) ────────────────────────────────── */}
          {yearRange.map((year, colIdx) => {
            const isFirst = colIdx === 0;
            const isLast = colIdx === yearRange.length - 1;
            const isHoveredYearCol = hoveredYear === year;
            const showLabel =
              year % 5 === 0 || isFirst || isLast || isHoveredYearCol;

            if (!showLabel) return null;
            const x = LABEL_W + colIdx * colW + colW / 2;
            const y = laneAreaTop + totalLanesH + YEAR_LABEL_H - 4;

            return (
              <text
                key={year}
                x={x}
                y={y}
                textAnchor="middle"
                className={isHoveredYearCol ? 'fill-foreground' : 'fill-muted-foreground'}
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {String(year).slice(2)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ─── 断层注释 ───────────────────────────────────────────────────── */}
      {historyDensity && (
        <p className="text-xs text-muted-foreground max-w-2xl italic">
          {t('strata.gapNote', historyDensity)}
        </p>
      )}

      {/* ─── 图例 (M2.5) ────────────────────────────────────────────── */}
      <Legend
        separatorBefore="unknownYear"
        items={[
          { key: 'held', glyph: <HeldGlyph />, label: t('strata.legend.held') },
          { key: 'external', glyph: <ExternalGlyph />, label: t('strata.legend.external') },
          { key: 'departed', glyph: <DepartedGlyph />, label: t('strata.legend.departed') },
          { key: 'degenerate', glyph: <DegenerateGlyph />, label: t('strata.legend.degenerate') },
          { key: 'unknownYear', glyph: <UnknownYearGlyph />, label: t('strata.legend.unknownYear') },
        ]}
      />

      {/* ─── 底部 tooltip 信息条 ─────────────────────────────────────── */}
      {/* 优先级链：hoveredArtwork > hoveredYear > pinnedLane > overview。
          pin 低于 hover —— hover 单 block 临时覆盖 pin 信息，离开 block 回到
          pin 视图（不丢上下文）；空 idle 态显示 overview。 */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {hoveredArtwork ? (
          <>
            <div className="font-bold">
              {hoveredArtwork.title_en ||
                hoveredArtwork.title_cn ||
                hoveredArtwork.id}
            </div>
            <div className="text-muted-foreground">
              {hoveredArtwork.year ?? '—'} · {hoveredArtwork.type ?? '(untyped)'}
            </div>
          </>
        ) : hoveredYear !== null ? (
          <>
            <div className="font-bold">
              {t('strata.tooltip.yearLabel', { year: hoveredYear })}
            </div>
            <div className="text-muted-foreground">
              {t('strata.tooltip.count', { count: artworksInHoveredYear })}
            </div>
          </>
        ) : pinnedLane !== null && laneStatsMap.get(pinnedLane) ? (
          (() => {
            const lane = laneStatsMap.get(pinnedLane)!;
            // glyph 字符用 Unicode 而非 inline SVG —— info bar 是 HTML 不是 SVG，
            // SVG 会破坏 mono 字体对齐。选取的字符宽度跟 mono 字体匹配：
            //   held       ◻ (U+25FB White Medium Square)
            //   external   ▦ (U+25A6 dotted-fill square)
            //   departed   ◼ (U+25FC Black Medium Square)
            //   degenerate ✕ (U+2715)
            return (
              <div data-testid="lane-pin-panel">
                <div className="font-bold">{lane.displayLabel}</div>
                <div className="text-muted-foreground">
                  {t('strata.lane.summary.artworks', {
                    count: lane.artworkCount,
                  })}
                  {' · '}
                  {t('strata.lane.summary.editions', {
                    count: lane.editionCount,
                  })}
                </div>
                <div className="text-muted-foreground">
                  <span data-testid="lane-pin-held">
                    ◻ {t('strata.lane.summary.held', {
                      count: lane.ownership.held,
                    })}
                  </span>
                  {'  '}
                  <span data-testid="lane-pin-external">
                    ▦ {t('strata.lane.summary.external', {
                      count: lane.ownership.external,
                    })}
                  </span>
                  {'  '}
                  <span data-testid="lane-pin-departed">
                    ◼ {t('strata.lane.summary.departed', {
                      count: lane.ownership.departed,
                    })}
                  </span>
                  {'  '}
                  <span data-testid="lane-pin-degenerate">
                    ✕ {t('strata.lane.summary.degenerate', {
                      count: lane.ownership.degenerate,
                    })}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {lane.yearSpan
                    ? t('strata.lane.summary.yearSpan', {
                        from: lane.yearSpan.min,
                        to: lane.yearSpan.max,
                      })
                    : t('strata.lane.summary.yearSpanEmpty')}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="text-muted-foreground">
            {t('strata.summary.overview', {
              artworks: artworks.length,
              types: swimlanes.length,
              yearSpan:
                yearCount > 0
                  ? yearCount === 1
                    ? yearRange[0]
                    : `${yearRange[0]}–${yearRange[yearCount - 1]}`
                  : '—',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── M2 内部辅助：按 ownership state 渲染方块 ───────────────────────────────
// HELD / 强制 stroke-only —— fill=none + stroke-foreground
// EXTERNAL                 —— fill = url(#dot pattern)
// DEPARTED                 —— solid fill-foreground（当前默认）
// DEGENERATE 叠加层         —— 上层画两条 X 线（细，opacity 0.6），不影响主 fill
//
// stateCls 是 lane focus / time cutoff future 维度的 opacity className（沿用原逻辑）
function OwnershipBlock(props: {
  x: number;
  y: number;
  size: number;
  ownership: ArtworkOwnershipState;
  stateCls: string;
  forceStrokeOnly: boolean;
}) {
  const { x, y, size, ownership, stateCls, forceStrokeOnly } = props;
  const strokeOnly = forceStrokeOnly || ownership.bucket === 'held';

  // 主形：fill / stroke 决定 ownership bucket 的视觉
  // pointerEvents="all" —— SVG 默认 visiblePainted，fill=none 内部不响应点击；
  // 强制全 geometry 响应，让用户可以点方块内部而非只点边
  const mainShape = strokeOnly ? (
    <rect
      x={x + 0.75}
      y={y + 0.75}
      width={size - 1.5}
      height={size - 1.5}
      fill="none"
      pointerEvents="all"
      className={cn(
        'stroke-foreground transition-opacity duration-100',
        stateCls
      )}
      strokeWidth={1.5}
    />
  ) : ownership.bucket === 'external' ? (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      fill={`url(#${DOT_PATTERN_ID})`}
      // text-foreground 提供 pattern circle 的 currentColor 值
      className={cn('text-foreground transition-opacity duration-100', stateCls)}
    />
  ) : (
    // departed (默认 solid)
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      className={cn('fill-foreground transition-opacity duration-100', stateCls)}
    />
  );

  // X 标记：lost / damaged 在主形之上叠加。X 长度 = size 的 80%，居中。
  // stroke-background 在 fill-foreground 方块上形成"切口"——必须反差色，
  // stroke-foreground 等于把同色画在同色上，看不见。
  const xMark = ownership.isDegenerate ? (
    <g
      data-mark="degenerate"
      className={cn(
        'stroke-background pointer-events-none transition-opacity duration-100',
        stateCls
      )}
      strokeWidth={X_MARK_STROKE}
      strokeLinecap="round"
      opacity={X_MARK_OPACITY}
    >
      <line
        x1={x + size * 0.1}
        y1={y + size * 0.1}
        x2={x + size * 0.9}
        y2={y + size * 0.9}
      />
      <line
        x1={x + size * 0.9}
        y1={y + size * 0.1}
        x2={x + size * 0.1}
        y2={y + size * 0.9}
      />
    </g>
  ) : null;

  return (
    <>
      {mainShape}
      {xMark}
    </>
  );
}

// ─── 内部辅助：从作品取 anchor year ─────────────────────────────────────────
function parseYearFromArtwork(a: VizArtwork): number | null {
  if (!a.year) return null;
  const match = a.year.match(/(\d{4})/);
  if (!match) return null;
  const y = Number(match[1]);
  if (Number.isNaN(y) || y < 1900 || y > 2100) return null;
  return y;
}
