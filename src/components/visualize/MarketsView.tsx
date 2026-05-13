import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { VizArtwork, VizEdition } from '@/hooks/queries/useVisualizationData';
import {
  groupEditionsByCurrency,
  computeCurrencyStats,
  priceToRadius,
  priceToY,
} from './marketsUtils';

export interface MarketsViewProps {
  artworks: VizArtwork[];
  editions: VizEdition[];
}

// 几何常量（SVG 内部坐标系，外层用 viewBox + className="w-full" 响应式缩放）
const PANEL_H = 360;
const COL_MIN_W = 120;
const LEFT_PAD = 16;
const RIGHT_PAD = 16;
const COL_PAD_X = 24;      // 每列内部水平内边距（圆点不贴边）
const HEADER_H = 32;       // 货币代码标签高度
const STAT_H = 56;         // 底部 stat 行高度
const TOP_PAD = 8;

const TOTAL_H = TOP_PAD + HEADER_H + PANEL_H + STAT_H;

// hover opacity 与 Strata 对齐（locked design decision）：默认 0.65，hover 升 1.0
const DOT_OPACITY_DEFAULT = 0.65;
const DOT_OPACITY_HOVER = 1.0;

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

export default function MarketsView({ artworks, editions }: MarketsViewProps) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [hoveredEdition, setHoveredEdition] = useState<VizEdition | null>(null);

  // 作品 id → 作品
  const artworkMap = useMemo(() => {
    const m = new Map<string, VizArtwork>();
    for (const a of artworks) m.set(a.id, a);
    return m;
  }, [artworks]);

  const groups = useMemo(() => groupEditionsByCurrency(editions), [editions]);

  // 全局日期范围（所有货币共用，y 轴时间线一致）
  const dateRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const { sales } of groups) {
      for (const ed of sales) {
        const raw = ed.sale_date ?? ed.created_at;
        if (!raw) continue;
        const ts = new Date(raw).getTime();
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      }
    }
    if (!Number.isFinite(min)) {
      const fallback = new Date(0);
      return { min: fallback, max: fallback };
    }
    return { min: new Date(min), max: new Date(max) };
  }, [groups]);

  const currencyCount = groups.length;

  if (currencyCount === 0) {
    return (
      <div className="py-24 text-center text-muted-foreground text-sm">
        {t('markets.empty')}
      </div>
    );
  }

  // 列宽自适应，不足 COL_MIN_W 出现水平滚动
  const colW = Math.max(
    COL_MIN_W,
    Math.floor((800 - LEFT_PAD - RIGHT_PAD) / currencyCount)
  );
  const totalW = LEFT_PAD + colW * currencyCount + RIGHT_PAD;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-bold uppercase tracking-wider">
            {t('markets.heading')}
          </h2>
          <span className="text-xs text-muted-foreground shrink-0">
            {t('markets.currenciesAvailable', { count: currencyCount })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t('markets.description')}
        </p>
      </header>

      <div className="relative overflow-x-auto border border-border">
        <svg
          viewBox={`0 0 ${totalW} ${TOTAL_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full"
          role="img"
          aria-label={t('markets.heading')}
        >
          {groups.map(({ currency, sales }, colIdx) => {
            const stats = computeCurrencyStats(sales);
            const xColLeft = LEFT_PAD + colIdx * colW;
            const xCenter = xColLeft + colW / 2;
            const panelTop = TOP_PAD + HEADER_H;
            const panelBottom = panelTop + PANEL_H;

            // 每列独立 scale（见 marketsUtils.ts 注释说明原因）
            const colMin = stats.min;
            const colMax = stats.max;

            return (
              <g key={currency}>
                {/* 列分隔线 */}
                {colIdx > 0 && (
                  <line
                    x1={xColLeft}
                    y1={TOP_PAD}
                    x2={xColLeft}
                    y2={TOTAL_H - 4}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                )}

                {/* 货币代码标签（<title> 让 screen reader 念出货币名） */}
                <text
                  x={xCenter}
                  y={TOP_PAD + HEADER_H - 8}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="0.1em"
                  aria-label={t('markets.currencyLabel', { currency })}
                >
                  <title>{t('markets.currencyLabel', { currency })}</title>
                  {currency}
                </text>

                {/* 散点：每个圆是可键盘聚焦的 button，Enter / Space 触发 navigate */}
                {sales.map((ed) => {
                  const price = Number(ed.sale_price);
                  const r = priceToRadius(price, colMin, colMax);
                  const rawY = priceToY(ed.sale_date, ed, dateRange, PANEL_H);
                  // 将 y 限制在 [r, PANEL_H - r]，避免圆出界
                  const cy = panelTop + Math.max(r, Math.min(PANEL_H - r, rawY));
                  // 散点 x 在列内随机抖动，避免价格相近时重叠
                  const jitter = stableJitter(ed.id, colW - COL_PAD_X * 2 - r * 2);
                  const cx = xColLeft + COL_PAD_X + r + jitter;

                  const isHovered = hoveredEdition?.id === ed.id;
                  const artwork = artworkMap.get(ed.artwork_id);
                  const dotLabel = t('markets.dotLabel', {
                    inv: ed.inventory_number ?? '—',
                    title:
                      artwork?.title_en ||
                      artwork?.title_cn ||
                      ed.artwork_id,
                    price: formatPrice(price, currency),
                  });

                  return (
                    <g
                      key={ed.id}
                      role="button"
                      tabIndex={0}
                      aria-label={dotLabel}
                      aria-pressed={isHovered}
                      data-testid="markets-dot"
                      className="cursor-pointer outline-none focus-visible:[&>circle]:opacity-100"
                      onMouseEnter={() => setHoveredEdition(ed)}
                      onMouseLeave={() => setHoveredEdition(null)}
                      onFocus={() => setHoveredEdition(ed)}
                      onBlur={() => setHoveredEdition(null)}
                      onClick={() => {
                        if (!ed.id) return;
                        navigate(`/editions/${ed.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!ed.id) return;
                          navigate(`/editions/${ed.id}`);
                        }
                      }}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        className="fill-foreground transition-opacity hover:opacity-100"
                        opacity={
                          isHovered ? DOT_OPACITY_HOVER : DOT_OPACITY_DEFAULT
                        }
                      />
                    </g>
                  );
                })}

                {/* 底部 stat 行 */}
                <g>
                  <text
                    x={xCenter}
                    y={panelBottom + 16}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                  >
                    {t('markets.stat.count')} {stats.count}
                  </text>
                  <text
                    x={xCenter}
                    y={panelBottom + 28}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                  >
                    {t('markets.stat.median')} {formatPrice(stats.median, currency)}
                  </text>
                  <text
                    x={xCenter}
                    y={panelBottom + 40}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                  >
                    {t('markets.stat.sum')} {formatPrice(stats.sum, currency)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* hover tooltip：固定在画布下方，避免遮挡 SVG */}
      <div className="min-h-[3.5rem] border-t border-border pt-3 text-xs font-mono space-y-0.5">
        {hoveredEdition ? (
          (() => {
            const artwork = artworkMap.get(hoveredEdition.artwork_id);
            const price = Number(hoveredEdition.sale_price);
            const currency = hoveredEdition.sale_currency ?? '';
            return (
              <>
                <div className="font-bold">
                  {hoveredEdition.inventory_number ?? '—'}
                  {artwork
                    ? ` · ${artwork.title_en ?? artwork.title_cn ?? artwork.id}`
                    : ''}
                </div>
                <div className="text-muted-foreground">
                  {formatPrice(price, currency)}
                  {' · '}
                  {hoveredEdition.buyer_name ?? t('markets.tooltip.noBuyer')}
                </div>
                <div className="text-muted-foreground">
                  {hoveredEdition.sale_date
                    ? new Date(hoveredEdition.sale_date).toLocaleDateString()
                    : t('markets.tooltip.noDate')}
                </div>
              </>
            );
          })()
        ) : (
          <div className="text-muted-foreground">
            {t('markets.summary.overview', {
              sales: groups.reduce((s, g) => s + g.sales.length, 0),
              currencies: currencyCount,
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 基于 id 字符串生成稳定的伪随机抖动量（0..range），避免每次渲染闪跳。
function stableJitter(id: string, range: number): number {
  if (range <= 0) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  return ((h >>> 0) % Math.ceil(range)) / Math.ceil(range) * range;
}
