import { describe, it, expect } from 'vitest';
import {
  parseYearAnchor,
  tierForType,
  buildYearBuckets,
  buildHistoryMonthBuckets,
  TIER_OPACITY,
} from './strataUtils';
import type { VizArtwork } from '@/hooks/queries/useVisualizationData';

function makeArtwork(overrides: Partial<VizArtwork>): VizArtwork {
  return {
    id: 'a',
    title_en: 'untitled',
    title_cn: null,
    year: null,
    type: null,
    thumbnail_url: null,
    edition_total: null,
    ap_total: null,
    is_unique: false,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseYearAnchor', () => {
  it.each([
    ['2017', 2017],
    ['2024-2025', 2024],
    ['2024–2025', 2024],
    ['circa 2010', 2010],
    ['2017 - 2018', 2017],
  ])('"%s" → %i', (input, expected) => {
    expect(parseYearAnchor(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'unknown', 'abc'])(
    'invalid input "%s" → null',
    (input) => {
      expect(parseYearAnchor(input as string | null)).toBeNull();
    }
  );

  it('1800 / 2200 等越界年份 → null', () => {
    expect(parseYearAnchor('1800')).toBeNull();
    expect(parseYearAnchor('2200')).toBeNull();
  });
});

describe('tierForType', () => {
  it('头部 3 种 type 各自归位', () => {
    expect(tierForType('Installation')).toBe('Installation');
    expect(tierForType('Video')).toBe('Video');
    expect(tierForType('Digital printing')).toBe('Digital printing');
  });

  it('其他 type 归入 other', () => {
    expect(tierForType('Website')).toBe('other');
    expect(tierForType('Sculpture')).toBe('other');
    expect(tierForType(null)).toBe('other');
    expect(tierForType('')).toBe('other');
  });

  it('TIER_OPACITY 四种 tier 都有定义且降序', () => {
    expect(TIER_OPACITY['Installation']).toBeGreaterThan(TIER_OPACITY['Video']);
    expect(TIER_OPACITY['Video']).toBeGreaterThan(
      TIER_OPACITY['Digital printing']
    );
    expect(TIER_OPACITY['Digital printing']).toBeGreaterThan(
      TIER_OPACITY['other']
    );
  });
});

describe('buildYearBuckets', () => {
  it('空输入 → 空 buckets', () => {
    expect(buildYearBuckets([])).toEqual({ buckets: [], maxStack: 0 });
  });

  it('忽略 year 无法解析的作品', () => {
    const { buckets } = buildYearBuckets([
      makeArtwork({ id: 'x', year: 'unknown' }),
      makeArtwork({ id: 'y', year: '2020' }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].year).toBe(2020);
    expect(buckets[0].artworks).toHaveLength(1);
    expect(buckets[0].artworks[0].id).toBe('y');
  });

  it('生成连续年份区间（缺失年份保留空列）', () => {
    const { buckets } = buildYearBuckets([
      makeArtwork({ id: 'a', year: '2018' }),
      makeArtwork({ id: 'b', year: '2020' }),
    ]);
    expect(buckets.map((b) => b.year)).toEqual([2018, 2019, 2020]);
    expect(buckets[1].artworks).toEqual([]);
  });

  it('bucket 内按 tier 倒序：Installation 在末尾（视觉上的底部）', () => {
    const { buckets } = buildYearBuckets([
      makeArtwork({ id: 'inst', year: '2020', type: 'Installation' }),
      makeArtwork({ id: 'other', year: '2020', type: 'Website' }),
      makeArtwork({ id: 'vid', year: '2020', type: 'Video' }),
    ]);
    // 数组顺序 = other / Video / Installation（按 tierIndex desc）
    // 渲染时 stackIdx 增长方向是 y 减小（往上堆），所以排在前面 = 顶部
    expect(buckets[0].artworks.map((a) => a.id)).toEqual([
      'other',
      'vid',
      'inst',
    ]);
  });

  it('maxStack = 任一年份内的最大作品数', () => {
    const { maxStack } = buildYearBuckets([
      makeArtwork({ id: '1', year: '2020' }),
      makeArtwork({ id: '2', year: '2020' }),
      makeArtwork({ id: '3', year: '2020' }),
      makeArtwork({ id: '4', year: '2021' }),
    ]);
    expect(maxStack).toBe(3);
  });

  it('year range 解析为 anchor year', () => {
    const { buckets } = buildYearBuckets([
      makeArtwork({ id: 'r', year: '2017-2019' }),
    ]);
    expect(buckets[0].year).toBe(2017);
  });
});

describe('buildHistoryMonthBuckets', () => {
  it('按 YYYY-MM 分桶并升序', () => {
    const { entries, max } = buildHistoryMonthBuckets([
      { created_at: '2026-05-01T00:00:00Z' },
      { created_at: '2026-01-15T00:00:00Z' },
      { created_at: '2026-05-20T00:00:00Z' },
    ]);
    expect(entries).toEqual([
      ['2026-01', 1],
      ['2026-05', 2],
    ]);
    expect(max).toBe(2);
  });

  it('空输入', () => {
    expect(buildHistoryMonthBuckets([])).toEqual({ entries: [], max: 0 });
  });

  it('忽略空 created_at', () => {
    const { entries } = buildHistoryMonthBuckets([
      { created_at: '' },
      { created_at: '2026-01-01' },
    ]);
    expect(entries).toEqual([['2026-01', 1]]);
  });
});
