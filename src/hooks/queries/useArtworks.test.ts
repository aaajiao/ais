import { describe, it, expect, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { getArtworkMainStatus } from './useArtworks';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn(() => ({
            order: vi.fn(() => ({
              or: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    })),
  },
}));

describe('useArtworks query keys', () => {
  describe('queryKeys.artworks', () => {
    it('should have correct all key', () => {
      expect(queryKeys.artworks.all).toEqual(['artworks']);
    });

    it('should generate correct list key with filters', () => {
      const filters = { status: 'in_studio' as const, search: 'test' };
      expect(queryKeys.artworks.list(filters)).toEqual(['artworks', 'list', filters]);
    });

    it('should generate correct detail key', () => {
      expect(queryKeys.artworks.detail('artwork-123')).toEqual([
        'artworks',
        'detail',
        'artwork-123',
      ]);
    });

    it('should generate correct infinite key with filters', () => {
      const filters = { status: 'sold' as const };
      expect(queryKeys.artworks.infinite(filters)).toEqual([
        'artworks',
        'infinite',
        filters,
      ]);
    });
  });

  describe('query key uniqueness', () => {
    it('should generate unique keys for different artwork IDs', () => {
      const key1 = queryKeys.artworks.detail('artwork-1');
      const key2 = queryKeys.artworks.detail('artwork-2');

      expect(key1).not.toEqual(key2);
    });

    it('should generate unique keys for different filters', () => {
      const key1 = queryKeys.artworks.list({ status: 'in_studio' as const });
      const key2 = queryKeys.artworks.list({ status: 'sold' as const });

      expect(key1).not.toEqual(key2);
    });

    it('should generate same keys for same filters', () => {
      const filters = { status: 'in_studio' as const, search: 'test' };
      const key1 = queryKeys.artworks.list(filters);
      const key2 = queryKeys.artworks.list(filters);

      expect(key1).toEqual(key2);
    });
  });

  describe('query key hierarchy', () => {
    it('artworks.all should be prefix for all artwork keys', () => {
      const allKey = queryKeys.artworks.all;
      const detailKey = queryKeys.artworks.detail('test');
      const listKey = queryKeys.artworks.list({});

      expect(detailKey[0]).toBe(allKey[0]);
      expect(listKey[0]).toBe(allKey[0]);
    });

    it('invalidating artworks.all should match all artwork queries', () => {
      const matchFn = (key: readonly unknown[]) =>
        key[0] === queryKeys.artworks.all[0];

      expect(matchFn(queryKeys.artworks.detail('test'))).toBe(true);
      expect(matchFn(queryKeys.artworks.list({}))).toBe(true);
      expect(matchFn(queryKeys.artworks.infinite({}))).toBe(true);
    });
  });
});

describe('getArtworkMainStatus', () => {
  it('should return null for empty editions array', () => {
    expect(getArtworkMainStatus([])).toBeNull();
  });

  it('should prioritize at_gallery status', () => {
    const editions = [
      { status: 'in_studio' as const },
      { status: 'at_gallery' as const },
      { status: 'sold' as const },
    ];
    expect(getArtworkMainStatus(editions)).toBe('at_gallery');
  });

  it('should prioritize in_studio when no at_gallery', () => {
    const editions = [
      { status: 'in_studio' as const },
      { status: 'sold' as const },
      { status: 'in_production' as const },
    ];
    expect(getArtworkMainStatus(editions)).toBe('in_studio');
  });

  it('should prioritize sold when no at_gallery or in_studio', () => {
    const editions = [
      { status: 'sold' as const },
      { status: 'gifted' as const },
      { status: 'lost' as const },
    ];
    expect(getArtworkMainStatus(editions)).toBe('sold');
  });

  it('should return first status when none of priority statuses exist', () => {
    const editions = [
      { status: 'in_production' as const },
      { status: 'in_transit' as const },
    ];
    expect(getArtworkMainStatus(editions)).toBe('in_production');
  });

  it('should handle single edition', () => {
    const editions = [{ status: 'at_museum' as const }];
    expect(getArtworkMainStatus(editions)).toBe('at_museum');
  });
});

