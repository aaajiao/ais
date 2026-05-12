import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeArtworkType, fetchExistingArtworkTypes } from './normalizeArtworkType';

describe('normalizeArtworkType', () => {
  describe('null / empty handling', () => {
    it('returns null for null', () => {
      expect(normalizeArtworkType(null, [])).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(normalizeArtworkType(undefined, [])).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeArtworkType('', [])).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeArtworkType('   ', [])).toBeNull();
      expect(normalizeArtworkType('\t\n', [])).toBeNull();
    });
  });

  describe('trim behaviour', () => {
    it('trims leading whitespace', () => {
      expect(normalizeArtworkType('  Video', [])).toBe('Video');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeArtworkType('Video  ', [])).toBe('Video');
    });

    it('trims both sides', () => {
      expect(normalizeArtworkType('  digital printing  ', [])).toBe('digital printing');
    });
  });

  describe('case-insensitive match against existingTypes', () => {
    it('maps lowercase variant to existing canonical form', () => {
      expect(normalizeArtworkType('installation', ['Installation', 'Video'])).toBe(
        'Installation',
      );
    });

    it('maps uppercase variant to existing canonical form', () => {
      expect(normalizeArtworkType('VIDEO', ['Video', 'Installation'])).toBe('Video');
    });

    it('maps mixed-case variant to existing canonical form', () => {
      expect(normalizeArtworkType('DiGiTal PrInTiNg', ['Digital printing'])).toBe(
        'Digital printing',
      );
    });

    it('trims AND matches in the same call (handles "digital printing " trailing-space dirty data)', () => {
      expect(normalizeArtworkType('digital printing ', ['Digital printing'])).toBe(
        'Digital printing',
      );
    });

    it('preserves the canonical form even when input case already matches', () => {
      expect(normalizeArtworkType('Installation', ['Installation'])).toBe('Installation');
    });
  });

  describe('miss / new types', () => {
    it('returns trimmed input when no existing type matches', () => {
      expect(normalizeArtworkType('  Sound  ', ['Installation', 'Video'])).toBe('Sound');
    });

    it('returns trimmed input when existingTypes is empty (degrades to trim-only)', () => {
      expect(normalizeArtworkType('  Painting  ', [])).toBe('Painting');
    });

    it('new type becomes the future canonical form via self-bootstrapping (caller decision)', () => {
      // The function itself just returns the trimmed value; the database receives it
      // as-is and a later normalization call sees it in existingTypes. This test
      // documents that the helper is non-magical: it returns what the caller will
      // pass to the DB.
      const first = normalizeArtworkType('Photography', []);
      expect(first).toBe('Photography');
      // Subsequent variants should normalize to the freshly-canonical form.
      expect(normalizeArtworkType('photography', [first!])).toBe('Photography');
      expect(normalizeArtworkType('  PHOTOGRAPHY  ', [first!])).toBe('Photography');
    });
  });

  describe('determinism / priority', () => {
    it('picks the first match when existingTypes has case duplicates (caller is responsible for de-dup)', () => {
      // If existingTypes itself is dirty, the function returns whichever appears first.
      // fetchExistingArtworkTypes already dedupes case-sensitively by frequency, so
      // this should be rare in practice.
      expect(normalizeArtworkType('video', ['Video', 'video'])).toBe('Video');
      expect(normalizeArtworkType('video', ['video', 'Video'])).toBe('video');
    });
  });
});

describe('fetchExistingArtworkTypes', () => {
  function makeSupabase(rows: Array<{ type: string | null }>, error: unknown = null) {
    type Builder = {
      select: (cols: string) => Builder;
      not: (col: string, op: string, val: unknown) => Builder;
      is: (col: string, val: unknown) => Builder;
      eq: (col: string, val: unknown) => Builder;
      then: <T>(onfulfilled: (v: { data: typeof rows; error: unknown }) => T) => Promise<T>;
    };
    const filters: Array<{ col: string; method: string; val: unknown }> = [];
    const builder: Builder = {
      select: () => builder,
      not: (col, op, val) => {
        filters.push({ col, method: `not.${op}`, val });
        return builder;
      },
      is: (col, val) => {
        filters.push({ col, method: 'is', val });
        return builder;
      },
      eq: (col, val) => {
        filters.push({ col, method: 'eq', val });
        return builder;
      },
      then: (onfulfilled) => Promise.resolve({ data: rows, error }).then(onfulfilled),
    };
    return {
      supabase: {
        from: () => builder,
      } as unknown as SupabaseClient,
      filters,
    };
  }

  it('returns empty array on supabase error', async () => {
    const { supabase } = makeSupabase([], { message: 'boom' });
    const result = await fetchExistingArtworkTypes(supabase);
    expect(result).toEqual([]);
  });

  it('dedupes case-sensitively and sorts by frequency desc', async () => {
    const rows = [
      { type: 'Installation' }, { type: 'Installation' }, { type: 'Installation' },
      { type: 'installation' }, { type: 'installation' },
      { type: 'Video' },
    ];
    const { supabase } = makeSupabase(rows);
    const result = await fetchExistingArtworkTypes(supabase);
    // 'Installation' (3), 'installation' (2), 'Video' (1)
    expect(result).toEqual(['Installation', 'installation', 'Video']);
  });

  it('drops null and whitespace-only entries', async () => {
    const rows = [
      { type: null }, { type: '  ' }, { type: 'Video' },
    ];
    const { supabase } = makeSupabase(rows);
    expect(await fetchExistingArtworkTypes(supabase)).toEqual(['Video']);
  });

  it('trims entries before counting (so " Video" + "Video" merge)', async () => {
    const rows = [{ type: ' Video' }, { type: 'Video' }, { type: 'Video ' }];
    const { supabase } = makeSupabase(rows);
    expect(await fetchExistingArtworkTypes(supabase)).toEqual(['Video']);
  });

  it('adds user_id filter when options.userId is provided', async () => {
    const { supabase, filters } = makeSupabase([{ type: 'Video' }]);
    await fetchExistingArtworkTypes(supabase, { userId: 'user-123' });
    const userFilter = filters.find((f) => f.col === 'user_id');
    expect(userFilter).toBeDefined();
    expect(userFilter?.val).toBe('user-123');
  });

  it('always filters out soft-deleted rows', async () => {
    const { supabase, filters } = makeSupabase([]);
    await fetchExistingArtworkTypes(supabase);
    const softDeleteFilter = filters.find((f) => f.col === 'deleted_at' && f.method === 'is');
    expect(softDeleteFilter).toBeDefined();
    expect(softDeleteFilter?.val).toBeNull();
  });
});
