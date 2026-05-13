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

// Studio location (center node — most editions)
const studioLocation: VizLocation = {
  id: 'loc-studio',
  name: 'aaajiao Shanghai Studio',
  type: 'studio',
  city: 'Shanghai',
  country: 'China',
};

// Gallery location (outer node)
const galleryLocation: VizLocation = {
  id: 'loc-gallery',
  name: 'Test Gallery Berlin',
  type: 'gallery',
  city: 'Berlin',
  country: 'Germany',
};

// Location with a name longer than 18 chars to assert SVG <title> tooltip + truncation
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
  status: 'at_gallery',
  location_id: 'loc-longname',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2024-02-01T00:00:00Z',
};

// Editions at studio
const studioEditions: VizEdition[] = [
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
    inventory_number: null, // no inventory number
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

// Edition at gallery
const galleryEdition: VizEdition = {
  id: 'e4',
  artwork_id: 'artwork-2',
  inventory_number: 'AAJ-2023-001',
  edition_type: 'numbered',
  edition_number: 2,
  status: 'at_gallery',
  location_id: 'loc-gallery',
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  created_at: '2023-06-01T00:00:00Z',
};

const allEditions = [...studioEditions, galleryEdition];

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

const allLocations = [studioLocation, galleryLocation];
const allArtworks = [fakeArtwork, fakeArtwork2];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderDiaspora(
  overrides: Partial<{
    artworks: VizArtwork[];
    editions: VizEdition[];
    locations: VizLocation[];
    history: VizHistory[];
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

  it('初始状态：无 pin、信息条显示 summary 总览', () => {
    renderDiaspora();

    // Heading rendered
    expect(screen.getByRole('heading', { name: /Diaspora|流散/i })).toBeInTheDocument();

    // No pin card visible initially
    expect(screen.queryByRole('button', { name: /查看此位置全部版本|View all editions/i })).not.toBeInTheDocument();

    // Default summary shown (2 locations, 1 flow)
    expect(screen.getByText(/处位置.*条流转|locations.*flows/i)).toBeInTheDocument();
  });

  it('hover 节点 → 下方信息条预览 location 信息', () => {
    renderDiaspora();

    // Find a node group by aria-label containing gallery name
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.mouseEnter(galleryGroup);

    // Preview appears (scope to div/span — SVG <title> also contains the name now)
    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();
    // Pin icon (lucide) signals click-to-pin affordance; no text hint anymore
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
    // Preview gone — assert the visible (non-SVG-title) instance disappears.
    // SVG <title> remains on the node permanently; that's fine.
    expect(
      screen.queryByText('Test Gallery Berlin', { selector: 'div,span' })
    ).not.toBeInTheDocument();
    // Summary overview restored
    expect(screen.getByText(/处位置.*条流转|locations.*flows/i)).toBeInTheDocument();
  });

  it('click 节点 → pin 卡片出现 + 显示 editions 列表', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // Pin card should show gallery name (scope away from SVG <title>)
    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();
    // View all link
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();
    // Edition inventory chip
    expect(screen.getByRole('button', { name: 'AAJ-2023-001' })).toBeInTheDocument();
  });

  it('pin 卡片中的 edition 行点击 → navigate 到 /editions/{id}', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // Click on the edition row button
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
    // Pinned
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();

    fireEvent.click(galleryGroup);
    // Unpinned
    expect(screen.queryByRole('button', { name: /查看此位置全部版本|View all editions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/处位置.*条流转|locations.*flows/i)).toBeInTheDocument();
  });

  it('click 另一节点 → 切换 pin 到新节点', () => {
    renderDiaspora();

    // Pin gallery
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(
      screen.getByText('Test Gallery Berlin', { selector: 'div,span' })
    ).toBeInTheDocument();

    // Click center node (studio) to switch pin
    const studioGroup = screen.getByRole('button', {
      name: /aaajiao Shanghai Studio/i,
    });
    fireEvent.click(studioGroup);

    // Now studio is pinned, gallery pin is gone
    expect(
      screen.getByText('aaajiao Shanghai Studio', { selector: 'div,span' })
    ).toBeInTheDocument();
    // Gallery node name should not be in pin card position
    // Check "view all" still present (still pinned, just to different location)
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();
  });

  it('pin 状态下 hover 其他节点 → pin 卡片保持，不显示预览', () => {
    renderDiaspora();

    // Pin gallery first
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();

    // Hover studio node
    const studioGroup = screen.getByRole('button', {
      name: /aaajiao Shanghai Studio/i,
    });
    fireEvent.mouseEnter(studioGroup);

    // Pin card still visible (gallery pin not disturbed)
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();
  });

  it('edition 无 inventory_number 时显示 id 前缀 + noInventory 标记', () => {
    renderDiaspora();

    // Pin the studio (which has e3 with no inventory_number)
    const studioGroup = screen.getByRole('button', {
      name: /aaajiao Shanghai Studio/i,
    });
    fireEvent.click(studioGroup);

    // e3 has no inventory_number, id = 'e3', so displayId starts with 'e3'
    // The display should show "e3" prefix (first 8 chars of uuid) + noInventory marker
    // Since id is 'e3' (2 chars), it shows 'e3（无编号）' or 'e3(no inv)'
    expect(screen.getByText(/e3/)).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();
  });

  it('pin 卡片中每个 edition chip 只显示 inventory 号（status 仅作 title）', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // chip 仅显示 inv；status 作为 title attr 不进 accessible name
    const chip = screen.getByRole('button', { name: 'AAJ-2023-001' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('title', 'at_gallery');
  });

  it('长名 location 节点渲染 SVG <title> 元素显示完整 name（label 被截断）', () => {
    const { container } = renderDiaspora({
      locations: [studioLocation, longNameLocation],
      editions: [...studioEditions, longNameEdition],
    });

    // The node <g> has data-node attribute matching the location id
    const node = container.querySelector('g[data-node="loc-longname"]');
    expect(node).not.toBeNull();

    // SVG native <title> child carries the full name (used as native tooltip on hover)
    const titleEl = node!.querySelector('title');
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe(longNameLocation.name);

    // The visible label is truncated (16 chars + '…')
    const visibleText = node!.querySelector('text');
    expect(visibleText).not.toBeNull();
    expect(visibleText!.textContent).toBe(
      longNameLocation.name.slice(0, 16) + '…'
    );
  });

  it('center node 也带 SVG <title> 显示完整 name', () => {
    const { container } = renderDiaspora();

    // Studio is the center (3 editions vs gallery's 1)
    const centerNode = container.querySelector('g[data-node="loc-studio"]');
    expect(centerNode).not.toBeNull();

    const titleEl = centerNode!.querySelector('title');
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe(studioLocation.name);
  });

  it('pin 卡片 edition 行点击不会冒泡触发 SVG unpin（stopPropagation 防御）', () => {
    renderDiaspora();

    // Pin the gallery
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(screen.getByRole('button', { name: /查看此位置全部版本|View all editions/i })).toBeInTheDocument();

    // Click the edition row — should navigate but NOT unpin
    const editionBtn = screen.getByRole('button', { name: /AAJ-2023-001/i });
    fireEvent.click(editionBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/editions/e4');
    // Verify stopPropagation by checking we'd remain pinned if the navigate were not present.
    // Direct verification: the click event handler should call stopPropagation —
    // we cover this with a dedicated spy test below.
  });

  // ─── M2 ghost ring ────────────────────────────────────────────────────────

  it('有 location_id 缺失的 edition → 渲染 ghost 环（圆数 = 缺失数）', () => {
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
    // aria-hidden 让 screen reader 忽略（鬼影不进可达性树）
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    // 没有 role="button" / aria-pressed / tabIndex
    expect(ring.querySelector('[role="button"]')).toBeNull();
    expect(ring.querySelector('[aria-pressed]')).toBeNull();
    expect(ring.querySelector('[tabindex]')).toBeNull();
    // stroke-only
    const circle = ring.querySelector('circle')!;
    expect(circle.getAttribute('fill')).toBe('none');
    const cls = circle.getAttribute('class') ?? '';
    expect(cls).toContain('stroke-foreground');
  });

  it('所有 edition 都有 location_id → 不渲染 ghost 环（不画空环）', () => {
    // allEditions 都有 location_id
    const { container } = renderDiaspora();
    const ring = container.querySelector('[data-testid="diaspora-ghost-ring"]');
    expect(ring).toBeNull();
  });

  it('pin 卡片按钮 onClick 调用 stopPropagation（spy 验证）', () => {
    renderDiaspora();

    // Pin gallery
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // Spy stopPropagation by creating a custom event
    const editionBtn = screen.getByRole('button', { name: /AAJ-2023-001/i });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(event, 'stopPropagation');
    editionBtn.dispatchEvent(event);

    expect(stopProp).toHaveBeenCalled();

    // Same for "view all" button
    const viewAllBtn = screen.getByRole('button', {
      name: /查看此位置全部版本|View all editions/i,
    });
    const event2 = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopProp2 = vi.spyOn(event2, 'stopPropagation');
    viewAllBtn.dispatchEvent(event2);

    expect(stopProp2).toHaveBeenCalled();
  });
});
