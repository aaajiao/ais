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
        const builder = {
          eq(col: string, val: unknown) {
            call.filters.push({ col, val, method: 'eq' });
            return builder;
          },
          is(col: string, val: unknown) {
            call.filters.push({ col, val, method: 'is' });
            return Promise.resolve({
              data: resolveSelect(call, opts) ?? [],
              error: null,
            });
          },
          single() {
            const data = resolveSelect(call, opts);
            return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null });
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
