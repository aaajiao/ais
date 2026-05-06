import { describe, it, expect } from 'vitest';
import { createSearchEditionsTool } from '../search-editions';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 守护测试：search_editions 的三段式 location hint。
 *
 *   no_location_match    → 数据库里完全没有匹配的 location 行
 *   location_no_editions → location 行匹配到了，但没 edition 关联
 *   has_editions         → 正常返回 editions
 *
 * 这三种情况对模型的回答语义完全不同（v1.2.4 引入），如果未来某个 PR 改回到只返回
 * `editions: [], message: ...` 而忽略 hint，这个测试会失败。
 */

interface CapturedCall {
  table: string;
  selectArgs?: string;
  filters: Array<{ kind: string; col?: string; val?: unknown; expr?: string }>;
  limit?: number;
}

interface MockOptions {
  /** 第一次 from('locations') 的返回结果 */
  locationsResult?: { data: unknown; error: unknown };
  /** 第二次 from('editions') 的返回结果 */
  editionsResult?: { data: unknown; error: unknown };
  /** from('artworks') 的返回结果（仅在 artwork_title 时用到，本测试不用） */
  artworksResult?: { data: unknown; error: unknown };
}

/**
 * 极简 supabase mock：按 from() 调用顺序在内部状态机切换返回。
 * search-editions.ts 的调用序列：
 *   1. (artwork_title) supabase.from('artworks').select(...).eq.is.or  → artworks
 *   2. (location)      supabase.from('locations').select(...).eq.or    → locations
 *   3. (always)        supabase.from('editions').select(...).eq.<filters>.limit → editions
 */
function createMockSupabase(opts: MockOptions = {}) {
  const calls: CapturedCall[] = [];
  const artworksResult = opts.artworksResult ?? { data: [], error: null };
  const locationsResult = opts.locationsResult ?? { data: [], error: null };
  const editionsResult = opts.editionsResult ?? { data: [], error: null };

  const supabase = {
    from(table: string) {
      const call: CapturedCall = { table, filters: [] };
      calls.push(call);
      // 共享一个最终 thenable：调用方 await 时返回对应表的结果
      const finalize = () => {
        if (table === 'artworks') return Promise.resolve(artworksResult);
        if (table === 'locations') return Promise.resolve(locationsResult);
        return Promise.resolve(editionsResult);
      };
      const builder: Record<string, unknown> = {
        select(arg?: string) {
          call.selectArgs = arg;
          return builder;
        },
        eq(col: string, val: unknown) {
          call.filters.push({ kind: 'eq', col, val });
          return builder;
        },
        is(col: string, val: unknown) {
          call.filters.push({ kind: 'is', col, val });
          return builder;
        },
        in(col: string, val: unknown) {
          call.filters.push({ kind: 'in', col, val });
          return builder;
        },
        or(expr: string) {
          call.filters.push({ kind: 'or', expr });
          return builder;
        },
        ilike(col: string, val: unknown) {
          call.filters.push({ kind: 'ilike', col, val });
          return builder;
        },
        gte(col: string, val: unknown) {
          call.filters.push({ kind: 'gte', col, val });
          return builder;
        },
        lte(col: string, val: unknown) {
          call.filters.push({ kind: 'lte', col, val });
          return builder;
        },
        limit(n: number) {
          call.limit = n;
          return finalize();
        },
        // 当 builder 直接被 await（无 .limit() 终结）时，依然 resolve
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) {
          return finalize().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

function getExec(tool: ReturnType<typeof createSearchEditionsTool>) {
  return (tool as unknown as {
    execute: (args: unknown) => Promise<unknown>;
  }).execute;
}

function getToModelOutput(tool: ReturnType<typeof createSearchEditionsTool>) {
  return (tool as unknown as {
    toModelOutput: (event: { output: unknown }) => {
      type: 'content';
      value: Array<{ type: 'text'; text: string }>;
    };
  }).toModelOutput;
}

describe('search_editions — three-state location hint (v1.2.4)', () => {
  it('returns hint=no_location_match when location does not match any row', async () => {
    const { supabase } = createMockSupabase({
      locationsResult: { data: [], error: null }, // 没有匹配的 location
      editionsResult: { data: [], error: null },
    });
    const tool = createSearchEditionsTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({ location: 'Atlantis' })) as {
      editions: unknown[];
      hint?: string;
      location?: string;
    };
    expect(result.editions).toEqual([]);
    expect(result.hint).toBe('no_location_match');
    expect(result.location).toBe('Atlantis');
  });

  it('returns hint=location_no_editions when location matches but no edition links to it', async () => {
    const { supabase } = createMockSupabase({
      locationsResult: {
        data: [
          { id: 'loc-1', name: 'Empty Gallery', city: 'London' },
          { id: 'loc-2', name: 'Empty Gallery 2', city: 'London' },
        ],
        error: null,
      },
      editionsResult: { data: [], error: null }, // 关联查询返回空
    });
    const tool = createSearchEditionsTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({ location: 'London' })) as {
      editions: unknown[];
      hint?: string;
      location?: string;
      matched_locations?: Array<{ id: string }>;
    };
    expect(result.editions).toEqual([]);
    expect(result.hint).toBe('location_no_editions');
    expect(result.location).toBe('London');
    expect(result.matched_locations).toHaveLength(2);
    expect(result.matched_locations?.[0].id).toBe('loc-1');
  });

  it('returns hint=has_editions when location matches and editions exist', async () => {
    const { supabase } = createMockSupabase({
      locationsResult: {
        data: [{ id: 'loc-1', name: 'Pace London', city: 'London' }],
        error: null,
      },
      editionsResult: {
        data: [
          {
            id: 'ed-1',
            edition_number: 1,
            status: 'at_gallery',
            artworks: { id: 'aw-1', title_en: 'Black Forest', user_id: 'me' },
            locations: { id: 'loc-1', name: 'Pace London', city: 'London' },
          },
        ],
        error: null,
      },
    });
    const tool = createSearchEditionsTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({ location: 'London' })) as {
      editions: Array<Record<string, unknown>>;
      hint?: string;
    };
    expect(result.editions).toHaveLength(1);
    expect(result.hint).toBe('has_editions');
  });

  it('does NOT include hint when location is not passed (regression: anthropic happy path unchanged)', async () => {
    const { supabase } = createMockSupabase({
      editionsResult: {
        data: [
          {
            id: 'ed-1',
            status: 'in_studio',
            artworks: { id: 'aw-1', title_en: 'X', user_id: 'me' },
            locations: null,
          },
        ],
        error: null,
      },
    });
    const tool = createSearchEditionsTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({ status: 'in_studio' })) as {
      editions: unknown[];
      hint?: string;
    };
    expect(result.editions).toHaveLength(1);
    expect(result.hint).toBeUndefined();
  });
});

