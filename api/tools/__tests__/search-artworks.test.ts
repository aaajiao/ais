import { describe, it, expect } from 'vitest';
import { createSearchArtworksTool } from '../search-artworks';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CapturedCall {
  table: string;
  filters: Array<{ kind: string; col?: string; val?: unknown; expr?: string }>;
  limit?: number;
}

function createMockSupabase(opts: {
  artworksResult?: { data: unknown; error: unknown };
} = {}) {
  const calls: CapturedCall[] = [];
  const artworksResult = opts.artworksResult ?? { data: [], error: null };

  const supabase = {
    from(table: string) {
      const call: CapturedCall = { table, filters: [] };
      calls.push(call);
      const finalize = () => Promise.resolve(artworksResult);
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(col: string, val: unknown) { call.filters.push({ kind: 'eq', col, val }); return builder; },
        is(col: string, val: unknown) { call.filters.push({ kind: 'is', col, val }); return builder; },
        in(col: string, val: unknown) { call.filters.push({ kind: 'in', col, val }); return builder; },
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

function getExec(tool: ReturnType<typeof createSearchArtworksTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('search_artworks — OpenAI strict structured outputs default-value payload', () => {
  it('strips empty strings from OpenAI default payload', async () => {
    const { supabase, calls } = createMockSupabase({
      artworksResult: { data: [{ id: 'aw-1', title_en: 'X' }], error: null },
    });
    const tool = createSearchArtworksTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      query: '',
      year: '',
      type: '',
      materials: '',
      is_unique: null,
    });

    const artworksCall = calls.find(c => c.table === 'artworks');
    expect(artworksCall).toBeDefined();
    const filterCols = (artworksCall?.filters ?? []).map(f => f.col);
    expect(filterCols).not.toContain('year');
    expect(filterCols).not.toContain('is_unique');
    const orExprs = (artworksCall?.filters ?? [])
      .filter(f => f.kind === 'or')
      .map(f => f.expr || '');
    const titleOrPresent = orExprs.some(e => e.includes('title_en') || e.includes('title_cn'));
    expect(titleOrPresent).toBe(false);
    const typeOrPresent = orExprs.some(e => e.includes('type.ilike'));
    expect(typeOrPresent).toBe(false);
    const materialsOrPresent = orExprs.some(e => e.includes('materials.ilike'));
    expect(materialsOrPresent).toBe(false);
  });

  it('null values from OpenAI strict mode are treated as unset', async () => {
    const { supabase, calls } = createMockSupabase({
      artworksResult: { data: [], error: null },
    });
    const tool = createSearchArtworksTool({ supabase, userId: 'me', locale: 'zh' });

    await getExec(tool)({
      query: null,
      year: null,
      type: null,
      materials: null,
      is_unique: null,
    });

    const artworksCall = calls.find(c => c.table === 'artworks');
    const filterCols = (artworksCall?.filters ?? []).map(f => f.col);
    expect(filterCols).not.toContain('year');
    expect(filterCols).not.toContain('is_unique');
  });

  it('inputSchema accepts null for every optional field', () => {
    const tool = createSearchArtworksTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const schema = (tool as unknown as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    }).inputSchema;
    expect(schema.safeParse({
      query: null,
      year: null,
      type: null,
      materials: null,
      is_unique: null,
    }).success).toBe(true);
  });

  it('preserves is_unique=false (not coerced to "unset")', async () => {
    const { supabase, calls } = createMockSupabase({
      artworksResult: { data: [], error: null },
    });
    const tool = createSearchArtworksTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({ is_unique: false });

    const artworksCall = calls.find(c => c.table === 'artworks');
    const eqIsUnique = (artworksCall?.filters ?? []).find(
      f => f.kind === 'eq' && f.col === 'is_unique'
    );
    expect(eqIsUnique).toBeDefined();
    expect(eqIsUnique?.val).toBe(false);
  });
});
