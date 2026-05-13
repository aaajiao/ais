import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import StrataView from './StrataView';
import type {
  VizArtwork,
  VizHistory,
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

const installation2024: VizArtwork = {
  id: 'aw-1',
  title_en: 'Guard, I…',
  title_cn: '保安，我...',
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 0,
  is_unique: false,
  created_at: '2024-01-01T00:00:00Z',
};

const installation2024Second: VizArtwork = {
  id: 'aw-2',
  title_en: 'Quiet, Inside',
  title_cn: '',
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 2,
  ap_total: 0,
  is_unique: false,
  created_at: '2024-02-01T00:00:00Z',
};

const video2023: VizArtwork = {
  id: 'aw-3',
  title_en: '',
  title_cn: '末日媒体',
  year: '2023',
  type: 'Video',
  thumbnail_url: null,
  edition_total: 1,
  ap_total: 0,
  is_unique: false,
  created_at: '2023-01-01T00:00:00Z',
};

const sampleArtworks: VizArtwork[] = [
  installation2024,
  installation2024Second,
  video2023,
];

const sampleHistory: VizHistory[] = [
  {
    id: 'h1',
    edition_id: 'e-1',
    action: 'created',
    from_status: null,
    to_status: 'in_production',
    from_location: null,
    to_location: null,
    created_at: '2024-01-15T00:00:00Z',
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderStrata(
  overrides: Partial<{
    artworks: VizArtwork[];
    history: VizHistory[];
  }> = {}
) {
  const props = {
    artworks: sampleArtworks,
    history: sampleHistory,
    ...overrides,
  };
  return renderWithClient(
    <MemoryRouter>
      <StrataView {...props} />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StrataView', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('每个方块渲染为 role="button" 包裹 <rect>', () => {
    renderStrata();

    // 3 作品 → 3 个 block-button（每个 block 包一层 <g>）
    // 用 SVG 容器作为 scope，排除 Timeline 的 play button
    const svg = screen.getByRole('img', { name: /Strata/i });
    const blockButtons = svg.querySelectorAll('g[role="button"]');
    expect(blockButtons.length).toBe(3);
    // 每个 button 内部应含 <rect>
    for (const btn of Array.from(blockButtons)) {
      expect(btn.querySelector('rect')).not.toBeNull();
    }
  });

  it('方块 aria-label 包含 type / year / 标题', () => {
    renderStrata();

    // Installation · 2024 · Guard, I…
    expect(
      screen.getByRole('button', {
        name: /Installation.*2024.*Guard/i,
      })
    ).toBeInTheDocument();

    // title_en 为空时回落 title_cn —— Video · 2023 · 末日媒体
    expect(
      screen.getByRole('button', {
        name: /Video.*2023.*末日媒体/,
      })
    ).toBeInTheDocument();
  });

  it('点击方块 → navigate 到 /artworks/{id}', () => {
    renderStrata();

    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.click(block);

    expect(mockNavigate).toHaveBeenCalledWith('/artworks/aw-1');
  });

  it('键盘 Enter 触发 navigate', () => {
    renderStrata();

    const block = screen.getByRole('button', {
      name: /Video.*2023.*末日媒体/,
    });
    fireEvent.keyDown(block, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/artworks/aw-3');
  });

  it('键盘 Space 触发 navigate', () => {
    renderStrata();

    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.keyDown(block, { key: ' ' });

    expect(mockNavigate).toHaveBeenCalledWith('/artworks/aw-1');
  });

  it('键盘其它键不触发 navigate', () => {
    renderStrata();

    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.keyDown(block, { key: 'Tab' });
    fireEvent.keyDown(block, { key: 'a' });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('方块 tabIndex=0，键盘可达', () => {
    renderStrata();

    // scope 到 strata svg 内的 block-button，避免捕到 Timeline 的 play button
    const svg = screen.getByRole('img', { name: /Strata/i });
    const blockButtons = svg.querySelectorAll('g[role="button"]');
    expect(blockButtons.length).toBeGreaterThan(0);
    for (const btn of Array.from(blockButtons)) {
      expect(btn).toHaveAttribute('tabindex', '0');
    }
  });

  it('id 缺失（null/undefined）的方块 → 标 aria-disabled，不触发 navigate', () => {
    // 故意伪造一个 id 为空的 artwork —— 模拟 DB row 出现意外
    const brokenArtwork = {
      ...installation2024,
      id: '' as unknown as string,
    };
    renderStrata({ artworks: [brokenArtwork] });

    const svg = screen.getByRole('img', { name: /Strata/i });
    const blockButtons = Array.from(svg.querySelectorAll('g[role="button"]'));
    expect(blockButtons.length).toBe(1);
    const btn = blockButtons[0] as HTMLElement;
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // tabIndex 应被设为 -1，避免 focus 到坏方块
    expect(btn).toHaveAttribute('tabindex', '-1');

    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('SVG 用 viewBox 响应式渲染（不硬编码 width=800）', () => {
    renderStrata();

    // 用 aria-label scope 到主 svg（避免捕到 Timeline 内的 lucide icon svg）
    const svg = screen.getByRole('img', { name: /Strata/i });
    // viewBox 必须存在
    expect(svg.getAttribute('viewBox')).toBeTruthy();
    // 不应 hard-code 数字 width 属性；应使用 className w-full
    const widthAttr = svg.getAttribute('width');
    expect(widthAttr === null || widthAttr === '100%').toBe(true);
    // className 应包含 w-full
    expect(svg.getAttribute('class')).toMatch(/w-full/);
  });

  it('hover 方块 → 底部 tooltip 显示作品信息', () => {
    renderStrata();

    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.mouseEnter(block);

    // tooltip 区显示 title_en
    expect(screen.getByText('Guard, I…')).toBeInTheDocument();
  });

  it('空数据 → 渲染 empty 状态', () => {
    renderStrata({ artworks: [] });
    expect(screen.getByText(/暂无数据可视化|No data/i)).toBeInTheDocument();
  });

  // ─── Time scrubber (M1) ───────────────────────────────────────────────────

  it('多年份数据 → 渲染 Timeline scrubber', () => {
    renderStrata();
    expect(screen.getByTestId('visualize-timeline')).toBeInTheDocument();
    // 默认 cutoff = max year = 2024
    expect(screen.getByTestId('visualize-timeline-current').textContent).toBe('2024');
  });

  it('单一年份数据 → 不渲染 Timeline', () => {
    renderStrata({
      artworks: [
        installation2024,
        installation2024Second,
      ],
    });
    expect(screen.queryByTestId('visualize-timeline')).toBeNull();
  });

  it('默认 t = max → 所有方块 opacity 不被 dim（>= 0.5）', () => {
    renderStrata();
    const svg = screen.getByRole('img', { name: /Strata/i });
    const rects = Array.from(svg.querySelectorAll('g[role="button"] > rect'));
    expect(rects.length).toBeGreaterThan(0);
    // 默认 BLOCK_DEFAULT_CLS = opacity-[0.65] 不是 future
    for (const r of rects) {
      const cls = r.getAttribute('class') ?? '';
      // 不应出现 future-dim 的 opacity-[0.15]
      expect(cls).not.toMatch(/opacity-\[0\.15\]/);
    }
  });

  it('拖动 scrubber 到中段 → 之后的方块被 dim（opacity-[0.15]），之前的保持默认', () => {
    renderStrata();
    const slider = screen.getByRole('slider');
    // yearRange = [2023, 2024]，切到 2023
    fireEvent.change(slider, { target: { value: '0' } });

    const svg = screen.getByRole('img', { name: /Strata/i });
    const buttons = Array.from(svg.querySelectorAll('g[role="button"]'));

    let futureCount = 0;
    let activeCount = 0;
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') ?? '';
      const rect = btn.querySelector('rect')!;
      const cls = rect.getAttribute('class') ?? '';
      const isFutureClass = /opacity-\[0\.15\]/.test(cls);
      if (label.includes('2024')) {
        expect(isFutureClass).toBe(true);
        futureCount++;
      } else if (label.includes('2023')) {
        expect(isFutureClass).toBe(false);
        activeCount++;
      }
    }
    expect(futureCount).toBeGreaterThan(0);
    expect(activeCount).toBeGreaterThan(0);
  });
});
