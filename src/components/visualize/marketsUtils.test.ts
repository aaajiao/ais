import { describe, it, expect } from 'vitest';
import {
  groupEditionsByCurrency,
  computeCurrencyStats,
  priceToRadius,
  priceToY,
  filterSalesByDateCutoff,
  getSalesWithoutPrice,
  buildActivityHistogram,
} from './marketsUtils';
import type { VizEdition } from '@/hooks/queries/useVisualizationData';

function makeEdition(overrides: Partial<VizEdition>): VizEdition {
  return {
    id: 'ed-1',
    artwork_id: 'art-1',
    inventory_number: 'INV-001',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'sold',
    location_id: null,
    sale_price: 10000,
    sale_currency: 'CNY',
    sale_date: '2024-01-01',
    buyer_name: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupEditionsByCurrency', () => {
  it('过滤掉非 sold 的版本', () => {
    const editions = [
      makeEdition({ id: '1', status: 'in_studio', sale_currency: 'CNY', sale_price: 5000 }),
      makeEdition({ id: '2', status: 'sold', sale_currency: 'CNY', sale_price: 5000 }),
    ];
    const groups = groupEditionsByCurrency(editions);
    expect(groups).toHaveLength(1);
    expect(groups[0].sales).toHaveLength(1);
    expect(groups[0].sales[0].id).toBe('2');
  });

  it('过滤掉 sale_price 为 0 或 null 的版本', () => {
    const editions = [
      makeEdition({ id: '1', sale_price: 0, sale_currency: 'USD' }),
      makeEdition({ id: '2', sale_price: null, sale_currency: 'USD' }),
      makeEdition({ id: '3', sale_price: 5000, sale_currency: 'USD' }),
    ];
    const groups = groupEditionsByCurrency(editions);
    expect(groups[0].sales).toHaveLength(1);
    expect(groups[0].sales[0].id).toBe('3');
  });

  it('过滤掉 sale_currency 为空的版本', () => {
    const editions = [
      makeEdition({ id: '1', sale_currency: null, sale_price: 5000 }),
      makeEdition({ id: '2', sale_currency: 'CNY', sale_price: 5000 }),
    ];
    const groups = groupEditionsByCurrency(editions);
    expect(groups).toHaveLength(1);
    expect(groups[0].currency).toBe('CNY');
  });

  it('按交易数降序排列', () => {
    const editions = [
      makeEdition({ id: '1', sale_currency: 'USD', sale_price: 6000 }),
      makeEdition({ id: '2', sale_currency: 'CNY', sale_price: 50000 }),
      makeEdition({ id: '3', sale_currency: 'CNY', sale_price: 60000 }),
      makeEdition({ id: '4', sale_currency: 'EUR', sale_price: 8000 }),
    ];
    const groups = groupEditionsByCurrency(editions);
    expect(groups[0].currency).toBe('CNY');
    expect(groups[0].sales).toHaveLength(2);
    expect(groups.map((g) => g.currency)).toEqual(['CNY', 'USD', 'EUR']);
  });

  it('空输入返回空数组', () => {
    expect(groupEditionsByCurrency([])).toEqual([]);
  });
});

describe('computeCurrencyStats', () => {
  it('单个数据点', () => {
    const stats = computeCurrencyStats([makeEdition({ sale_price: 10000 })]);
    expect(stats.count).toBe(1);
    expect(stats.sum).toBe(10000);
    expect(stats.median).toBe(10000);
    expect(stats.max).toBe(10000);
    expect(stats.min).toBe(10000);
  });

  it('两个数据点的中位数 = 两者均值', () => {
    const stats = computeCurrencyStats([
      makeEdition({ sale_price: 1000 }),
      makeEdition({ sale_price: 3000 }),
    ]);
    expect(stats.median).toBe(2000);
    expect(stats.sum).toBe(4000);
  });

  it('奇数个数据点取中间值', () => {
    const stats = computeCurrencyStats([
      makeEdition({ sale_price: 1000 }),
      makeEdition({ sale_price: 5000 }),
      makeEdition({ sale_price: 9000 }),
    ]);
    expect(stats.median).toBe(5000);
  });

  it('空数组返回全零', () => {
    const stats = computeCurrencyStats([]);
    expect(stats).toEqual({ count: 0, sum: 0, median: 0, max: 0, min: 0 });
  });
});

