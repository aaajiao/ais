import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * 测试 AI 工具的 Zod schema 验证
 * 这些 schema 定义来自各工具文件，这里独立测试验证逻辑
 */

// search_artworks schema
const searchArtworksSchema = z.object({
  query: z.string().optional(),
  year: z.string().optional(),
  type: z.string().optional(),
  materials: z.string().optional(),
  is_unique: z.boolean().optional(),
});

// execute_edition_update schema
const executeUpdateSchema = z.object({
  edition_id: z.string(),
  updates: z.object({
    status: z.string().optional(),
    location_id: z.string().optional(),
    sale_price: z.number().optional(),
    sale_currency: z.string().optional(),
    buyer_name: z.string().optional(),
    sold_at: z.string().optional(),
    notes: z.string().optional(),
    condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
    condition_notes: z.string().optional(),
    storage_detail: z.string().optional(),
    consignment_start: z.string().optional(),
    consignment_end: z.string().optional(),
    loan_start: z.string().optional(),
    loan_end: z.string().optional(),
  }),
  confirmed: z.boolean(),
});

// export_artworks schema
const exportArtworksSchema = z.object({
  artwork_title: z.string().optional(),
  artwork_ids: z.array(z.string()).optional(),
  format: z.enum(['pdf', 'md']),
  include_price: z.boolean().optional(),
  include_status: z.boolean().optional(),
  include_location: z.boolean().optional(),
});

// search_editions schema
const searchEditionsSchema = z.object({
  artwork_title: z.string().optional(),
  edition_number: z.string().optional(),
  status: z.string().optional(),
  location: z.string().optional(),
  edition_type: z.string().optional(),
  condition: z.string().optional(),
  inventory_number: z.string().optional(),
  buyer_name: z.string().optional(),
  price_min: z.number().optional(),
  price_max: z.number().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

describe('search_artworks schema', () => {
  it('should accept empty object', () => {
    const result = searchArtworksSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept query string', () => {
    const result = searchArtworksSchema.safeParse({ query: 'test artwork' });
    expect(result.success).toBe(true);
  });

  it('should accept year as string', () => {
    const result = searchArtworksSchema.safeParse({ year: '2024' });
    expect(result.success).toBe(true);
  });

  it('should accept is_unique boolean', () => {
    const result = searchArtworksSchema.safeParse({ is_unique: true });
    expect(result.success).toBe(true);
  });

  it('should accept all fields combined', () => {
    const result = searchArtworksSchema.safeParse({
      query: 'digital',
      year: '2023',
      type: 'installation',
      materials: 'LED',
      is_unique: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid is_unique type', () => {
    const result = searchArtworksSchema.safeParse({ is_unique: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('execute_edition_update schema', () => {
  it('should require edition_id', () => {
    const result = executeUpdateSchema.safeParse({
      updates: {},
      confirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it('should require confirmed field', () => {
    const result = executeUpdateSchema.safeParse({
      edition_id: '123',
      updates: { status: 'sold' },
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid update with confirmation', () => {
    const result = executeUpdateSchema.safeParse({
      edition_id: 'ed-123',
      updates: { status: 'sold', buyer_name: 'Collector' },
      confirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it('should validate condition enum', () => {
    const validResult = executeUpdateSchema.safeParse({
      edition_id: '123',
      updates: { condition: 'excellent' },
      confirmed: true,
    });
    expect(validResult.success).toBe(true);

    const invalidResult = executeUpdateSchema.safeParse({
      edition_id: '123',
      updates: { condition: 'unknown' },
      confirmed: true,
    });
    expect(invalidResult.success).toBe(false);
  });

  it('should accept sale_price as number', () => {
    const result = executeUpdateSchema.safeParse({
      edition_id: '123',
      updates: { sale_price: 10000, sale_currency: 'USD' },
      confirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject sale_price as string', () => {
    const result = executeUpdateSchema.safeParse({
      edition_id: '123',
      updates: { sale_price: '10000' },
      confirmed: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('export_artworks schema', () => {
  it('should require format field', () => {
    const result = exportArtworksSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept pdf format', () => {
    const result = exportArtworksSchema.safeParse({ format: 'pdf' });
    expect(result.success).toBe(true);
  });

  it('should accept md format', () => {
    const result = exportArtworksSchema.safeParse({ format: 'md' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid format', () => {
    const result = exportArtworksSchema.safeParse({ format: 'docx' });
    expect(result.success).toBe(false);
  });

  it('should accept artwork_ids as array', () => {
    const result = exportArtworksSchema.safeParse({
      format: 'pdf',
      artwork_ids: ['id1', 'id2'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept all export options', () => {
    const result = exportArtworksSchema.safeParse({
      format: 'pdf',
      artwork_title: 'Test',
      include_price: true,
      include_status: true,
      include_location: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('search_editions schema', () => {
  it('should accept empty object', () => {
    const result = searchEditionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept status filter', () => {
    const result = searchEditionsSchema.safeParse({ status: 'sold' });
    expect(result.success).toBe(true);
  });

  it('should accept price range', () => {
    const result = searchEditionsSchema.safeParse({
      price_min: 1000,
      price_max: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('should accept date range', () => {
    const result = searchEditionsSchema.safeParse({
      date_from: '2024-01-01',
      date_to: '2024-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('should accept combined filters', () => {
    const result = searchEditionsSchema.safeParse({
      artwork_title: 'Digital',
      status: 'at_gallery',
      location: 'Beijing',
      condition: 'excellent',
    });
    expect(result.success).toBe(true);
  });

  it('should reject price as string', () => {
    const result = searchEditionsSchema.safeParse({
      price_min: '1000',
    });
    expect(result.success).toBe(false);
  });
});