describe('search_editions toModelOutput — text differs by hint', () => {
  it('hint=no_location_match → text mentions location not found', () => {
    const tool = createSearchEditionsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const out = getToModelOutput(tool)({
      output: {
        editions: [],
        hint: 'no_location_match',
        location: 'Atlantis',
      },
    });
    const text = out.value[0].text;
    expect(text).toContain('Atlantis');
    expect(text).toMatch(/未找到|没有|没有匹配/);
  });

  it('hint=location_no_editions → text mentions matched locations + 没有版本关联', () => {
    const tool = createSearchEditionsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const out = getToModelOutput(tool)({
      output: {
        editions: [],
        hint: 'location_no_editions',
        location: 'London',
        matched_locations: [
          { id: 'loc-1', name: 'Pace London', city: 'London' },
          { id: 'loc-2', name: 'Tate Modern', city: 'London' },
        ],
      },
    });
    const text = out.value[0].text;
    expect(text).toContain('London');
    expect(text).toContain('Pace London');
    expect(text).toMatch(/没有版本关联|2 个/);
  });

  it('hint=has_editions → text uses the existing summary format (regression)', () => {
    const tool = createSearchEditionsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const out = getToModelOutput(tool)({
      output: {
        editions: [
          {
            id: 'ed-1',
            edition_number: 1,
            status: 'at_gallery',
            artworks: { title_en: 'Black Forest', edition_total: 5 },
            locations: { name: 'Pace London' },
          },
        ],
        hint: 'has_editions',
      },
    });
    const text = out.value[0].text;
    // 与 v1.2.3 完全一致的 summary 行格式：'- id: ..., artwork: ..., #1/5, status: ..., location: ...'
    expect(text).toContain('id: ed-1');
    expect(text).toContain('Black Forest');
    expect(text).toContain('#1/5');
    expect(text).toContain('status: at_gallery');
    expect(text).toContain('location: Pace London');
  });

  it('no hint, empty editions → falls back to result.message (regression)', () => {
    const tool = createSearchEditionsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const out = getToModelOutput(tool)({
      output: { editions: [], message: 'custom message' },
    });
    expect(out.value[0].text).toBe('custom message');
  });

  it('error path is unchanged', () => {
    const tool = createSearchEditionsTool({
      supabase: {} as SupabaseClient,
      userId: 'me',
      locale: 'zh',
    });
    const out = getToModelOutput(tool)({
      output: { error: 'permission denied' },
    });
    expect(out.value[0].text).toContain('permission denied');
  });
});
