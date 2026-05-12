import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ExtractionShape {
  success: boolean;
  artwork?: {
    title_en: string;
    title_cn?: string;
    year?: string;
    type?: string;
    dimensions?: string;
    materials?: string;
    duration?: string;
  };
  images?: string[];
  error?: string;
}

let extractStub: ExtractionShape;

vi.mock('../../lib/artwork-extractor.js', () => ({
  extractArtworkFromUrl: vi.fn(async () => extractStub),
}));

vi.mock('../../lib/image-downloader.js', () => ({
  selectBestImage: (imgs: string[]) => imgs[0] ?? null,
}));

import { createImportFromUrlTool } from '../import-from-url';

interface CapturedCall {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload?: unknown;
  filters: Array<{ col: string; val: unknown; method?: string }>;
}

interface FromHandler {
  (table: string, calls: CapturedCall[]): {
    select: (cols?: string) => unknown;
    insert: (payload: unknown) => unknown;
    update: (payload: unknown) => unknown;
  };
}

function createMockSupabase(handler: FromHandler) {
  const calls: CapturedCall[] = [];
  const supabase = {
    from(table: string) {
      return handler(table, calls);
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

interface ExistingArtwork {
  id: string;
  user_id: string;
  source_url?: string | null;
  title_en?: string | null;
}

function buildHandler(opts: {
  existingByUrl?: ExistingArtwork[];
  existingByTitle?: ExistingArtwork[];
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
  updateError?: { message: string } | null;
}) {
  const handler: FromHandler = (table, calls) => {
    return {
      select(cols?: string) {
        const call: CapturedCall = { table, op: 'select', filters: [] };
        calls.push(call);
        // Thenable builder：每次链式 filter 都返回 self，await builder 时 resolve 数据。
        // fetchExistingArtworkTypes 走 .not().is().eq() 顺序，import-from-url 自身走
        // .eq().eq().is() 顺序 —— 两条路径都需要可链 + 可 await。
        interface SelectBuilder {
          eq(col: string, val: unknown): SelectBuilder;
          not(col: string, op: string, val: unknown): SelectBuilder;
          is(col: string, val: unknown): SelectBuilder;
          single(): Promise<{ data: ExistingArtwork | null; error: null }>;
          then<TResult>(
            onfulfilled: (v: { data: ExistingArtwork[]; error: null }) => TResult,
          ): Promise<TResult>;
        }
        const builder: SelectBuilder = {
          eq(col, val) {
            call.filters.push({ col, val, method: 'eq' });
            return builder;
          },
          not(col, op, val) {
            call.filters.push({ col, val, method: `not.${op}` });
            return builder;
          },
          is(col, val) {
            call.filters.push({ col, val, method: 'is' });
            return builder;
          },
          single() {
            const data = resolveSelect(call, opts);
            return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null });
          },
          then(onfulfilled) {
            return Promise.resolve({
              data: resolveSelect(call, opts) ?? [],
              error: null,
            }).then(onfulfilled);
          },
        };
        void cols;
        return builder;
      },
      insert(payload: unknown) {
        const call: CapturedCall = { table, op: 'insert', payload, filters: [] };
        calls.push(call);
        return {
          select() {
            return {
              single() {
                return Promise.resolve(opts.insertResult ?? { data: { id: 'new-art-id' }, error: null });
              },
            };
          },
        };
      },
      update(payload: unknown) {
        const call: CapturedCall = { table, op: 'update', payload, filters: [] };
        calls.push(call);
        return {
          eq(col: string, val: unknown) {
            call.filters.push({ col, val, method: 'eq' });
            return Promise.resolve({ error: opts.updateError ?? null });
          },
        };
      },
    };
  };
  return handler;
}

function resolveSelect(
  call: CapturedCall,
  opts: { existingByUrl?: ExistingArtwork[]; existingByTitle?: ExistingArtwork[] },
): ExistingArtwork[] | null {
  if (call.table !== 'artworks') return [];
  const filterCols = call.filters.map((f) => f.col);
  // fetchExistingArtworkTypes 用 `.not('type', 'is', null)`，没 source_url/title_en 过滤
  if (
    call.filters.some((f) => f.col === 'type' && f.method === 'not.is') &&
    !filterCols.includes('source_url') &&
    !filterCols.includes('title_en')
  ) {
    return [];
  }
  if (filterCols.includes('source_url')) {
    return opts.existingByUrl ?? [];
  }
  if (filterCols.includes('title_en')) {
    return opts.existingByTitle ?? [];
  }
  return [];
}

describe('import_artwork_from_url', () => {
  beforeEach(() => {
    extractStub = {
      success: true,
      artwork: { title_en: 'Test Title', year: '2024' },
      images: ['https://example.com/big.jpg'],
    };
  });

  it('returns extractor error when extraction fails', async () => {
    extractStub = { success: false, error: 'parse failed' };
    const { supabase } = createMockSupabase(buildHandler({}));
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    })) as { error?: string };
    expect(result.error).toBeTruthy();
  });

  it('inserts a new artwork with user_id when nothing matches', async () => {
    const { supabase, calls } = createMockSupabase(buildHandler({}));
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    })) as { success?: boolean; action?: string; artwork_id?: string };

    expect(result.success).toBe(true);
    expect(result.action).toBe('created');

    const insert = calls.find((c) => c.op === 'insert' && c.table === 'artworks');
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.user_id).toBe('me');
    expect(payload.source_url).toBe('https://example.com/art');
    expect(payload.title_en).toBe('Test Title');
  });

  it('scopes both source_url and title queries by user_id and excludes soft-deleted', async () => {
    const { supabase, calls } = createMockSupabase(buildHandler({}));
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    });

    const lookups = calls.filter((c) => c.op === 'select' && c.table === 'artworks');
    expect(lookups.length).toBeGreaterThanOrEqual(1);
    for (const lookup of lookups) {
      const cols = lookup.filters.map((f) => `${f.method}:${f.col}`);
      expect(cols).toContain('eq:user_id');
      expect(cols).toContain('is:deleted_at');
    }
  });

  it('updates instead of duplicating when matching source_url already exists for the user', async () => {
    const existing = [{ id: 'existing-id', user_id: 'me', title_en: 'Test Title' }];
    const { supabase, calls } = createMockSupabase(
      buildHandler({ existingByUrl: existing }),
    );
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    })) as { action?: string; artwork_id?: string };

    expect(result.action).toBe('updated');
    expect(result.artwork_id).toBe('existing-id');

    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'artworks');
    expect(inserts.length).toBe(0);

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'artworks');
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const idScopedUpdate = updates.find((u) =>
      u.filters.some((f) => f.col === 'id' && f.val === 'existing-id'),
    );
    expect(idScopedUpdate).toBeDefined();
  });

  it('falls back to title match within the same user scope', async () => {
    const { supabase, calls } = createMockSupabase(
      buildHandler({
        existingByUrl: [],
        existingByTitle: [{ id: 'title-match-id', user_id: 'me', source_url: null }],
      }),
    );
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    })) as { action?: string; artwork_id?: string };
    expect(result.action).toBe('updated');
    expect(result.artwork_id).toBe('title-match-id');
    const titleLookup = calls.find(
      (c) =>
        c.op === 'select' &&
        c.table === 'artworks' &&
        c.filters.some((f) => f.col === 'title_en'),
    );
    expect(titleLookup).toBeDefined();
    expect(titleLookup!.filters.find((f) => f.col === 'user_id')?.val).toBe('me');
  });

  it('normalizes the LLM-extracted type against existing user types (case-insensitive + trim)', async () => {
    // LLM 从网页抽出 "installation " (尾空格 + 小写)，用户库里已有 "Installation"。
    // 期望：写入 DB 时归一化为 "Installation"。
    extractStub = {
      success: true,
      artwork: { title_en: 'Dirty Type Test', type: 'installation ' },
      images: [],
    };
    // 自定义 handler：让 fetchExistingArtworkTypes 那次 select 返回 [{type:'Installation'}]
    const typeAwareHandler: FromHandler = (table, calls) => ({
      select() {
        const call: CapturedCall = { table, op: 'select', filters: [] };
        calls.push(call);
        interface SelectBuilder {
          eq(col: string, val: unknown): SelectBuilder;
          not(col: string, op: string, val: unknown): SelectBuilder;
          is(col: string, val: unknown): SelectBuilder;
          single(): Promise<{ data: unknown; error: null }>;
          then<TResult>(onfulfilled: (v: { data: unknown[]; error: null }) => TResult): Promise<TResult>;
        }
        const builder: SelectBuilder = {
          eq(col, val) {
            call.filters.push({ col, val, method: 'eq' });
            return builder;
          },
          not(col, op, val) {
            call.filters.push({ col, val, method: `not.${op}` });
            return builder;
          },
          is(col, val) {
            call.filters.push({ col, val, method: 'is' });
            return builder;
          },
          single() {
            return Promise.resolve({ data: null, error: null });
          },
          then(onfulfilled) {
            // fetchExistingArtworkTypes 是唯一带 `not.is` 过滤的 select
            const isTypesFetch = call.filters.some(
              (f) => f.col === 'type' && f.method === 'not.is',
            );
            return Promise.resolve({
              data: isTypesFetch ? [{ type: 'Installation' }, { type: 'Installation' }] : [],
              error: null,
            }).then(onfulfilled);
          },
        };
        return builder;
      },
      insert(payload: unknown) {
        const call: CapturedCall = { table, op: 'insert', payload, filters: [] };
        calls.push(call);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-art-id' }, error: null }),
          }),
        };
      },
      update(payload: unknown) {
        const call: CapturedCall = { table, op: 'update', payload, filters: [] };
        calls.push(call);
        return {
          eq(col: string, val: unknown) {
            call.filters.push({ col, val, method: 'eq' });
            return Promise.resolve({ error: null });
          },
        };
      },
    });
    const { supabase, calls } = createMockSupabase(typeAwareHandler);
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/dirty-type',
    });

    const insert = calls.find((c) => c.op === 'insert' && c.table === 'artworks');
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.type).toBe('Installation');
  });

  it('updates the thumbnail_url when a best image is selected', async () => {
    const { supabase, calls } = createMockSupabase(buildHandler({}));
    const tool = createImportFromUrlTool({ supabase, userId: 'me', locale: 'zh' });
    await (tool as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
      url: 'https://example.com/art',
    });
    const thumbnailUpdate = calls.find(
      (c) =>
        c.op === 'update' &&
        c.table === 'artworks' &&
        (c.payload as Record<string, unknown>).thumbnail_url !== undefined,
    );
    expect(thumbnailUpdate).toBeDefined();
    expect((thumbnailUpdate!.payload as Record<string, unknown>).thumbnail_url).toBe(
      'https://example.com/big.jpg',
    );
  });
});
