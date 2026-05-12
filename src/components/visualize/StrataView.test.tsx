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

    // 3 作品 → 3 个 role="button"（每个 block 包一层 <g>）
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
    // 每个 button 内部应含 <rect>
    for (const btn of buttons) {
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

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
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

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
    const btn = buttons[0];
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // tabIndex 应被设为 -1，避免 focus 到坏方块
    expect(btn).toHaveAttribute('tabindex', '-1');

    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('SVG 用 viewBox 响应式渲染（不硬编码 width=800）', () => {
    const { container } = renderStrata();

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // viewBox 必须存在
    expect(svg!.getAttribute('viewBox')).toBeTruthy();
    // 不应 hard-code 数字 width 属性；应使用 className w-full
    // (SVG 没有 width 属性等价于 100% 默认；如果有，必须是百分比或不存在)
    const widthAttr = svg!.getAttribute('width');
    expect(widthAttr === null || widthAttr === '100%').toBe(true);
    // className 应包含 w-full
    expect(svg!.getAttribute('class')).toMatch(/w-full/);
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
});
