import { describe, it, expect } from 'vitest';
import {
  STATUS_LABELS,
  formatEditionLabel,
  formatEditionSummary,
  buildCatalogItemFromEdition,
  buildCatalogItemFromArtworkData,
  generatePDFFilename,
  formatDate,
  type EditionRow,
} from '../pdf-helpers';
import type { ArtworkExportData, ExportOptions } from '../../../src/lib/exporters/index';
import type { CatalogOptions } from '../catalog-template';

// --- Test data factories ---

function createArtwork(overrides: Partial<NonNullable<EditionRow['artwork']>> = {}): NonNullable<EditionRow['artwork']> {
  return {
    id: 'art-1',
    title_en: 'Test Artwork',
    title_cn: '测试作品',
    year: '2024',
    type: 'Installation',
    materials: 'Mixed media',
    dimensions: '100 × 200 cm',
    duration: null,
    thumbnail_url: null,
    source_url: null,
    edition_total: 5,
    ap_total: 2,
    is_unique: false,
    ...overrides,
  };
}

function createEdition(overrides: Partial<EditionRow> = {}): EditionRow {
  return {
    id: 'ed-1',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    sale_price: null,
    sale_currency: null,
    artwork: createArtwork(),
    ...overrides,
  };
}

function createCatalogOptions(overrides: Partial<CatalogOptions> = {}): CatalogOptions {
  return {
    locationName: 'Gallery X',
    includePrice: false,
    includeStatus: false,
    date: 'January 29, 2026',
    ...overrides,
  };
}

// --- Tests ---

describe('STATUS_LABELS', () => {
  it('should map all edition statuses', () => {
    expect(STATUS_LABELS['in_production']).toBe('In Production');
    expect(STATUS_LABELS['in_studio']).toBe('In Studio');
    expect(STATUS_LABELS['at_gallery']).toBe('On Loan');
    expect(STATUS_LABELS['at_museum']).toBe('On Exhibition');
    expect(STATUS_LABELS['in_transit']).toBe('In Transit');
    expect(STATUS_LABELS['sold']).toBe('Sold');
    expect(STATUS_LABELS['gifted']).toBe('Gifted');
    expect(STATUS_LABELS['lost']).toBe('Lost');
    expect(STATUS_LABELS['damaged']).toBe('Damaged');
  });

  it('should have 9 status entries', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(9);
  });
});

describe('formatEditionLabel', () => {
  it('should return "Unique" for unique edition type', () => {
    const edition = createEdition({ edition_type: 'unique', artwork: createArtwork({ is_unique: true }) });
    expect(formatEditionLabel(edition as any)).toBe('Unique');
  });

  it('should return "Unique" when artwork is_unique is true regardless of edition_type', () => {
    const edition = createEdition({ edition_type: 'numbered', artwork: createArtwork({ is_unique: true }) });
    expect(formatEditionLabel(edition as any)).toBe('Unique');
  });

  it('should format AP edition with number', () => {
    const edition = createEdition({ edition_type: 'ap', edition_number: 1, artwork: createArtwork({ ap_total: 2 }) });
    expect(formatEditionLabel(edition as any)).toBe('AP 1/2');
  });

  it('should format AP edition without total', () => {
    const edition = createEdition({ edition_type: 'ap', edition_number: 1, artwork: createArtwork({ ap_total: null }) });
    expect(formatEditionLabel(edition as any)).toBe('AP 1');
  });

  it('should format AP edition without number', () => {
    const edition = createEdition({ edition_type: 'ap', edition_number: null });
    expect(formatEditionLabel(edition as any)).toBe('AP');
  });

  it('should format numbered edition', () => {
    const edition = createEdition({ edition_type: 'numbered', edition_number: 3, artwork: createArtwork({ edition_total: 10 }) });
    expect(formatEditionLabel(edition as any)).toBe('3/10');
  });

  it('should format numbered edition without total', () => {
    const edition = createEdition({ edition_type: 'numbered', edition_number: 3, artwork: createArtwork({ edition_total: null }) });
    expect(formatEditionLabel(edition as any)).toBe('3');
  });

  it('should return empty string when no number', () => {
    const edition = createEdition({ edition_type: 'numbered', edition_number: null, artwork: createArtwork({ is_unique: false }) });
    expect(formatEditionLabel(edition as any)).toBe('');
  });
});

