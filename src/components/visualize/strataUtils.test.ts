import { describe, it, expect } from 'vitest';
import {
  parseYearAnchor,
  buildHistoryMonthBuckets,
  buildSwimlanes,
  swimlaneHeight,
  stackPositionFor,
  filterArtworksByYearCutoff,
  getArtworkOwnershipState,
  getUnknownYearArtworks,
  OWNERSHIP_STATUS_MAP,
} from './strataUtils';
import type {
  VizArtwork,
  VizEdition,
} from '@/hooks/queries/useVisualizationData';
import type { EditionStatus } from '@/lib/database.types';

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

// ─── filterArtworksByYearCutoff ─────────────────────────────────────────────

describe('filterArtworksByYearCutoff', () => {
  const artworks = [
    makeArtwork({ id: 'a1', year: '2014' }),
    makeArtwork({ id: 'a2', year: '2018' }),
    makeArtwork({ id: 'a3', year: '2020-2021' }),
    makeArtwork({ id: 'a4', year: '2026' }),
    makeArtwork({ id: 'a5', year: 'unknown' }),
    makeArtwork({ id: 'a6', year: null }),
  ];

  it('cutoff = max → 返回全部有 year 的作品（year 不可解析的被排除）', () => {
    const result = filterArtworksByYearCutoff(artworks, 2026);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('cutoff = 中间年份 → 只返回 anchor year <= cutoff 的作品', () => {
    const result = filterArtworksByYearCutoff(artworks, 2018);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('cutoff = min - 1 → 空数组', () => {
    const result = filterArtworksByYearCutoff(artworks, 2013);
    expect(result).toEqual([]);
  });

  it('range 类型 year（"2020-2021"）使用 anchor（起始年）做比较', () => {
    const result = filterArtworksByYearCutoff(artworks, 2020);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toContain('a3');
  });

  it('year 无法解析的作品始终被过滤掉', () => {
    const result = filterArtworksByYearCutoff(artworks, 2100);
    const ids = result.map((a) => a.id);
    expect(ids).not.toContain('a5');
    expect(ids).not.toContain('a6');
  });

  it('空输入 → 空数组', () => {
    expect(filterArtworksByYearCutoff([], 2024)).toEqual([]);
  });
});

// ─── M2: getArtworkOwnershipState ───────────────────────────────────────────

function makeEdition(
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

describe('OWNERSHIP_STATUS_MAP（数据驱动入口）', () => {
  // 把 status enum 真实值显式列出，让"未来新增 status 漏更新 map"在 typecheck 之外
  // 还能被 runtime 测试挡一次。
  it('覆盖所有 9 个 EditionStatus 枚举值', () => {
    const expected: EditionStatus[] = [
      'in_production',
      'in_studio',
      'at_gallery',
      'at_museum',
      'in_transit',
      'sold',
      'gifted',
      'lost',
      'damaged',
    ];
    for (const s of expected) {
      expect(OWNERSHIP_STATUS_MAP[s]).toBeDefined();
    }
  });

  it('held 桶 = in_production + in_studio', () => {
    expect(OWNERSHIP_STATUS_MAP.in_production.bucket).toBe('held');
    expect(OWNERSHIP_STATUS_MAP.in_studio.bucket).toBe('held');
  });

  it('external 桶 = at_gallery + at_museum + in_transit', () => {
    expect(OWNERSHIP_STATUS_MAP.at_gallery.bucket).toBe('external');
    expect(OWNERSHIP_STATUS_MAP.at_museum.bucket).toBe('external');
    expect(OWNERSHIP_STATUS_MAP.in_transit.bucket).toBe('external');
  });

  it('departed 桶 = sold + gifted + lost + damaged', () => {
    expect(OWNERSHIP_STATUS_MAP.sold.bucket).toBe('departed');
    expect(OWNERSHIP_STATUS_MAP.gifted.bucket).toBe('departed');
    expect(OWNERSHIP_STATUS_MAP.lost.bucket).toBe('departed');
    expect(OWNERSHIP_STATUS_MAP.damaged.bucket).toBe('departed');
  });

  it('degenerate 标记 = lost + damaged，其余为 false', () => {
    expect(OWNERSHIP_STATUS_MAP.lost.degenerate).toBe(true);
    expect(OWNERSHIP_STATUS_MAP.damaged.degenerate).toBe(true);
    expect(OWNERSHIP_STATUS_MAP.in_studio.degenerate).toBe(false);
    expect(OWNERSHIP_STATUS_MAP.sold.degenerate).toBe(false);
    expect(OWNERSHIP_STATUS_MAP.at_gallery.degenerate).toBe(false);
  });
});

describe('getArtworkOwnershipState', () => {
  const artwork = { id: 'art-1' };

  it('无 edition → held + isDegenerate=false', () => {
    expect(getArtworkOwnershipState(artwork, [])).toEqual({
      bucket: 'held',
      isDegenerate: false,
    });
  });

  it('单 edition in_studio → held', () => {
    expect(
      getArtworkOwnershipState(artwork, [makeEdition('e1', 'art-1', 'in_studio')])
    ).toEqual({ bucket: 'held', isDegenerate: false });
  });

  it('单 edition at_gallery → external', () => {
    expect(
      getArtworkOwnershipState(artwork, [
        makeEdition('e1', 'art-1', 'at_gallery'),
      ])
    ).toEqual({ bucket: 'external', isDegenerate: false });
  });

  it('单 edition in_transit → external（也算外溢）', () => {
    expect(
      getArtworkOwnershipState(artwork, [
        makeEdition('e1', 'art-1', 'in_transit'),
      ])
    ).toEqual({ bucket: 'external', isDegenerate: false });
  });

  it('单 edition sold → departed', () => {
    expect(
      getArtworkOwnershipState(artwork, [makeEdition('e1', 'art-1', 'sold')])
    ).toEqual({ bucket: 'departed', isDegenerate: false });
  });

  it('混合：held + external → external（外溢优先）', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'in_studio'),
      makeEdition('e2', 'art-1', 'at_gallery'),
    ];
    expect(getArtworkOwnershipState(artwork, eds)).toEqual({
      bucket: 'external',
      isDegenerate: false,
    });
  });

  it('混合：external + departed → departed（最外溢）', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'at_gallery'),
      makeEdition('e2', 'art-1', 'sold'),
    ];
    expect(getArtworkOwnershipState(artwork, eds)).toEqual({
      bucket: 'departed',
      isDegenerate: false,
    });
  });

  it('混合：held + external + departed → departed', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'in_production'),
      makeEdition('e2', 'art-1', 'in_transit'),
      makeEdition('e3', 'art-1', 'gifted'),
    ];
    expect(getArtworkOwnershipState(artwork, eds).bucket).toBe('departed');
  });

  it('degenerate 叠加：lost 出现 → isDegenerate=true，bucket=departed', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'in_studio'),
      makeEdition('e2', 'art-1', 'lost'),
    ];
    expect(getArtworkOwnershipState(artwork, eds)).toEqual({
      bucket: 'departed',
      isDegenerate: true,
    });
  });

  it('degenerate 叠加：damaged 与 held 共存 → bucket=departed + degenerate', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'in_studio'),
      makeEdition('e2', 'art-1', 'damaged'),
    ];
    expect(getArtworkOwnershipState(artwork, eds)).toEqual({
      bucket: 'departed',
      isDegenerate: true,
    });
  });

  it('忽略其他 artwork 的 edition', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'in_studio'),
      makeEdition('e2', 'other-art', 'sold'), // 不该影响 art-1
    ];
    expect(getArtworkOwnershipState(artwork, eds).bucket).toBe('held');
  });

  it('全部 lost → bucket=departed + degenerate', () => {
    const eds = [
      makeEdition('e1', 'art-1', 'lost'),
      makeEdition('e2', 'art-1', 'lost'),
    ];
    expect(getArtworkOwnershipState(artwork, eds)).toEqual({
      bucket: 'departed',
      isDegenerate: true,
    });
  });
});

