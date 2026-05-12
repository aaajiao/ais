import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  VizArtwork,
  VizEdition,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';
import {
  buildHistoryMonthBuckets,
  buildYearBuckets,
  tierForType,
  TIER_OPACITY,
  type TypeTier,
} from './strataUtils';

interface Props {
  artworks: VizArtwork[];
  editions: VizEdition[];
  history: VizHistory[];
}

// 几何常量
const BLOCK_W = 18;
const BLOCK_H = 8;
const BLOCK_GAP_X = 2;
const BLOCK_GAP_Y = 2;
const YEAR_GAP = 6;
const Y_AXIS_PAD = 32; // 顶部留给最高的栈
const X_AXIS_LABEL_H = 24;
const HISTORY_BAR_H = 60;
const HISTORY_GAP_H = 36;
const LEFT_PAD = 16;
const RIGHT_PAD = 16;
const TOP_PAD = 16;

export default function StrataView({ artworks, history }: Props) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [hoveredArtwork, setHoveredArtwork] = useState<VizArtwork | null>(null);

  const yearData = useMemo(() => buildYearBuckets(artworks), [artworks]);
  const historyMonths = useMemo(
    () => buildHistoryMonthBuckets(history),
    [history]
  );

  const { buckets, maxStack } = yearData;
  const yearCount = buckets.length;

  // 每年一列宽度（含间距）
  const colW = BLOCK_W + BLOCK_GAP_X * 2 + YEAR_GAP;
  const stratumW = colW * yearCount;
  const stratumH =
    maxStack * (BLOCK_H + BLOCK_GAP_Y) + Y_AXIS_PAD + X_AXIS_LABEL_H;

  const totalW = LEFT_PAD + stratumW + RIGHT_PAD;
  const totalH = TOP_PAD + HISTORY_BAR_H + HISTORY_GAP_H + stratumH;

  // 历史轴 baseline（顶端）
  const historyBaseY = TOP_PAD + HISTORY_BAR_H;
  // 地层顶端
  const stratumTopY = historyBaseY + HISTORY_GAP_H;
  // 地层 baseline（年份标签上方）
  const stratumBaseY = stratumTopY + stratumH - X_AXIS_LABEL_H;

  if (yearCount === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-bold uppercase tracking-wider">
          {t('strata.heading')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t('strata.description')}
        </p>
      </header>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">
          {t('strata.legend.title')}
        </span>
        {(['Installation', 'Video', 'Digital printing', 'other'] as TypeTier[]).map(
          (tier) => (
            <span key={tier} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 bg-foreground"
                style={{ opacity: TIER_OPACITY[tier] }}
              />
              <span className="text-muted-foreground">
                {tier === 'other' ? t('strata.legend.more') : tier}
              </span>
            </span>
          )
        )}
      </div>

      <div className="relative overflow-x-auto border border-border">
        <svg
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          className="block"
          role="img"
          aria-label={t('strata.heading')}
        >
          {/* 历史录入轴 */}
          {historyMonths.entries.map(([month, count], i) => {
            const x = LEFT_PAD + i * 28;
            const h = (count / historyMonths.max) * (HISTORY_BAR_H - 18);
            return (
              <g key={month}>
                <rect
                  x={x}
                  y={historyBaseY - h}
                  width={22}
                  height={h}
                  className="fill-foreground"
                  opacity={0.6}
                />
                <text
                  x={x + 11}
                  y={historyBaseY + 12}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {month}
                </text>
                <text
                  x={x + 11}
                  y={historyBaseY - h - 4}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {count}
                </text>
              </g>
            );
          })}
          {historyMonths.entries.length > 0 && (
            <text
              x={LEFT_PAD}
              y={TOP_PAD + 10}
              className="fill-muted-foreground"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
            >
              {t('strata.axisHistory')}
            </text>
          )}

          {/* 断层连接线：从最早历史月份连到地层最右（最近年份） */}
          {historyMonths.entries.length > 0 && yearCount > 0 && (
            <line
              x1={LEFT_PAD + 11}
              y1={historyBaseY + 2}
              x2={LEFT_PAD + stratumW - colW / 2}
              y2={stratumBaseY - 4}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

          {/* 地层 */}
          {buckets.map((bucket, colIdx) => {
            const xCol = LEFT_PAD + colIdx * colW + BLOCK_GAP_X;
            const isHovered = hoveredYear === bucket.year;
            const showYearLabel =
              bucket.year % 5 === 0 ||
              colIdx === 0 ||
              colIdx === yearCount - 1 ||
              isHovered;
            return (
              <g
                key={bucket.year}
                onMouseEnter={() => setHoveredYear(bucket.year)}
                onMouseLeave={() => setHoveredYear(null)}
              >
                {/* 列背景（hover 时弱高亮） */}
                <rect
                  x={xCol - BLOCK_GAP_X}
                  y={stratumTopY}
                  width={colW}
                  height={stratumH - X_AXIS_LABEL_H}
                  className={
                    isHovered ? 'fill-foreground/5' : 'fill-transparent'
                  }
                />
                {bucket.artworks.map((a, stackIdx) => {
                  const tier = tierForType(a.type);
                  const y =
                    stratumBaseY - (stackIdx + 1) * (BLOCK_H + BLOCK_GAP_Y);
                  return (
                    <rect
                      key={a.id}
                      x={xCol}
                      y={y}
                      width={BLOCK_W}
                      height={BLOCK_H}
                      className="fill-foreground cursor-pointer"
                      opacity={TIER_OPACITY[tier]}
                      onMouseEnter={() => setHoveredArtwork(a)}
                      onMouseLeave={() => setHoveredArtwork(null)}
                      onClick={() => navigate(`/artworks/${a.id}`)}
                    />
                  );
                })}
                {showYearLabel && (
                  <text
                    x={xCol + BLOCK_W / 2}
                    y={stratumBaseY + 14}
                    textAnchor="middle"
                    className={
                      isHovered ? 'fill-foreground' : 'fill-muted-foreground'
                    }
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                  >
                    {String(bucket.year).slice(2)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 断层注释 */}
      <p className="text-xs text-muted-foreground max-w-2xl italic">
        {t('strata.gapNote')}
      </p>

      {/* hover tooltip：固定在画布下方信息条，避免遮挡 SVG */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {hoveredArtwork ? (
          <>
            <div className="font-bold">
              {hoveredArtwork.title_en || hoveredArtwork.title_cn || hoveredArtwork.id}
            </div>
            <div className="text-muted-foreground">
              {hoveredArtwork.year ?? '—'} · {hoveredArtwork.type ?? '—'}
            </div>
            <div className="text-muted-foreground">
              {t('strata.tooltip.click')}
            </div>
          </>
        ) : hoveredYear !== null ? (
          <>
            <div className="font-bold">
              {t('strata.tooltip.yearLabel', { year: hoveredYear })}
            </div>
            <div className="text-muted-foreground">
              {t('strata.tooltip.count', {
                count:
                  buckets.find((b) => b.year === hoveredYear)?.artworks.length ??
                  0,
              })}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            {t('strata.tooltip.click')}
          </div>
        )}
      </div>
    </div>
  );
}
