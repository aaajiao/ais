import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

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
  fetchArtworksPaginated,
  fetchArtworksTotalCount,
  fetchArtworkDetail,
  useArtworksTotalCount,
  useArtworkDetail,
  getArtworkMainStatus,
} from './useArtworks';
import { renderHookWithClient, waitFor } from '@/test/test-utils';

const sampleArtworkRow = {
  id: 'a1',
  title_en: 'Digital Dreams',
  title_cn: '数字梦境',
  year: '2024',
  type: 'Installation',
  materials: null,
  dimensions: null,
  duration: null,
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 0,
  is_unique: false,
  notes: null,
  source_url: null,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  user_id: 'u1',
};

function lastBuilder(): BuilderState {
  return builderRegistry[builderRegistry.length - 1];
}

beforeEach(() => {
  builderRegistry.length = 0;
  fromMock.mockClear();
  setNextResponse({ data: [], error: null, count: null });
});

describe('fetchArtworksPaginated', () => {
  it('查询 artworks 表并应用 deleted_at IS NULL 过滤', async () => {
    setNextResponse({
      data: [{ ...sampleArtworkRow, editions: [] }],
    });

    const result = await fetchArtworksPaginated({ pageParam: null });

    const builder = lastBuilder();
    expect(builder.table).toBe('artworks');

    const isCall = builder.calls.find((c) => c.method === 'is');
    expect(isCall).toBeDefined();
    expect(isCall?.args).toEqual(['deleted_at', null]);

    const limitCall = builder.calls.find((c) => c.method === 'limit');
    expect(limitCall).toBeDefined();
    expect(limitCall?.args[0]).toBe(51);

    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('对每个作品计算 stats 字段', async () => {
    setNextResponse({
      data: [
        {
          ...sampleArtworkRow,
          editions: [
            { id: 'e1', status: 'in_studio' },
            { id: 'e2', status: 'in_studio' },
            { id: 'e3', status: 'at_gallery' },
            { id: 'e4', status: 'sold' },
          ],
        },
      ],
    });

    const result = await fetchArtworksPaginated({ pageParam: null });

    expect(result.data[0].stats).toEqual({
      total: 4,
      inStudio: 2,
      atGallery: 1,
      sold: 1,
    });
  });

  it('当返回多于 pageSize 时设置 hasMore=true', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      ...sampleArtworkRow,
      id: `a${i}`,
      editions: [],
    }));
    setNextResponse({ data: rows });

    const result = await fetchArtworksPaginated({ pageParam: null });

    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
  });

  it('应用 status 过滤 (客户端筛选)', async () => {
    setNextResponse({
      data: [
        {
          ...sampleArtworkRow,
          id: 'a1',
          editions: [{ id: 'e1', status: 'in_studio' }],
        },
        {
          ...sampleArtworkRow,
          id: 'a2',
          editions: [{ id: 'e2', status: 'sold' }],
        },
      ],
    });

    const result = await fetchArtworksPaginated({
      pageParam: null,
      filters: { status: 'sold' },
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('a2');
  });

  it('应用 search 过滤 (匹配 title_en/title_cn/year/type)', async () => {
    setNextResponse({
      data: [
        {
          ...sampleArtworkRow,
          id: 'a1',
          title_en: 'Digital Dreams',
          editions: [],
        },
        {
          ...sampleArtworkRow,
          id: 'a2',
          title_en: 'Urban Landscape',
          editions: [],
        },
      ],
    });

    const result = await fetchArtworksPaginated({
      pageParam: null,
      filters: { search: 'digital' },
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('a1');
  });

  it('在游标存在时应用 OR 条件', async () => {
    setNextResponse({ data: [] });
    const cursor = btoa(
      JSON.stringify({ timestamp: '2024-01-01T00:00:00Z', id: 'a1' })
    );

    await fetchArtworksPaginated({ pageParam: cursor });

    const builder = lastBuilder();
    const orCall = builder.calls.find((c) => c.method === 'or');
    expect(orCall).toBeDefined();
    expect(String(orCall?.args[0])).toContain('created_at.lt');
  });

  it('在 supabase 错误时抛出', async () => {
    setNextResponse({ data: null, error: { message: 'boom' } });

    await expect(
      fetchArtworksPaginated({ pageParam: null })
    ).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('fetchArtworksTotalCount', () => {
  it('使用 head:true count:exact 选项', async () => {
    setNextResponse({ data: null, count: 42 });

    const total = await fetchArtworksTotalCount();

    expect(total).toBe(42);
    const builder = lastBuilder();
    expect(builder.table).toBe('artworks');

    const selectCall = builder.calls.find((c) => c.method === 'select');
    expect(selectCall?.args[1]).toEqual({ count: 'exact', head: true });

    const isCall = builder.calls.find((c) => c.method === 'is');
    expect(isCall?.args).toEqual(['deleted_at', null]);
  });

  it('count 为 null 时返回 0', async () => {
    setNextResponse({ data: null, count: null });
    expect(await fetchArtworksTotalCount()).toBe(0);
  });

  it('错误时抛出', async () => {
    setNextResponse({ data: null, error: { message: 'fail' }, count: null });
    await expect(fetchArtworksTotalCount()).rejects.toMatchObject({
      message: 'fail',
    });
  });
});

describe('fetchArtworkDetail', () => {
  it('应用 eq(id) 和 deleted_at IS NULL', async () => {
    setNextResponse({ data: { ...sampleArtworkRow, editions: [] } });

    const detail = await fetchArtworkDetail('a1');

    expect(detail).not.toBeNull();
    const builder = lastBuilder();
    const eqCall = builder.calls.find((c) => c.method === 'eq');
    expect(eqCall?.args).toEqual(['id', 'a1']);

    const isCall = builder.calls.find((c) => c.method === 'is');
    expect(isCall?.args).toEqual(['deleted_at', null]);
  });

  it('PGRST116 错误码返回 null', async () => {
    setNextResponse({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });

    const result = await fetchArtworkDetail('missing');
    expect(result).toBeNull();
  });

  it('其它错误抛出', async () => {
    setNextResponse({ data: null, error: { code: 'OTHER', message: 'oops' } });
    await expect(fetchArtworkDetail('a1')).rejects.toMatchObject({
      code: 'OTHER',
    });
  });

  it('返回值带 stats', async () => {
    setNextResponse({
      data: {
        ...sampleArtworkRow,
        editions: [
          { id: 'e1', status: 'in_studio' },
          { id: 'e2', status: 'sold' },
        ],
      },
    });

    const detail = await fetchArtworkDetail('a1');
    expect(detail?.stats).toEqual({
      total: 2,
      inStudio: 1,
      atGallery: 0,
      sold: 1,
    });
  });
});

describe('useArtworksTotalCount hook', () => {
  it('成功时返回 count', async () => {
    setNextResponse({ data: null, count: 7 });

    const { result } = renderHookWithClient(() => useArtworksTotalCount());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => result.current.isSuccess);

    expect(result.current.data).toBe(7);
  });

  it('count key 形如 ["artworks","count"]', () => {
    expect([...queryKeys.artworks.all, 'count']).toEqual(['artworks', 'count']);
  });
});

describe('useArtworkDetail hook', () => {
  it('id 为 undefined 时不发起查询', () => {
    const { result } = renderHookWithClient(() => useArtworkDetail(undefined));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('id 存在时发起查询并返回详情', async () => {
    setNextResponse({ data: { ...sampleArtworkRow, editions: [] } });

    const { result } = renderHookWithClient(() => useArtworkDetail('a1'));

    await waitFor(() => result.current.isSuccess);

    expect(result.current.data?.id).toBe('a1');
    expect(result.current.data?.stats.total).toBe(0);
  });
});

describe('getArtworkMainStatus', () => {
  it('空版本数组返回 null', () => {
    expect(getArtworkMainStatus([])).toBeNull();
  });

  it('优先级 at_gallery > in_studio > sold', () => {
    expect(
      getArtworkMainStatus([
        { status: 'in_studio' },
        { status: 'at_gallery' },
        { status: 'sold' },
      ])
    ).toBe('at_gallery');

    expect(
      getArtworkMainStatus([{ status: 'in_studio' }, { status: 'sold' }])
    ).toBe('in_studio');

    expect(
      getArtworkMainStatus([{ status: 'sold' }, { status: 'gifted' }])
    ).toBe('sold');
  });

  it('无优先状态时返回首个状态', () => {
    expect(
      getArtworkMainStatus([
        { status: 'in_production' },
        { status: 'in_transit' },
      ])
    ).toBe('in_production');
  });
});
