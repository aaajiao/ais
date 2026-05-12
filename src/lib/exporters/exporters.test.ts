import { describe, it, expect } from 'vitest';
import type { Artwork, Edition, Location, EditionFile, EditionHistory } from '../types';
import type { ArtworkExportData, ExportOptions } from './index';
import {
  formatEditionInfo,
  formatEditionLabel,
  formatEditionHeading,
  formatEditionFields,
  formatEditionFiles,
  formatEditionHistory,
  formatEditionBlock,
  sortEditions,
} from './index';
import { generateArtworkMarkdown, generateFullMarkdown } from './formatters';

// --- Helpers ---

const allOffOptions: ExportOptions = {
  includePrice: false,
  includeStatus: false,
  includeLocation: false,
  includeDetails: false,
  includeFiles: false,
};

const allOnOptions: ExportOptions = {
  includePrice: true,
  includeStatus: true,
  includeLocation: true,
  includeDetails: true,
  includeFiles: true,
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

function createFile(overrides: Partial<EditionFile> = {}): EditionFile {
  return {
    id: 'f-1',
    edition_id: 'ed-1',
    source_type: 'upload',
    file_url: 'https://example.com/img.jpg',
    file_type: 'image',
    file_name: 'cover.jpg',
    sort_order: 0,
    created_at: '2024-01-01',
    ...overrides,
  };
}

function createHistory(overrides: Partial<EditionHistory> = {}): EditionHistory {
  return {
    id: 'h-1',
    edition_id: 'ed-1',
    action: 'status_change',
    created_at: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

function createExportData(overrides: Partial<ArtworkExportData> = {}): ArtworkExportData {
  return {
    artwork: createArtwork(),
    editions: [],
    locations: new Map(),
    filesByEdition: new Map(),
    stats: { total: 0, inStock: 0, onLoan: 0, sold: 0, other: 0 },
    ...overrides,
  };
}

// --- formatEditionLabel ---

describe('formatEditionLabel', () => {
  const artwork = createArtwork();

  it('formats numbered edition label', () => {
    expect(formatEditionLabel(createEdition({ edition_number: 3 }), artwork, 'en')).toBe('3/5');
  });

  it('formats AP edition label', () => {
    expect(formatEditionLabel(createEdition({ edition_type: 'ap', edition_number: 1 }), artwork, 'en')).toBe('AP 1');
  });

  it('formats unique edition label', () => {
    expect(formatEditionLabel(createEdition({ edition_type: 'unique' }), artwork, 'en')).toBe('Unique');
  });

  it('uses Chinese label for unique', () => {
    expect(formatEditionLabel(createEdition({ edition_type: 'unique' }), artwork, 'zh')).toBe('独版');
  });

  it('uses fallbackTotal when artwork.edition_total is missing', () => {
    const orphanArtwork = createArtwork({ edition_total: undefined });
    expect(formatEditionLabel(createEdition({ edition_number: 1 }), orphanArtwork, 'en', 3)).toBe('1/3');
  });

  it('falls back to #N when both edition_total and fallbackTotal are missing (no more "1/?")', () => {
    const orphanArtwork = createArtwork({ edition_total: undefined });
    expect(formatEditionLabel(createEdition({ edition_number: 2 }), orphanArtwork, 'en')).toBe('#2');
  });
});

// --- formatEditionHeading ---

describe('formatEditionHeading', () => {
  const artwork = createArtwork();

  it('joins label and inventory_number with separator', () => {
    const edition = createEdition({ edition_number: 1, inventory_number: 'INV-001' });
    expect(formatEditionHeading(edition, artwork, 'en')).toBe('1/5 · INV-001');
  });

  it('omits separator when no inventory_number', () => {
    const edition = createEdition({ edition_number: 2 });
    expect(formatEditionHeading(edition, artwork, 'en')).toBe('2/5');
  });
});

// --- formatEditionFields ---

describe('formatEditionFields', () => {
  const locations = new Map<string, Location>();
  locations.set('loc-1', createLocation());

  it('returns empty list when all toggles off and no always-on values', () => {
    const fields = formatEditionFields(createEdition(), locations, allOffOptions, 'en');
    expect(fields).toEqual([]);
  });

  it('always shows certificate when present (no toggle)', () => {
    const edition = createEdition({ certificate_number: 'CERT-001' });
    const fields = formatEditionFields(edition, locations, allOffOptions, 'en');
    expect(fields).toContain('- **Certificate**: CERT-001');
  });

  it('includes Status as bullet line when includeStatus is on', () => {
    const edition = createEdition({ status: 'sold' });
    const fields = formatEditionFields(edition, locations, { ...allOffOptions, includeStatus: true }, 'en');
    expect(fields).toContain('- **Status**: Sold');
  });

  it('does not suppress in_studio status when location also shown (new unified layout)', () => {
    const edition = createEdition({ status: 'in_studio', location_id: 'loc-1' });
    const fields = formatEditionFields(edition, locations, { ...allOffOptions, includeStatus: true, includeLocation: true }, 'en');
    expect(fields).toContain('- **Status**: In Studio');
    expect(fields).toContain('- **Location**: Gallery X');
  });

  it('includes Location bullet when includeLocation is on and location exists', () => {
    const edition = createEdition({ location_id: 'loc-1' });
    const fields = formatEditionFields(edition, locations, { ...allOffOptions, includeLocation: true }, 'en');
    expect(fields).toContain('- **Location**: Gallery X');
  });

  it('includes Price bullet with currency when includePrice on', () => {
    const edition = createEdition({ sale_price: 50000, sale_currency: 'USD' });
    const fields = formatEditionFields(edition, locations, { ...allOffOptions, includePrice: true }, 'en');
    expect(fields.some(line => line.includes('$50,000'))).toBe(true);
  });

  it('requires both includeLocation AND includeDetails for Storage', () => {
    const edition = createEdition({ storage_detail: 'Rack A-3' });

    // location only — no storage
    const locOnly = formatEditionFields(edition, locations, { ...allOffOptions, includeLocation: true }, 'en');
    expect(locOnly).not.toContain('- **Storage**: Rack A-3');

    // details only — no storage
    const detailOnly = formatEditionFields(edition, locations, { ...allOffOptions, includeDetails: true }, 'en');
    expect(detailOnly).not.toContain('- **Storage**: Rack A-3');

    // both — storage shows
    const both = formatEditionFields(edition, locations, { ...allOffOptions, includeLocation: true, includeDetails: true }, 'en');
    expect(both).toContain('- **Storage**: Rack A-3');
  });

  describe('includeDetails fields', () => {
    const detailOpts = { ...allOffOptions, includeDetails: true };

    it('includes Condition with notes', () => {
      const edition = createEdition({ condition: 'fair', condition_notes: 'Minor scratch' });
      const fields = formatEditionFields(edition, locations, detailOpts, 'en');
      expect(fields).toContain('- **Condition**: fair — Minor scratch');
    });

    it('includes Buyer', () => {
      const fields = formatEditionFields(createEdition({ buyer_name: 'John Doe' }), locations, detailOpts, 'en');
      expect(fields).toContain('- **Buyer**: John Doe');
    });

    it('includes Sale Date', () => {
      const fields = formatEditionFields(createEdition({ sale_date: '2024-06-15' }), locations, detailOpts, 'en');
      expect(fields).toContain('- **Sale Date**: 2024-06-15');
    });

    it('includes Consignment range', () => {
      const fields = formatEditionFields(
        createEdition({ consignment_start: '2024-01-01', consignment_end: '2024-06-01' }),
        locations,
        detailOpts,
        'en'
      );
      expect(fields).toContain('- **Consignment**: 2024-01-01 ~ 2024-06-01');
    });

    it('includes Loan info', () => {
      const edition = createEdition({ loan_institution: 'MoMA', loan_start: '2024-03-01', loan_end: '2024-09-01' });
      const fields = formatEditionFields(edition, locations, detailOpts, 'en');
      expect(fields.find(d => d.startsWith('- **Loan**'))).toBe('- **Loan**: MoMA, 2024-03-01 ~ 2024-09-01');
    });

    it('includes edition Notes', () => {
      const fields = formatEditionFields(createEdition({ notes: 'Handle with care' }), locations, detailOpts, 'en');
      expect(fields).toContain('- **Notes**: Handle with care');
    });
  });
});

// --- formatEditionFiles ---

describe('formatEditionFiles', () => {
  it('returns empty when includeFiles is false', () => {
    const files = [createFile()];
    expect(formatEditionFiles(files, allOffOptions, 'en')).toEqual([]);
  });

  it('returns empty when files undefined or empty', () => {
    expect(formatEditionFiles(undefined, allOnOptions, 'en')).toEqual([]);
    expect(formatEditionFiles([], allOnOptions, 'en')).toEqual([]);
  });

  it('renders Files block with sorted entries', () => {
    const files = [
      createFile({ id: 'f-2', file_name: 'cert.pdf', file_url: 'https://x/cert.pdf', file_type: 'pdf', sort_order: 1 }),
      createFile({ id: 'f-1', file_name: 'cover.jpg', file_url: 'https://x/cover.jpg', file_type: 'image', sort_order: 0 }),
    ];
    const lines = formatEditionFiles(files, allOnOptions, 'en');
    expect(lines[0]).toBe('**Files**:');
    expect(lines[1]).toBe('- [cover.jpg](https://x/cover.jpg) — image');
    expect(lines[2]).toBe('- [cert.pdf](https://x/cert.pdf) — pdf');
  });

  it('appends description to file line', () => {
    const files = [createFile({ description: 'Signed copy' })];
    const lines = formatEditionFiles(files, allOnOptions, 'en');
    expect(lines[1]).toContain('Signed copy');
  });
});

// --- formatEditionHistory ---

describe('formatEditionHistory', () => {
  it('returns empty when undefined or empty', () => {
    expect(formatEditionHistory(undefined, 'en')).toEqual([]);
    expect(formatEditionHistory([], 'en')).toEqual([]);
  });

  it('renders History block in reverse chronological order', () => {
    const history = [
      createHistory({ id: 'h1', action: 'created', created_at: '2024-01-01T00:00:00Z' }),
      createHistory({ id: 'h2', action: 'sold', created_at: '2024-06-15T00:00:00Z', related_party: 'John', price: 1000, currency: 'USD' }),
    ];
    const lines = formatEditionHistory(history, 'en');
    expect(lines[0]).toBe('**History**:');
    expect(lines[1]).toContain('2024-06-15');  // newest first
    expect(lines[1]).toContain('Sold');
    expect(lines[1]).toContain('John');
    expect(lines[1]).toContain('$1,000');
    expect(lines[2]).toContain('2024-01-01');  // oldest last
  });

  it('renders status transition arrow', () => {
    const history = [createHistory({ from_status: 'in_studio', to_status: 'sold' })];
    const lines = formatEditionHistory(history, 'en');
    expect(lines[1]).toContain('in_studio → sold');
  });
});

// --- formatEditionBlock ---

describe('formatEditionBlock', () => {
  const artwork = createArtwork();
  const locations = new Map<string, Location>();
  locations.set('loc-1', createLocation());

  it('emits H3 heading + fields + files + history blocks', () => {
    const edition = createEdition({ inventory_number: 'INV-001', status: 'sold' });
    const files = [createFile({ file_name: 'img.jpg', file_url: 'https://x/img.jpg', file_type: 'image' })];
    const history = [createHistory({ action: 'created' })];
    const block = formatEditionBlock(edition, artwork, locations, files, history, allOnOptions, 'en');
    expect(block[0]).toBe('### 1/5 · INV-001');
    expect(block.some(l => l === '- **Status**: Sold')).toBe(true);
    expect(block.some(l => l === '**Files**:')).toBe(true);
    expect(block.some(l => l === '**History**:')).toBe(true);
  });

  it('omits Files block when no files', () => {
    const edition = createEdition();
    const block = formatEditionBlock(edition, artwork, locations, undefined, undefined, allOnOptions, 'en');
    expect(block.some(l => l === '**Files**:')).toBe(false);
  });

  it('omits History block when history undefined (no scope=all)', () => {
    const edition = createEdition();
    const block = formatEditionBlock(edition, artwork, locations, [], undefined, allOnOptions, 'en');
    expect(block.some(l => l === '**History**:')).toBe(false);
  });
});

// --- sortEditions ---

describe('sortEditions', () => {
  it('sorts numbered before ap before unique, then by edition_number', () => {
    const editions = [
      createEdition({ id: 'e1', edition_type: 'unique', edition_number: undefined }),
      createEdition({ id: 'e2', edition_type: 'ap', edition_number: 1 }),
      createEdition({ id: 'e3', edition_type: 'numbered', edition_number: 2 }),
      createEdition({ id: 'e4', edition_type: 'numbered', edition_number: 1 }),
    ];
    const sorted = sortEditions(editions);
    expect(sorted.map(e => e.id)).toEqual(['e4', 'e3', 'e2', 'e1']);
  });
});

// --- generateArtworkMarkdown ---

describe('generateArtworkMarkdown', () => {
  it('emits title, thumbnail, and ## Artwork section with bullet fields', () => {
    const data = createExportData({
      artwork: createArtwork({
        title_en: 'My Art',
        title_cn: '我的艺术',
        year: '2024',
        type: 'Installation',
        materials: 'Mixed media',
        dimensions: '200x300cm',
        thumbnail_url: 'https://example.com/img.jpg',
      }),
    });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('# My Art');
    expect(md).toContain('我的艺术');
    expect(md).toContain('<img src="https://example.com/img.jpg" alt="My Art" />');
    expect(md).toContain('## Artwork');
    expect(md).toContain('- **Year**: 2024');
    expect(md).toContain('- **Type**: Installation');
    expect(md).toContain('- **Materials**: Mixed media');
    expect(md).toContain('- **Dimensions**: 200x300cm');
  });

  it('emits artwork Edition spec bullet', () => {
    const data = createExportData({ artwork: createArtwork({ edition_total: 10, ap_total: 2 }) });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('- **Edition**: Edition of 10 + 2AP');
  });

  it('emits artwork Notes only when includeDetails is on', () => {
    const data = createExportData({ artwork: createArtwork({ notes: 'Important note' }) });
    const mdOff = generateArtworkMarkdown(data, allOffOptions);
    const mdOn = generateArtworkMarkdown(data, allOnOptions);
    expect(mdOff).not.toContain('Important note');
    expect(mdOn).toContain('- **Notes**: Important note');
  });

  it('emits artwork Source as angle-bracket auto-link', () => {
    const data = createExportData({ artwork: createArtwork({ source_url: 'https://example.com/x' }) });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('- **Source**: <https://example.com/x>');
  });

  it('omits ## Editions section when no editions', () => {
    const data = createExportData({ editions: [] });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).not.toContain('## Editions');
  });

  it('infers denominator from numbered edition count when artwork.edition_total is missing', () => {
    const data = createExportData({
      artwork: createArtwork({ edition_total: undefined, ap_total: undefined }),
      editions: [
        createEdition({ id: 'e1', edition_number: 1 }),
        createEdition({ id: 'e2', edition_number: 2 }),
        createEdition({ id: 'e3', edition_number: 3 }),
      ],
    });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('### 1/3');
    expect(md).toContain('### 2/3');
    expect(md).toContain('### 3/3');
    expect(md).not.toContain('1/?');
    expect(md).not.toContain('/?');
  });

  it('emits ## Editions section with H3 per edition', () => {
    const locations = new Map<string, Location>();
    locations.set('loc-1', createLocation());
    const data = createExportData({
      editions: [
        createEdition({ id: 'e1', edition_number: 1, inventory_number: 'INV-001', status: 'sold', sale_price: 10000, sale_currency: 'USD' }),
        createEdition({ id: 'e2', edition_number: 2, inventory_number: 'INV-002', status: 'in_studio', location_id: 'loc-1' }),
      ],
      locations,
    });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('## Editions');
    expect(md).toContain('### 1/5 · INV-001');
    expect(md).toContain('### 2/5 · INV-002');
    expect(md).toContain('- **Status**: Sold');
    expect(md).toContain('- **Location**: Gallery X');
    expect(md).toContain('$10,000');
  });

  it('renders Files block under each edition when files exist and includeFiles=true', () => {
    const filesByEdition = new Map<string, EditionFile[]>();
    filesByEdition.set('e1', [
      createFile({ edition_id: 'e1', file_name: 'photo.jpg', file_url: 'https://x/p.jpg', file_type: 'image' }),
    ]);
    const data = createExportData({
      editions: [createEdition({ id: 'e1', inventory_number: 'INV-001' })],
      filesByEdition,
    });
    const md = generateArtworkMarkdown(data, allOnOptions);
    expect(md).toContain('**Files**:');
    expect(md).toContain('[photo.jpg](https://x/p.jpg)');
  });

  it('does not render Files block when includeFiles=false', () => {
    const filesByEdition = new Map<string, EditionFile[]>();
    filesByEdition.set('e1', [createFile({ edition_id: 'e1' })]);
    const data = createExportData({
      editions: [createEdition({ id: 'e1' })],
      filesByEdition,
    });
    const md = generateArtworkMarkdown(data, { ...allOnOptions, includeFiles: false });
    expect(md).not.toContain('**Files**:');
  });

  it('renders History block only when historyByEdition is provided (scope=all path)', () => {
    const historyByEdition = new Map<string, EditionHistory[]>();
    historyByEdition.set('e1', [createHistory({ edition_id: 'e1', action: 'created' })]);
    const dataNoHist = createExportData({
      editions: [createEdition({ id: 'e1' })],
    });
    const dataWithHist = createExportData({
      editions: [createEdition({ id: 'e1' })],
      historyByEdition,
    });
    expect(generateArtworkMarkdown(dataNoHist, allOnOptions)).not.toContain('**History**:');
    expect(generateArtworkMarkdown(dataWithHist, allOnOptions)).toContain('**History**:');
  });
});

// --- generateFullMarkdown ---

describe('generateFullMarkdown', () => {
  it('emits YAML frontmatter with all 5 toggle states + include_history flag', () => {
    const md = generateFullMarkdown([], allOnOptions, 'testartist');
    expect(md).toContain('include_price: true');
    expect(md).toContain('include_status: true');
    expect(md).toContain('include_location: true');
    expect(md).toContain('include_details: true');
    expect(md).toContain('include_files: true');
    expect(md).toContain('include_history: false');  // empty input → no history detected
    expect(md).toContain('title: "testartist Artworks"');
  });

  it('detects include_history=true from data with historyByEdition map', () => {
    const data = createExportData({ historyByEdition: new Map() });
    const md = generateFullMarkdown([data], allOnOptions, 'aaajiao');
    expect(md).toContain('include_history: true');
  });

  it('emits copyright with studio name', () => {
    const md = generateFullMarkdown([], allOffOptions, 'aaajiao');
    expect(md).toContain('© ');
    expect(md).toContain('aaajiao studio');
  });

  it('defaults artist name to aaajiao', () => {
    const md = generateFullMarkdown([], allOffOptions);
    expect(md).toContain('# aaajiao Artworks');
  });
});

// --- formatEditionInfo ---

describe('formatEditionInfo', () => {
  it('returns Unique for unique artwork', () => {
    expect(formatEditionInfo(createArtwork({ is_unique: true }))).toBe('Unique');
  });

  it('formats edition total and AP', () => {
    expect(formatEditionInfo(createArtwork({ edition_total: 5, ap_total: 2 }))).toBe('Edition of 5 + 2AP');
  });

  it('returns N/A when no edition info', () => {
    expect(formatEditionInfo(createArtwork({ edition_total: undefined, ap_total: undefined }))).toBe('N/A');
  });
});
