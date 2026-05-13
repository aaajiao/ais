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
    expect(chip).toHaveAttribute('title', 'sold');
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

  // ─── M2 ghost ring ────────────────────────────────────────────────────────

  it('有 location_id 缺失的非 outflow edition → 渲染 ghost 环', () => {
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
    const ring = container.querySelector('[data-testid="diaspora-ghost-ring"]');
    expect(ring).not.toBeNull();
    const circles = ring!.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('ghost 圆 stroke-only + 不可点击（aria-hidden + 无 role / 无 tabIndex）', () => {
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
    const ring = container.querySelector('[data-testid="diaspora-ghost-ring"]')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.querySelector('[role="button"]')).toBeNull();
    expect(ring.querySelector('[aria-pressed]')).toBeNull();
    expect(ring.querySelector('[tabindex]')).toBeNull();
    const circle = ring.querySelector('circle')!;
    expect(circle.getAttribute('fill')).toBe('none');
    const cls = circle.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-foreground');
  });

  it('所有 non-outflow edition 都有 location_id → 不渲染 ghost 环', () => {
    // allEditions 里 non-outflow editions（studioInternalEditions）都有 location_id
    const { container } = renderDiaspora();
    const ring = container.querySelector('[data-testid="diaspora-ghost-ring"]');
    expect(ring).toBeNull();
  });

  it('图例包含 ghost 项（diaspora-legend-ghost testid）', () => {
    renderDiaspora();
    expect(screen.getByTestId('diaspora-legend-ghost')).toBeInTheDocument();
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
    const svg = container.querySelector('svg')!;
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

  it('anonymous dots 不可点击（无 role/tabIndex）', () => {
    const { container } = renderDiaspora();
    const anon = container.querySelector('[data-testid="constellation-anon-0"]');
    expect(anon).not.toBeNull();
    expect(anon!.getAttribute('role')).toBeNull();
    expect(anon!.getAttribute('tabindex')).toBeNull();
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
    // 构造两个 dated location，一个 earliest（落 12 点钟，dx≈0 → 右半算）一个 latest
    // 仅用一个 dated entity 不够判断 anchor（落 12 点钟时 dx=0）；
    // 构造两个不同日期的 location：earliest 落顶部，latest 也落顶部（绕一圈）
    // —— 二者都在 dx>=0 一侧（顶部 dx=0 当 isRightHalf）。
    // 为了拿到左右两侧 label，用 3 个 dated entity 形成不同 t 值：
    //   t=0   → -π/2 (顶部, dx=0 → right)
    //   t=0.25 → 0   (3 点钟方向, dx>0 → right)
    //   t=0.5 → π/2  (6 点钟方向, dx=0 → right; dy>0)
    //   t=0.75 → π   (9 点钟方向, dx<0 → left) ←—— 要这个
    const locs: VizLocation[] = [
      { id: 'loc-a', name: 'A', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-b', name: 'B', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-c', name: 'C', type: 'gallery', city: null, country: 'China' },
      { id: 'loc-d', name: 'D', type: 'gallery', city: null, country: 'China' },
    ];
    // t 值由 sale_date 在 [min, max] 区间的位置决定。span = 4ms（4 个连续 ms）
    // 让 t = 0 / 1/3 / 2/3 / 1
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
      // 跨度 2018→2024，4 个等距点：2018/2020/2022/2024
      sale_date: `${2018 + i * 2}-01-01`,
      buyer_name: null,
      created_at: '2020-01-01T00:00:00Z',
    }));
    const { container } = renderDiaspora({ editions: eds, locations: locs });
    // loc-c 对应 t=2/3 → angle = -π/2 + 2π * 2/3 = 5π/6（≈ 150°，左半 dx<0）
    const groupC = container.querySelector('g[data-node="loc-c"]')!;
    const texts = groupC.querySelectorAll('text');
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts[0].getAttribute('text-anchor')).toBe('end');

    // loc-b 对应 t=1/3 → angle = -π/2 + 2π/3 = π/6（≈ 30°, 右半 dx>0）
    const groupB = container.querySelector('g[data-node="loc-b"]')!;
    const textsB = groupB.querySelectorAll('text');
    expect(textsB[0].getAttribute('text-anchor')).toBe('start');
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
});
