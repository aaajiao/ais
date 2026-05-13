import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithClient } from '@/test/test-utils';
import Locations from '../Locations';
import type { Location } from '@/hooks/useLocations';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// supabase usage-count effect 不影响 chip filter 行为，给一个最小桩
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ not: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/editions/LocationDialog', () => ({
  default: () => null, // 不测 dialog 内部
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeLoc(id: string, name: string, type: Location['type']): Location {
  return {
    id,
    name,
    type,
    aliases: [],
    city: null,
    country: null,
    address: null,
    contact: null,
    notes: null,
    user_id: 'u1',
    created_at: '2024-01-01T00:00:00Z',
  };
}

const fixture: Location[] = [
  makeLoc('s1', 'aaajiao Studio', 'studio'),
  makeLoc('g1', 'Tabula Rasa', 'gallery'),
  makeLoc('g2', 'White Rabbit', 'gallery'),
  makeLoc('m1', 'Power Station of Art', 'museum'),
  makeLoc('p1', 'Sigg Collection', 'private_collection'),
  makeLoc('o1', '中转点', 'other'),
];

const groupByType = (locs: Location[]) =>
  locs.reduce<Record<string, Location[]>>((acc, l) => {
    (acc[l.type] ||= []).push(l);
    return acc;
  }, {});

vi.mock('@/hooks/useLocations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useLocations')>(
    '@/hooks/useLocations'
  );
  return {
    ...actual,
    useLocations: () => ({
      locations: fixture,
      locationsByType: groupByType(fixture),
      isLoading: false,
      error: null,
      deleteLocation: vi.fn().mockResolvedValue(undefined),
      refetch: vi.fn(),
    }),
  };
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderLocations() {
  return renderWithClient(
    <MemoryRouter>
      <Locations />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Locations 页面 — 顶部分类卡 filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认渲染：5 个分类 chip 全部 aria-pressed=false，列表显示全部 6 个 location', () => {
    renderLocations();
    // 5 个 chip（不同 type 的统计卡片）
    const chips = screen.getAllByRole('button', { pressed: false });
    // chips 至少包含 5 个 type filter（可能含其他 button 如"添加位置"，所以 ≥5）
    expect(chips.length).toBeGreaterThanOrEqual(5);
    // 全部 fixture location name 都应该渲染
    for (const loc of fixture) {
      expect(screen.getByText(loc.name)).toBeInTheDocument();
    }
  });

  it('点"画廊"chip → 只渲染 gallery section，chip aria-pressed=true', () => {
    renderLocations();
    const galleryChip = screen.getByRole('button', { name: /画廊/ });
    fireEvent.click(galleryChip);
    expect(galleryChip).toHaveAttribute('aria-pressed', 'true');
    // 渲染 2 个 gallery
    expect(screen.getByText('Tabula Rasa')).toBeInTheDocument();
    expect(screen.getByText('White Rabbit')).toBeInTheDocument();
    // 其他 type 的 location 应不在文档里
    expect(screen.queryByText('aaajiao Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Power Station of Art')).not.toBeInTheDocument();
    expect(screen.queryByText('Sigg Collection')).not.toBeInTheDocument();
  });

  it('再点已选 chip → 关闭，恢复显示全部', () => {
    renderLocations();
    const galleryChip = screen.getByRole('button', { name: /画廊/ });
    fireEvent.click(galleryChip);
    expect(galleryChip).toHaveAttribute('aria-pressed', 'true');
    // 再点一次
    fireEvent.click(galleryChip);
    expect(galleryChip).toHaveAttribute('aria-pressed', 'false');
    // 全部恢复
    expect(screen.getByText('aaajiao Studio')).toBeInTheDocument();
    expect(screen.getByText('Power Station of Art')).toBeInTheDocument();
  });

  it('点 chip A 再点 chip B → 直接切到 B（不是关闭再开）', () => {
    renderLocations();
    const galleryChip = screen.getByRole('button', { name: /画廊/ });
    const museumChip = screen.getByRole('button', { name: /美术馆/ });
    fireEvent.click(galleryChip);
    expect(galleryChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(museumChip);
    expect(museumChip).toHaveAttribute('aria-pressed', 'true');
    expect(galleryChip).toHaveAttribute('aria-pressed', 'false');
    // 只 museum 可见
    expect(screen.getByText('Power Station of Art')).toBeInTheDocument();
    expect(screen.queryByText('Tabula Rasa')).not.toBeInTheDocument();
  });
});
