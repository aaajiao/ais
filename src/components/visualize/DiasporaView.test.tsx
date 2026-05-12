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

  it('初始状态：无 pin、信息条显示默认提示', () => {
    renderDiaspora();

    // Heading rendered
    expect(screen.getByRole('heading', { name: /Diaspora|流散/i })).toBeInTheDocument();

    // No pin card visible initially
    expect(screen.queryByText(/查看此位置全部版本|View all editions/i)).not.toBeInTheDocument();

    // Default hint shown
    expect(screen.getByText(/悬停或点击节点|Hover or click/i)).toBeInTheDocument();
  });

  it('hover 节点 → 下方信息条预览 location 信息', () => {
    renderDiaspora();

    // Find a node group by aria-label containing gallery name
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.mouseEnter(galleryGroup);

    // Preview appears
    expect(screen.getByText('Test Gallery Berlin')).toBeInTheDocument();
    // Should show clickToPin hint
    expect(screen.getByText(/点击固定|Click to pin/i)).toBeInTheDocument();
  });

  it('hover 离开 → 预览消失，恢复默认提示', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.mouseEnter(galleryGroup);
    expect(screen.getByText('Test Gallery Berlin')).toBeInTheDocument();

    fireEvent.mouseLeave(galleryGroup);
    // Preview gone
    expect(screen.queryByText(/Test Gallery Berlin/)).not.toBeInTheDocument();
    // Default hint restored
    expect(screen.getByText(/悬停或点击节点|Hover or click/i)).toBeInTheDocument();
  });

  it('click 节点 → pin 卡片出现 + 显示 editions 列表', () => {
    renderDiaspora();

    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // Pin card should show gallery name
    expect(screen.getByText('Test Gallery Berlin')).toBeInTheDocument();
    // View all link
    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();
    // Edition inventory number
    expect(screen.getByText('AAJ-2023-001')).toBeInTheDocument();
    // Edition status
    expect(screen.getByText(/at_gallery/)).toBeInTheDocument();
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
    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();

    fireEvent.click(galleryGroup);
    // Unpinned
    expect(screen.queryByText(/查看此位置全部版本|View all editions/i)).not.toBeInTheDocument();
    expect(screen.getByText(/悬停或点击节点|Hover or click/i)).toBeInTheDocument();
  });

  it('click 另一节点 → 切换 pin 到新节点', () => {
    renderDiaspora();

    // Pin gallery
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(screen.getByText('Test Gallery Berlin')).toBeInTheDocument();

    // Click center node (studio) to switch pin
    const studioGroup = screen.getByRole('button', {
      name: /aaajiao Shanghai Studio/i,
    });
    fireEvent.click(studioGroup);

    // Now studio is pinned, gallery pin is gone
    expect(screen.getByText('aaajiao Shanghai Studio')).toBeInTheDocument();
    // Gallery node name should not be in pin card position
    // Check "view all" still present (still pinned, just to different location)
    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();
  });

  it('pin 状态下 hover 其他节点 → pin 卡片保持，不显示预览', () => {
    renderDiaspora();

    // Pin gallery first
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);
    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();

    // Hover studio node
    const studioGroup = screen.getByRole('button', {
      name: /aaajiao Shanghai Studio/i,
    });
    fireEvent.mouseEnter(studioGroup);

    // Pin card still visible (gallery pin not disturbed)
    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();
    // "clickToPin" hint should NOT appear (pin is active)
    expect(screen.queryByText(/点击固定|Click to pin/i)).not.toBeInTheDocument();
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

    expect(screen.getByText(/查看此位置全部版本|View all editions/i)).toBeInTheDocument();
  });

  it('pin 卡片中 artwork title 使用 title_cn fallback（title_en 为 null 时）', () => {
    renderDiaspora();

    // Pin gallery — galleryEdition is artwork-2 which has title_en=null, title_cn='末日媒体'
    const galleryGroup = screen.getByRole('button', {
      name: /Test Gallery Berlin/i,
    });
    fireEvent.click(galleryGroup);

    // Should show cn title as fallback
    expect(screen.getByText(/末日媒体/)).toBeInTheDocument();
  });
});
