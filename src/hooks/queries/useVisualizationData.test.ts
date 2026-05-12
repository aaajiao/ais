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
const responseByTable: Record<string, { data: unknown; error: unknown }> = {};

function setTableResponse(
  table: string,
  response: { data?: unknown; error?: unknown }
) {
  responseByTable[table] = {
    data: response.data ?? [],
    error: response.error ?? null,
  };
}

function createBuilder(state: BuilderState): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          const resp = responseByTable[state.table] ?? {
            data: [],
            error: null,
          };
          try {
            return Promise.resolve(
              onFulfilled({ data: resp.data, error: resp.error })
            );
          } catch (err) {
            if (onRejected) return Promise.resolve(onRejected(err));
            return Promise.reject(err);
          }
        };
      }
      if (typeof prop === 'symbol') return undefined;
      return (...args: unknown[]) => {
        state.calls.push({ method: prop, args });
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
  useVisualizationData,
  type VizArtwork,
  type VizEdition,
  type VizLocation,
  type VizHistory,
} from './useVisualizationData';
import { renderHookWithClient, waitFor } from '@/test/test-utils';

const fakeArtwork: VizArtwork = {
  id: 'a1',
  title_en: 'Test',
  title_cn: null,
  year: '2024',
  type: 'Installation',
  thumbnail_url: null,
  edition_total: 3,
  ap_total: 1,
  is_unique: false,
  created_at: '2024-01-01T00:00:00Z',
};
const fakeEdition: VizEdition = {
  id: 'e1',
  artwork_id: 'a1',
  inventory_number: 'AAJ-2024-001',
  edition_type: 'numbered',
  edition_number: 1,
  status: 'sold',
  location_id: null,
  sale_price: 5000,
  sale_currency: 'USD',
  sale_date: '2024-06-01',
  buyer_name: 'Buyer',
  created_at: '2024-01-01T00:00:00Z',
};
const fakeLocation: VizLocation = {
  id: 'l1',
  name: 'Studio',
  type: 'studio',
  city: 'Shanghai',
  country: 'China',
};
const fakeHistory: VizHistory = {
  id: 'h1',
  edition_id: 'e1',
  action: 'status_change',
  from_status: 'in_studio',
  to_status: 'sold',
  from_location: null,
  to_location: null,
  created_at: '2024-06-01T00:00:00Z',
};

beforeEach(() => {
  builderRegistry.length = 0;
  fromMock.mockClear();
  for (const k of Object.keys(responseByTable)) delete responseByTable[k];
});

describe('useVisualizationData', () => {
  it('并行查询 4 张表（artworks/editions/locations/edition_history）', async () => {
    setTableResponse('artworks', { data: [fakeArtwork] });
    setTableResponse('editions', { data: [fakeEdition] });
    setTableResponse('locations', { data: [fakeLocation] });
    setTableResponse('edition_history', { data: [fakeHistory] });

    const { result } = renderHookWithClient(() => useVisualizationData());

    await waitFor(() => result.current.isSuccess);

    const tables = builderRegistry.map((b) => b.table).sort();
    expect(tables).toEqual([
      'artworks',
      'edition_history',
      'editions',
      'locations',
    ]);
  });

  it('artworks 查询过滤 deleted_at IS NULL', async () => {
    setTableResponse('artworks', { data: [fakeArtwork] });
    setTableResponse('editions', { data: [] });
    setTableResponse('locations', { data: [] });
    setTableResponse('edition_history', { data: [] });

    const { result } = renderHookWithClient(() => useVisualizationData());
    await waitFor(() => result.current.isSuccess);

    const artworksBuilder = builderRegistry.find((b) => b.table === 'artworks');
    expect(artworksBuilder).toBeDefined();
    const isCall = artworksBuilder!.calls.find((c) => c.method === 'is');
    expect(isCall).toBeDefined();
    expect(isCall!.args).toEqual(['deleted_at', null]);
  });

  it('返回数据按 4 个 key 聚合并附带 fetchedAt', async () => {
    setTableResponse('artworks', { data: [fakeArtwork] });
    setTableResponse('editions', { data: [fakeEdition] });
    setTableResponse('locations', { data: [fakeLocation] });
    setTableResponse('edition_history', { data: [fakeHistory] });

    const { result } = renderHookWithClient(() => useVisualizationData());
    await waitFor(() => result.current.isSuccess);

    expect(result.current.data).toBeDefined();
    expect(result.current.data!.artworks).toHaveLength(1);
    expect(result.current.data!.editions).toHaveLength(1);
    expect(result.current.data!.locations).toHaveLength(1);
    expect(result.current.data!.history).toHaveLength(1);
    expect(result.current.data!.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('某张表报错时整体 query 标记为 isError', async () => {
    setTableResponse('artworks', { data: [] });
    setTableResponse('editions', {
      data: null,
      error: { message: 'boom' },
    });
    setTableResponse('locations', { data: [] });
    setTableResponse('edition_history', { data: [] });

    const { result } = renderHookWithClient(() => useVisualizationData());
    await waitFor(() => result.current.isError);
  });
});
