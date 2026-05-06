import { describe, it, expect } from 'vitest';
import { createSearchLocationsTool } from '../search-locations';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CapturedCall {
  table: string;
  filters: Array<{ kind: string; col?: string; val?: unknown; expr?: string }>;
  limit?: number;
}

function createMockSupabase(opts: {
  locationsResult?: { data: unknown; error: unknown };
} = {}) {
  const calls: CapturedCall[] = [];
  const locationsResult = opts.locationsResult ?? { data: [], error: null };

  const supabase = {
    from(table: string) {
      const call: CapturedCall = { table, filters: [] };
      calls.push(call);
      const finalize = () => Promise.resolve(locationsResult);
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(col: string, val: unknown) { call.filters.push({ kind: 'eq', col, val }); return builder; },
        or(expr: string) { call.filters.push({ kind: 'or', expr }); return builder; },
        ilike(col: string, val: unknown) { call.filters.push({ kind: 'ilike', col, val }); return builder; },
        limit(n: number) { call.limit = n; return finalize(); },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) {
          return finalize().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

function getExec(tool: ReturnType<typeof createSearchLocationsTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('search_locations — OpenAI strict structured outputs default-value payload', () => {
  it('strips empty strings + null values from OpenAI default payload', async () => {
    const { supabase, calls } = createMockSupabase({
      locationsResult: { data: [{ id: 'loc-1', name: 'X' }], error: null },
    });
    const tool = createSearchLocationsTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      query: '',
      type: 'studio', // OpenAI strict default fills first enum value, must be ignored if user did not mention type
      country: '',
    });

    // Note: 'studio' is a valid enum and we cannot semantically distinguish a real
    // user request for studios from an OpenAI default fill of the first enum value.
    // For other empty fields we expect them to be stripped.
    const locsCall = calls.find(c => c.table === 'locations');
    expect(locsCall).toBeDefined();
    const filterCols = (locsCall?.filters ?? []).map(f => f.col);
    expect(filterCols).not.toContain('country');
    const orExprs = (locsCall?.filters ?? [])
      .filter(f => f.kind === 'or')
      .map(f => f.expr || '');
    const queryOrPresent = orExprs.some(e => e.includes('name.ilike') || e.includes('city.ilike'));
    expect(queryOrPresent).toBe(false);
  });

  it('all-null payload skips all filters except user_id', async () => {
    const { supabase, calls } = createMockSupabase({
      locationsResult: { data: [], error: null },
    });
    const tool = createSearchLocationsTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      query: null,
      type: null,
      country: null,
    });

    const locsCall = calls.find(c => c.table === 'locations');
    const filters = locsCall?.filters ?? [];
    const eqs = filters.filter(f => f.kind === 'eq');
    expect(eqs).toHaveLength(1);
    expect(eqs[0].col).toBe('user_id');
    const ilikeFilters = filters.filter(f => f.kind === 'ilike');
    expect(ilikeFilters).toHaveLength(0);
    const orFilters = filters.filter(f => f.kind === 'or');
    expect(orFilters).toHaveLength(0);
  });

  it('inputSchema accepts null for every optional field', () => {
    const tool = createSearchLocationsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const schema = (tool as unknown as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    }).inputSchema;
    expect(schema.safeParse({ query: null, type: null, country: null }).success).toBe(true);
  });
});
