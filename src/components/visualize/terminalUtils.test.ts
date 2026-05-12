import { describe, it, expect } from 'vitest';
import type { VizArtwork, VizEdition, VizLocation } from '@/hooks/queries/useVisualizationData';
import {
  buildEditionLabel,
  buildLocationName,
  buildPriceLabel,
  buildRows,
  computeStats,
  groupRows,
  naturalCompare,
} from './terminalUtils';

// ──────────────────────────────────────────────
// 工厂函数
// ──────────────────────────────────────────────

function makeArtwork(overrides: Partial<VizArtwork> = {}): VizArtwork {
  return {
    id: 'artwork-1',
    title_en: 'Untitled',
    title_cn: null,
    year: '2017',
    type: 'Installation',
    thumbnail_url: null,
    edition_total: 3,
    ap_total: 2,
    is_unique: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEdition(overrides: Partial<VizEdition> = {}): VizEdition {
  return {
    id: 'edition-1',
    artwork_id: 'artwork-1',
    inventory_number: 'AAJ-2017-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    location_id: null,
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLocation(overrides: Partial<VizLocation> = {}): VizLocation {
  return {
    id: 'loc-1',
    name: 'Tabula Rasa London',
    type: 'gallery',
    city: 'London',
    country: 'UK',
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// naturalCompare
// ──────────────────────────────────────────────

describe('naturalCompare', () => {
  it('AAJ-2017-002 在 AAJ-2017-010 前', () => {
    expect(naturalCompare('AAJ-2017-002', 'AAJ-2017-010')).toBeLessThan(0);
  });

  it('AAJ-2017-001 在 AAJ-2018-001 前', () => {
    expect(naturalCompare('AAJ-2017-001', 'AAJ-2018-001')).toBeLessThan(0);
  });

  it('相同字符串返回 0', () => {
    expect(naturalCompare('AAJ-2017-001', 'AAJ-2017-001')).toBe(0);
  });
});

// ──────────────────────────────────────────────
// buildEditionLabel
// ──────────────────────────────────────────────

describe('buildEditionLabel', () => {
  it('numbered 有 total → "1/3"', () => {
    const e = makeEdition({ edition_type: 'numbered', edition_number: 1 });
    const a = makeArtwork({ edition_total: 3, is_unique: false });
    expect(buildEditionLabel(e, a)).toBe('1/3');
  });

  it('numbered 无 total → "#2"', () => {
    const e = makeEdition({ edition_type: 'numbered', edition_number: 2 });
    const a = makeArtwork({ edition_total: null, is_unique: false });
    expect(buildEditionLabel(e, a)).toBe('#2');
  });

  it('is_unique → "unique"', () => {
    const e = makeEdition({ edition_type: 'unique' });
    const a = makeArtwork({ is_unique: true });
    expect(buildEditionLabel(e, a)).toBe('unique');
  });

  it('ap 有 number 且有 total → "AP1/2"', () => {
    const e = makeEdition({ edition_type: 'ap', edition_number: 1 });
    const a = makeArtwork({ ap_total: 2, is_unique: false });
    expect(buildEditionLabel(e, a)).toBe('AP1/2');
  });

  it('ap 有 number 无 total → "AP1"', () => {
    const e = makeEdition({ edition_type: 'ap', edition_number: 1 });
    const a = makeArtwork({ ap_total: null, is_unique: false });
    expect(buildEditionLabel(e, a)).toBe('AP1');
  });

  it('numbered 无 number → "#?"', () => {
    const e = makeEdition({ edition_type: 'numbered', edition_number: null });
    const a = makeArtwork({ edition_total: 3, is_unique: false });
    expect(buildEditionLabel(e, a)).toBe('#?');
  });
});

// ──────────────────────────────────────────────
// buildLocationName
// ──────────────────────────────────────────────

describe('buildLocationName', () => {
  it('有 city 和 country → "Name (City, Country)"', () => {
    const loc = makeLocation({ name: 'Tabula Rasa London', city: 'London', country: 'UK' });
    expect(buildLocationName(loc)).toBe('Tabula Rasa London (London, UK)');
  });

  it('只有 city → "Name (City)"', () => {
    const loc = makeLocation({ name: 'Gallery X', city: 'Berlin', country: null });
    expect(buildLocationName(loc)).toBe('Gallery X (Berlin)');
  });

  it('只有 country → "Name (Country)"', () => {
    const loc = makeLocation({ name: 'Gallery Y', city: null, country: 'France' });
    expect(buildLocationName(loc)).toBe('Gallery Y (France)');
  });

  it('缺 city 和 country → 只有 name', () => {
    const loc = makeLocation({ name: 'Studio', city: null, country: null });
    expect(buildLocationName(loc)).toBe('Studio');
  });

  it('location 为 null → null', () => {
    expect(buildLocationName(null)).toBeNull();
  });
});

// ──────────────────────────────────────────────
// buildRows & 排序
// ──────────────────────────────────────────────

describe('buildRows', () => {
  it('inventory_number 自然排序：AAJ-2017-010 在 AAJ-2017-002 后', () => {
    const artworks = [makeArtwork()];
    const editions = [
      makeEdition({ id: 'e1', inventory_number: 'AAJ-2017-010' }),
      makeEdition({ id: 'e2', inventory_number: 'AAJ-2017-002' }),
    ];
    const rows = buildRows(artworks, editions, []);
    expect(rows[0].id).toBe('e2'); // 002 在前
    expect(rows[1].id).toBe('e1'); // 010 在后
  });

  it('无 inventory_number 放最后', () => {
    const artworks = [makeArtwork()];
    const editions = [
      makeEdition({ id: 'no-inv', inventory_number: null }),
      makeEdition({ id: 'has-inv', inventory_number: 'AAJ-2017-001' }),
    ];
    const rows = buildRows(artworks, editions, []);
    expect(rows[0].id).toBe('has-inv');
    expect(rows[1].id).toBe('no-inv');
  });

  it('location join 正确：locationName 填入', () => {
    const artworks = [makeArtwork()];
    const locations = [makeLocation({ id: 'loc-1', name: 'Tabula Rasa London', city: 'London', country: 'UK' })];
    const editions = [makeEdition({ location_id: 'loc-1' })];
    const rows = buildRows(artworks, editions, locations);
    expect(rows[0].locationName).toBe('Tabula Rasa London (London, UK)');
  });

  it('location_id 为 null → locationName 为 null', () => {
    const artworks = [makeArtwork()];
    const editions = [makeEdition({ location_id: null })];
    const rows = buildRows(artworks, editions, []);
    expect(rows[0].locationName).toBeNull();
  });
});

// ──────────────────────────────────────────────
// groupRows
// ──────────────────────────────────────────────

describe('groupRows', () => {
  const rows = [
    { id: 'e1', status: 'sold', year: '2017', locationName: 'Gallery A', inventoryNumber: 'A-001', type: 'Installation', editionLabel: '1/3', priceLabel: 'EUR 1000', artworkId: 'a1' },
    { id: 'e2', status: 'in_studio', year: '2018', locationName: null, inventoryNumber: 'A-002', type: 'Video', editionLabel: '1/2', priceLabel: null, artworkId: 'a2' },
    { id: 'e3', status: 'sold', year: '2016', locationName: 'Gallery B', inventoryNumber: 'A-003', type: 'Installation', editionLabel: '2/3', priceLabel: 'USD 500', artworkId: 'a1' },
  ];

  it('none → 一个组 key=all，行数 = 全部', () => {
    const groups = groupRows(rows, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('all');
    expect(groups[0].rows).toHaveLength(3);
  });

  it('status → 按状态分桶，桶数正确', () => {
    const groups = groupRows(rows, 'status');
    expect(groups.length).toBe(2); // sold + in_studio
    const soldGroup = groups.find(g => g.key === 'sold');
    expect(soldGroup?.rows).toHaveLength(2);
  });

  it('year → 按年份分桶', () => {
    const groups = groupRows(rows, 'year');
    expect(groups.length).toBe(3);
    // 年份按自然排序：2016 < 2017 < 2018
    expect(groups[0].key).toBe('2016');
    expect(groups[1].key).toBe('2017');
    expect(groups[2].key).toBe('2018');
  });

  it('location → null 位置归入 ─，排最后', () => {
    const groups = groupRows(rows, 'location');
    const dashGroup = groups.find(g => g.key === '─');
    expect(dashGroup).toBeDefined();
    expect(dashGroup?.rows[0].id).toBe('e2');
    // ─ 在最后
    expect(groups[groups.length - 1].key).toBe('─');
  });
});

// ──────────────────────────────────────────────
// computeStats
// ──────────────────────────────────────────────

describe('computeStats', () => {
  it('marketsLine 按 count desc 只显示存在的货币', () => {
    const rows = [
      { id: 'e1', priceLabel: 'CNY 10000', artworkId: 'a1', status: 'sold', year: '2017', type: null, inventoryNumber: null, editionLabel: '1/3', locationName: null },
      { id: 'e2', priceLabel: 'CNY 20000', artworkId: 'a2', status: 'sold', year: '2017', type: null, inventoryNumber: null, editionLabel: '2/3', locationName: null },
      { id: 'e3', priceLabel: 'USD 5000', artworkId: 'a3', status: 'sold', year: '2017', type: null, inventoryNumber: null, editionLabel: '1/2', locationName: null },
    ];
    const stats = computeStats(rows, 10);
    // CNY 2, USD 1 → CNY 2 / USD 1
    expect(stats.marketsLine).toBe('CNY 2 / USD 1');
    expect(stats.editionsTotal).toBe(3);
    expect(stats.artworksWithEditions).toBe(3);
    expect(stats.artworksTotal).toBe(10);
  });

  it('无已售版本 → marketsLine 为 ─', () => {
    const rows = [
      { id: 'e1', priceLabel: null, artworkId: 'a1', status: 'in_studio', year: '2017', type: null, inventoryNumber: null, editionLabel: '1/3', locationName: null },
    ];
    const stats = computeStats(rows, 5);
    expect(stats.marketsLine).toBe('─');
  });

  it('artworksWithEditions 正确去重', () => {
    const rows = [
      { id: 'e1', priceLabel: null, artworkId: 'a1', status: 'in_studio', year: '2017', type: null, inventoryNumber: null, editionLabel: '1/3', locationName: null },
      { id: 'e2', priceLabel: null, artworkId: 'a1', status: 'in_studio', year: '2017', type: null, inventoryNumber: null, editionLabel: '2/3', locationName: null },
      { id: 'e3', priceLabel: null, artworkId: 'a2', status: 'in_studio', year: '2018', type: null, inventoryNumber: null, editionLabel: '1/2', locationName: null },
    ];
    const stats = computeStats(rows, 10);
    expect(stats.artworksWithEditions).toBe(2); // a1, a2 各一个
  });
});

// ──────────────────────────────────────────────
// buildPriceLabel
// ──────────────────────────────────────────────

describe('buildPriceLabel', () => {
  it('有价格和货币 → "EUR 4,500"', () => {
    expect(buildPriceLabel(4500, 'EUR')).toBe('EUR 4,500');
  });

  it('价格为 null → null', () => {
    expect(buildPriceLabel(null, 'EUR')).toBeNull();
  });

  it('货币为 null → null', () => {
    expect(buildPriceLabel(4500, null)).toBeNull();
  });

  it('整数价格无小数', () => {
    expect(buildPriceLabel(1000000, 'CNY')).toBe('CNY 1,000,000');
  });
});