// ─── M2: getUnknownYearArtworks ─────────────────────────────────────────────

describe('getUnknownYearArtworks', () => {
  function makeArtworkLocal(overrides: Partial<VizArtwork>): VizArtwork {
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

  it('过滤出 year 不可解析的作品', () => {
    const arts = [
      makeArtworkLocal({ id: 'a1', year: '2020' }),
      makeArtworkLocal({ id: 'a2', year: null }),
      makeArtworkLocal({ id: 'a3', year: 'unknown' }),
      makeArtworkLocal({ id: 'a4', year: '' }),
      makeArtworkLocal({ id: 'a5', year: '2018-2019' }),
    ];
    const result = getUnknownYearArtworks(arts);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toEqual(['a2', 'a3', 'a4']);
  });

  it('全部有合法 year → 空数组', () => {
    const result = getUnknownYearArtworks([
      makeArtworkLocal({ id: 'a1', year: '2020' }),
      makeArtworkLocal({ id: 'a2', year: 'circa 2010' }),
    ]);
    expect(result).toEqual([]);
  });

  it('全部 year 缺失 → 全部返回', () => {
    const arts = [
      makeArtworkLocal({ id: 'a1', year: null }),
      makeArtworkLocal({ id: 'a2', year: 'unknown' }),
    ];
    expect(getUnknownYearArtworks(arts)).toHaveLength(2);
  });

  it('空输入 → 空数组', () => {
    expect(getUnknownYearArtworks([])).toEqual([]);
  });
});
