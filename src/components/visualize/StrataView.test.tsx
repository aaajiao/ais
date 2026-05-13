import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import StrataView from './StrataView';
import type {
  VizArtwork,
  VizEdition,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';
import type { EditionStatus } from '@/lib/database.types';

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
    editions: VizEdition[];
    history: VizHistory[];
  }> = {}
) {
  const props = {
    artworks: sampleArtworks,
    editions: overrides.editions ?? [],
    history: sampleHistory,
    ...overrides,
  };
  return renderWithClient(
    <MemoryRouter>
      <StrataView {...props} />
    </MemoryRouter>
  );
}

// M2 helper：构造一个 edition fixture
function makeStrataEdition(
  id: string,
  artworkId: string,
  status: EditionStatus
): VizEdition {
  return {
    id,
    artwork_id: artworkId,
    inventory_number: id,
    edition_type: 'numbered',
    edition_number: 1,
    status,
    location_id: null,
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2024-01-01T00:00:00Z',
  };
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
    const blockButtons = svg.querySelectorAll('g[role="button"][data-block]');
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
    const blockButtons = svg.querySelectorAll('g[role="button"][data-block]');
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
    const blockButtons = Array.from(svg.querySelectorAll('g[role="button"][data-block]'));
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
    const rects = Array.from(svg.querySelectorAll('g[role="button"][data-block] > rect'));
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
    const buttons = Array.from(svg.querySelectorAll('g[role="button"][data-block]'));

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

  // ─── M2 状态编码 ─────────────────────────────────────────────────────────

  it('HELD 作品（in_studio edition）→ stroke-only（fill=none + stroke-foreground）', () => {
    const editions = [makeStrataEdition('e1', 'aw-1', 'in_studio')];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    // aw-1 是 Guard, I…（2024）
    const block = svg.querySelector(
      'g[role="button"][data-ownership="held"]'
    )!;
    expect(block).not.toBeNull();
    const rect = block.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('none');
    const cls = rect.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-foreground');
  });

  it('EXTERNAL 作品（at_gallery edition）→ pattern fill', () => {
    const editions = [makeStrataEdition('e1', 'aw-1', 'at_gallery')];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-ownership="external"]'
    )!;
    expect(block).not.toBeNull();
    const rect = block.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toMatch(/url\(#viz-strata-pattern-dots\)/);
  });

  it('DEPARTED 作品（sold edition）→ solid fill-foreground，无 stroke', () => {
    const editions = [makeStrataEdition('e1', 'aw-1', 'sold')];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-ownership="departed"]'
    )!;
    expect(block).not.toBeNull();
    const rect = block.querySelector('rect')!;
    const cls = rect.getAttribute('class') ?? '';
    expect(cls).toContain('fill-foreground');
    // 非 stroke-only：不应有 stroke-foreground
    expect(cls).not.toContain('stroke-foreground');
  });

  it('DEGENERATE 叠加：lost edition → 主形 + X 标记线（两条 line）', () => {
    const editions = [makeStrataEdition('e1', 'aw-1', 'lost')];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-degenerate="true"]'
    )!;
    expect(block).not.toBeNull();
    // 主桶 = departed（lost → departed + degenerate）
    expect(block.getAttribute('data-ownership')).toBe('departed');
    // X 标记：g[data-mark="degenerate"] 包两条 <line>
    const xGroup = block.querySelector('g[data-mark="degenerate"]');
    expect(xGroup).not.toBeNull();
    const lines = xGroup!.querySelectorAll('line');
    expect(lines.length).toBe(2);
    // X 必须用 stroke-background（跟 fill-foreground 反差），否则同色叠加 X 不可见
    const xCls = xGroup!.getAttribute('class') ?? '';
    expect(xCls).toContain('stroke-background');
    expect(xCls).not.toContain('stroke-foreground');
  });

  it('混合 edition：at_gallery + sold → 聚合为 departed', () => {
    const editions = [
      makeStrataEdition('e1', 'aw-1', 'at_gallery'),
      makeStrataEdition('e2', 'aw-1', 'sold'),
    ];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-ownership="departed"][aria-label*="Guard"]'
    );
    expect(block).not.toBeNull();
  });

  it('SVG <defs> 含 dot pattern（id=viz-strata-pattern-dots）', () => {
    renderStrata();
    const svg = screen.getByRole('img', { name: /Strata/i });
    const pattern = svg.querySelector('defs pattern#viz-strata-pattern-dots');
    expect(pattern).not.toBeNull();
  });

  // ─── M2 缺失 year 列 ─────────────────────────────────────────────────────

  it('有缺 year 作品 → 渲染 unknown-year 列 + 列头 "?"', () => {
    const artworks: VizArtwork[] = [
      ...sampleArtworks,
      {
        ...installation2024,
        id: 'aw-noyear',
        title_en: 'Untitled (no year)',
        year: null,
      },
    ];
    renderStrata({ artworks });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const col = svg.querySelector('[data-testid="strata-unknown-year-col"]');
    expect(col).not.toBeNull();
    // 列头有 "?" 字符
    const headerTexts = Array.from(col!.querySelectorAll('text')).map(
      (t) => t.textContent
    );
    expect(headerTexts).toContain('?');
  });

  it('缺 year 列中的方块强制 stroke-only（即使 ownership = departed）', () => {
    // 缺 year 作品，给一个 sold edition —— 正常情况下应 solid，但缺失态优先 → stroke-only
    const noYearArtwork: VizArtwork = {
      ...installation2024,
      id: 'aw-noyear-sold',
      title_en: 'Sold no-year',
      year: null,
    };
    const artworks = [...sampleArtworks, noYearArtwork];
    const editions = [makeStrataEdition('e1', 'aw-noyear-sold', 'sold')];
    renderStrata({ artworks, editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-unknown-year="true"]'
    );
    expect(block).not.toBeNull();
    const rect = block!.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('none');
    const cls = rect.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-foreground');
  });

  it('无缺 year 作品 → 不渲染 unknown-year 列', () => {
    renderStrata(); // sampleArtworks 全有 year
    const svg = screen.getByRole('img', { name: /Strata/i });
    const col = svg.querySelector('[data-testid="strata-unknown-year-col"]');
    expect(col).toBeNull();
  });

  // ─── M2 bug fix: pointer-events on stroke-only blocks ───────────────────
  it('stroke-only 方块带 pointerEvents=all（让 click 可点中空心内部，不只 stroke）', () => {
    const editions = [makeStrataEdition('e1', 'aw-1', 'in_studio')];
    renderStrata({ editions });
    const svg = screen.getByRole('img', { name: /Strata/i });
    const block = svg.querySelector(
      'g[role="button"][data-ownership="held"]'
    )!;
    const rect = block.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('pointer-events')).toBe('all');
  });

  // ─── M2.5 图例 ────────────────────────────────────────────────────────────
  it('图例渲染 5 个 ownership glyph（held/external/departed/degenerate/unknownYear）', () => {
    renderStrata();
    expect(screen.getByTestId('visualize-legend')).toBeInTheDocument();
    for (const key of ['held', 'external', 'departed', 'degenerate', 'unknownYear']) {
      expect(screen.getByTestId(`legend-glyph-${key}`)).toBeInTheDocument();
    }
  });

  it('DegenerateGlyph 的 X 用 stroke-background（不是 stroke-foreground）', () => {
    // 同色叠加 (fill-foreground + stroke-foreground) X 不可见。
    // 这条守护让 glyph 跟 OwnershipBlock X 的修复保持一致。
    renderStrata();
    const wrap = screen.getByTestId('legend-glyph-degenerate');
    const xGroup = wrap.querySelector('svg > g');
    expect(xGroup).not.toBeNull();
    const cls = xGroup!.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-background');
    expect(cls).not.toContain('stroke-foreground');
  });

  // ─── M2 Y 轴 pin 交互 ─────────────────────────────────────────────────────

  it('点击 type label → pinnedLane 进入 pin 状态，marker 渲染', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    expect(label).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(label);
    expect(label).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByTestId('lane-pin-marker-Installation')
    ).toBeInTheDocument();
  });

  it('同 label 再点 → unpin，marker 消失', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    fireEvent.click(label);
    expect(screen.getByTestId('lane-pin-marker-Installation')).toBeInTheDocument();
    fireEvent.click(label);
    expect(label).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('lane-pin-marker-Installation')).toBeNull();
  });

  it('点不同 label → 切换 pin（marker 跟着移动）', () => {
    renderStrata();
    const labelA = screen.getByTestId('lane-label-Installation');
    const labelB = screen.getByTestId('lane-label-Video');
    fireEvent.click(labelA);
    expect(screen.getByTestId('lane-pin-marker-Installation')).toBeInTheDocument();
    fireEvent.click(labelB);
    expect(screen.queryByTestId('lane-pin-marker-Installation')).toBeNull();
    expect(screen.getByTestId('lane-pin-marker-Video')).toBeInTheDocument();
    expect(labelA).toHaveAttribute('aria-pressed', 'false');
    expect(labelB).toHaveAttribute('aria-pressed', 'true');
  });

  it('pinned 状态下其他 lane block 走 BLOCK_OTHER_LANE_CLS opacity', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    fireEvent.click(label);

    const svg = screen.getByRole('img', { name: /Strata/i });
    // Video lane 的 block 应该被 dim 到 opacity-[0.3]
    const videoBlocks = Array.from(
      svg.querySelectorAll('g[role="button"][data-block][aria-label*="Video"]')
    );
    expect(videoBlocks.length).toBeGreaterThan(0);
    for (const btn of videoBlocks) {
      const rect = btn.querySelector('rect')!;
      const cls = rect.getAttribute('class') ?? '';
      expect(cls).toMatch(/opacity-\[0\.3\]/);
    }
    // Installation lane 的 block 走 focused 态（opacity-100）
    const instBlocks = Array.from(
      svg.querySelectorAll(
        'g[role="button"][data-block][aria-label*="Installation"]'
      )
    );
    expect(instBlocks.length).toBeGreaterThan(0);
    for (const btn of instBlocks) {
      const rect = btn.querySelector('rect')!;
      const cls = rect.getAttribute('class') ?? '';
      // FOCUSED_LANE_CLS = 'opacity-100'，不应被 dim 到 0.3
      expect(cls).not.toMatch(/opacity-\[0\.3\]/);
    }
  });

  it('pin 模式下底部信息面板显示 lane stats（artworks / editions / 4 ownership / yearSpan）', () => {
    // aw-1 (Installation/2024) in_studio, aw-2 (Installation/2024) at_gallery
    const editions = [
      makeStrataEdition('e1', 'aw-1', 'in_studio'),
      makeStrataEdition('e2', 'aw-2', 'at_gallery'),
    ];
    renderStrata({ editions });
    fireEvent.click(screen.getByTestId('lane-label-Installation'));

    const panel = screen.getByTestId('lane-pin-panel');
    expect(panel).toBeInTheDocument();
    // 2 件 Installation
    expect(panel.textContent).toMatch(/2/);
    // 中文 / 英文都包"作品" 或 "artworks"
    expect(panel.textContent ?? '').toMatch(/件作品|artworks/);
    // editions 文案
    expect(panel.textContent ?? '').toMatch(/版本|editions/);
    // ownership 4 项均出现
    expect(screen.getByTestId('lane-pin-held')).toBeInTheDocument();
    expect(screen.getByTestId('lane-pin-external')).toBeInTheDocument();
    expect(screen.getByTestId('lane-pin-departed')).toBeInTheDocument();
    expect(screen.getByTestId('lane-pin-degenerate')).toBeInTheDocument();
    // yearSpan：Installation 全在 2024，min=max=2024
    expect(panel.textContent ?? '').toMatch(/2024/);
    // 不是 "spans —" 空态
    expect(panel.textContent ?? '').not.toMatch(/spans —|跨度 —/);
  });

  it('hover 单 block 优先于 pinnedLane 显示 artwork tooltip（pin 不消失）', () => {
    renderStrata();
    fireEvent.click(screen.getByTestId('lane-label-Installation'));
    expect(screen.getByTestId('lane-pin-panel')).toBeInTheDocument();

    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.mouseEnter(block);

    // pin panel 被 artwork tooltip 覆盖
    expect(screen.queryByTestId('lane-pin-panel')).toBeNull();
    expect(screen.getByText('Guard, I…')).toBeInTheDocument();
    // 但 pin marker 仍在 SVG 上（pinnedLane 未变）
    expect(screen.getByTestId('lane-pin-marker-Installation')).toBeInTheDocument();
  });

  it('mouseLeave block → 信息面板回到 pin 视图（不退回 overview）', () => {
    renderStrata();
    fireEvent.click(screen.getByTestId('lane-label-Installation'));
    const block = screen.getByRole('button', {
      name: /Installation.*2024.*Guard/i,
    });
    fireEvent.mouseEnter(block);
    expect(screen.queryByTestId('lane-pin-panel')).toBeNull();

    fireEvent.mouseLeave(block);
    // 回到 pin panel，不是 overview
    expect(screen.getByTestId('lane-pin-panel')).toBeInTheDocument();
  });

  it('键盘 Enter 在 type label 上触发 toggle pin', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(label).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lane-pin-marker-Installation')).toBeInTheDocument();
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(label).toHaveAttribute('aria-pressed', 'false');
  });

  it('键盘 Space 在 type label 上触发 toggle pin', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    fireEvent.keyDown(label, { key: ' ' });
    expect(label).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(label, { key: ' ' });
    expect(label).toHaveAttribute('aria-pressed', 'false');
  });

  it('a11y：type label 有 role="button" + aria-pressed + tabIndex=0', () => {
    renderStrata();
    const label = screen.getByTestId('lane-label-Installation');
    expect(label).toHaveAttribute('role', 'button');
    expect(label).toHaveAttribute('aria-pressed', 'false');
    expect(label).toHaveAttribute('tabindex', '0');
    // aria-label 走 strata.lane.pin.aria，含 type 名
    expect(label.getAttribute('aria-label')).toMatch(/Installation/);
  });
});