describe('formatEditionSummary', () => {
  it('should return "Unique" for unique artwork', () => {
    expect(formatEditionSummary(createArtwork({ is_unique: true }))).toBe('Unique');
  });

  it('should format edition total', () => {
    expect(formatEditionSummary(createArtwork({ edition_total: 10, ap_total: null }))).toBe('Edition of 10');
  });

  it('should format AP total', () => {
    expect(formatEditionSummary(createArtwork({ edition_total: null, ap_total: 3 }))).toBe('3AP');
  });

  it('should combine edition and AP totals', () => {
    expect(formatEditionSummary(createArtwork({ edition_total: 5, ap_total: 2 }))).toBe('Edition of 5 + 2AP');
  });

  it('should return "N/A" when no edition info', () => {
    expect(formatEditionSummary(createArtwork({ is_unique: false, edition_total: null, ap_total: null }))).toBe('N/A');
  });
});

describe('buildCatalogItemFromEdition', () => {
  it('should return null when artwork is null', () => {
    const edition = createEdition({ artwork: null });
    expect(buildCatalogItemFromEdition(edition, createCatalogOptions())).toBeNull();
  });

  it('should build basic catalog item', () => {
    const edition = createEdition();
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions());
    expect(item).not.toBeNull();
    expect(item!.titleEn).toBe('Test Artwork');
    expect(item!.titleCn).toBe('测试作品');
    expect(item!.year).toBe('2024');
    expect(item!.type).toBe('Installation');
    expect(item!.editionLabel).toBe('1/5');
    expect(item!.editionInfo).toBe('Edition of 5 + 2AP');
  });

  it('should convert null optional fields to undefined', () => {
    const edition = createEdition({
      artwork: createArtwork({ title_cn: null, year: null, type: null, duration: null }),
    });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions());
    expect(item!.titleCn).toBeUndefined();
    expect(item!.year).toBeUndefined();
    expect(item!.type).toBeUndefined();
    expect(item!.duration).toBeUndefined();
  });

  it('should include status when includeStatus is true', () => {
    const edition = createEdition({ status: 'sold' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includeStatus: true }));
    expect(item!.status).toBe('Sold');
  });

  it('should not include status when includeStatus is false', () => {
    const edition = createEdition({ status: 'sold' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includeStatus: false }));
    expect(item!.status).toBeUndefined();
  });

  it('should use raw status when no label mapping exists', () => {
    const edition = createEdition({ status: 'custom_status' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includeStatus: true }));
    expect(item!.status).toBe('custom_status');
  });

  it('should include price when includePrice is true and price exists', () => {
    const edition = createEdition({ sale_price: 50000, sale_currency: 'USD' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includePrice: true }));
    expect(item!.price).toBe('$50,000');
  });

  it('should not include price when includePrice is false', () => {
    const edition = createEdition({ sale_price: 50000, sale_currency: 'USD' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includePrice: false }));
    expect(item!.price).toBeUndefined();
  });

  it('should not include price when sale_price is null', () => {
    const edition = createEdition({ sale_price: null, sale_currency: 'USD' });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions({ includePrice: true }));
    expect(item!.price).toBeUndefined();
  });

  it('should use image from cache when available', () => {
    const edition = createEdition({ artwork: createArtwork({ thumbnail_url: 'https://example.com/img.jpg' }) });
    const cache = new Map([['https://example.com/img.jpg', 'data:image/jpeg;base64,abc']]);
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions(), cache);
    expect(item!.thumbnailBase64).toBe('data:image/jpeg;base64,abc');
  });

  it('should return undefined thumbnailBase64 when no cache', () => {
    const edition = createEdition({ artwork: createArtwork({ thumbnail_url: 'https://example.com/img.jpg' }) });
    const item = buildCatalogItemFromEdition(edition, createCatalogOptions());
    expect(item!.thumbnailBase64).toBeUndefined();
  });
});

