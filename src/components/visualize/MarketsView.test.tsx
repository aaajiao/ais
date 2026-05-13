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
    // scope 到 markets svg，排除 Timeline 的 play button
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]'));
    // 3 sold editions → 3 dot buttons
    expect(dots.length).toBeGreaterThanOrEqual(3);
    for (const dot of dots) {
      expect(dot).toHaveAttribute('tabindex', '0');
      expect(dot).toHaveAttribute('aria-label');
    }
  });

  it('键盘 Enter 触发 navigate 到 /editions/{id}', () => {
    renderMarkets();
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]'));
    const firstDot = dots[0]! as HTMLElement;
    fireEvent.keyDown(firstDot, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/editions\/e[1-3]$/)
    );
  });

  it('键盘 Space 同样触发 navigate', () => {
    renderMarkets();
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]'));
    fireEvent.keyDown(dots[0]! as HTMLElement, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('点击散点 navigate 到 /editions/{id}', () => {
    renderMarkets();
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]'));
    fireEvent.click(dots[0]! as HTMLElement);
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
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]'));
    const dot = dots[0]! as HTMLElement;
    expect(dot).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseEnter(dot);
    expect(dot).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(dot);
    expect(dot).toHaveAttribute('aria-pressed', 'false');
  });

  it('SVG 使用 viewBox 响应式（无固定 width/height 属性）', () => {
    renderMarkets();
    // 用 aria-label scope 到主 svg（避免捕到 Timeline 内的 lucide icon svg）
    const svg = screen.getByRole('img', { name: /Markets/i });
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
    const svg = screen.getByRole('img', { name: /Markets/i });
    const dots = Array.from(svg.querySelectorAll('g[role="button"]')) as HTMLElement[];
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

  it('idle 态显示自己段下的 summary（交易数 + 货币种数，不借其他 view 的 key）', () => {
    renderMarkets();
    // 3 sold editions, 2 currencies (USD + CNY)
    expect(
      screen.getByText(/3 笔交易.*2 种货币|3 transactions.*2 currencies/i)
    ).toBeInTheDocument();
  });

  // ─── Time scrubber (M1) ───────────────────────────────────────────────────

  it('多 sale_date 数据 → 渲染 Timeline scrubber', () => {
    renderMarkets();
    expect(screen.getByTestId('visualize-timeline')).toBeInTheDocument();
    // 默认 cutoff = max date = '2024-06-01' → format slice 0..7 = '2024-06'
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2024-06');
  });

  it('单一 sale_date 数据 → 不渲染 Timeline', () => {
    const singleDate: VizEdition[] = [
      makeSale('e-only', 'AAJ-ONLY', 'USD', 5000, '2024-03-01'),
    ];
    renderWithClient(
      <MemoryRouter>
        <MarketsView artworks={[artwork]} editions={singleDate} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('visualize-timeline')).toBeNull();
  });

  it('默认 t = max → 所有散点 opacity 0.65（不被 dim）', () => {
    const { container } = renderMarkets();
    const circles = container.querySelectorAll('g[role="button"] > circle');
    expect(circles.length).toBeGreaterThanOrEqual(3);
    for (const c of circles) {
      expect(c.getAttribute('opacity')).toBe('0.65');
    }
  });

  it('拖动 scrubber 到中段 → 之后的散点 opacity=0.15，之前的保持 0.65', () => {
    renderMarkets();
    const slider = screen.getByRole('slider');
    // saleDates 升序：'2024-03-01', '2024-04-01', '2024-06-01' → idx 0=03-01
    fireEvent.change(slider, { target: { value: '0' } });

    const svg = screen.getByRole('img', { name: /Markets/i });
    const buttons = Array.from(svg.querySelectorAll('g[role="button"]')) as HTMLElement[];

    let dimCount = 0;
    let activeCount = 0;
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') ?? '';
      const circle = btn.querySelector('circle')!;
      const op = circle.getAttribute('opacity');
      if (label.includes('AAJ-2024-001')) {
        // sale_date='2024-03-01' = cutoff → 不 dim
        expect(op).toBe('0.65');
        activeCount++;
      } else {
        // 其余 sale_date > cutoff → dim
        expect(op).toBe('0.15');
        dimCount++;
      }
    }
    expect(activeCount).toBeGreaterThan(0);
    expect(dimCount).toBeGreaterThan(0);
  });
});