describe('Artwork stats calculation', () => {
  const calculateStats = (editions: { status: string }[]) => ({
    total: editions.length,
    inStudio: editions.filter((e) => e.status === 'in_studio').length,
    atGallery: editions.filter((e) => e.status === 'at_gallery').length,
    sold: editions.filter((e) => e.status === 'sold').length,
  });

  it('should calculate correct stats for mixed editions', () => {
    const editions = [
      { status: 'in_studio' },
      { status: 'in_studio' },
      { status: 'at_gallery' },
      { status: 'sold' },
      { status: 'sold' },
      { status: 'sold' },
    ];

    const stats = calculateStats(editions);

    expect(stats.total).toBe(6);
    expect(stats.inStudio).toBe(2);
    expect(stats.atGallery).toBe(1);
    expect(stats.sold).toBe(3);
  });

  it('should handle empty editions', () => {
    const stats = calculateStats([]);

    expect(stats.total).toBe(0);
    expect(stats.inStudio).toBe(0);
    expect(stats.atGallery).toBe(0);
    expect(stats.sold).toBe(0);
  });

  it('should handle editions with no tracked statuses', () => {
    const editions = [
      { status: 'in_production' },
      { status: 'in_transit' },
      { status: 'damaged' },
    ];

    const stats = calculateStats(editions);

    expect(stats.total).toBe(3);
    expect(stats.inStudio).toBe(0);
    expect(stats.atGallery).toBe(0);
    expect(stats.sold).toBe(0);
  });
});

describe('Artwork search filtering', () => {
  const mockArtworks = [
    {
      id: '1',
      title_en: 'Digital Dreams',
      title_cn: '数字梦境',
      year: '2024',
      type: 'Installation',
    },
    {
      id: '2',
      title_en: 'Urban Landscape',
      title_cn: '城市风景',
      year: '2023',
      type: 'Photography',
    },
    {
      id: '3',
      title_en: 'Abstract Form',
      title_cn: '抽象形态',
      year: '2024',
      type: 'Sculpture',
    },
  ];

  it('should filter by English title', () => {
    const searchLower = 'digital'.toLowerCase();
    const filtered = mockArtworks.filter(
      (artwork) =>
        artwork.title_en?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should filter by Chinese title', () => {
    const searchLower = '城市'.toLowerCase();
    const filtered = mockArtworks.filter(
      (artwork) =>
        artwork.title_cn?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should filter by year', () => {
    const searchLower = '2024';
    const filtered = mockArtworks.filter(
      (artwork) =>
        artwork.year?.includes(searchLower)
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.id).sort()).toEqual(['1', '3']);
  });

  it('should filter by type', () => {
    const searchLower = 'photo'.toLowerCase();
    const filtered = mockArtworks.filter(
      (artwork) =>
        artwork.type?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should match multiple fields', () => {
    const searchLower = 'form'.toLowerCase();
    const filtered = mockArtworks.filter(
      (artwork) =>
        artwork.title_en?.toLowerCase().includes(searchLower) ||
        artwork.title_cn?.toLowerCase().includes(searchLower) ||
        artwork.year?.includes(searchLower) ||
        artwork.type?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('3');
  });
});

describe('Artwork status filtering', () => {
  const mockArtworks = [
    {
      id: '1',
      editions: [{ status: 'in_studio' }, { status: 'sold' }],
    },
    {
      id: '2',
      editions: [{ status: 'at_gallery' }],
    },
    {
      id: '3',
      editions: [{ status: 'sold' }, { status: 'sold' }],
    },
    {
      id: '4',
      editions: [],
    },
  ];

  it('should filter artworks with editions matching status', () => {
    const statusToFilter = 'at_gallery';
    const filtered = mockArtworks.filter((artwork) =>
      artwork.editions.some((e) => e.status === statusToFilter)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should find artworks with any matching edition', () => {
    const statusToFilter = 'in_studio';
    const filtered = mockArtworks.filter((artwork) =>
      artwork.editions.some((e) => e.status === statusToFilter)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should find artworks with sold editions', () => {
    const statusToFilter = 'sold';
    const filtered = mockArtworks.filter((artwork) =>
      artwork.editions.some((e) => e.status === statusToFilter)
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.id).sort()).toEqual(['1', '3']);
  });

  it('should exclude artworks with no editions when filtering by status', () => {
    const statusToFilter = 'in_studio';
    const filtered = mockArtworks.filter((artwork) =>
      artwork.editions.some((e) => e.status === statusToFilter)
    );

    expect(filtered.find((a) => a.id === '4')).toBeUndefined();
  });
});

describe('Soft delete filtering', () => {
  const mockArtworks = [
    { id: '1', title_en: 'Active Artwork', deleted_at: null },
    { id: '2', title_en: 'Deleted Artwork', deleted_at: '2024-01-01T00:00:00Z' },
    { id: '3', title_en: 'Another Active', deleted_at: null },
  ];

  it('should filter out soft-deleted artworks', () => {
    const filtered = mockArtworks.filter((artwork) => artwork.deleted_at === null);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.id).sort()).toEqual(['1', '3']);
  });

  it('should not include deleted artwork', () => {
    const filtered = mockArtworks.filter((artwork) => artwork.deleted_at === null);

    expect(filtered.find((a) => a.id === '2')).toBeUndefined();
  });
});