describe('buildCatalogItemFromArtworkData', () => {
  function createArtworkExportData(overrides: Partial<ArtworkExportData> = {}): ArtworkExportData {
    return {
      artwork: {
        id: 'art-1',
        title_en: 'Export Test',
        title_cn: '导出测试',
        year: '2023',
        type: 'Video',
        materials: 'Digital',
        dimensions: null,
        duration: '10:00',
        thumbnail_url: null,
        source_url: 'https://example.com',
        edition_total: 3,
        ap_total: 1,
        is_unique: false,
      } as any,
      editions: [],
      locations: new Map(),
      stats: { total: 0, inStock: 0, onLoan: 0, sold: 0, other: 0 },
      ...overrides,
    };
  }

  const defaultOptions: ExportOptions = {
    includePrice: false,
    includeStatus: false,
    includeLocation: false,
  };

  it('should build item from artwork data', () => {
    const data = createArtworkExportData();
    const item = buildCatalogItemFromArtworkData(data, defaultOptions);
    expect(item.titleEn).toBe('Export Test');
    expect(item.titleCn).toBe('导出测试');
    expect(item.year).toBe('2023');
    expect(item.duration).toBe('10:00');
  });

  it('should include status from first edition when includeStatus is true', () => {
    const data = createArtworkExportData({
      editions: [{ status: 'at_gallery' } as any],
    });
    const item = buildCatalogItemFromArtworkData(data, { ...defaultOptions, includeStatus: true });
    expect(item.status).toBe('On Loan');
  });

  it('should not include status when no editions', () => {
    const data = createArtworkExportData({ editions: [] });
    const item = buildCatalogItemFromArtworkData(data, { ...defaultOptions, includeStatus: true });
    expect(item.status).toBeUndefined();
  });

  it('should include price from priceInfo when includePrice is true', () => {
    const data = createArtworkExportData({
      priceInfo: { price: 10000, currency: 'EUR' },
    });
    const item = buildCatalogItemFromArtworkData(data, { ...defaultOptions, includePrice: true });
    expect(item.price).toBe('€10,000');
  });

  it('should not include price when priceInfo is undefined', () => {
    const data = createArtworkExportData({ priceInfo: undefined });
    const item = buildCatalogItemFromArtworkData(data, { ...defaultOptions, includePrice: true });
    expect(item.price).toBeUndefined();
  });
});

describe('generatePDFFilename', () => {
  it('should generate slug-based filename', () => {
    const filename = generatePDFFilename('Gallery X');
    expect(filename).toMatch(/^aaajiao-gallery-x-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('should handle special characters', () => {
    const filename = generatePDFFilename('Café & Bar (Main)');
    expect(filename).toMatch(/^aaajiao-caf-bar-main-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('should handle Chinese characters', () => {
    const filename = generatePDFFilename('北京画廊');
    // Chinese chars are not a-z0-9, so they get replaced
    expect(filename).toMatch(/^aaajiao-.*\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('should strip leading/trailing hyphens', () => {
    const filename = generatePDFFilename('---Test---');
    expect(filename).not.toMatch(/aaajiao--/);
    expect(filename).toMatch(/^aaajiao-test-\d{4}/);
  });
});

describe('formatDate', () => {
  it('should return a date string with month, day, and year', () => {
    const date = formatDate();
    // Should match pattern like "January 29, 2026"
    expect(date).toMatch(/\w+ \d{1,2}, \d{4}/);
  });

  it('should use English locale', () => {
    const date = formatDate();
    const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const hasEnglishMonth = englishMonths.some(m => date.includes(m));
    expect(hasEnglishMonth).toBe(true);
  });
});
