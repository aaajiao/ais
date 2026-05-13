import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { useTimelineScrubber } from './useTimelineScrubber';
import { buildActivityHistogram } from './marketsUtils';

/**
 * MarketsTimelineRibbon — Markets 视图顶部的"活动密度直方图 + 时间播头"。
 *
 * 跟 Strata 视觉**有意不同步**：
 *   - Strata 的时间是 chart X 轴（年份列），scrubber 是"地层切片"——drop line 进 chart 有几何意义。
 *   - Markets X 轴是 nominal（货币），时间跟空间正交——drop line 强加无意义。
 *
 * 改用 histogram：bin 高 = 该时段交易笔数，cutoff 之后的 bin dim 0.15（跟 dot 同步）。
 * ribbon 自包含，不向下穿透 chart 区域；marker 只在 ribbon 内、连续时间轴上定位。
 */

export interface MarketsTimelineRibbonProps {
  /** ISO date strings，升序 —— 仍是 scrubber 的离散停留点 */
  dates: string[];
  currentDate: string;
  onDateChange: (d: string) => void;
  xOffset: number;
  /** axis 区域宽度 */
  axisWidth: number;
  /** Play 按钮 x（相对 ribbon <g>） */
  playBtnX: number;
  yTop: number;
  ribbonH: number;
  playing: boolean;
  onPlayToggle: () => void;
  onPlayComplete?: () => void;
}

const MARKER_SIZE = 7;
const PLAY_BTN_SIZE = 16;
/**
 * 顶部 caption 行高 —— "YYYY-MM" 浮动 label 独占空间。
 *
 * v1.6.x 修复：之前 caption 用 `fill-foreground font-bold` 跟 histogram bar
 * 同色，且 caption y≈11 在 histogram 区 [0, HIST_AREA_H] 内 —— marker 落在
 * max-count bin 时 bar 从 y=0 满高画到 HIST_AREA_H，caption 整段被同色 bar
 * 吞掉看不见。物理腾空间：caption 独占 ribbon 顶部一行，histogram 整体下移
 * `TOP_LABEL_H`，保证 caption 永远在 histogram 之上。
 */
const TOP_LABEL_H = 12;
/** 直方图 bar 区域占 ribbon 中段的高度（从 TOP_LABEL_H 起算） */
const HIST_AREA_H = 20;
/** baseline 与 histogram 间的小间距（marker 三角伸入空间） */
const BASELINE_GAP = 0;
/** 目标显示 tick label 数量（含首尾） */
const TARGET_TICK_LABELS = 6;
/** 未来 bin / future-cutoff 的 opacity（跟 DOT_OPACITY_FUTURE 同步） */
const FUTURE_OPACITY = 0.15;
/**
 * caption "YYYY-MM" 文字半宽 px（估算）—— 字号 10、mono bold、7 字符约 46px，
 * 半宽 23 + 1px buffer。markerCx 接近 0 或 axisWidth 时用来 clamp caption.x，
 * 避免文字超出 ribbon [0, axisWidth] 边界压到兄弟元素（currency label / Play
 * 按钮）。Marker 三角 / overlay 不受影响，仍严格落在 markerCx。
 */
const CAPTION_HALF_W = 24;

/** ISO date → 'YYYY-MM' for display label */
function formatYearMonth(d: string): string {
  return d.slice(0, 7);
}

/** ISO date → ms (slice + Date.UTC 避免 timezone 漂移) */
function isoToMs(d: string): number {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1;
  const day = Number(d.slice(8, 10)) || 1;
  return Date.UTC(y, m, day);
}

