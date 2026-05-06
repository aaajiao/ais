import { describe, it, expect } from 'vitest';
import { createSearchHistoryTool } from '../search-history';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CapturedCall {
  table: string;
  filters: Array<{ kind: string; col?: string; val?: unknown; expr?: string }>;
  limit?: number;
  ordered?: boolean;
}

function createMockSupabase(opts: {
  historyResult?: { data: unknown; error: unknown };
} = {}) {
  const calls: CapturedCall[] = [];
  const historyResult = opts.historyResult ?? { data: [], error: null };

  const supabase = {
    from(table: string) {
      const call: CapturedCall = { table, filters: [] };
      calls.push(call);
      const finalize = () => Promise.resolve(historyResult);
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(col: string, val: unknown) { call.filters.push({ kind: 'eq', col, val }); return builder; },
        is(col: string, val: unknown) { call.filters.push({ kind: 'is', col, val }); return builder; },
        in(col: string, val: unknown) { call.filters.push({ kind: 'in', col, val }); return builder; },
        or(expr: string) { call.filters.push({ kind: 'or', expr }); return builder; },
        ilike(col: string, val: unknown) { call.filters.push({ kind: 'ilike', col, val }); return builder; },
        gte(col: string, val: unknown) { call.filters.push({ kind: 'gte', col, val }); return builder; },
        lte(col: string, val: unknown) { call.filters.push({ kind: 'lte', col, val }); return builder; },
        order() { call.ordered = true; return builder; },
        limit(n: number) { call.limit = n; return builder; },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) {
          return finalize().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

function getExec(tool: ReturnType<typeof createSearchHistoryTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('search_history — OpenAI strict structured outputs default-value payload', () => {
  it('strips empty strings from OpenAI default payload', async () => {
    const { supabase, calls } = createMockSupabase({
      historyResult: { data: [], error: null },
    });
    const tool = createSearchHistoryTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      edition_id: '',
      artwork_title: '',
      action: 'created', // OpenAI strict mode would fill first enum value; we cannot tell from real intent
      after: '',
      before: '',
      related_party: '',
    });

    const historyCall = calls.find(c => c.table === 'edition_history');
    expect(historyCall).toBeDefined();
    const filters = historyCall?.filters ?? [];
    const filterCols = filters.map(f => f.col);
    expect(filterCols).not.toContain('edition_id');
    expect(filterCols).not.toContain('related_party');
    const gteFilters = filters.filter(f => f.kind === 'gte' && f.col === 'created_at');
    const lteFilters = filters.filter(f => f.kind === 'lte' && f.col === 'created_at');
    expect(gteFilters).toHaveLength(0);
    expect(lteFilters).toHaveLength(0);
  });

  it('all-null payload skips all filters except user_id scope', async () => {
    const { supabase, calls } = createMockSupabase({
      historyResult: { data: [], error: null },
    });
    const tool = createSearchHistoryTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      edition_id: null,
      artwork_title: null,
      action: null,
      after: null,
      before: null,
      related_party: null,
    });

    const historyCall = calls.find(c => c.table === 'edition_history');
    const filters = historyCall?.filters ?? [];
    const eqs = filters.filter(f => f.kind === 'eq');
    // Only the scope filter should be present (editions.artworks.user_id)
    expect(eqs).toHaveLength(1);
    expect(eqs[0].col).toBe('editions.artworks.user_id');
    const gteFilters = filters.filter(f => f.kind === 'gte');
    const lteFilters = filters.filter(f => f.kind === 'lte');
    const ilikeFilters = filters.filter(f => f.kind === 'ilike');
    expect(gteFilters).toHaveLength(0);
    expect(lteFilters).toHaveLength(0);
    expect(ilikeFilters).toHaveLength(0);
  });

  it('inputSchema accepts null for every optional field', () => {
    const tool = createSearchHistoryTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const schema = (tool as unknown as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    }).inputSchema;
    expect(schema.safeParse({
      edition_id: null,
      artwork_title: null,
      action: null,
      after: null,
      before: null,
      related_party: null,
    }).success).toBe(true);
  });
});
