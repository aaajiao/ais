import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type {
  VizArtwork,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';
import {
  buildHistoryMonthBuckets,
  buildSwimlanes,
  swimlaneHeight,
  stackPositionFor,
} from './strataUtils';
import Timeline from './Timeline';

interface Props {
  artworks: VizArtwork[];
  history: VizHistory[];
}

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

// ─── 方块状态 → Tailwind className ────────────────────────────────────────────
// 用 Tailwind opacity 而非 SVG `fillOpacity` attribute，这样 dark 模式可以单独提暗。
// `hover:opacity-100` 由 Tailwind 默认 gated 在 `@media (hover: hover) and (pointer: fine)` 下，
// touch 设备 tap 不会触发该效果，tap 直接 navigate。
const BLOCK_DEFAULT_CLS = 'opacity-[0.65] dark:opacity-[0.8] hover:opacity-100';
const BLOCK_FOCUSED_LANE_CLS = 'opacity-100';
const BLOCK_OTHER_LANE_CLS = 'opacity-[0.3] dark:opacity-[0.4]';
// 播头之后的"未来"方块：保留鬼影，0.15 让形状仍可见但不抢视觉重心
const BLOCK_FUTURE_CLS = 'opacity-[0.15] dark:opacity-[0.2]';

export default function StrataView({ artworks, history }: Props) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [hoveredArtwork, setHoveredArtwork] = useState<VizArtwork | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null); // swimlane.type key
  const [playing, setPlaying] = useState(false);

  // ─── 数据变换 ──────────────────────────────────────────────────────────────
  const { swimlanes, yearRange } = useMemo(
    () => buildSwimlanes(artworks),
    [artworks]
  );
  const historyMonths = useMemo(
    () => buildHistoryMonthBuckets(history),
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

  // ─── x 轴：year column 宽度自适应 ─────────────────────────────────────────
  // viewBox 内部坐标：保留 800 为最小逻辑宽度，由 yearCount 决定向上扩展
  // SVG 外层用 className="w-full" 响应式缩放（参考 Diaspora）；
  // overflow-x-auto 兜底极端窄屏（虽然 w-full 缩放后通常不触发）
  const CANVAS_W = Math.max(800, LABEL_W + yearCount * 20 + RIGHT_PAD);
  const colW = yearCount > 0
    ? Math.max(14, Math.floor((CANVAS_W - LABEL_W - RIGHT_PAD) / yearCount))
    : 20;

  // ─── SVG 总高度 ───────────────────────────────────────────────────────────
  const totalH =
    TOP_PAD +
    HISTORY_H +
    HISTORY_GAP +
    totalLanesH +
    YEAR_LABEL_H +
    BOTTOM_PAD;

  // swimlane 区域顶部 y（相对 SVG）
  const laneAreaTop = TOP_PAD + HISTORY_H + HISTORY_GAP;

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

      {/* ─── Time scrubber ──────────────────────────────────────────────── */}
      {yearRange.length > 1 && effectiveCutoff !== null && (
        <Timeline
          values={yearRange}
          current={effectiveCutoff}
          onChange={(y) => {
            if (playing) {
              setPlayingCutoff(y);
            } else {
              setCutoffYear(y);
            }
          }}
          format={(y) => String(y)}
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

      {/* ─── SVG ────────────────────────────────────────────────────────── */}
      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${CANVAS_W} ${totalH}`}
          className="block w-full"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={t('strata.heading')}
        >
          {/* ─── History bar ─────────────────────────────────────────── */}
          {historyMonths.entries.length > 0 && (
            <>
              <text
                x={LABEL_W}
                y={TOP_PAD + 10}
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
                const barY = TOP_PAD + HISTORY_H - h;
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
            const isFocusedLane = hoveredLane !== null && hoveredLane === sl.type;
            const isOtherLane = hoveredLane !== null && hoveredLane !== sl.type;

            // Lane separator line (between lanes)
            const showSep = laneIdx > 0;

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

                {/* Type label —— 字体与 Diaspora 节点 label 对齐：9px mono + fill-foreground + opacity 0.75/1.0 */}
                <text
                  x={LABEL_W - 8}
                  y={laneY + laneH / 2 + 4}
                  textAnchor="end"
                  className="fill-foreground"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                  opacity={isFocusedLane ? 1 : 0.75}
                  style={{ cursor: 'default' }}
                  onMouseEnter={() => setHoveredLane(sl.type)}
                  onMouseLeave={() => setHoveredLane(null)}
                >
                  {sl.displayLabel} · {sl.count}
                </text>

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

                    return (
                      <g
                        key={a.id ?? `${sl.type}-${year}-${i}`}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-label={ariaLabel}
                        aria-disabled={disabled || undefined}
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
                        <rect
                          x={blockX}
                          y={blockY}
                          width={BLOCK}
                          height={BLOCK}
                          className={cn(
                            'fill-foreground transition-opacity duration-100',
                            stateCls
                          )}
                        />
                      </g>
                    );
                  });
                })}
              </g>
            );
          })}

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
      <p className="text-xs text-muted-foreground max-w-2xl italic">
        {t('strata.gapNote')}
      </p>

      {/* ─── 底部 tooltip 信息条 ─────────────────────────────────────── */}
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

// ─── 内部辅助：从作品取 anchor year ─────────────────────────────────────────
function parseYearFromArtwork(a: VizArtwork): number | null {
  if (!a.year) return null;
  const match = a.year.match(/(\d{4})/);
  if (!match) return null;
  const y = Number(match[1]);
  if (Number.isNaN(y) || y < 1900 || y > 2100) return null;
  return y;
}
