import { describe, it, expect } from 'vitest';
import {
  parseYearAnchor,
  buildHistoryMonthBuckets,
  buildSwimlanes,
  swimlaneHeight,
  stackPositionFor,
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

// ─── parseYearAnchor ────────────────────────────────────────────────────────

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

// ─── buildHistoryMonthBuckets ───────────────────────────────────────────────

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

// ─── buildSwimlanes ─────────────────────────────────────────────────────────

describe('buildSwimlanes', () => {
  it('空输入 → 空 swimlanes + 空 yearRange', () => {
    const { swimlanes, yearRange } = buildSwimlanes([]);
    expect(swimlanes).toEqual([]);
    expect(yearRange).toEqual([]);
  });

  it('单一 type → 1 个 swimlane', () => {
    const { swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Installation', year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Installation', year: '2021' }),
    ]);
    expect(swimlanes).toHaveLength(1);
    expect(swimlanes[0].type).toBe('Installation');
    expect(swimlanes[0].count).toBe(2);
  });

  it('多个 type → 按 count desc 排序', () => {
    const { swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Video', year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Installation', year: '2020' }),
      makeArtwork({ id: 'a3', type: 'Installation', year: '2021' }),
      makeArtwork({ id: 'a4', type: 'Installation', year: '2022' }),
    ]);
    expect(swimlanes[0].type).toBe('Installation');
    expect(swimlanes[0].count).toBe(3);
    expect(swimlanes[1].type).toBe('Video');
    expect(swimlanes[1].count).toBe(1);
  });

  it('null type → 单独 swimlane，displayLabel === "(untyped)"', () => {
    const { swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: null, year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Video', year: '2020' }),
    ]);
    const untyped = swimlanes.find((s) => s.displayLabel === '(untyped)');
    expect(untyped).toBeDefined();
    expect(untyped!.type).toBe('__untyped__');
    expect(untyped!.count).toBe(1);
  });

  it('count tie → 按 displayLabel asc tie-break', () => {
    const { swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Video', year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Application', year: '2021' }),
    ]);
    // Both count=1; 'Application' < 'Video' lexically
    expect(swimlanes[0].type).toBe('Application');
    expect(swimlanes[1].type).toBe('Video');
  });

  it('同 (type, year) 多个作品 → 都在同一 swimlane', () => {
    const { swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Installation', year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Installation', year: '2020' }),
      makeArtwork({ id: 'a3', type: 'Installation', year: '2020' }),
    ]);
    expect(swimlanes).toHaveLength(1);
    expect(swimlanes[0].artworks).toHaveLength(3);
    const ids = swimlanes[0].artworks.map((a) => a.id).sort();
    expect(ids).toEqual(['a1', 'a2', 'a3']);
  });

  it('yearRange 连续填充（缺失年份保留空隙）', () => {
    const { yearRange } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Installation', year: '2018' }),
      makeArtwork({ id: 'a2', type: 'Video', year: '2020' }),
    ]);
    expect(yearRange).toEqual([2018, 2019, 2020]);
  });

  it('year 无法解析的作品不影响 yearRange', () => {
    const { yearRange, swimlanes } = buildSwimlanes([
      makeArtwork({ id: 'a1', type: 'Video', year: '2020' }),
      makeArtwork({ id: 'a2', type: 'Video', year: 'unknown' }),
    ]);
    expect(yearRange).toEqual([2020]);
    // 两个作品都进入 swimlane（year 解析失败不影响 swimlane 归组）
    expect(swimlanes[0].count).toBe(2);
  });

  it('15+ 种 type 各自产生独立 swimlane', () => {
    const types = [
      'Installation', 'Video', 'Digital printing', 'Website',
      'Crypto Art', 'Application', 'Sound Art', 'Sculpture',
      'Projection Mapping', 'Performance', 'Painting', 'Print',
      'JavaScript library', 'Game', '3D printing',
    ];
    const artworks = types.map((t, i) =>
      makeArtwork({ id: `a${i}`, type: t, year: '2020' })
    );
    const { swimlanes } = buildSwimlanes(artworks);
    expect(swimlanes).toHaveLength(15);
    // 全部 count=1，tie-break 按 displayLabel asc
    const labels = swimlanes.map((s) => s.displayLabel);
    const sortedLabels = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sortedLabels);
  });
});