describe('priceToRadius', () => {
  it('min === max 返回中间值', () => {
    const r = priceToRadius(5000, 5000, 5000);
    expect(r).toBeCloseTo((4 + 18) / 2, 5);
  });

  it('最小价格返回最小半径', () => {
    const r = priceToRadius(100, 100, 100000);
    expect(r).toBeCloseTo(4, 1);
  });

  it('最大价格返回最大半径', () => {
    const r = priceToRadius(100000, 100, 100000);
    expect(r).toBeCloseTo(18, 1);
  });

  it('中间值半径在 MIN_R 和 MAX_R 之间', () => {
    const r = priceToRadius(1000, 100, 10000);
    expect(r).toBeGreaterThan(4);
    expect(r).toBeLessThan(18);
  });
});

describe('priceToY', () => {
  const dateRange = { min: new Date('2020-01-01'), max: new Date('2024-01-01') };
  const panelHeight = 360;

  it('最新日期 → 顶部（y≈0）', () => {
    const ed = makeEdition({ sale_date: '2024-01-01' });
    const y = priceToY('2024-01-01', ed, dateRange, panelHeight);
    expect(y).toBeCloseTo(0, 1);
  });

  it('最早日期 → 底部（y≈panelHeight）', () => {
    const ed = makeEdition({ sale_date: '2020-01-01' });
    const y = priceToY('2020-01-01', ed, dateRange, panelHeight);
    expect(y).toBeCloseTo(panelHeight, 1);
  });

  it('sale_date 为 null 时 fallback created_at', () => {
    const ed = makeEdition({ sale_date: null, created_at: '2022-01-01T00:00:00Z' });
    const y = priceToY(null, ed, dateRange, panelHeight);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(panelHeight);
  });

  it('sale_date 和 created_at 均为空时居中', () => {
    const ed = makeEdition({ sale_date: null, created_at: '' });
    const y = priceToY(null, ed, dateRange, panelHeight);
    expect(y).toBe(panelHeight / 2);
  });
});

