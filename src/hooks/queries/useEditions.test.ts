import { describe, it, expect, vi, beforeEach } from 'vitest';

interface ChainCall {
  method: string;
  args: unknown[];
}

interface BuilderState {
  table: string;
  calls: ChainCall[];
}

const builderRegistry: BuilderState[] = [];
let nextResponse: { data: unknown; error: unknown; count?: number | null } = {
  data: [],
  error: null,
  count: null,
};

function setNextResponse(response: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}) {
  nextResponse = {
    data: response.data ?? null,
    error: response.error ?? null,
    count: response.count ?? null,
  };
}

const TERMINAL_METHODS = new Set(['single', 'maybeSingle', 'csv']);

function createBuilder(state: BuilderState): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          const result = {
            data: nextResponse.data,
            error: nextResponse.error,
            count: nextResponse.count,
          };
          try {
            return Promise.resolve(onFulfilled(result));
          } catch (err) {
            if (onRejected) return Promise.resolve(onRejected(err));
            return Promise.reject(err);
          }
        };
      }
      if (typeof prop === 'symbol') return undefined;
      return (...args: unknown[]) => {
        state.calls.push({ method: prop, args });
        if (TERMINAL_METHODS.has(prop)) {
          const data = Array.isArray(nextResponse.data)
            ? nextResponse.data[0] ?? null
            : nextResponse.data;
          return Promise.resolve({
            data,
            error: nextResponse.error,
          });
        }
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

const fromMock = vi.fn((table: string) => {
  const state: BuilderState = { table, calls: [] };
  builderRegistry.push(state);
  return createBuilder(state);
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

import {
  fetchEditionsPaginated,
  fetchEditionStatusCounts,
  fetchEditionDetail,
  fetchEditionHistory,
  fetchEditionFiles,
  fetchEditionsByArtwork,
  useEditionStatusCounts,
  useEditionDetail,
  useEditionHistory,
  useEditionsByArtwork,
} from './useEditions';
import { renderHookWithClient, waitFor } from '@/test/test-utils';

const baseEditionRow = {
  id: 'e1',
  artwork_id: 'a1',
  inventory_number: 'AAJ-2024-001',
  edition_type: 'numbered' as const,
  edition_number: 1,
  status: 'in_studio' as const,
  location_id: 'l1',
  storage_detail: null,
  condition: 'excellent',
  condition_notes: null,
  sale_price: null,
  sale_currency: null,
  sale_date: null,
  buyer_name: null,
  consignment_start: null,
  loan_institution: null,
  loan_end: null,
  certificate_number: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  artwork: {
    id: 'a1',
    title_en: 'Test',
    title_cn: '测试',
    thumbnail_url: null,
    edition_total: 3,
    ap_total: 0,
    is_unique: false,
    deleted_at: null,
  },
  location: {
    id: 'l1',
    name: 'Studio',
    address: null,
    contact: null,
    notes: null,
  },
};

function lastBuilder(): BuilderState {
  return builderRegistry[builderRegistry.length - 1];
}

beforeEach(() => {
  builderRegistry.length = 0;
  fromMock.mockClear();
  setNextResponse({ data: [], error: null, count: null });
});

describe('fetchEditionsPaginated', () => {
  it('查询 editions 表并 join artworks/locations', async () => {
    setNextResponse({ data: [baseEditionRow] });

    const result = await fetchEditionsPaginated({ pageParam: null });

    const builder = lastBuilder();
    expect(builder.table).toBe('editions');

    const selectCall = builder.calls.find((c) => c.method === 'select');
    expect(String(selectCall?.args[0])).toContain('artwork:artworks!left');
    expect(String(selectCall?.args[0])).toContain('location:locations!left');

    const limitCall = builder.calls.find((c) => c.method === 'limit');
    expect(limitCall?.args[0]).toBe(51);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].artwork?.title_en).toBe('Test');
  });

  it('清理结果时移除 artwork.deleted_at 字段', async () => {
    setNextResponse({ data: [baseEditionRow] });

    const result = await fetchEditionsPaginated({ pageParam: null });
    expect(result.data[0].artwork).not.toHaveProperty('deleted_at');
  });

  it('过滤掉关联了软删除作品的版本', async () => {
    setNextResponse({
      data: [
        baseEditionRow,
        {
          ...baseEditionRow,
          id: 'e2',
          artwork: { ...baseEditionRow.artwork, deleted_at: '2024-02-01' },
        },
      ],
    });

    const result = await fetchEditionsPaginated({ pageParam: null });

    expect(result.data.map((e) => e.id)).toEqual(['e1']);
  });

  it('保留 artwork 为 null 的版本', async () => {
    setNextResponse({
      data: [{ ...baseEditionRow, id: 'e3', artwork: null }],
    });

    const result = await fetchEditionsPaginated({ pageParam: null });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].artwork).toBeNull();
  });

  it('在 status filter 不为 all 时调用 eq("status", ...)', async () => {
    setNextResponse({ data: [baseEditionRow] });

    await fetchEditionsPaginated({
      pageParam: null,
      filters: { status: 'sold' },
    });

    const builder = lastBuilder();
    const eqCall = builder.calls.find(
      (c) => c.method === 'eq' && c.args[0] === 'status'
    );
    expect(eqCall).toBeDefined();
    expect(eqCall?.args[1]).toBe('sold');
  });

  it('status=all 时不调用 eq("status",...)', async () => {
    setNextResponse({ data: [baseEditionRow] });

    await fetchEditionsPaginated({
      pageParam: null,
      filters: { status: 'all' },
    });

    const builder = lastBuilder();
    const eqStatus = builder.calls.find(
      (c) => c.method === 'eq' && c.args[0] === 'status'
    );
    expect(eqStatus).toBeUndefined();
  });

  it('search 过滤匹配 inventory_number/title/location.name (客户端)', async () => {
    setNextResponse({
      data: [
        baseEditionRow,
        {
          ...baseEditionRow,
          id: 'e2',
          inventory_number: 'XYZ-2024-001',
          artwork: {
            ...baseEditionRow.artwork,
            title_en: 'Different',
            title_cn: '不同',
          },
        },
      ],
    });

    const result = await fetchEditionsPaginated({
      pageParam: null,
      filters: { search: 'xyz' },
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('e2');
  });

  it('hasMore=true 当返回多于 pageSize', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      ...baseEditionRow,
      id: `e${i}`,
    }));
    setNextResponse({ data: rows });

    const result = await fetchEditionsPaginated({ pageParam: null });

    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
  });

  it('在 supabase 错误时抛出', async () => {
    setNextResponse({ data: null, error: { message: 'fail' } });

    await expect(
      fetchEditionsPaginated({ pageParam: null })
    ).rejects.toMatchObject({ message: 'fail' });
  });
});

