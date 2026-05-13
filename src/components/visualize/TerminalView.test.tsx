import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import TerminalView from './TerminalView';
import type {
  VizArtwork,
  VizEdition,
  VizLocation,
} from '@/hooks/queries/useVisualizationData';

// Mock react-router-dom useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── Test fixtures ────────────────────────────────────────────────────────────

const fakeArtwork: VizArtwork = {
  id: 'artwork-1',
  title_en: 'Test Artwork',
  title_cn: '测试作品',
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 1,
  is_unique: false,
  created_at: '2024-01-01T00:00:00Z',
};

const fakeArtwork2: VizArtwork = {
  id: 'artwork-2',
  title_en: 'Another',
  title_cn: '另一作品',
  year: '2023',
  type: 'Video',
  thumbnail_url: null,
  edition_total: 2,
  ap_total: 0,
  is_unique: false,
  created_at: '2023-01-01T00:00:00Z',
};

const fakeLocation: VizLocation = {
  id: 'loc-1',
  name: 'Studio Shanghai',
  type: 'studio',
  city: 'Shanghai',
  country: 'China',
};

const fakeEditions: VizEdition[] = [
  {
    id: 'edition-1',
    artwork_id: 'artwork-1',
    inventory_number: 'AAJ-2024-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'sold',
    location_id: 'loc-1',
    sale_price: 5000,
    sale_currency: 'USD',
    sale_date: '2024-06-01',
    buyer_name: 'Buyer A',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'edition-2',
    artwork_id: 'artwork-2',
    inventory_number: 'AAJ-2023-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    location_id: 'loc-1',
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2023-01-01T00:00:00Z',
  },
];

function renderTerminal(
  overrides: Partial<{
    artworks: VizArtwork[];
    editions: VizEdition[];
    locations: VizLocation[];
    fetchedAt: string;
    selectedArtworkId: string | null;
  }> = {}
) {
  const props = {
    artworks: [fakeArtwork, fakeArtwork2],
    editions: fakeEditions,
    locations: [fakeLocation],
    fetchedAt: '2026-05-12T00:00:00Z',
    ...overrides,
  };
  return renderWithClient(
    <MemoryRouter>
      <TerminalView {...props} />
    </MemoryRouter>
  );
}

describe('TerminalView a11y & responsive', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('每个数据行用 role=button 渲染并可用键盘聚焦', () => {
    renderTerminal();

    // 找到 AAJ-2024-001 所在行（role=button）
    const row = screen.getByRole('button', { name: /AAJ-2024-001/ });
    expect(row).toBeInTheDocument();
    expect(row.tagName).toBe('SPAN'); // 用 span + role 保留 <pre> 等宽布局
    expect(row).toHaveAttribute('tabIndex', '0');
  });

  it('点击数据行 → navigate 到 /editions/{id}', () => {
    renderTerminal();

    const row = screen.getByRole('button', { name: /AAJ-2024-001/ });
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/editions/edition-1');
  });

  it('键盘 Enter 触发 navigate', () => {
    renderTerminal();

    const row = screen.getByRole('button', { name: /AAJ-2024-001/ });
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/editions/edition-1');
  });

  it('键盘 Space 触发 navigate', () => {
    renderTerminal();

    const row = screen.getByRole('button', { name: /AAJ-2024-001/ });
    fireEvent.keyDown(row, { key: ' ' });

    expect(mockNavigate).toHaveBeenCalledWith('/editions/edition-1');
  });

  it('其他按键不触发 navigate', () => {
    renderTerminal();

    const row = screen.getByRole('button', { name: /AAJ-2024-001/ });
    fireEvent.keyDown(row, { key: 'Tab' });
    fireEvent.keyDown(row, { key: 'a' });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('分组标题用 heading role 且装饰字符 aria-hidden', () => {
    renderTerminal();

    // 切到 by status —— 用精确匹配避免匹中数据行 aria-label 里的 "Status"
    const statusChip = screen.getByRole('button', { name: /^(按状态|Status)$/ });
    fireEvent.click(statusChip);

    // 找出 heading 节点（aria-label 是 "status: sold (1 items)" 等）
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.length).toBeGreaterThan(0);

    // 至少有一个 aria-label 含 "items"（人类可读形式）
    const itemsHeadings = headings.filter((h) =>
      h.getAttribute('aria-label')?.includes('items')
    );
    expect(itemsHeadings.length).toBeGreaterThan(0);

    // 装饰字符 ╭─ / ╮ 应被 aria-hidden 包裹
    const deco = itemsHeadings[0].querySelectorAll('[aria-hidden="true"]');
    expect(deco.length).toBeGreaterThan(0);
  });

  it('紧凑模式：<pre> 在小屏使用 text-[10px]，sm 及以上回到 text-xs', () => {
    const { container } = renderTerminal();

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    // Tailwind className 字符串包含两段
    expect(pre?.className).toContain('text-[10px]');
    expect(pre?.className).toContain('sm:text-xs');
  });

  it('row.id 为空时不渲染为 button（防御）', () => {
    const brokenEdition: VizEdition = {
      ...fakeEditions[0],
      id: '',
      inventory_number: 'BROKEN-001',
    };
    renderTerminal({ editions: [brokenEdition] });

    // 不存在 role=button 行命中 BROKEN-001
    expect(
      screen.queryByRole('button', { name: /BROKEN-001/ })
    ).toBeNull();
  });

  it('separator 分隔线（连续 ─）对 SR 隐藏', () => {
    const { container } = renderTerminal();

    // 找 aria-hidden 的 separator span
    const hiddenSpans = container.querySelectorAll(
      'pre span[aria-hidden="true"]'
    );
    // 至少 2 条 separator 线 + 分组装饰（none 时无组装饰，仅 2 separator）
    expect(hiddenSpans.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Phase 2: M3a selection ─────────────────────────────────────────────

  it('selectedArtworkId 设置时该 artwork 对应行渲染 selection highlight (data-selected + testid)', () => {
    const { container } = renderTerminal({ selectedArtworkId: 'artwork-1' });
    // edition-1 属于 artwork-1
    expect(
      container.querySelector('[data-testid="terminal-selected-row-edition-1"]')
    ).not.toBeNull();
    // edition-2 属于 artwork-2，不被高亮
    expect(
      container.querySelector('[data-testid="terminal-selected-row-edition-2"]')
    ).toBeNull();
  });

  it('selectedArtworkId 为 null 时不渲染任何 selection highlight', () => {
    const { container } = renderTerminal({ selectedArtworkId: null });
    expect(
      container.querySelector('[data-testid^="terminal-selected-row-"]')
    ).toBeNull();
  });
});