describe('filterSalesByDateCutoff', () => {
  const editions = [
    makeEdition({ id: 'e1', sale_date: '2020-03-15' }),
    makeEdition({ id: 'e2', sale_date: '2022-06-01' }),
    makeEdition({ id: 'e3', sale_date: '2024-01-01' }),
    makeEdition({ id: 'e4', sale_date: '2026-04-10' }),
    makeEdition({ id: 'e5', sale_date: null }),
  ];

  it('cutoff = max → 返回所有有 sale_date 的 edition', () => {
    const result = filterSalesByDateCutoff(editions, '2026-04-10');
    const ids = result.map((e) => e.id).sort();
    expect(ids).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('cutoff = 中间日期 → 只返回 sale_date <= cutoff 的 edition', () => {
    const result = filterSalesByDateCutoff(editions, '2022-12-31');
    const ids = result.map((e) => e.id).sort();
    expect(ids).toEqual(['e1', 'e2']);
  });

  it('cutoff = min - 1 day → 空数组', () => {
    const result = filterSalesByDateCutoff(editions, '2020-03-14');
    expect(result).toEqual([]);
  });

  it('sale_date 为 null 的 edition 始终被过滤掉', () => {
    const result = filterSalesByDateCutoff(editions, '2099-12-31');
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain('e5');
  });

  it('非法 cutoff 字符串 → 返回原数组（防御）', () => {
    const result = filterSalesByDateCutoff(editions, 'not-a-date');
    expect(result).toEqual(editions);
  });

  it('空输入 → 空数组', () => {
    expect(filterSalesByDateCutoff([], '2024-01-01')).toEqual([]);
  });

  it('cutoff 同日 → 包含该日期的 edition', () => {
    const result = filterSalesByDateCutoff(editions, '2020-03-15');
    expect(result.map((e) => e.id)).toEqual(['e1']);
  });
});

// ─── M2: getSalesWithoutPrice ───────────────────────────────────────────────

describe('getSalesWithoutPrice', () => {
  it('只返回 sold 且无有效 sale_price 的 edition', () => {
    const editions = [
      makeEdition({ id: 'e1', status: 'sold', sale_price: 5000 }),
      makeEdition({ id: 'e2', status: 'sold', sale_price: null }),
      makeEdition({ id: 'e3', status: 'sold', sale_price: 0 }),
      makeEdition({ id: 'e4', status: 'in_studio', sale_price: null }),
      makeEdition({ id: 'e5', status: 'gifted', sale_price: null }),
    ];
    const result = getSalesWithoutPrice(editions);
    const ids = result.map((e) => e.id).sort();
    // e2 / e3 是 sold 但无价；e1 有价；e4 / e5 不是 sold
    expect(ids).toEqual(['e2', 'e3']);
  });

  it('sale_price 负数也视为无价（防御）', () => {
    const editions = [
      makeEdition({ id: 'neg', status: 'sold', sale_price: -1 }),
    ];
    expect(getSalesWithoutPrice(editions)).toHaveLength(1);
  });

  it('sale_price NaN（字符串转数失败）视为无价', () => {
    const editions = [
      makeEdition({
        id: 'nan',
        status: 'sold',
        sale_price: 'abc' as unknown as number,
      }),
    ];
    expect(getSalesWithoutPrice(editions)).toHaveLength(1);
  });

  it('空输入 → 空数组', () => {
    expect(getSalesWithoutPrice([])).toEqual([]);
  });

  it('全部有价的 sold → 空数组', () => {
    const editions = [
      makeEdition({ id: 'a', status: 'sold', sale_price: 1000 }),
      makeEdition({ id: 'b', status: 'sold', sale_price: 2000 }),
    ];
    expect(getSalesWithoutPrice(editions)).toEqual([]);
  });
});

describe('buildActivityHistogram', () => {
  it('空数组 → null', () => {
    expect(buildActivityHistogram([])).toBeNull();
  });

  it('过滤格式不合法的 ISO date', () => {
    const hist = buildActivityHistogram(['2024-01-01', 'not-a-date', '']);
    expect(hist?.bins.length).toBe(1);
    expect(hist?.kind).toBe('month');
  });

  it('跨度 ≥ 5 年 → 年分桶（连续年份含空年）', () => {
    // 2018 - 2024 = 6 年跨度 → 年分桶
    const dates = ['2018-01-01', '2020-06-01', '2024-12-31'];
    const hist = buildActivityHistogram(dates)!;
    expect(hist.kind).toBe('year');
    // bins 含 2018,2019,2020,2021,2022,2023,2024 = 7 个
    expect(hist.bins.length).toBe(7);
    expect(hist.bins[0]).toMatchObject({ startISO: '2018-01-01', label: '2018', count: 1 });
    expect(hist.bins[2]).toMatchObject({ label: '2020', count: 1 });
    expect(hist.bins[6]).toMatchObject({ label: '2024', count: 1 });
    // 空年份 = count 0（保留连续轴）
    expect(hist.bins[1].count).toBe(0);
    expect(hist.bins[3].count).toBe(0);
  });

  it('跨度 < 5 年 → 月分桶（连续月份含空月）', () => {
    const dates = ['2023-03-15', '2023-05-20', '2023-12-01'];
    const hist = buildActivityHistogram(dates)!;
    expect(hist.kind).toBe('month');
    // bins 含 2023-03..2023-12 = 10 个
    expect(hist.bins.length).toBe(10);
    expect(hist.bins[0]).toMatchObject({ label: '2023-03', count: 1 });
    expect(hist.bins[2]).toMatchObject({ label: '2023-05', count: 1 });
    expect(hist.bins[9]).toMatchObject({ label: '2023-12', count: 1 });
    expect(hist.bins[1].count).toBe(0);
  });

  it('同一 bin 多次命中 → count 累加', () => {
    const dates = ['2023-03-15', '2023-03-20', '2023-03-25'];
    const hist = buildActivityHistogram(dates)!;
    expect(hist.bins[0].count).toBe(3);
  });

  it('maxCount 是所有 bin 里最大的 count', () => {
    const dates = [
      '2023-01-01',
      '2023-06-01', '2023-06-15', '2023-06-30', // 6 月 3 次
      '2023-12-01',
    ];
    const hist = buildActivityHistogram(dates)!;
    expect(hist.maxCount).toBe(3);
  });

  it('minISO / maxISO = 排序后的首尾', () => {
    const dates = ['2024-05-01', '2020-01-15', '2022-09-30'];
    const hist = buildActivityHistogram(dates)!;
    expect(hist.minISO).toBe('2020-01-15');
    expect(hist.maxISO).toBe('2024-05-01');
  });
});
