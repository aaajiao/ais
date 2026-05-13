import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { useTimelineScrubber } from './useTimelineScrubber';

/**
 * StrataTimelineRibbon — Strata 视图顶部的"年份地层"播头。
 *
 * 单一职责：在 yearRange 上拖一个 ▼ marker，配套 drop line 穿透整个 swimlane 区。
 * 视觉表达：
 *   - 年份 tick 本身就是 axis 的 ticks，间距均匀（colW × yearCount）
 *   - ▼ 居于 currentYear tick 上方
 *   - drop line 从 marker 底 → swimlane 底，stroke-dasharray="2 3" opacity=0.3
 *   - Play / Pause 按钮：foreignObject 内 HTML 按钮，纯 icon
 *   - 透明 range input 覆盖整条 ribbon 区，提供 native a11y + 键盘 + 触屏拖动
 *
 * 不接 URL state / view state —— playing / onPlayToggle 由 view 自己控（避免 URL 抖动）。
 *
 * 嵌入方式：view 把它作为 <g> 嵌入自己的 SVG 中（共享坐标系）。
 */

export interface StrataTimelineRibbonProps {
  /** 升序连续 year 数组（含空年份） */
  years: number[];
  /** 当前 cutoff year，必须在 years 内 */
  currentYear: number;
  onYearChange: (y: number) => void;
  /** 父 SVG 中 ribbon 的 x 起点（避开左侧 label 列） */
  xOffset: number;
  /** axis 区域宽度（= yearCount × colW），tick 在此宽度内均分 */
  axisWidth: number;
  /** Play 按钮 x（相对 ribbon <g>），需在 axis 之外预留空间 */
  playBtnX: number;
  /** ribbon 顶端在父 SVG 中的 y */
  yTop: number;
  /** ribbon 自身高度 */
  ribbonH: number;
  /** marker 下方虚线长度（= swimlane 总高度）；为 0 时不画 */
  dropLineH: number;
  /** 外部播放状态（view 控） */
  playing: boolean;
  onPlayToggle: () => void;
  /** play 自然结束时回调 */
  onPlayComplete?: () => void;
}

/** marker 三角尺寸 */
const MARKER_SIZE = 7;
/** Play 按钮 icon 容器尺寸 */
const PLAY_BTN_SIZE = 16;

export default function StrataTimelineRibbon(props: StrataTimelineRibbonProps) {
  const {
    years,
    currentYear,
    onYearChange,
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

  const { currentIdx, enabled, setIdx } = useTimelineScrubber<number>({
    values: years,
    current: currentYear,
    onChange: onYearChange,
    playing,
    onPlayComplete,
  });

  if (!enabled) return null;

  const len = years.length;
  /** 每个 tick 占据的逻辑宽度 —— tick 中心跟下方 year column 中心严格对齐 */
  const tickW = axisWidth / len;
  /** 把 index 转 ribbon 内 x（tick 中心） */
  const idxToX = (idx: number) => idx * tickW + tickW / 2;

  const baselineY = ribbonH - 6;
  const markerCx = idxToX(currentIdx);
  // ▼ 顶尖在 baseline，底两点向上
  const markerTopY = baselineY - MARKER_SIZE;

  /** 哪些 year 显示文字 label：第一个 / 最后一个 / 每 5 的倍数 / 当前 */
  const showLabelAt = (year: number, idx: number) =>
    idx === 0 || idx === len - 1 || year % 5 === 0 || idx === currentIdx;

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

      {/* ticks + year labels */}
      {years.map((year, idx) => {
        const x = idxToX(idx);
        const isCurrent = idx === currentIdx;
        return (
          <g key={year}>
            <line
              x1={x}
              y1={baselineY - 4}
              x2={x}
              y2={baselineY}
              stroke="currentColor"
              strokeWidth={1}
              opacity={isCurrent ? 0.9 : 0.5}
              className="text-foreground"
            />
            {showLabelAt(year, idx) && (
              <text
                x={x}
                y={baselineY - 8}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                className={isCurrent ? 'fill-foreground' : 'fill-muted-foreground'}
                opacity={isCurrent ? 1 : 0.7}
              >
                {String(year).slice(2)}
              </text>
            )}
          </g>
        );
      })}

      {/* ▼ marker —— 跟 axis tick 严格对齐 */}
      <polygon
        points={`${markerCx},${baselineY} ${markerCx - MARKER_SIZE / 2},${markerTopY} ${markerCx + MARKER_SIZE / 2},${markerTopY}`}
        className="fill-foreground"
      />
      {/* 当前 year label —— 在 marker 上方，加粗以与其他 tick 区分；
          data-testid 保留让 view 测试无需改动 */}
      <text
        x={markerCx}
        y={markerTopY - 4}
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        className="fill-foreground font-bold"
        data-testid="visualize-timeline-current"
      >
        {String(currentYear)}
      </text>

      {/* 垂直 drop line：从 marker 底（baseline）一直画到 swimlane 区底 */}
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

      {/* 透明 input 覆盖 axis 区，提供 native a11y / 键盘 ← → / 触屏 / drag。
          单独一个 foreignObject 让坐标系跟 SVG axis 严格匹配。 */}
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
          aria-valuetext={String(currentYear)}
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

      {/* Play 按钮：与 axis 解耦，落在 view 算好的 playBtnX 位置（一般 = axis 右侧 + gap） */}
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