// ─── swimlaneHeight ─────────────────────────────────────────────────────────

describe('swimlaneHeight', () => {
  it('count=1, maxCount=1 → min（最小值）', () => {
    expect(swimlaneHeight(1, 1, 16, 64)).toBe(16 + 1 * (64 - 16));
    // log1p(1)/log1p(1) = 1 → max
    expect(swimlaneHeight(1, 1)).toBe(64);
  });

  it('count=maxCount → max（最大值）', () => {
    expect(swimlaneHeight(115, 115, 16, 64)).toBe(64);
  });

  it('count < maxCount → 中间值 log scale 内插', () => {
    const h = swimlaneHeight(10, 115, 16, 64);
    expect(h).toBeGreaterThan(16);
    expect(h).toBeLessThan(64);
    // log1p(10) ≈ 2.398, log1p(115) ≈ 4.754 → ratio ≈ 0.504
    const expected = 16 + (Math.log1p(10) / Math.log1p(115)) * (64 - 16);
    expect(h).toBeCloseTo(expected, 5);
  });

  it('count=0 → min', () => {
    expect(swimlaneHeight(0, 115, 16, 64)).toBe(16);
  });

  it('maxCount=0 → min', () => {
    expect(swimlaneHeight(5, 0, 16, 64)).toBe(16);
  });

  it('单件 type（Installation 115，其余 1）— count=1 比 count=115 小', () => {
    const h1 = swimlaneHeight(1, 115, 16, 64);
    const h115 = swimlaneHeight(115, 115, 16, 64);
    expect(h1).toBeLessThan(h115);
    expect(h1).toBeGreaterThanOrEqual(16);
    expect(h115).toBe(64);
  });
});

// ─── stackPositionFor ───────────────────────────────────────────────────────

describe('stackPositionFor', () => {
  it('单作品 → row=0, col=0', () => {
    const pos = stackPositionFor(1, 8, 2, 64);
    expect(pos).toEqual([{ row: 0, col: 0 }]);
  });

  it('多作品在 swimlane 高度足够时 → col=0，row 递增', () => {
    // swimlaneH=64, blockSize=8, gap=2 → cellH=10, maxRows=6
    // 4 作品全在 col=0
    const pos = stackPositionFor(4, 8, 2, 64);
    expect(pos.every((p) => p.col === 0)).toBe(true);
    expect(pos.map((p) => p.row)).toEqual([0, 1, 2, 3]);
  });

  it('超出行数 → row 重置为 0，col 递增', () => {
    // swimlaneH=20, blockSize=8, gap=2 → cellH=10, maxRows=2
    // 作品 0: row=0,col=0; 作品 1: row=1,col=0; 作品 2: row=0,col=1
    const pos = stackPositionFor(3, 8, 2, 20);
    expect(pos[0]).toEqual({ row: 0, col: 0 });
    expect(pos[1]).toEqual({ row: 1, col: 0 });
    expect(pos[2]).toEqual({ row: 0, col: 1 });
  });

  it('swimlaneH 极小 → maxRows 最少为 1，不崩溃', () => {
    const pos = stackPositionFor(3, 8, 2, 1);
    // maxRows = max(1, floor(1/10)) = 1
    expect(pos[0]).toEqual({ row: 0, col: 0 });
    expect(pos[1]).toEqual({ row: 0, col: 1 });
    expect(pos[2]).toEqual({ row: 0, col: 2 });
  });

  it('零作品 → 空数组', () => {
    expect(stackPositionFor(0, 8, 2, 64)).toEqual([]);
  });
});
