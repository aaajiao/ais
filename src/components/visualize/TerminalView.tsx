import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  VizArtwork,
  VizEdition,
  VizLocation,
} from '@/hooks/queries/useVisualizationData';
import {
  buildRows,
  groupRows,
  computeStats,
  type GroupBy,
} from './terminalUtils';

export interface TerminalViewProps {
  artworks: VizArtwork[];
  editions: VizEdition[];
  locations: VizLocation[];
  fetchedAt: string;
}

// ──────────────────────────────────────────────
// 列宽（字符数）——维持在 pre 内等宽对齐
// ──────────────────────────────────────────────
const COL = {
  year: 6,
  type: 20,
  inv: 14,
  edition: 8,
  status: 15,
  location: 32,
  price: 16,
} as const;

const DASH = '─';

/** 截断 + padEnd，保证等宽（ASCII 友好，CJK 会偏宽，但 archive 数据全是英文） */
function col(value: string | null | undefined, width: number, align: 'left' | 'right' = 'left'): string {
  const s = (value ?? DASH).slice(0, width);
  return align === 'right' ? s.padStart(width) : s.padEnd(width);
}

const GROUP_BY_OPTIONS: GroupBy[] = ['none', 'status', 'year', 'location'];

export default function TerminalView({
  artworks,
  editions,
  locations,
  fetchedAt,
}: TerminalViewProps) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const rows = useMemo(
    () => buildRows(artworks, editions, locations),
    [artworks, editions, locations]
  );

  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);

  const stats = useMemo(
    () => computeStats(rows, artworks.length),
    [rows, artworks.length]
  );

  // 格式化 fetchedAt 为 UTC 字符串
  const fetchedAtFormatted = useMemo(() => {
    try {
      const d = new Date(fetchedAt);
      return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    } catch {
      return fetchedAt;
    }
  }, [fetchedAt]);

  // 今天日期（UTC）
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  // 列标题分隔线
  const separator =
    DASH.repeat(COL.year) +
    '  ' +
    DASH.repeat(COL.type) +
    '  ' +
    DASH.repeat(COL.inv) +
    '  ' +
    DASH.repeat(COL.edition) +
    '  ' +
    DASH.repeat(COL.status) +
    '  ' +
    DASH.repeat(COL.location) +
    '  ' +
    DASH.repeat(COL.price);

  // 列标题行
  const headerLine =
    col(t('terminal.header.year'), COL.year) +
    '  ' +
    col(t('terminal.header.type'), COL.type) +
    '  ' +
    col(t('terminal.header.inv'), COL.inv) +
    '  ' +
    col(t('terminal.header.edition'), COL.edition) +
    '  ' +
    col(t('terminal.header.status'), COL.status) +
    '  ' +
    col(t('terminal.header.location'), COL.location) +
    '  ' +
    col(t('terminal.header.price'), COL.price);

  // 组标题（ASCII box-drawing）
  const groupHeader = (key: string, count: number) => {
    const label = ` ${groupBy}: ${key} (${count}) `;
    const lineLen = Math.max(0, separator.length - label.length - 2);
    return `╭─${label}${DASH.repeat(lineLen)}╮`;
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-bold uppercase tracking-wider">
          {t('terminal.heading')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t('terminal.description')}
        </p>
      </header>

      {/* group by 切换 chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">
          {t('terminal.groupBy.label')}
        </span>
        {GROUP_BY_OPTIONS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroupBy(g)}
            className={[
              'px-2 py-0.5 border font-mono transition-colors',
              groupBy === g
                ? 'border-foreground text-foreground bg-foreground/10'
                : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground',
            ].join(' ')}
          >
            {t(`terminal.groupBy.${g}`)}
          </button>
        ))}
      </div>

      {/* 主体终端输出 */}
      <div className="border border-border overflow-x-auto">
        <pre className="font-mono text-xs leading-relaxed bg-muted/10 p-4 min-w-max">
          {/* prompt 行 */}
          <span className="text-muted-foreground font-bold">{'$ '}</span>
          <span className="font-bold">{t('terminal.manifesto')}</span>
          {'\n'}
          <span className="text-muted-foreground">
            {'# aaajiao archive · '}
            {todayStr}
            {' · '}
            {stats.editionsTotal}
            {' rows'}
          </span>
          {'\n\n'}

          {/* 列标题 */}
          <span className="text-foreground font-bold uppercase">{headerLine}</span>
          {'\n'}
          <span className="text-muted-foreground">{separator}</span>
          {'\n'}

          {/* 数据行 */}
          {groups.map((group) => (
            <span key={group.key}>
              {/* 分组标题（non-none） */}
              {groupBy !== 'none' && (
                <>
                  {'\n'}
                  <span className="text-muted-foreground">{groupHeader(group.key, group.rows.length)}</span>
                  {'\n'}
                </>
              )}

              {group.rows.map((row) => {
                const isHovered = hoveredId === row.id;
                const isSold = row.status === 'sold' || row.status === 'gifted';
                const rowText =
                  col(row.year, COL.year) +
                  '  ' +
                  col(row.type, COL.type) +
                  '  ' +
                  col(row.inventoryNumber, COL.inv) +
                  '  ' +
                  col(row.editionLabel, COL.edition) +
                  '  ' +
                  col(row.status, COL.status) +
                  '  ' +
                  col(row.locationName, COL.location) +
                  '  ' +
                  col(row.priceLabel, COL.price, 'right');

                return (
                  <span
                    key={row.id}
                    className={[
                      'block cursor-pointer',
                      isHovered ? 'bg-foreground/10' : '',
                      isSold ? 'text-foreground' : 'text-muted-foreground',
                    ].join(' ')}
                    onClick={() => navigate(`/editions/${row.id}`)}
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {rowText}
                  </span>
                );
              })}
            </span>
          ))}

          {/* stat 区块 */}
          {'\n'}
          <span className="text-muted-foreground">{separator}</span>
          {'\n\n'}
          <span className="text-muted-foreground font-bold">{'$ '}</span>
          <span className="font-bold">{'archive stat'}</span>
          {'\n'}
          <span className="text-muted-foreground">
            {'Artworks '}
            <span className="text-foreground">{stats.artworksWithEditions}</span>
            {' / '}
            <span className="text-foreground">{stats.artworksTotal}</span>
            {' have editions'}
          </span>
          {'\n'}
          <span className="text-muted-foreground">
            {'Editions '}
            <span className="text-foreground">{stats.editionsTotal}</span>
          </span>
          {'\n'}
          <span className="text-muted-foreground">
            {'Markets '}
            <span className="text-foreground">{stats.marketsLine}</span>
          </span>
          {'\n'}
          <span className="text-muted-foreground">
            {'Fetched at '}
            <span className="text-foreground">{fetchedAtFormatted}</span>
          </span>
          {'\n'}
          <span className="text-muted-foreground font-bold">{'$ _'}</span>
        </pre>
      </div>

      {/* 底部注释 */}
      <p className="text-xs text-muted-foreground italic">
        {t('terminal.description')}
      </p>
    </div>
  );
}