describe('fetchEditionStatusCounts', () => {
  it('按状态统计且排除软删除作品的版本', async () => {
    setNextResponse({
      data: [
        { status: 'in_studio', artwork: { deleted_at: null } },
        { status: 'in_studio', artwork: { deleted_at: null } },
        { status: 'sold', artwork: { deleted_at: null } },
        { status: 'at_gallery', artwork: null },
        { status: 'in_studio', artwork: { deleted_at: '2024-01-01' } },
      ],
    });

    const counts = await fetchEditionStatusCounts();

    expect(counts.all).toBe(4);
    expect(counts.in_studio).toBe(2);
    expect(counts.sold).toBe(1);
    expect(counts.at_gallery).toBe(1);
    expect(counts.in_production).toBe(0);
  });

  it('包含所有 EditionStatus key', async () => {
    setNextResponse({ data: [] });

    const counts = await fetchEditionStatusCounts();

    expect(Object.keys(counts).sort()).toEqual(
      [
        'all',
        'in_production',
        'in_studio',
        'at_gallery',
        'at_museum',
        'in_transit',
        'sold',
        'gifted',
        'lost',
        'damaged',
      ].sort()
    );
  });

  it('错误时抛出', async () => {
    setNextResponse({ data: null, error: { message: 'oops' } });
    await expect(fetchEditionStatusCounts()).rejects.toMatchObject({
      message: 'oops',
    });
  });
});

describe('fetchEditionDetail', () => {
  it('应用 eq(id) 并使用 single()', async () => {
    setNextResponse({ data: baseEditionRow });

    const detail = await fetchEditionDetail('e1');

    expect(detail?.id).toBe('e1');
    const builder = lastBuilder();
    const eq = builder.calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['id', 'e1']);

    const single = builder.calls.find((c) => c.method === 'single');
    expect(single).toBeDefined();
  });

  it('当 artwork 已软删除时返回 null', async () => {
    setNextResponse({
      data: {
        ...baseEditionRow,
        artwork: { ...baseEditionRow.artwork, deleted_at: '2024-02-01' },
      },
    });

    const detail = await fetchEditionDetail('e1');
    expect(detail).toBeNull();
  });

  it('错误时抛出', async () => {
    setNextResponse({ data: null, error: { message: 'fail' } });
    await expect(fetchEditionDetail('e1')).rejects.toMatchObject({
      message: 'fail',
    });
  });
});

