import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import MarketsView from './MarketsView';
import type {
  VizArtwork,
  VizEdition,
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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const artwork: VizArtwork = {
  id: 'aw-1',
  title_en: 'Guard, I…',
  title_cn: '保安，我...',
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 1,
  is_unique: false,
  created_at: '2024-01-01T00:00:00Z',
};

function makeSale(
  id: string,
  inv: string | null,
  currency: 'USD' | 'EUR' | 'CNY' | 'GBP' | 'CHF' | 'HKD' | 'JPY',
  price: number,
  saleDate: string
): VizEdition {
  return {
    id,
    artwork_id: artwork.id,
    inventory_number: inv,
    edition_type: 'numbered',
    edition_number: 1,
    status: 'sold',
    location_id: null,
    sale_price: price,
    sale_currency: currency,
    sale_date: saleDate,
    buyer_name: 'collector',
    created_at: '2024-01-01T00:00:00Z',
  };
}

const editions: VizEdition[] = [
  makeSale('e1', 'AAJ-2024-001', 'USD', 5000, '2024-03-01'),
  makeSale('e2', 'AAJ-2024-002', 'USD', 8000, '2024-06-01'),
  makeSale('e3', 'AAJ-2024-003', 'CNY', 30000, '2024-04-01'),
];

function renderMarkets() {
  return renderWithClient(
    <MemoryRouter>
      <MarketsView artworks={[artwork]} editions={editions} />
    </MemoryRouter>
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MarketsView', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('每个散点以 <g role="button"> 渲染（键盘可达）', () => {
    renderMarkets();
    const dots = screen.getAllByRole('button');
    // 3 sold editions → 3 dot buttons
    expect(dots.length).toBeGreaterThanOrEqual(3);
    for (const dot of dots) {
      expect(dot).toHaveAttribute('tabindex', '0');
      expect(dot).toHaveAttribute('aria-label');
    }
  });

  it('键盘 Enter 触发 navigate 到 /editions/{id}', () => {
    renderMarkets();
    const dots = screen.getAllByRole('button');
    const firstDot = dots[0]!;
    fireEvent.keyDown(firstDot, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/editions\/e[1-3]$/)
    );
  });

  it('键盘 Space 同样触发 navigate', () => {
    renderMarkets();
    const dots = screen.getAllByRole('button');
    fireEvent.keyDown(dots[0]!, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('点击散点 navigate 到 /editions/{id}', () => {
    renderMarkets();
    const dots = screen.getAllByRole('button');
    fireEvent.click(dots[0]!);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/editions\/e[1-3]$/)
    );
  });

  it('默认 opacity 0.65，hover 升到 1.0（对齐 Strata）', () => {
    const { container } = renderMarkets();
    const circles = container.querySelectorAll('g[role="button"] > circle');
    expect(circles.length).toBeGreaterThanOrEqual(3);
    // 初始全部 0.65
    for (const c of circles) {
      expect(c.getAttribute('opacity')).toBe('0.65');
    }

    // hover 第一个
    const firstDot = container.querySelector('g[role="button"]')!;
    fireEvent.mouseEnter(firstDot);
    const firstCircle = firstDot.querySelector('circle')!;
    expect(firstCircle.getAttribute('opacity')).toBe('1');
  });

  it('hover 散点 aria-pressed 变 true，离开还原 false', () => {
    renderMarkets();
    const dots = screen.getAllByRole('button');
    const dot = dots[0]!;
    expect(dot).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseEnter(dot);
    expect(dot).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(dot);
    expect(dot).toHaveAttribute('aria-pressed', 'false');
  });

  it('SVG 使用 viewBox 响应式（无固定 width/height 属性）', () => {
    const { container } = renderMarkets();
    const svg = container.querySelector('svg')!;
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute('viewBox');
    // 固定 px 宽高已移除
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.getAttribute('class')).toContain('w-full');
  });

  it('货币标签带 <title> 让 screen reader 念出货币名', () => {
    const { container } = renderMarkets();
    const titles = container.querySelectorAll('text > title');
    // 至少 2 个货币 → 2 个 title
    expect(titles.length).toBeGreaterThanOrEqual(2);
    const titleTexts = Array.from(titles).map((t) => t.textContent ?? '');
    expect(titleTexts.some((t) => t.includes('USD'))).toBe(true);
    expect(titleTexts.some((t) => t.includes('CNY'))).toBe(true);
  });

  it('id 为空时不触发 navigate（防御）', () => {
    const editionsWithEmptyId: VizEdition[] = [
      makeSale('', 'AAJ-EMPTY', 'USD', 5000, '2024-03-01'),
      makeSale('e-valid', 'AAJ-OK', 'USD', 8000, '2024-06-01'),
    ];
    renderWithClient(
      <MemoryRouter>
        <MarketsView artworks={[artwork]} editions={editionsWithEmptyId} />
      </MemoryRouter>
    );
    const dots = screen.getAllByRole('button');
    // 找到 aria-label 含 AAJ-EMPTY 的那个
    const emptyDot = dots.find((d) =>
      (d.getAttribute('aria-label') ?? '').includes('AAJ-EMPTY')
    );
    expect(emptyDot).toBeTruthy();
    fireEvent.click(emptyDot!);
    expect(mockNavigate).not.toHaveBeenCalled();

    // 有效 id 仍可 navigate
    const validDot = dots.find((d) =>
      (d.getAttribute('aria-label') ?? '').includes('AAJ-OK')
    );
    fireEvent.click(validDot!);
    expect(mockNavigate).toHaveBeenCalledWith('/editions/e-valid');
  });

  it('空状态：没有 sold edition 时显示 empty 文案', () => {
    renderWithClient(
      <MemoryRouter>
        <MarketsView artworks={[artwork]} editions={[]} />
      </MemoryRouter>
    );
    // zh 文案 "暂无已售版本"
    expect(screen.getByText(/暂无已售版本|No sold editions/i)).toBeInTheDocument();
  });

  it('idleHint 使用自己段下的 key（不借 strata.tooltip.click）', () => {
    renderMarkets();
    // 当前无 hover → 显示 idleHint
    expect(
      screen.getByText(/悬停或聚焦圆点|Hover or focus a dot/i)
    ).toBeInTheDocument();
  });
});
