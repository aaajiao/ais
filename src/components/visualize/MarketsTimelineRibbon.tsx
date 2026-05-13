import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { useTimelineScrubber } from './useTimelineScrubber';

/**
 * MarketsTimelineRibbon — Markets 视图顶部的"date axis"播头。
 *
 * 跟 Strata 的视觉词汇对齐：baseline + ticks + ▼ marker + drop line + 右上 Play 按钮。
 *
 * 差异：
 *   - tick label 是 ISO date（YYYY-MM），稀疏标签（自动选 N≈5~7 个均匀 tick）
 *   - drop line 只贯穿主散点 canvas（不进 noPrice lane） —— 由 dropLineH 控
 *   - values 是按时间升序的 distinct sale_date 字符串
 */

export interface MarketsTimelineRibbonProps {
  /** ISO date strings，升序 */
  dates: string[];
  currentDate: string;
  onDateChange: (d: string) => void;
  /** ribbon 在父 SVG 中的 x 起点 */
  xOffset: number;
  /** axis 区域宽度，tick 均分 */
  axisWidth: number;
  /** Play 按钮 x（相对 ribbon <g>），在 axis 之外 */
  playBtnX: number;
  /** ribbon 顶端在父 SVG 中的 y */
  yTop: number;
  /** ribbon 自身高度 */
  ribbonH: number;
  /** 垂直 drop line 长度（= 主散点 canvas 高度，不含 noPrice lane） */
  dropLineH: number;
  playing: boolean;
  onPlayToggle: () => void;
  onPlayComplete?: () => void;
}

const MARKER_SIZE = 7;
const PLAY_BTN_SIZE = 16;
/** 目标显示 tick label 数量（含首尾） */
const TARGET_TICK_LABELS = 6;

/** ISO date → 'YYYY-MM' for label display */
function formatYearMonth(d: string): string {
  return d.slice(0, 7);
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
    dropLineH,
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

  if (!enabled) return null;

  const len = dates.length;
  const tickW = axisWidth / len;
  const idxToX = (idx: number) => idx * tickW + tickW / 2;

  const baselineY = ribbonH - 6;
  const markerCx = idxToX(currentIdx);
  const markerTopY = baselineY - MARKER_SIZE;

  /** 稀疏 tick label：均匀挑选 ~TARGET_TICK_LABELS 个，含首尾，外加 current */
  const labelIdxSet = new Set<number>();
  labelIdxSet.add(0);
  labelIdxSet.add(len - 1);
  labelIdxSet.add(currentIdx);
  if (len > 2) {
    const step = Math.max(1, Math.floor(len / (TARGET_TICK_LABELS - 1)));
    for (let i = step; i < len - 1; i += step) labelIdxSet.add(i);
  }

  return (
    <g
      data-testid="visualize-timeline"
      transform={`translate(${xOffset}, ${yTop})`}
    >
      {/* baseline */}
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

      {/* 全 tick mark（短竖线），稀疏 label */}
      {dates.map((d, idx) => {
        const x = idxToX(idx);
        const isCurrent = idx === currentIdx;
        return (
          <g key={`${d}-${idx}`}>
            <line
              x1={x}
              y1={baselineY - 3}
              x2={x}
              y2={baselineY}
              stroke="currentColor"
              strokeWidth={1}
              opacity={isCurrent ? 0.9 : 0.3}
              className="text-foreground"
            />
            {labelIdxSet.has(idx) && !isCurrent && (
              <text
                x={x}
                y={baselineY - 8}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                className="fill-muted-foreground"
                opacity={0.7}
              >
                {formatYearMonth(d)}
              </text>
            )}
          </g>
        );
      })}

      {/* ▼ marker */}
      <polygon
        points={`${markerCx},${baselineY} ${markerCx - MARKER_SIZE / 2},${markerTopY} ${markerCx + MARKER_SIZE / 2},${markerTopY}`}
        className="fill-foreground"
      />
      {/* current date label —— 在 marker 上方加粗 */}
      <text
        x={markerCx}
        y={markerTopY - 4}
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        className="fill-foreground font-bold"
        data-testid="visualize-timeline-current"
      >
        {formatYearMonth(currentDate)}
      </text>

      {/* 垂直 drop line：贯穿散点主区，止于 noPrice lane 顶部之前 */}
      {dropLineH > 0 && (
        <line
          x1={markerCx}
          y1={baselineY}
          x2={markerCx}
          y2={baselineY + dropLineH}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.3}
          strokeDasharray="2 3"
          className="text-foreground pointer-events-none"
        />
      )}

      {/* 透明 input 覆盖 axis 区，native a11y / 键盘 / 触屏 */}
      <foreignObject x={0} y={0} width={axisWidth} height={ribbonH}>
        <input
          type="range"
          min={0}
          max={len - 1}
          step={1}
          value={currentIdx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label={t('timeline.ariaSlider')}
          aria-valuemin={0}
          aria-valuemax={len - 1}
          aria-valuenow={currentIdx}
          aria-valuetext={formatYearMonth(currentDate)}
          style={{
            width: '100%',
            height: '100%',
            margin: 0,
            padding: 0,
            opacity: 0,
            cursor: 'pointer',
            display: 'block',
          }}
        />
      </foreignObject>

      {/* Play 按钮 —— 跟 axis 解耦，落在 view 算好的位置 */}
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