describe('fetchEditionHistory', () => {
  it('按 edition_id eq 过滤并按 created_at desc 排序', async () => {
    setNextResponse({
      data: [
        {
          id: 'h1',
          edition_id: 'e1',
          action: 'status_change',
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
    });

    const history = await fetchEditionHistory('e1');
    expect(history).toHaveLength(1);

    const builder = lastBuilder();
    expect(builder.table).toBe('edition_history');

    const eq = builder.calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['edition_id', 'e1']);

    const order = builder.calls.find((c) => c.method === 'order');
    expect(order?.args[0]).toBe('created_at');
    expect(order?.args[1]).toEqual({ ascending: false });
  });

  it('null data 时返回空数组', async () => {
    setNextResponse({ data: null });
    expect(await fetchEditionHistory('e1')).toEqual([]);
  });
});

describe('fetchEditionFiles', () => {
  it('按 edition_id 过滤', async () => {
    setNextResponse({ data: [] });
    await fetchEditionFiles('e1');

    const builder = lastBuilder();
    expect(builder.table).toBe('edition_files');

    const eq = builder.calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['edition_id', 'e1']);
  });
});

describe('fetchEditionsByArtwork', () => {
  it('按 artwork_id 过滤并按 edition_number 升序', async () => {
    setNextResponse({
      data: [
        { ...baseEditionRow, edition_number: 1 },
        { ...baseEditionRow, id: 'e2', edition_number: 2 },
      ],
    });

    const result = await fetchEditionsByArtwork('a1');
    expect(result).toHaveLength(2);

    const builder = lastBuilder();
    expect(builder.table).toBe('editions');

    const eq = builder.calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['artwork_id', 'a1']);

    const order = builder.calls.find((c) => c.method === 'order');
    expect(order?.args[0]).toBe('edition_number');
    expect(order?.args[1]).toEqual({ ascending: true });
  });
});

describe('useEditionStatusCounts hook', () => {
  it('成功后返回 counts 对象', async () => {
    setNextResponse({
      data: [
        { status: 'in_studio', artwork: { deleted_at: null } },
        { status: 'sold', artwork: { deleted_at: null } },
      ],
    });

    const { result } = renderHookWithClient(() => useEditionStatusCounts());

    await waitFor(() => result.current.isSuccess);

    expect(result.current.data?.all).toBe(2);
    expect(result.current.data?.in_studio).toBe(1);
    expect(result.current.data?.sold).toBe(1);
  });
});

describe('useEditionDetail hook', () => {
  it('id 为 undefined 时不查询', () => {
    const { result } = renderHookWithClient(() => useEditionDetail(undefined));
    expect(result.current.fetchStatus).toBe('idle');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('查询并返回 edition 详情', async () => {
    setNextResponse({ data: baseEditionRow });

    const { result } = renderHookWithClient(() => useEditionDetail('e1'));
    await waitFor(() => result.current.isSuccess);

    expect(result.current.data?.id).toBe('e1');
  });
});

describe('useEditionHistory hook', () => {
  it('editionId 为 undefined 时不查询', () => {
    const { result } = renderHookWithClient(() =>
      useEditionHistory(undefined)
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('返回历史记录数组', async () => {
    setNextResponse({
      data: [
        {
          id: 'h1',
          edition_id: 'e1',
          action: 'status_change',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    });

    const { result } = renderHookWithClient(() => useEditionHistory('e1'));
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useEditionsByArtwork hook', () => {
  it('artworkId 为 undefined 时不查询', () => {
    const { result } = renderHookWithClient(() =>
      useEditionsByArtwork(undefined)
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('返回作品下版本列表', async () => {
    setNextResponse({
      data: [{ ...baseEditionRow }, { ...baseEditionRow, id: 'e2' }],
    });

    const { result } = renderHookWithClient(() => useEditionsByArtwork('a1'));
    await waitFor(() => result.current.isSuccess);

    expect(result.current.data).toHaveLength(2);
  });
});
