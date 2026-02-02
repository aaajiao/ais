import { describe, it, expect } from 'vitest';
import type { Artwork, Edition, Location } from '../types';
import type { ArtworkExportData, ExportOptions } from './index';
import { formatEditionLine, formatEditionLines, formatEditionInfo } from './index';
import { generateArtworkMarkdown, generateFullMarkdown } from './formatters';

// --- Helpers ---

const defaultOptions: ExportOptions = {
  includePrice: false,
  includeStatus: false,
  includeLocation: false,
  includeDetails: false,
};

function createArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'art-1',
    title_en: 'Test Artwork',
    edition_total: 5,
    ap_total: 2,
    user_id: 'user-1',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

function createEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 'ed-1',
    artwork_id: 'art-1',
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

function createLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Gallery X',
    type: 'gallery',
    user_id: 'user-1',
    created_at: '2024-01-01',
    ...overrides,
  };
}

function createExportData(overrides: Partial<ArtworkExportData> = {}): ArtworkExportData {
  return {
    artwork: createArtwork(),
    editions: [],
    locations: new Map(),
    stats: { total: 0, inStock: 0, onLoan: 0, sold: 0, other: 0 },
    ...overrides,
  };
}

// --- Tests ---

describe('formatEditionLine', () => {
  const artwork = createArtwork();
  const locations = new Map<string, Location>();
  locations.set('loc-1', createLocation());

  it('should format numbered edition label', () => {
    const edition = createEdition({ edition_number: 3 });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.main).toBe('3/5');
    expect(result.details).toEqual([]);
  });

  it('should format AP edition label', () => {
    const edition = createEdition({ edition_type: 'ap', edition_number: 1 });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.main).toBe('AP 1');
  });

  it('should format unique edition label', () => {
    const edition = createEdition({ edition_type: 'unique' });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.main).toBe('Unique');
  });

  it('should always include inventory_number when present', () => {
    const edition = createEdition({ inventory_number: 'INV-2024-001' });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.main).toContain('INV-2024-001');
  });

  it('should always include certificate_number in details when present', () => {
    const edition = createEdition({ certificate_number: 'CERT-001' });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.details).toContain('Certificate: CERT-001');
  });

  it('should include location when includeLocation is true', () => {
    const edition = createEdition({ location_id: 'loc-1' });
    const result = formatEditionLine(edition, artwork, locations, { ...defaultOptions, includeLocation: true }, 'en');
    expect(result.main).toContain('Gallery X');
  });

  it('should not include location when includeLocation is false', () => {
    const edition = createEdition({ location_id: 'loc-1' });
    const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
    expect(result.main).not.toContain('Gallery X');
  });

  it('should include status when includeStatus is true', () => {
    const edition = createEdition({ status: 'sold' });
    const result = formatEditionLine(edition, artwork, locations, { ...defaultOptions, includeStatus: true }, 'en');
    expect(result.main).toContain('(Sold)');
  });

  it('should include price when includePrice is true', () => {
    const edition = createEdition({ sale_price: 50000, sale_currency: 'USD' });
    const result = formatEditionLine(edition, artwork, locations, { ...defaultOptions, includePrice: true }, 'en');
    expect(result.main).toContain('$50,000');
  });

  it('should suppress in_studio status when location is shown', () => {
    const edition = createEdition({ status: 'in_studio', location_id: 'loc-1' });
    const opts = { ...defaultOptions, includeStatus: true, includeLocation: true };
    const result = formatEditionLine(edition, artwork, locations, opts, 'en');
    expect(result.main).not.toContain('In Studio');
    expect(result.main).toContain('Gallery X');
  });

  describe('includeDetails', () => {
    const detailOpts = { ...defaultOptions, includeDetails: true };

    it('should include condition', () => {
      const edition = createEdition({ condition: 'good' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Condition: good');
    });

    it('should include condition with notes', () => {
      const edition = createEdition({ condition: 'fair', condition_notes: 'Minor scratch' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Condition: fair — Minor scratch');
    });

    it('should include buyer_name', () => {
      const edition = createEdition({ buyer_name: 'John Doe' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Buyer: John Doe');
    });

    it('should include sale_date', () => {
      const edition = createEdition({ sale_date: '2024-06-15' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Sale Date: 2024-06-15');
    });

    it('should include consignment range', () => {
      const edition = createEdition({ consignment_start: '2024-01-01', consignment_end: '2024-06-01' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Consignment: 2024-01-01 ~ 2024-06-01');
    });

    it('should include loan info', () => {
      const edition = createEdition({ loan_institution: 'MoMA', loan_start: '2024-03-01', loan_end: '2024-09-01' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details.find(d => d.startsWith('Loan:'))).toBe('Loan: MoMA, 2024-03-01 ~ 2024-09-01');
    });

    it('should include storage_detail when includeLocation is also true', () => {
      const edition = createEdition({ storage_detail: 'Rack A-3' });
      const opts = { ...detailOpts, includeLocation: true };
      const result = formatEditionLine(edition, artwork, locations, opts, 'en');
      expect(result.details).toContain('Storage: Rack A-3');
    });

    it('should not include storage_detail when includeLocation is false', () => {
      const edition = createEdition({ storage_detail: 'Rack A-3' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).not.toContain('Storage: Rack A-3');
    });

    it('should include edition notes', () => {
      const edition = createEdition({ notes: 'Handle with care' });
      const result = formatEditionLine(edition, artwork, locations, detailOpts, 'en');
      expect(result.details).toContain('Notes: Handle with care');
    });

    it('should not include details when includeDetails is false', () => {
      const edition = createEdition({ condition: 'good', buyer_name: 'X', notes: 'Y' });
      const result = formatEditionLine(edition, artwork, locations, defaultOptions, 'en');
      expect(result.details).toEqual([]);
    });
  });
});

describe('formatEditionLines', () => {
  const artwork = createArtwork();
  const locations = new Map<string, Location>();

  it('should return "No editions" for empty array (en)', () => {
    const result = formatEditionLines([], artwork, locations, defaultOptions, 'en');
    expect(result).toEqual([{ main: 'No editions', details: [] }]);
  });

  it('should return "无版本信息" for empty array (zh)', () => {
    const result = formatEditionLines([], artwork, locations, defaultOptions, 'zh');
    expect(result).toEqual([{ main: '无版本信息', details: [] }]);
  });

  it('should sort editions: numbered before ap before unique', () => {
    const editions = [
      createEdition({ id: 'e1', edition_type: 'unique', edition_number: undefined }),
      createEdition({ id: 'e2', edition_type: 'ap', edition_number: 1 }),
      createEdition({ id: 'e3', edition_type: 'numbered', edition_number: 2 }),
      createEdition({ id: 'e4', edition_type: 'numbered', edition_number: 1 }),
    ];
    const result = formatEditionLines(editions, artwork, locations, defaultOptions, 'en');
    expect(result[0].main).toBe('1/5');
    expect(result[1].main).toBe('2/5');
    expect(result[2].main).toBe('AP 1');
    expect(result[3].main).toBe('Unique');
  });
});

describe('generateArtworkMarkdown', () => {
  it('should include title and basic fields', () => {
    const data = createExportData({
      artwork: createArtwork({
        title_en: 'My Art',
        title_cn: '我的艺术',
        year: '2024',
        type: 'Installation',
        materials: 'Mixed media',
        dimensions: '200x300cm',
      }),
    });
    const md = generateArtworkMarkdown(data, defaultOptions);
    expect(md).toContain('# My Art');
    expect(md).toContain('我的艺术');
    expect(md).toContain('**Year**: 2024');
    expect(md).toContain('**Type**: Installation');
    expect(md).toContain('**Materials**: Mixed media');
    expect(md).toContain('**Dimensions**: 200x300cm');
  });

  it('should render thumbnail as clean <img> tag without inline style', () => {
    const data = createExportData({
      artwork: createArtwork({ thumbnail_url: 'https://example.com/img.jpg' }),
    });
    const md = generateArtworkMarkdown(data, defaultOptions);
    expect(md).toContain('<img src="https://example.com/img.jpg" alt="Test Artwork" />');
    expect(md).not.toContain('style=');
  });

  it('should include artwork notes when includeDetails is true', () => {
    const data = createExportData({
      artwork: createArtwork({ notes: 'Important note' }),
    });
    const md = generateArtworkMarkdown(data, { ...defaultOptions, includeDetails: true });
    expect(md).toContain('**Notes**: Important note');
  });

  it('should not include artwork notes when includeDetails is false', () => {
    const data = createExportData({
      artwork: createArtwork({ notes: 'Important note' }),
    });
    const md = generateArtworkMarkdown(data, defaultOptions);
    expect(md).not.toContain('Important note');
  });

  it('should include edition details section when options enabled', () => {
    const locations = new Map<string, Location>();
    locations.set('loc-1', createLocation());
    const data = createExportData({
      editions: [createEdition({ inventory_number: 'INV-001', status: 'sold', sale_price: 10000, sale_currency: 'USD' })],
      locations,
    });
    const md = generateArtworkMarkdown(data, { ...defaultOptions, includeStatus: true, includePrice: true });
    expect(md).toContain('**Edition Details**:');
    expect(md).toContain('INV-001');
    expect(md).toContain('(Sold)');
    expect(md).toContain('$10,000');
  });

  it('should include source_url as link', () => {
    const data = createExportData({
      artwork: createArtwork({ source_url: 'https://example.com/artwork' }),
    });
    const md = generateArtworkMarkdown(data, defaultOptions);
    expect(md).toContain('[View Details](https://example.com/artwork)');
  });

  it('should show fallback when no editions and price enabled', () => {
    const data = createExportData();
    const md = generateArtworkMarkdown(data, { ...defaultOptions, includePrice: true });
    expect(md).toContain('**Price**: Price on request');
  });
});

describe('generateFullMarkdown', () => {
  it('should include YAML frontmatter with all options', () => {
    const opts = { includePrice: true, includeStatus: false, includeLocation: true, includeDetails: true };
    const md = generateFullMarkdown([], opts, 'testartist');
    expect(md).toContain('include_price: true');
    expect(md).toContain('include_status: false');
    expect(md).toContain('include_location: true');
    expect(md).toContain('include_details: true');
    expect(md).toContain('title: "testartist Artworks"');
  });

  it('should include copyright with studio name', () => {
    const md = generateFullMarkdown([], defaultOptions, 'aaajiao');
    expect(md).toContain('© ');
    expect(md).toContain('aaajiao studio');
  });

  it('should default artist name to aaajiao', () => {
    const md = generateFullMarkdown([], defaultOptions);
    expect(md).toContain('# aaajiao Artworks');
  });
});

describe('formatEditionInfo', () => {
  it('should return Unique for unique artwork', () => {
    expect(formatEditionInfo(createArtwork({ is_unique: true }))).toBe('Unique');
  });

  it('should format edition total and AP', () => {
    expect(formatEditionInfo(createArtwork({ edition_total: 5, ap_total: 2 }))).toBe('Edition of 5 + 2AP');
  });

  it('should return N/A when no edition info', () => {
    expect(formatEditionInfo(createArtwork({ edition_total: undefined, ap_total: undefined }))).toBe('N/A');
  });
});