export default function MarketsTimelineRibbon(props: MarketsTimelineRibbonProps) {
  const {
    dates,
    currentDate,
    onDateChange,
    xOffset,
    axisWidth,
    playBtnX,
    yTop,
    ribbonH,
    playing,
    onPlayToggle,
    onPlayComplete,
  } = props;
  const { t } = useTranslation('visualize');

  const { currentIdx, enabled, setIdx } = useTimelineScrubber<string>({
    values: dates,
    current: currentDate,
    onChange: onDateChange,
    playing,
    onPlayComplete,
  });

  const [dragging, setDragging] = useState(false);

  if (!enabled) return null;

  const histogram = buildActivityHistogram(dates);
  if (!histogram) return null;

  const { bins, minISO, maxISO, maxCount } = histogram;
  const minMs = isoToMs(minISO);
  const maxMs = isoToMs(maxISO);
  const cutoffMs = isoToMs(currentDate);
  const timeSpan = Math.max(1, maxMs - minMs);

  /** ISO date → x（连续时间轴定位） */
  const dateToX = (iso: string): number => {
    const ms = isoToMs(iso);
    return ((ms - minMs) / timeSpan) * axisWidth;
  };

  /**
   * pointer (clientX) → 最近的 sale date (ISO string)
   *
   * 转坐标用 overlay rect 的 `getBoundingClientRect()`：localX / rect.width
   * 直接是"屏幕坐标比例" = "SVG 内部 localX / axisWidth"（同一 viewBox 缩放比例）。
   * 然后把比例映射回**连续时间轴**上的目标 ms，扫描 dates[] 找最接近的。
   *
   * 关键：用连续时间映射、不用 idx 比例 —— 跟 ▼ marker / histogram bin /
   * tick label 的连续时间坐标系一致。这是 v1.6 修复"点击不准"bug 的核心：
   * 之前 `<input type="range">` 走 idx 离散映射，sale dates 不等距时 thumb
   * 位置和 marker 位置永远偏移。
   */
  const pointerToDate = (e: React.PointerEvent<SVGRectElement>): string => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio =
      rect.width > 0
        ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        : 0;
    const targetMs = minMs + ratio * timeSpan;
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < dates.length; i++) {
      const d = Math.abs(isoToMs(dates[i]) - targetMs);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }
    return dates[bestIdx];
  };

  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    const next = pointerToDate(e);
    if (next !== currentDate) onDateChange(next);
  };

  // baseline 位置：先让出 TOP_LABEL_H 顶部行给 caption，再画 histogram，
  // 然后是 baseline。改 TOP_LABEL_H / HIST_AREA_H 时下面所有派生量自动跟。
  const baselineY = TOP_LABEL_H + HIST_AREA_H + BASELINE_GAP;
  const markerCx = dateToX(currentDate);
  const markerTopY = baselineY - MARKER_SIZE;
  const labelY = baselineY + 10;
  const tickEndY = baselineY + 3;

  // caption x：marker 落在 ribbon 两端时把 caption 往里挪，避免文字伸出
  // [0, axisWidth] 边界压到兄弟 SVG 元素（currency label / Play 按钮）。
  // marker 三角 / overlay 不动，仅 caption 文字移位 —— 边缘日期下读得到 > 跟 marker 像素级对齐。
  const captionX = Math.max(
    CAPTION_HALF_W,
    Math.min(axisWidth - CAPTION_HALF_W, markerCx)
  );

  /** bin 宽度：把全时间跨度按 bin 平均划分；连续时间轴下 bin 等宽 */
  const binW = axisWidth / bins.length;

  /** 稀疏 tick label：每隔 step 标一个 + 首尾 + current bin */
  const labelStep = Math.max(1, Math.floor(bins.length / (TARGET_TICK_LABELS - 1)));
  const labelIdxSet = new Set<number>();
  labelIdxSet.add(0);
  labelIdxSet.add(bins.length - 1);
  for (let i = labelStep; i < bins.length - 1; i += labelStep) labelIdxSet.add(i);

  return (
    <g
      data-testid="visualize-timeline"
      transform={`translate(${xOffset}, ${yTop})`}
    >
      {/* ─── histogram bars ────────────────────────────────────────────
          整体下移 TOP_LABEL_H：caption 独占 ribbon 顶部一行（y ∈ [0, TOP_LABEL_H]），
          bars 落在 y ∈ [TOP_LABEL_H, TOP_LABEL_H + HIST_AREA_H]，永远不跟 caption
          几何重叠 —— 修 v1.6.x 之前 max-count bar 同色吞掉 caption 的 bug。
          内部 bar 本地坐标 y = HIST_AREA_H - h 不动，只让外层 group 平移。 */}
      <g transform={`translate(0, ${TOP_LABEL_H})`}>
        {bins.map((bin, i) => {
          if (bin.count === 0) return null;
          const x = i * binW;
          const h = Math.max(1, (bin.count / Math.max(1, maxCount)) * HIST_AREA_H);
          const y = HIST_AREA_H - h;
          const binMs = isoToMs(bin.startISO);
          const isFuture = binMs > cutoffMs;
          return (
            <rect
              key={`hbar-${i}`}
              data-testid={`hist-bar-${i}`}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, binW - 1)}
              height={h}
              className="fill-foreground"
              opacity={isFuture ? FUTURE_OPACITY : 1}
            />
          );
        })}
      </g>

      {/* ─── baseline ──────────────────────────────────────────────────── */}
      <line
        x1={0}
        y1={baselineY}
        x2={axisWidth}
        y2={baselineY}
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.5}
        className="text-foreground"
      />

      {/* ─── bin tick marks + 稀疏 label ────────────────────────────────── */}
      {bins.map((bin, i) => {
        const x = i * binW + binW / 2;
        return (
          <g key={`tick-${i}`}>
            <line
              x1={x}
              y1={baselineY}
              x2={x}
              y2={tickEndY}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.3}
              className="text-foreground"
            />
            {labelIdxSet.has(i) && (
              <text
                x={x}
                y={labelY}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                className="fill-muted-foreground"
                opacity={0.7}
              >
                {bin.label}
              </text>
            )}
          </g>
        );
      })}

      {/* ─── ▼ marker（apex 在 baseline，向 histogram 区域伸入） ─────────── */}
      <polygon
        data-testid="visualize-timeline-marker"
        points={`${markerCx},${baselineY} ${markerCx - MARKER_SIZE / 2},${markerTopY} ${markerCx + MARKER_SIZE / 2},${markerTopY}`}
        className="fill-foreground"
      />
      {/* current date 浮动 label —— 独占 ribbon 顶部一行 [0, TOP_LABEL_H]，
          物理上**在** histogram 区之上（histogram 起始 y = TOP_LABEL_H），
          所以即使 marker 落在 max-count bin，caption 也不会被同色 bar 遮挡。
          baseline y = TOP_LABEL_H - 3 = 9，字号 10，文字大致占 y ∈ [1, 9]，
          整段保持在 y < TOP_LABEL_H 范围内。 */}
      <text
        x={captionX}
        y={TOP_LABEL_H - 3}
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        className="fill-foreground font-bold"
        data-testid="visualize-timeline-current"
      >
        {formatYearMonth(currentDate)}
      </text>

      {/* ─── 隐形 range input：仅服务键盘 a11y（Tab focus + ← →） ────────
          pointer-events: none —— 不响应鼠标/触屏，避免跟下方 overlay rect
          的 idx 离散映射冲突（v1.6 修复点击偏移 bug 的核心）。
          仍保留在 DOM 是为了让 Tab 键聚焦 + 左右键步进 + screen reader
          读出 aria-valuetext。 */}
      <foreignObject
        x={0}
        y={0}
        width={axisWidth}
        height={ribbonH}
        pointerEvents="none"
      >
        <input
          type="range"
          min={0}
          max={dates.length - 1}
          step={1}
          value={currentIdx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label={t('timeline.ariaSlider')}
          aria-valuemin={0}
          aria-valuemax={dates.length - 1}
          aria-valuenow={currentIdx}
          aria-valuetext={formatYearMonth(currentDate)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            padding: 0,
            opacity: 0,
            pointerEvents: 'none',
            display: 'block',
          }}
        />
      </foreignObject>

      {/* ─── pointer 点击/拖拽 overlay —— 连续时间映射 → 最近 sale date
          只覆盖 axisWidth 范围，绝不延伸到 playBtnX 之后（不抢 Play 按钮的点击）。
          setPointerCapture 让 drag 超出 rect 仍能持续触发 move，连贯体验。 */}
      <rect
        data-testid="markets-ribbon-click-overlay"
        x={0}
        y={0}
        width={axisWidth}
        height={ribbonH}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => {
          // setPointerCapture 在 jsdom 没实现 —— try/catch 防御
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          setDragging(true);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging) handlePointer(e);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          try {
            if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            /* noop */
          }
        }}
        onPointerCancel={() => setDragging(false)}
      />

      {/* ─── Play 按钮 ─────────────────────────────────────────────────── */}
      <foreignObject
        x={playBtnX}
        y={(ribbonH - PLAY_BTN_SIZE) / 2}
        width={PLAY_BTN_SIZE}
        height={PLAY_BTN_SIZE}
      >
        <button
          type="button"
          onClick={onPlayToggle}
          aria-label={playing ? t('timeline.pause') : t('timeline.play')}
          aria-pressed={playing}
          style={{
            width: PLAY_BTN_SIZE,
            height: PLAY_BTN_SIZE,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
      </foreignObject>
    </g>
  );
}

/**
 * 关于 minMs/maxMs 单点 fallback：
 * - `enabled` flag 已经在 dates.length <= 1 时返 null，所以此处不必额外保护
 * - `timeSpan = max(1, maxMs - minMs)` 是双重保险（任何"两点同日"也不会除零）
 */
