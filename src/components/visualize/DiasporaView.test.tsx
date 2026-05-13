import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import DiasporaView from './DiasporaView';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
  VizArtwork,
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
//
// M6 Constellation 重构后，Diaspora 只展示 outflow（status ∈ sold/gifted）。
// 测试 fixture 改用 sold 状态让节点真实出现在三环上。

const fakeArtwork: VizArtwork = {
  id: 'artwork-1',
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

const fakeArtwork2: VizArtwork = {
  id: 'artwork-2',
  title_en: '',
  title_cn: '末日媒体',
  year: '2023',
  type: 'Video',
  thumbnail_url: null,
  edition_total: 2,
  ap_total: 0,
  is_unique: false,
  created_at: '2023-01-01T00:00:00Z',
};

// Studio location（M6 后不会作为 Constellation 节点出现 —— studio + buyer
// 会归 named_private；studio + 无 buyer + 非 outflow 不进 Constellation）
const studioLocation: VizLocation = {
  id: 'loc-studio',
  name: 'aaajiao Shanghai Studio',
  type: 'studio',
  city: 'Shanghai',
  country: 'China',
};

// Gallery location（作为 Inner ring location node）
const galleryLocation: VizLocation = {
  id: 'loc-gallery',
  name: 'Test Gallery Berlin',
  type: 'gallery',
  city: 'Berlin',
  country: 'Germany',
};

// Museum location（作为另一个 Inner ring node，验证多 type 分弧）
const museumLocation: VizLocation = {
  id: 'loc-museum',
  name: 'Test Museum NY',
  type: 'museum',
  city: 'New York',
  country: 'United States',
};

const longNameLocation: VizLocation = {
  id: 'loc-longname',
  name: 'A Very Long Gallery Name That Exceeds Eighteen Chars',
  type: 'gallery',
  city: 'Tokyo',
  country: 'Japan',
};

const longNameEdition: VizEdition = {
  id: 'e5',
  artwork_id: 'artwork-1',
  inventory_number: 'AAJ-LONG-001',
  edition_type: 'numbered',
  edition_number: 3,
  status: 'sold',
  location_id: 'loc-longname',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2024-02-01T00:00:00Z',
};

// 在 studio 的 in_studio editions —— 不进 Constellation，但触发 ghost / tracked stat
const studioInternalEditions: VizEdition[] = [
  {
    id: 'e1',
    artwork_id: 'artwork-1',
    inventory_number: 'AAJ-2024-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    location_id: 'loc-studio',
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'e2',
    artwork_id: 'artwork-1',
    inventory_number: 'AAJ-2024-002',
    edition_type: 'numbered',
    edition_number: 2,
    status: 'in_studio',
    location_id: 'loc-studio',
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'e3',
    artwork_id: 'artwork-2',
    inventory_number: null,
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_production',
    location_id: 'loc-studio',
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2023-01-01T00:00:00Z',
  },
];

// Gallery sold edition —— 进 Constellation Inner ring (loc-gallery)
const gallerySoldEdition: VizEdition = {
  id: 'e4',
  artwork_id: 'artwork-2',
  inventory_number: 'AAJ-2023-001',
  edition_type: 'numbered',
  edition_number: 2,
  status: 'sold',
  location_id: 'loc-gallery',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2023-06-01T00:00:00Z',
};

// Museum sold edition —— 进 Constellation Inner ring (loc-museum)，验证多 type
const museumSoldEdition: VizEdition = {
  id: 'e6',
  artwork_id: 'artwork-1',
  inventory_number: 'AAJ-2022-001',
  edition_type: 'numbered',
  edition_number: 3,
  status: 'sold',
  location_id: 'loc-museum',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2022-06-01T00:00:00Z',
};

// Named private buyer —— 进 Middle ring
const namedBuyerEdition: VizEdition = {
  id: 'e7',
  artwork_id: 'artwork-1',
  inventory_number: 'AAJ-NAMED-001',
  edition_type: 'numbered',
  edition_number: 4,
  status: 'sold',
  location_id: null,
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: 'Liliana Gao',
  created_at: '2024-03-01T00:00:00Z',
};

// Anonymous sold —— 进 Outer ring
const anonSoldEdition: VizEdition = {
  id: 'e8',
  artwork_id: 'artwork-2',
  inventory_number: 'AAJ-ANON-001',
  edition_type: 'numbered',
  edition_number: 5,
  status: 'sold',
  location_id: null,
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2024-04-01T00:00:00Z',
};

const allEditions = [
  ...studioInternalEditions,
  gallerySoldEdition,
  museumSoldEdition,
  namedBuyerEdition,
  anonSoldEdition,
];

const fakeHistory: VizHistory[] = [
  {
    id: 'h1',
    edition_id: 'e4',
    action: 'location_change',
    from_status: null,
    to_status: null,
    from_location: 'aaajiao Shanghai Studio',
    to_location: 'Test Gallery Berlin',
    created_at: '2023-06-01T00:00:00Z',
  },
];

const allLocations = [studioLocation, galleryLocation, museumLocation];
const allArtworks = [fakeArtwork, fakeArtwork2];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderDiaspora(
  overrides: Partial<{
    artworks: VizArtwork[];
    editions: VizEdition[];
    locations: VizLocation[];
    history: VizHistory[];
    selectedArtworkId: string | null;
  }> = {}
) {
  const props = {
    artworks: allArtworks,
    editions: allEditions,
    locations: allLocations,
    history: fakeHistory,
    ...overrides,
  };
  return renderWithClient(
    <MemoryRouter>
      <DiasporaView {...props} />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DiasporaView', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('初始状态：无 pin、信息条显示 Constellation 总览', () => {
    renderDiaspora();

    expect(screen.getByRole('heading', { name: /Diaspora|流散/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).not.toBeInTheDocument();
    // 默认 summary 显示 Constellation 三环数量
    expect(
      screen.getByText(/机构.*私人买家.*匿名|institutions.*private buyers.*anonymous/i)
    ).toBeInTheDocument();
  });

  it('hover gallery 节点 → 下方信息条预览 location 信息', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.mouseEnter(galleryGroup);

    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();
    expect(galleryGroup).toBeInTheDocument();
  });

  it('hover 离开 → 预览消失，恢复默认提示', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.mouseEnter(galleryGroup);
    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();

    fireEvent.mouseLeave(galleryGroup);
    expect(
      screen.queryByText('Test Gallery Berlin', { selector: 'div,span' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/机构.*私人买家.*匿名|institutions.*private buyers.*anonymous/i)
    ).toBeInTheDocument();
  });

  it('click 节点 → pin 卡片出现 + 显示 editions 列表', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AAJ-2023-001' })).toBeInTheDocument();
  });

  it('pin 卡片中的 edition 行点击 → navigate 到 /editions/{id}', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    const editionBtn = screen.getByRole('button', { name: /AAJ-2023-001/i });
    fireEvent.click(editionBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/editions/e4');
  });

  it('pin 卡片 "view all" 链接 → navigate 包含 ?locationId=', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    const viewAllBtn = screen.getByRole('button', {
      name: /查看此位置全部版本|View all editions/i,
    });
    fireEvent.click(viewAllBtn);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('locationId=loc-gallery')
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/editions')
    );
  });

  it('click 同一节点二次 → 取消 pin，恢复默认提示', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();

    fireEvent.click(galleryGroup);
    expect(
      screen.queryByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/机构.*私人买家.*匿名|institutions.*private buyers.*anonymous/i)
    ).toBeInTheDocument();
  });

  it('click 另一节点 → 切换 pin 到新节点', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();

    const museumGroup = screen.getByRole('button', {
      name: /Test Museum NY/i,
    });
    fireEvent.click(museumGroup);

    expect(
      screen.getByText('Test Museum NY', { selector: 'div,span' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();
  });

  it('pin 状态下 hover 其他节点 → pin 卡片保持，不显示预览', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();

    const museumGroup = screen.getByRole('button', {
      name: /Test Museum NY/i,
    });
    fireEvent.mouseEnter(museumGroup);

    // Pin 仍指向 gallery
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();
  });

  it('空数据时渲染 empty 状态而不崩溃', () => {
    renderDiaspora({ editions: [], locations: [], artworks: [] });

    expect(screen.getByRole('heading', { name: /Diaspora|流散/i })).toBeInTheDocument();
    expect(screen.getByText(/暂无数据可视化|No data/i)).toBeInTheDocument();
  });

  it('节点有正确的 aria-pressed 属性反映 pin 状态', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    expect(galleryGroup).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(galleryGroup);
    expect(galleryGroup).toHaveAttribute('aria-pressed', 'true');
  });

  it('键盘 Enter 键触发 pin', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.keyDown(galleryGroup, { key: 'Enter' });

    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();
  });

  it('pin 卡片中每个 edition chip 只显示 inventory 号（status 仅作 title）', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    const chip = screen.getByRole('button', { name: 'AAJ-2023-001' });
    expect(chip).toBeInTheDocument();
    // status 走 useTranslation('status') 翻译；中英任一匹配防止 locale 切换 break
    expect(chip.getAttribute('title')).toMatch(/^(已售|sold)$/);
  });

  it('长名 location 节点渲染 SVG <title> 元素显示完整 name（label 被截断）', () => {
    const { container } = renderDiaspora({
      locations: [galleryLocation, longNameLocation],
      editions: [gallerySoldEdition, longNameEdition],
    });

    const node = container.querySelector('g[data-node="loc-longname"]');
    expect(node).not.toBeNull();

    const titleEl = node!.querySelector('title');
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe(longNameLocation.name);

    const visibleText = node!.querySelector('text');
    expect(visibleText).not.toBeNull();
    expect(visibleText!.textContent).toBe(
      longNameLocation.name.slice(0, 16) + '…'
    );
  });

  it('pin 卡片 edition 行点击不会冒泡触发 SVG unpin（stopPropagation 防御）', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(
      screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })
    ).toBeInTheDocument();

    const editionBtn = screen.getByRole('button', { name: /AAJ-2023-001/i });
    fireEvent.click(editionBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/editions/e4');
  });

  // ─── v1.6.x 第二轮 ghost editions inbox（per-edition 可点击） ──────────

  it('non-outflow + 无 location → 渲染 per-edition ghost circle（每个独立 testid + role=button）', () => {
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-1',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-GH-1',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'ghost-2',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-GH-2',
        edition_type: 'numbered',
        edition_number: 100,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const g1 = container.querySelector('[data-testid="constellation-ghost-ghost-1"]');
    const g2 = container.querySelector('[data-testid="constellation-ghost-ghost-2"]');
    expect(g1).not.toBeNull();
    expect(g2).not.toBeNull();
    // 每个 ghost g 都是 role=button + tabIndex=0（可点击 + 可聚焦）
    expect(g1!.getAttribute('role')).toBe('button');
    expect(g1!.getAttribute('tabindex')).toBe('0');
  });

  it('ghost editions inbox 圆是空心（fill=none + stroke-foreground r=4 opacity=0.55）', () => {
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-1',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-GH-1',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const g = container.querySelector('[data-testid="constellation-ghost-ghost-1"]')!;
    const circle = g.querySelector('circle')!;
    expect(circle.getAttribute('fill')).toBe('none');
    expect(circle.getAttribute('r')).toBe('4');
    const cls = circle.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-foreground');
  });

  it('click ghost edition → navigate 到 /editions/{id}', () => {
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-click-me',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-GHX',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const g = container.querySelector(
      '[data-testid="constellation-ghost-ghost-click-me"]'
    )!;
    fireEvent.click(g);
    expect(mockNavigate).toHaveBeenCalledWith('/editions/ghost-click-me');
  });

  it('Enter / Space 键盘也触发 navigate', () => {
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-kbd',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-K',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const g = container.querySelector(
      '[data-testid="constellation-ghost-ghost-kbd"]'
    )!;
    fireEvent.keyDown(g, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/editions/ghost-kbd');
    mockNavigate.mockClear();
    fireEvent.keyDown(g, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/editions/ghost-kbd');
  });

  it('所有 non-outflow edition 都有 location_id → 不渲染任何 ghost', () => {
    const { container } = renderDiaspora();
    expect(
      container.querySelector('[data-testid^="constellation-ghost-"]')
    ).toBeNull();
  });

  it('图例包含 anonymous + untracked 项（v1.6.x 第二轮三档视觉词汇）', () => {
    renderDiaspora();
    expect(screen.getByTestId('diaspora-legend-anonymous')).toBeInTheDocument();
    expect(screen.getByTestId('diaspora-legend-untracked')).toBeInTheDocument();
    // 旧 ghost legend chip 已被取代，不应出现
    expect(screen.queryByTestId('diaspora-legend-ghost')).toBeNull();
  });

  it('Legend 5 个 type chip 用 <svg><path> organic blob 渲染（149dbd1：与主图节点视觉同源）', () => {
    // type chips 必须是 generateOrganicPath 出的 inline SVG path（baseR=8 在 20×20 viewBox）
    // —— 跟主图 location 节点同 hash 函数 + 同形状。回归到旧 `rounded-full` <span>
    // block（圆 chip）会破坏"图例跟视觉编码同步"原则（视觉指南 #10）。
    const { container } = renderDiaspora();
    // 取 Legend 容器（在主 SVG 之前的 flex-wrap div，含 diaspora-legend-* testid）
    const anonymousChip = container.querySelector(
      '[data-testid="diaspora-legend-anonymous"]'
    )!;
    const legendContainer = anonymousChip.parentElement!;
    // type chips 各自是一个含 <svg> 的 span（非 testid 名义节点，按结构选）
    const typeSvgs = legendContainer.querySelectorAll(
      'svg[aria-hidden="true"][viewBox="0 0 20 20"]'
    );
    expect(typeSvgs).toHaveLength(5); // studio / gallery / museum / private_collection / other
    for (const svg of Array.from(typeSvgs)) {
      const path = svg.querySelector('path');
      expect(path).not.toBeNull();
      const d = path!.getAttribute('d') ?? '';
      expect(d.startsWith('M ')).toBe(true);
      expect(d.endsWith(' Z')).toBe(true);
      // 同主图节点：Catmull-Rom cubic bezier（v1.6.x 第六/七轮），不出现 Q / L 段
      expect(d).not.toMatch(/\sQ\s/);
      expect(d).not.toMatch(/\sL\s/);
    }
  });

  it('Legend 不渲染裸 "type" 字符串（45c8d9d anti-regression：删除硬编码 "type" 标签）', () => {
    // commit 45c8d9d 删掉了 Legend 上方一行硬编码英文 "type" 标签。回归会让
    // 中文界面出现孤立英文单词 "type"，是 i18n 漏网典型症状。
    // 容忍 "type" 出现在 inline aria/title/JSON attribute 里（这些不可见）；
    // 只检查 Legend 容器**可见 textContent** 不含独立 "type" 单词。
    const { container } = renderDiaspora();
    const anonymousChip = container.querySelector(
      '[data-testid="diaspora-legend-anonymous"]'
    )!;
    const legendContainer = anonymousChip.parentElement!;
    // 用 word boundary 匹配，避免误伤 "private_collection" / "anonymous" 等单词
    expect(legendContainer.textContent).not.toMatch(/\btype\b/i);
  });

  it('Ghost ring 顶节点完全在 viewBox 内（763f26f：R=320 修顶部 y<0 出界 bug）', () => {
    // viewBox H=680 / cy=340 / radius 默认 320 / 顶点视觉 r=4
    // → 12 点钟节点 cy = 340 - 320 = 20，circle r=4 顶边 = 20 - 4 = 16 ≥ 0
    // R=340（旧值）会让顶点 cy=0、circle 顶 = -4 → 出 viewBox。
    // 这条断言把"R 改回 340"或"H 改小"任何回归直接挡掉。
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-top',
        artwork_id: 'artwork-1',
        inventory_number: 'GH-TOP',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-12-01T00:00:00Z', // 只有 1 个 ghost → 必落 12 点钟
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const g = container.querySelector(
      '[data-testid="constellation-ghost-ghost-top"]'
    )!;
    const circle = g.querySelector('circle')!;
    const cy = parseFloat(circle.getAttribute('cy') ?? '0');
    const r = parseFloat(circle.getAttribute('r') ?? '0');
    // 节点视觉顶边 cy - r 必须 ≥ 0（落在 viewBox 内）
    expect(cy - r).toBeGreaterThanOrEqual(0);
    // 节点视觉底边 cy + r 必须 ≤ H=680（防对称回归）
    expect(cy + r).toBeLessThanOrEqual(680);
  });

  it('stat 区显示 untrackedHint 当有 ghost editions 时（v1.6.x 第二轮）', () => {
    const ghostEditions: VizEdition[] = [
      ...allEditions,
      {
        id: 'ghost-stat',
        artwork_id: 'artwork-1',
        inventory_number: 'AAJ-GH-STAT',
        edition_type: 'numbered',
        edition_number: 99,
        status: 'in_studio',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({ editions: ghostEditions });
    const hint = container.querySelector(
      '[data-testid="diaspora-stat-untracked-hint"]'
    );
    expect(hint).not.toBeNull();
    // 文案体现 count=1 + 提示去补 location（中英 i18n 任一匹配）
    expect(hint!.textContent).toMatch(/1.*(?:补全|location|complete)/i);
  });

  it('无 ghost editions → 不渲染 untrackedHint', () => {
    const { container } = renderDiaspora();
    expect(
      container.querySelector('[data-testid="diaspora-stat-untracked-hint"]')
    ).toBeNull();
  });

  it('pin 卡片按钮 onClick 调用 stopPropagation（spy 验证）', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    const editionBtn = screen.getByRole('button', { name: /AAJ-2023-001/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(event, 'stopPropagation');
    editionBtn.dispatchEvent(event);
    expect(stopProp).toHaveBeenCalled();

    const viewAllBtn = screen.getByRole('button', {
      name: /查看此位置全部版本|View all editions/i,
    });
    const event2 = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopProp2 = vi.spyOn(event2, 'stopPropagation');
    viewAllBtn.dispatchEvent(event2);
    expect(stopProp2).toHaveBeenCalled();
  });

  // ─── M6 Constellation 三环 ─────────────────────────────────────────────

  it('Constellation 模式下渲染 artist center node（testid constellation-artist）', () => {
    renderDiaspora();
    expect(screen.getByTestId('constellation-artist')).toBeInTheDocument();
  });

  it('Inner ring 渲染 location nodes（每个 sold edition 关联的 location 出现）', () => {
    const { container } = renderDiaspora();
    // gallery + museum 都是 sold edition target
    expect(
      container.querySelector('[data-testid="constellation-location-loc-gallery"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="constellation-location-loc-museum"]')
    ).not.toBeNull();
    // studio 不在 Constellation 里（in_studio editions 非 outflow）
    expect(
      container.querySelector('[data-testid="constellation-location-loc-studio"]')
    ).toBeNull();
  });

  it('Middle ring 渲染 named_private nodes (testid 模式 constellation-named-{name})', () => {
    const { container } = renderDiaspora();
    expect(
      container.querySelector('[data-testid="constellation-named-Liliana Gao"]')
    ).not.toBeNull();
  });

  it('Outer ring 渲染 anonymous dots, 数量 = anonymous.count', () => {
    const { container } = renderDiaspora();
    // allEditions 里只有 1 个匿名 sold (e8)
    const anons = container.querySelectorAll(
      '[data-testid^="constellation-anon-"]'
    );
    expect(anons).toHaveLength(1);
  });

  it('v1.6.x: anonymous dots 按 time-spiral 落点（不再固定 R=310 外圈）', () => {
    // 构造 3 条 anonymous 带不同 sale_date + 1 条无 sale_date
    // → 3 条 dated 落 time-spiral 半径区间 [R_INNER, R_OUTER_DATA]
    // → 1 条 undated 落 R_GHOST
    // viewport 用默认 W=800 H=600，center = (400, 300)
    const editions: VizEdition[] = [
      {
        id: 'a1',
        artwork_id: 'artwork-1',
        inventory_number: 'A1',
        edition_type: 'numbered',
        edition_number: 1,
        status: 'sold',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: '2018-01-01',
        buyer_name: null,
        created_at: '2018-01-01T00:00:00Z',
      },
      {
        id: 'a2',
        artwork_id: 'artwork-1',
        inventory_number: 'A2',
        edition_type: 'numbered',
        edition_number: 2,
        status: 'sold',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: '2021-06-15',
        buyer_name: null,
        created_at: '2021-06-15T00:00:00Z',
      },
      {
        id: 'a3',
        artwork_id: 'artwork-1',
        inventory_number: 'A3',
        edition_type: 'numbered',
        edition_number: 3,
        status: 'sold',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: '2024-01-01',
        buyer_name: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'a4',
        artwork_id: 'artwork-1',
        inventory_number: 'A4',
        edition_type: 'numbered',
        edition_number: 4,
        status: 'sold',
        location_id: null,
        sale_price: null,
        sale_currency: null,
        sale_date: null,
        buyer_name: null,
        created_at: '2024-02-01T00:00:00Z',
      },
    ];
    const { container } = renderDiaspora({
      editions,
      locations: [],
      artworks: [fakeArtwork],
    });
    const anons = container.querySelectorAll(
      '[data-testid^="constellation-anon-"]'
    );
    expect(anons).toHaveLength(4);
    // v1.6.x 第四轮：viewBox 1200×680 → center (600, 340)；layout 椭圆化 ASPECT_X=1.55
    // 每个 anonymous 点都落在 ellipse((x-600)/(r·1.55))² + ((y-340)/r)² = 1 上
    // 这里收集 |y - 340| 作为 r·|sin(angle)| 的代理：4 个点 r 不同 → |y - 340| 不同。
    const ASPECT_X = 1.55;
    const points = Array.from(anons).map((el) => {
      const px = parseFloat(el.getAttribute('cx') ?? '0');
      const py = parseFloat(el.getAttribute('cy') ?? '0');
      return { px, py };
    });
    // 每点反解 r：r² = ((x-cx)/ASPECT_X)² + (y-cy)²
    const rs = points.map(({ px, py }) =>
      Math.sqrt(((px - 600) / ASPECT_X) ** 2 + (py - 340) ** 2)
    );
    // 4 个点 r 不再全一样（旧实现全 = ANONYMOUS_R 310）
    const uniqRs = new Set(rs.map((r) => r.toFixed(1)));
    expect(uniqRs.size).toBeGreaterThan(1);
    // 缺 sale_date 的那个落 R_GHOST = 300（v1.6.x 第三轮 220→300）
    const hasGhost = rs.some((r) => Math.abs(r - 300) < 0.5);
    expect(hasGhost).toBe(true);
  });

  it('只画 location → artist edges（数 edge 数量 = locations.length）', () => {
    // 构造一个只有 1 个 location（gallery）+ 1 个 named buyer + 1 个 anon 的 fixture
    // 验证：line 数 (non-dashed) = 1，跟 location 节点数 = 1 一致；named / anon 不画 edge
    const oneLoc: VizEdition[] = [
      gallerySoldEdition,
      namedBuyerEdition,
      anonSoldEdition,
    ];
    const { container } = renderDiaspora({
      editions: oneLoc,
      locations: [galleryLocation],
    });
    // 主图 svg 用 role="img" 明确选中（Legend 里有多个 inline SVG chips）
    const svg = container.querySelector('svg[role="img"]')!;
    const allLines = svg.querySelectorAll('line');
    // 至少 1 条（gallery edge）
    expect(allLines.length).toBeGreaterThanOrEqual(1);
    // non-dashed line = location → artist edge（selection edge 走 dashed，参考圆是 circle 不是 line）
    const solidLines = Array.from(allLines).filter(
      (l) => !l.getAttribute('stroke-dasharray')
    );
    expect(solidLines.length).toBe(1);
  });

  it('named_private node 可点击 / 键盘聚焦（role=button + tabIndex=0 + aria-label）', () => {
    renderDiaspora();
    const named = screen.getByRole('button', {
      name: /Liliana Gao/i,
    });
    expect(named).toHaveAttribute('tabindex', '0');
    expect(named.getAttribute('aria-label')).toBeTruthy();
  });

  it('anonymous dots 可点击（v1.6.x 第三轮：跟 ghost 同构的"档案补全 inbox"语义）', () => {
    // v1.6.x: anonymous testid 从 index 改为 editionId（每条 anonymous edition
    // 一个独立 dust dot 进 time-spiral，不再有"第 i 个"的概念）。
    // v1.6.x 第三轮：anonymous click → /editions/:id 补 buyer_name，跟 ghost
    // click → 补 location 是同构的 inbox。role/tabIndex 挂在父 <g> 上。
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-e8"]')!;
    const parent = anon.parentElement!;
    expect(parent.tagName.toLowerCase()).toBe('g');
    expect(parent.getAttribute('role')).toBe('button');
    expect(parent.getAttribute('tabindex')).toBe('0');
  });

  it('click anonymous dust → navigate /editions/:id（v1.6.x 第三轮）', () => {
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-e8"]')!;
    const parent = anon.parentElement!;
    fireEvent.click(parent);
    expect(mockNavigate).toHaveBeenCalledWith('/editions/e8');
  });

  it('Enter / Space 键盘也触发 anonymous navigate', () => {
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-e8"]')!;
    const parent = anon.parentElement!;
    fireEvent.keyDown(parent, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/editions/e8');
    mockNavigate.mockClear();
    fireEvent.keyDown(parent, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/editions/e8');
  });

  it('点击 named_private node → pin 卡片显示 buyer 信息 + edition chip', () => {
    renderDiaspora();
    const named = screen.getByRole('button', {
      name: /Liliana Gao/i,
    });
    fireEvent.click(named);
    expect(
      screen.getByRole('button', { name: 'AAJ-NAMED-001' })
    ).toBeInTheDocument();
    // named_private pin 卡片没有 "view all" 按钮（无 locationId）
    expect(
      screen.queryByRole('button', {
        name: /查看此位置全部版本|View all editions/i,
      })
    ).not.toBeInTheDocument();
  });

  // ─── Phase 2: M3a selection ring on Diaspora ────────────────────────────

  it('selectedArtworkId 设置时该作品关联的 location 节点渲染 selection ring', () => {
    // gallerySoldEdition 卖到 gallery，artwork = artwork-2
    const { container } = renderDiaspora({ selectedArtworkId: 'artwork-2' });
    expect(
      container.querySelector(
        '[data-testid="constellation-selection-ring-loc-gallery"]'
      )
    ).not.toBeNull();
    // museum 是 artwork-1 的，不该有 ring
    expect(
      container.querySelector(
        '[data-testid="constellation-selection-ring-loc-museum"]'
      )
    ).toBeNull();
  });

  it('selectedArtworkId 设置时该作品关联的 named_private 节点渲染 selection ring', () => {
    // namedBuyerEdition: artwork_id=artwork-1, buyer=Liliana Gao
    const { container } = renderDiaspora({ selectedArtworkId: 'artwork-1' });
    expect(
      container.querySelector(
        '[data-testid="constellation-selection-ring-named-Liliana Gao"]'
      )
    ).not.toBeNull();
  });

  it('selectedArtworkId 设置时画 dashed edge 从 center 到选中的 location 节点', () => {
    const { container } = renderDiaspora({ selectedArtworkId: 'artwork-2' });
    expect(
      container.querySelector(
        '[data-testid="constellation-selection-edge-loc-gallery"]'
      )
    ).not.toBeNull();
  });

  it('selectedArtworkId 为 null 时不渲染 selection ring / edges', () => {
    const { container } = renderDiaspora({ selectedArtworkId: null });
    expect(
      container.querySelector(
        '[data-testid^="constellation-selection-ring-"]'
      )
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid^="constellation-selection-edge-"]'
      )
    ).toBeNull();
  });

  // ─── v1.6 time-spiral 视觉编码 ─────────────────────────────────────────────

  it('private_collection location 节点渲染 inner stroke ring（"双圆嵌套"）', () => {
    const pcLocation: VizLocation = {
      id: 'loc-pc',
      name: 'Akeroyd Collection',
      type: 'private_collection',
      city: null,
      country: 'United Kingdom',
    };
    const pcEdition: VizEdition = {
      id: 'e-pc',
      artwork_id: 'artwork-1',
      inventory_number: 'AAJ-PC-001',
      edition_type: 'numbered',
      edition_number: 1,
      status: 'sold',
      location_id: 'loc-pc',
      sale_price: null,
      sale_currency: null,
      sale_date: '2022-05-01',
      buyer_name: null,
      created_at: '2022-05-01T00:00:00Z',
    };
    const { container } = renderDiaspora({
      editions: [pcEdition],
      locations: [pcLocation],
    });
    // private_collection 节点画了 inner stroke ring
    const innerRing = container.querySelector(
      '[data-testid="constellation-private-inner-loc-pc"]'
    );
    expect(innerRing).not.toBeNull();
    // stroke-background class（反差色环）
    const cls = innerRing!.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-background');
  });

  // ─── v1.6.x organic blob ────────────────────────────────────────────────

  it('location 节点用 <path> organic blob 渲染（不再是 <circle>）', () => {
    const { container } = renderDiaspora();
    const galleryNode = container.querySelector(
      '[data-testid="constellation-location-loc-gallery"]'
    )!;
    // organic path 存在
    const path = galleryNode.querySelector('path');
    expect(path).not.toBeNull();
    const d = path!.getAttribute('d') ?? '';
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
  });

  it('named_private 节点用 <path> organic blob 渲染', () => {
    const { container } = renderDiaspora();
    const named = container.querySelector(
      '[data-testid="constellation-named-Liliana Gao"]'
    )!;
    const path = named.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')?.startsWith('M ')).toBe(true);
  });

  it('private_collection 节点同时含 <path> 外壳 + <circle stroke-background> 内部几何环（"有机壳 + 几何核"）', () => {
    const pcLocation: VizLocation = {
      id: 'loc-pc2',
      name: 'PC',
      type: 'private_collection',
      city: null,
      country: 'United Kingdom',
    };
    const pcEdition: VizEdition = {
      id: 'e-pc2',
      artwork_id: 'artwork-1',
      inventory_number: 'AAJ-PC2-001',
      edition_type: 'numbered',
      edition_number: 1,
      status: 'sold',
      location_id: 'loc-pc2',
      sale_price: null,
      sale_currency: null,
      sale_date: '2022-05-01',
      buyer_name: null,
      created_at: '2022-05-01T00:00:00Z',
    };
    const { container } = renderDiaspora({
      editions: [pcEdition],
      locations: [pcLocation],
    });
    const node = container.querySelector(
      '[data-testid="constellation-location-loc-pc2"]'
    )!;
    // 外壳是 organic path
    expect(node.querySelector('path')).not.toBeNull();
    // 内部几何环 circle stroke-background
    const innerRing = node.querySelector(
      '[data-testid="constellation-private-inner-loc-pc2"]'
    );
    expect(innerRing).not.toBeNull();
    expect(innerRing!.tagName.toLowerCase()).toBe('circle');
    expect(innerRing!.getAttribute('class')).toContain('stroke-background');
  });

  it('anonymous dots 仍是 <circle r=3.5>（v1.6.x 第二轮升级，不应用 organic blob）', () => {
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-e8"]')!;
    expect(anon.tagName.toLowerCase()).toBe('circle');
    expect(anon.getAttribute('r')).toBe('3.5');
  });

  it('anonymous dot 带 <title> 暴露 sale_date 给 hover（v1.6.x 第二轮）', () => {
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-e8"]')!;
    // 父 g 含 title 子元素（anonSoldEdition.sale_date = null → "no date"）
    const parent = anon.parentElement!;
    const title = parent.querySelector('title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toMatch(/anonymous|匿名/i);
    expect(title!.textContent).toMatch(/no date|无日期/i);
  });

  it('museum / gallery 节点不渲染 inner stroke ring', () => {
    const { container } = renderDiaspora();
    expect(
      container.querySelector('[data-testid="constellation-private-inner-loc-museum"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="constellation-private-inner-loc-gallery"]')
    ).toBeNull();
  });

  it('label 走 radial anchor：右半圆 textAnchor=start，左半圆 textAnchor=end', () => {
    // v1.6.x 第二轮：phyllotaxis 黄金角分布（≈137.5°/段）。
    // 4 个 dated entity（按时间升序）的 angle 序列：
    //   i=0 → -π/2          (cos≈0,    dx=0 → right)
    //   i=1 → -π/2 + 2.40   (cos≈0.67, dx>0 → right)
    //   i=2 → -π/2 + 4.80   (cos≈-1.0, dx<0 → left)  ←—— 期望 'end'
    //   i=3 → -π/2 + 7.20   (cos≈0.80, dx>0 → right) ←—— 期望 'start'
    const locs: VizLocation[] = [
      { id: 'loc-a', name: 'A', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-b', name: 'B', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-c', name: 'C', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-d', name: 'D', type: 'gallery', city: null, country: 'China' },
    ];
    const eds: VizEdition[] = locs.map((l, i) => ({
      id: `ed-${i}`,
      artwork_id: 'artwork-1',
      inventory_number: `AAJ-${i}`,
      edition_type: 'numbered',
      edition_number: 1,
      status: 'sold',
      location_id: l.id,
      sale_price: null,
      sale_currency: null,
      sale_date: `${2018 + i * 2}-01-01`,
      buyer_name: null,
      created_at: '2020-01-01T00:00:00Z',
    }));
    const { container } = renderDiaspora({ editions: eds, locations: locs });
    // loc-c 是 sorted index 2 → cos≈-1 → 左半 dx<0
    const groupC = container.querySelector('g[data-node="loc-c"]')!;
    const textsC = groupC.querySelectorAll('text');
    expect(textsC.length).toBeGreaterThanOrEqual(1);
    expect(textsC[0].getAttribute('text-anchor')).toBe('end');

    // loc-d 是 sorted index 3 → cos>0 → 右半 dx>0
    const groupD = container.querySelector('g[data-node="loc-d"]')!;
    const textsD = groupD.querySelectorAll('text');
    expect(textsD[0].getAttribute('text-anchor')).toBe('start');
  });

  it('dated entity 数量 = entities with firstSaleDate != null（其余推到 R_GHOST 不影响 count）', () => {
    const datedLoc: VizLocation = {
      id: 'loc-dated',
      name: 'Dated',
      type: 'gallery',
      city: null,
      country: 'China',
    };
    const undatedLoc: VizLocation = {
      id: 'loc-undated',
      name: 'Undated',
      type: 'gallery',
      city: null,
      country: 'China',
    };
    const datedEd: VizEdition = {
      id: 'ed-d',
      artwork_id: 'artwork-1',
      inventory_number: 'AAJ-D',
      edition_type: 'numbered',
      edition_number: 1,
      status: 'sold',
      location_id: 'loc-dated',
      sale_price: null,
      sale_currency: null,
      sale_date: '2022-01-01',
      buyer_name: null,
      created_at: '2022-01-01T00:00:00Z',
    };
    const undatedEd: VizEdition = {
      ...datedEd,
      id: 'ed-u',
      inventory_number: 'AAJ-U',
      location_id: 'loc-undated',
      sale_date: null,
    };
    const { container } = renderDiaspora({
      editions: [datedEd, undatedEd],
      locations: [datedLoc, undatedLoc],
    });
    // 两个 location 节点都渲染（dated + undated）
    expect(
      container.querySelector('[data-testid="constellation-location-loc-dated"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="constellation-location-loc-undated"]')
    ).not.toBeNull();
  });

  // ─── v1.6.x 第十一轮: artist center 可点击 + studios pin 卡片 ─────────────

  it('artist center 是 role=button + tabIndex（可点击 / 键盘可达）', () => {
    renderDiaspora();
    const center = screen.getByTestId('constellation-artist');
    expect(center.getAttribute('role')).toBe('button');
    expect(center.getAttribute('tabindex')).toBe('0');
  });

  it('点击 artist center → pin 卡片打开 + 列出 studio location', () => {
    renderDiaspora();
    const center = screen.getByTestId('constellation-artist');
    fireEvent.click(center);
    // pin 卡片渲染（artist 分支独立 testid）
    expect(screen.getByTestId('diaspora-pin-artist')).toBeInTheDocument();
    // studio 节点列出（id = loc-studio，fixture 里的 aaajiao Shanghai Studio）
    expect(
      screen.getByTestId('diaspora-pin-studio-loc-studio')
    ).toBeInTheDocument();
  });

  it('pin 卡片显示当前持有版本 chip（status ∈ in_studio / in_production / in_transit）', () => {
    renderDiaspora();
    fireEvent.click(screen.getByTestId('constellation-artist'));
    // fixture: AAJ-2024-001 / AAJ-2024-002 是 in_studio；e3 in_production 无 inv
    expect(
      screen.getByRole('button', { name: 'AAJ-2024-001' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'AAJ-2024-002' })
    ).toBeInTheDocument();
    // 流出的 edition（e4 sold to gallery）不在 chip 列表
    expect(
      screen.queryByRole('button', { name: 'AAJ-2023-001' })
    ).not.toBeInTheDocument();
  });

  it('点击 studio 行 → navigate 到 /editions?locationId=:id', () => {
    renderDiaspora();
    fireEvent.click(screen.getByTestId('constellation-artist'));
    const studioBtn = screen.getByTestId('diaspora-pin-studio-loc-studio');
    fireEvent.click(studioBtn);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/editions?locationId=loc-studio'
    );
  });

  it('无 studio location → pin 卡片显示 noStudios 提示', () => {
    renderDiaspora({
      // 移除 studioLocation，保留 gallery / museum
      locations: [galleryLocation, museumLocation],
      // 也移除 studio 内部 editions，避免 ghost / location_id 残留
      editions: [
        gallerySoldEdition,
        museumSoldEdition,
        namedBuyerEdition,
        anonSoldEdition,
      ],
    });
    fireEvent.click(screen.getByTestId('constellation-artist'));
    // 中英 i18n 任一匹配
    expect(
      screen.getByText(/未登记工作室位置|No studio locations registered/i)
    ).toBeInTheDocument();
  });

  it('中心节点 sub-label 反映 studio 数 / held / outflow 三段数据', () => {
    const { container } = renderDiaspora();
    const center = screen.getByTestId('constellation-artist');
    // fixture 数据：1 个 studio · 3 件 held · 4 件 outflow
    // sub-label 走 t('diaspora.constellation.centerSubLabel')
    // 验证最关键的三个数字都出现在 sub-label 里
    const labelText = center.textContent ?? '';
    expect(labelText).toMatch(/1/); // studios
    expect(labelText).toMatch(/3/); // held
    expect(labelText).toMatch(/4/); // outflow
    // 防御：原 totalOutflowCount 单数字裸输出已删（不再只显示一个数字）
    void container;
  });
});
