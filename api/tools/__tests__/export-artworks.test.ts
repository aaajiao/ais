import { describe, it, expect } from 'vitest';
import { createExportArtworksTool } from '../export-artworks';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockSupabase() {
  // Stub that returns no artworks for "all" scope tests; specific tests pass artwork_ids
  const supabase = {
    from() {
      return {
        select() {
          const builder = {
            eq() { return builder; },
            is() { return builder; },
            or() { return builder; },
            limit() {
              return Promise.resolve({ data: [], error: null });
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase };
}

function getExec(tool: ReturnType<typeof createExportArtworksTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('export_artworks default-payload defense', () => {
  it('default-padded include_* (null/undefined) defaults to true (full export)', async () => {
    const { supabase } = createMockSupabase();
    const tool = createExportArtworksTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      format: 'pdf',
      artwork_ids: ['a-1'],
      // user did not specify include_* — GPT may default to null
      include_price: null,
      include_status: null,
      include_location: null,
    })) as { exportRequest?: { options?: Record<string, unknown> } };
    expect(result.exportRequest?.options).toEqual({
      includePrice: true,
      includeStatus: true,
      includeLocation: true,
    });
  });

  it('user explicitly setting include_price=false is preserved', async () => {
    const { supabase } = createMockSupabase();
    const tool = createExportArtworksTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      format: 'md',
      artwork_ids: ['a-1'],
      include_price: false,
      include_status: true,
      include_location: true,
    })) as { exportRequest?: { options?: Record<string, unknown> } };
    expect(result.exportRequest?.options).toEqual({
      includePrice: false,
      includeStatus: true,
      includeLocation: true,
    });
  });

  it('artwork_ids array with empty string entries is filtered (no UUID = "")', async () => {
    const { supabase } = createMockSupabase();
    const tool = createExportArtworksTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      format: 'pdf',
      artwork_ids: ['a-1', '', 'a-2', '   '],
    })) as { exportRequest?: { artworkIds?: string[]; scope?: string } };
    expect(result.exportRequest?.artworkIds).toEqual(['a-1', 'a-2']);
    expect(result.exportRequest?.scope).toBe('selected');
  });

  it('null artwork_title is treated as "no title filter"', async () => {
    const { supabase } = createMockSupabase();
    const tool = createExportArtworksTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      format: 'pdf',
      artwork_title: null,
      artwork_ids: ['a-1'],
    })) as { exportRequest?: { artworkIds?: string[] } };
    expect(result.exportRequest?.artworkIds).toEqual(['a-1']);
  });
});
