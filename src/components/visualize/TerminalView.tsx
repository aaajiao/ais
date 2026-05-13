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
  /** Phase 2: M3a — 跨视图选中的 artwork id；该作品的行加 background highlight + 左侧 border */
  selectedArtworkId?: string | null;
  /** 选中作品的 callback（Terminal 仍走 navigate 模式） */
  onArtworkSelect?: (artworkId: string | null) => void;
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
  selectedArtworkId = null,
  onArtworkSelect: _onArtworkSelect,
}: TerminalViewProps) {
  const { t } = useTranslation('visualize');
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  // selection 由 URL state 驱动；prop 占位
  void _onArtworkSelect;

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

  // 组标题（ASCII box-drawing）—— 拆成三段，装饰字符 aria-hidden
  // 装饰部分（╭─ ... ─╮）对 screen reader 无意义，read out 会变成 "line drawings light arc down and right" 等
  function renderGroupHeader(key: string, count: number) {
    const label = ` ${groupBy}: ${key} (${count}) `;
    const lineLen = Math.max(0, separator.length - label.length - 2);
    const leftDeco = '╭─';
    const rightDeco = DASH.repeat(lineLen) + '╮';
    const a11yLabel = `${groupBy}: ${key} (${count} items)`;
    return (
      <span
        role="heading"
        aria-level={3}
        aria-label={a11yLabel}
        className="text-muted-foreground"
      >
        <span aria-hidden="true">{leftDeco}</span>
        <span aria-hidden="true">{label}</span>
        <span aria-hidden="true">{rightDeco}</span>
      </span>
    );
  }

  function handleRowActivate(id: string) {
    navigate(`/editions/${id}`);
  }

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
        <pre
          // 紧凑字号：375px 屏先用 10px，>=640px 回到 xs(12px)。保留全部列。
          className="font-mono text-[10px] sm:text-xs leading-relaxed bg-muted/10 p-4 min-w-max"
        >
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
          <span className="text-muted-foreground" aria-hidden="true">{separator}</span>
          {'\n'}

          {/* 数据行 */}
          {groups.map((group, gi) => (
            <span key={group.key || `group-${gi}`}>
              {/* 分组标题（non-none） */}
              {groupBy !== 'none' && (
                <>
                  {'\n'}
                  {renderGroupHeader(group.key, group.rows.length)}
                  {'\n'}
                </>
              )}

              {group.rows.map((row, ri) => {
                // row.id 防御：DB schema NOT NULL，但用户提供数据若异常仍稳健回退到 array index
                const safeKey = row.id || `${group.key}-${ri}`;
                const isSold = row.status === 'sold' || row.status === 'gifted';
                const isSelected =
                  selectedArtworkId !== null &&
                  row.artworkId === selectedArtworkId;
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

                // a11y row label：把列名拼回去，方便 SR 读出"年份 2024，类型 Installation…"
                const ariaLabel = [
                  row.year ? `${t('terminal.header.year')} ${row.year}` : null,
                  row.type ? `${t('terminal.header.type')} ${row.type}` : null,
                  row.inventoryNumber
                    ? `${t('terminal.header.inv')} ${row.inventoryNumber}`
                    : null,
                  row.editionLabel
                    ? `${t('terminal.header.edition')} ${row.editionLabel}`
                    : null,
                  `${t('terminal.header.status')} ${row.status}`,
                  row.locationName
                    ? `${t('terminal.header.location')} ${row.locationName}`
                    : null,
                  row.priceLabel
                    ? `${t('terminal.header.price')} ${row.priceLabel}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ');

                // 用 span + role=button 而不是 <button>：
                // <button> 会带 user-agent padding/border/font/background，破坏 <pre> 等宽对齐
                // span + role=button + tabIndex=0 + onKeyDown 同样满足键盘可达
                // 注意：row.id 可能（极端情况下）为空，禁用点击
                const isActivatable = !!row.id;
                return (
                  <span
                    key={safeKey}
                    data-testid={isSelected ? `terminal-selected-row-${row.id}` : undefined}
                    data-selected={isSelected || undefined}
                    {...(isActivatable
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': ariaLabel,
                          onClick: () => handleRowActivate(row.id),
                          onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleRowActivate(row.id);
                            }
                          },
                        }
                      : {})}
                    className={[
                      'block',
                      isActivatable
                        ? 'cursor-pointer hover:bg-foreground/10 focus:bg-foreground/10 focus:outline-none focus-visible:outline-1 focus-visible:outline-foreground'
                        : '',
                      // Phase 2: selection highlight —— 左侧 1px border-foreground + 微 bg
                      // 借 box-shadow 而非 border-l：避免破坏 <pre> 等宽字符流（border 会
                      // 让该行宽度差 1px 跟旁边行错开）
                      isSelected
                        ? 'bg-foreground/10 shadow-[inset_2px_0_0_0_var(--foreground)]'
                        : '',
                      isSold ? 'text-foreground' : 'text-muted-foreground',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {rowText}
                  </span>
                );
              })}
            </span>
          ))}

          {/* stat 区块 */}
          {'\n'}
          <span className="text-muted-foreground" aria-hidden="true">{separator}</span>
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
