import { describe, it, expect, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

describe('useEditions query keys', () => {
  describe('queryKeys.editions', () => {
    it('should have correct all key', () => {
      expect(queryKeys.editions.all).toEqual(['editions']);
    });

    it('should generate correct list key with filters', () => {
      const filters = { status: 'in_studio' as const, search: 'test' };
      expect(queryKeys.editions.list(filters)).toEqual(['editions', 'list', filters]);
    });

    it('should generate correct detail key', () => {
      expect(queryKeys.editions.detail('edition-123')).toEqual([
        'editions',
        'detail',
        'edition-123',
      ]);
    });

    it('should generate correct byArtwork key', () => {
      expect(queryKeys.editions.byArtwork('artwork-123')).toEqual([
        'editions',
        'byArtwork',
        'artwork-123',
      ]);
    });

    it('should generate correct infinite key with filters', () => {
      const filters = { status: 'sold' as const };
      expect(queryKeys.editions.infinite(filters)).toEqual([
        'editions',
        'infinite',
        filters,
      ]);
    });

    it('should generate correct history key', () => {
      expect(queryKeys.editions.history('edition-123')).toEqual([
        'editions',
        'history',
        'edition-123',
      ]);
    });

    it('should generate correct files key', () => {
      expect(queryKeys.editions.files('edition-123')).toEqual([
        'editions',
        'files',
        'edition-123',
      ]);
    });
  });

  describe('query key uniqueness', () => {
    it('should generate unique keys for different edition IDs', () => {
      const key1 = queryKeys.editions.detail('edition-1');
      const key2 = queryKeys.editions.detail('edition-2');

      expect(key1).not.toEqual(key2);
    });

    it('should generate unique keys for different filters', () => {
      const key1 = queryKeys.editions.list({ status: 'in_studio' as const });
      const key2 = queryKeys.editions.list({ status: 'sold' as const });

      expect(key1).not.toEqual(key2);
    });

    it('should generate same keys for same filters', () => {
      const filters = { status: 'in_studio' as const, search: 'test' };
      const key1 = queryKeys.editions.list(filters);
      const key2 = queryKeys.editions.list(filters);

      expect(key1).toEqual(key2);
    });
  });

  describe('query key hierarchy', () => {
    it('editions.all should be prefix for all edition keys', () => {
      const allKey = queryKeys.editions.all;
      const detailKey = queryKeys.editions.detail('test');
      const historyKey = queryKeys.editions.history('test');

      expect(detailKey[0]).toBe(allKey[0]);
      expect(historyKey[0]).toBe(allKey[0]);
    });

    it('invalidating editions.all should match all edition queries', () => {
      const matchFn = (key: readonly unknown[]) =>
        key[0] === queryKeys.editions.all[0];

      expect(matchFn(queryKeys.editions.detail('test'))).toBe(true);
      expect(matchFn(queryKeys.editions.history('test'))).toBe(true);
      expect(matchFn(queryKeys.editions.files('test'))).toBe(true);
      expect(matchFn(queryKeys.editions.byArtwork('test'))).toBe(true);
    });
  });
});

describe('Edition status filtering', () => {
  const mockEditions = [
    { id: '1', status: 'in_studio', artwork: { deleted_at: null } },
    { id: '2', status: 'sold', artwork: { deleted_at: null } },
    { id: '3', status: 'in_studio', artwork: { deleted_at: '2024-01-01' } }, // soft deleted
    { id: '4', status: 'at_gallery', artwork: null }, // no artwork
  ];

  it('should filter out editions with soft-deleted artworks', () => {
    const filtered = mockEditions.filter(
      (edition) => !edition.artwork || edition.artwork.deleted_at === null
    );

    expect(filtered).toHaveLength(3);
    expect(filtered.map((e) => e.id)).toEqual(['1', '2', '4']);
  });

  it('should keep editions with null artwork', () => {
    const filtered = mockEditions.filter(
      (edition) => !edition.artwork || edition.artwork.deleted_at === null
    );

    expect(filtered.find((e) => e.id === '4')).toBeDefined();
  });

  it('should not include editions with deleted artworks', () => {
    const filtered = mockEditions.filter(
      (edition) => !edition.artwork || edition.artwork.deleted_at === null
    );

    expect(filtered.find((e) => e.id === '3')).toBeUndefined();
  });
});

describe('Edition status counts', () => {
  it('should count editions by status correctly', () => {
    const editions = [
      { status: 'in_studio', artwork: { deleted_at: null } },
      { status: 'in_studio', artwork: { deleted_at: null } },
      { status: 'sold', artwork: { deleted_at: null } },
      { status: 'at_gallery', artwork: { deleted_at: null } },
      { status: 'in_studio', artwork: { deleted_at: '2024-01-01' } }, // should be excluded
    ];

    // Filter valid editions
    const validEditions = editions.filter(
      (e) => !e.artwork || e.artwork.deleted_at === null
    );

    // Count by status
    const counts: Record<string, number> = {
      all: validEditions.length,
      in_studio: 0,
      sold: 0,
      at_gallery: 0,
    };

    validEditions.forEach((edition) => {
      if (edition.status in counts) {
        counts[edition.status]++;
      }
    });

    expect(counts.all).toBe(4);
    expect(counts.in_studio).toBe(2);
    expect(counts.sold).toBe(1);
    expect(counts.at_gallery).toBe(1);
  });
});

describe('Edition search filtering', () => {
  const mockEditions = [
    {
      id: '1',
      inventory_number: 'AAJ-2024-001',
      artwork: { title_en: 'Test Artwork', title_cn: '测试作品' },
      location: { name: 'Studio A' },
    },
    {
      id: '2',
      inventory_number: 'AAJ-2024-002',
      artwork: { title_en: 'Another Work', title_cn: '另一作品' },
      location: { name: 'Gallery B' },
    },
    {
      id: '3',
      inventory_number: 'XYZ-2024-001',
      artwork: { title_en: 'Third Piece', title_cn: '第三件' },
      location: { name: 'Museum C' },
    },
  ];

  it('should filter by English title', () => {
    const searchLower = 'test'.toLowerCase();
    const filtered = mockEditions.filter(
      (edition) =>
        edition.artwork?.title_en?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should filter by Chinese title', () => {
    const searchLower = '另一'.toLowerCase();
    const filtered = mockEditions.filter(
      (edition) =>
        edition.artwork?.title_cn?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should filter by inventory number', () => {
    const searchLower = 'xyz'.toLowerCase();
    const filtered = mockEditions.filter(
      (edition) =>
        edition.inventory_number?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('3');
  });

  it('should filter by location name', () => {
    const searchLower = 'gallery'.toLowerCase();
    const filtered = mockEditions.filter(
      (edition) =>
        edition.location?.name?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should match multiple fields', () => {
    const searchLower = 'aaj-2024'.toLowerCase();
    const filtered = mockEditions.filter(
      (edition) =>
        edition.artwork?.title_en?.toLowerCase().includes(searchLower) ||
        edition.artwork?.title_cn?.toLowerCase().includes(searchLower) ||
        edition.inventory_number?.toLowerCase().includes(searchLower) ||
        edition.location?.name?.toLowerCase().includes(searchLower)
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id).sort()).toEqual(['1', '2']);
  });
});
