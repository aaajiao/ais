import { describe, it, expect } from 'vitest';
import { createSearchArtworksTool } from '../search-artworks';
import { createSearchEditionsTool } from '../search-editions';
import { createSearchLocationsTool } from '../search-locations';
import { createSearchHistoryTool } from '../search-history';
import { createGetStatisticsTool } from '../get-statistics';
import { createExecuteUpdateTool } from '../execute-update';
import { createUpdateConfirmationTool } from '../update-confirmation';
import { createExportArtworksTool } from '../export-artworks';
import { createImportFromUrlTool } from '../import-from-url';
import type { ToolContext } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

const stubCtx: ToolContext = {
  supabase: {} as SupabaseClient,
  userId: 'user-1',
  locale: 'zh',
};

function getInputSchema(t: ReturnType<typeof createSearchArtworksTool>) {
  return (t as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;
}

describe('search_artworks schema', () => {
  const schema = getInputSchema(createSearchArtworksTool(stubCtx));

  it('should accept empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('should accept query string', () => {
    expect(schema.safeParse({ query: 'test artwork' }).success).toBe(true);
  });

  it('should accept year as string', () => {
    expect(schema.safeParse({ year: '2024' }).success).toBe(true);
  });

  it('should accept is_unique boolean', () => {
    expect(schema.safeParse({ is_unique: true }).success).toBe(true);
  });

  it('should accept all fields combined', () => {
    expect(schema.safeParse({
      query: 'digital',
      year: '2023',
      type: 'installation',
      materials: 'LED',
      is_unique: false,
    }).success).toBe(true);
  });

  it('should reject invalid is_unique type', () => {
    expect(schema.safeParse({ is_unique: 'yes' }).success).toBe(false);
  });
});

describe('execute_edition_update schema', () => {
  const schema = getInputSchema(createExecuteUpdateTool(stubCtx));

  it('should require edition_id', () => {
    expect(schema.safeParse({ updates: {}, confirmed: true }).success).toBe(false);
  });

  it('should require confirmed field', () => {
    expect(schema.safeParse({ edition_id: '123', updates: { status: 'sold' } }).success).toBe(false);
  });

  it('should accept valid update with confirmation', () => {
    expect(schema.safeParse({
      edition_id: 'ed-123',
      updates: { status: 'sold', buyer_name: 'Collector' },
      confirmed: true,
    }).success).toBe(true);
  });

  it('should validate condition enum (excellent ok)', () => {
    expect(schema.safeParse({
      edition_id: '123',
      updates: { condition: 'excellent' },
      confirmed: true,
    }).success).toBe(true);
  });

  it('should reject unknown condition', () => {
    expect(schema.safeParse({
      edition_id: '123',
      updates: { condition: 'unknown' },
      confirmed: true,
    }).success).toBe(false);
  });

  it('should accept sale_price as number', () => {
    expect(schema.safeParse({
      edition_id: '123',
      updates: { sale_price: 10000, sale_currency: 'USD' },
      confirmed: true,
    }).success).toBe(true);
  });

  it('should reject sale_price as string', () => {
    expect(schema.safeParse({
      edition_id: '123',
      updates: { sale_price: '10000' },
      confirmed: true,
    }).success).toBe(false);
  });
});

describe('export_artworks schema', () => {
  const schema = getInputSchema(createExportArtworksTool(stubCtx));

  it('should require format field', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('should accept pdf format', () => {
    expect(schema.safeParse({ format: 'pdf' }).success).toBe(true);
  });

  it('should accept md format', () => {
    expect(schema.safeParse({ format: 'md' }).success).toBe(true);
  });

  it('should reject invalid format', () => {
    expect(schema.safeParse({ format: 'docx' }).success).toBe(false);
  });

  it('should accept artwork_ids as array', () => {
    expect(schema.safeParse({ format: 'pdf', artwork_ids: ['id1', 'id2'] }).success).toBe(true);
  });

  it('should accept all export options', () => {
    expect(schema.safeParse({
      format: 'pdf',
      artwork_title: 'Test',
      include_price: true,
      include_status: true,
      include_location: false,
    }).success).toBe(true);
  });
});

describe('search_editions schema', () => {
  const schema = getInputSchema(createSearchEditionsTool(stubCtx));

  it('should accept empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('should accept status filter', () => {
    expect(schema.safeParse({ status: 'sold' }).success).toBe(true);
  });

  it('should accept price range', () => {
    expect(schema.safeParse({ price_min: 1000, price_max: 5000 }).success).toBe(true);
  });

  it('should accept date range (sold_after / sold_before)', () => {
    expect(schema.safeParse({
      sold_after: '2024-01-01',
      sold_before: '2024-12-31',
    }).success).toBe(true);
  });

  it('should accept combined filters', () => {
    expect(schema.safeParse({
      artwork_title: 'Digital',
      status: 'at_gallery',
      location: 'Beijing',
      condition: 'excellent',
    }).success).toBe(true);
  });

  it('should reject price as string', () => {
    expect(schema.safeParse({ price_min: '1000' }).success).toBe(false);
  });

  it('should reject unknown edition_type enum', () => {
    expect(schema.safeParse({ edition_type: 'limited' }).success).toBe(false);
  });
});

describe('search_locations schema', () => {
  const schema = getInputSchema(createSearchLocationsTool(stubCtx));

  it('accepts empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts valid type enum', () => {
    expect(schema.safeParse({ type: 'gallery' }).success).toBe(true);
  });

  it('rejects invalid type enum', () => {
    expect(schema.safeParse({ type: 'warehouse' }).success).toBe(false);
  });
});

describe('search_history schema', () => {
  const schema = getInputSchema(createSearchHistoryTool(stubCtx));

  it('accepts empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts valid action enum', () => {
    expect(schema.safeParse({ action: 'sold' }).success).toBe(true);
  });

  it('rejects invalid action enum', () => {
    expect(schema.safeParse({ action: 'destroyed' }).success).toBe(false);
  });
});

describe('get_statistics schema', () => {
  const schema = getInputSchema(createGetStatisticsTool(stubCtx));

  it('requires type', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('accepts overview', () => {
    expect(schema.safeParse({ type: 'overview' }).success).toBe(true);
  });

  it('rejects unknown type', () => {
    expect(schema.safeParse({ type: 'by_year' }).success).toBe(false);
  });
});

describe('generate_update_confirmation schema', () => {
  const schema = getInputSchema(createUpdateConfirmationTool(stubCtx));

  it('requires edition_id and reason', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ edition_id: 'x', updates: {} }).success).toBe(false);
  });

  it('accepts a full payload', () => {
    expect(schema.safeParse({
      edition_id: 'ed-1',
      updates: { status: 'sold', sale_price: 100 },
      reason: '已售出',
    }).success).toBe(true);
  });
});

describe('import_artwork_from_url schema', () => {
  const schema = getInputSchema(createImportFromUrlTool(stubCtx));

  it('requires a valid URL', () => {
    expect(schema.safeParse({ url: 'not-a-url' }).success).toBe(false);
  });

  it('accepts a https URL', () => {
    expect(schema.safeParse({ url: 'https://example.com/art' }).success).toBe(true);
  });
});
