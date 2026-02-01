import { describe, it, expect } from 'vitest';
import {
  initFormDataFromArtwork,
  formatEditionNumber,
  getAvailableEditionSlots,
  createNewEditionFromSlot,
} from './types';

describe('initFormDataFromArtwork', () => {
  it('should initialize form data from complete artwork data', () => {
    const artwork = {
      id: '123',
      title_en: 'Test Artwork',
      title_cn: '测试作品',
      year: '2024',
      type: 'Installation',
      materials: 'Mixed media',
      dimensions: '100x100cm',
      duration: '10:00',
      edition_total: 5,
      ap_total: 2,
      is_unique: false,
      source_url: 'https://example.com',
      thumbnail_url: 'https://example.com/thumb.jpg',
      notes: 'Test notes',
    };

    const result = initFormDataFromArtwork(artwork);

    expect(result).toEqual({
      title_en: 'Test Artwork',
      title_cn: '测试作品',
      year: '2024',
      type: 'Installation',
      materials: 'Mixed media',
      dimensions: '100x100cm',
      duration: '10:00',
      edition_total: 5,
      ap_total: 2,
      is_unique: false,
      source_url: 'https://example.com',
      thumbnail_url: 'https://example.com/thumb.jpg',
      notes: 'Test notes',
    });
  });

  it('should handle null values with empty strings and defaults', () => {
    const artwork = {
      id: '123',
      title_en: 'Minimal Artwork',
      title_cn: null,
      year: null,
      type: null,
      materials: null,
      dimensions: null,
      duration: null,
      edition_total: null,
      ap_total: null,
      is_unique: null,
      source_url: null,
      thumbnail_url: null,
      notes: null,
    };

    const result = initFormDataFromArtwork(artwork);

    expect(result).toEqual({
      title_en: 'Minimal Artwork',
      title_cn: '',
      year: '',
      type: '',
      materials: '',
      dimensions: '',
      duration: '',
      edition_total: 0,
      ap_total: 0,
      is_unique: false,
      source_url: '',
      thumbnail_url: '',
      notes: '',
    });
  });

  it('should handle empty title_en', () => {
    const artwork = {
      id: '123',
      title_en: '',
      title_cn: null,
      year: null,
      type: null,
      materials: null,
      dimensions: null,
      duration: null,
      edition_total: null,
      ap_total: null,
      is_unique: null,
      source_url: null,
      thumbnail_url: null,
      notes: null,
    };

    const result = initFormDataFromArtwork(artwork);

    expect(result.title_en).toBe('');
  });
});

describe('formatEditionNumber', () => {
  it('should format unique edition', () => {
    const edition = { edition_type: 'unique', edition_number: null };
    const result = formatEditionNumber(edition, 5, 'Unique');
    expect(result).toBe('Unique');
  });

  it('should format AP edition with number', () => {
    const edition = { edition_type: 'ap', edition_number: 2 };
    const result = formatEditionNumber(edition, 5, 'Unique');
    expect(result).toBe('AP2');
  });

  it('should format AP edition without number', () => {
    const edition = { edition_type: 'ap', edition_number: null };
    const result = formatEditionNumber(edition, 5, 'Unique');
    expect(result).toBe('AP');
  });

  it('should format numbered edition', () => {
    const edition = { edition_type: 'numbered', edition_number: 3 };
    const result = formatEditionNumber(edition, 5, 'Unique');
    expect(result).toBe('3/5');
  });

  it('should handle null edition_number for numbered edition', () => {
    const edition = { edition_type: 'numbered', edition_number: null };
    const result = formatEditionNumber(edition, 5, 'Unique');
    expect(result).toBe('?/5');
  });

  it('should handle null editionTotal', () => {
    const edition = { edition_type: 'numbered', edition_number: 3 };
    const result = formatEditionNumber(edition, null, 'Unique');
    expect(result).toBe('3/?');
  });

  it('should handle undefined editionTotal', () => {
    const edition = { edition_type: 'numbered', edition_number: 3 };
    const result = formatEditionNumber(edition, undefined, 'Unique');
    expect(result).toBe('3/?');
  });

  it('should handle both null edition_number and editionTotal', () => {
    const edition = { edition_type: 'numbered', edition_number: null };
    const result = formatEditionNumber(edition, null, 'Unique');
    expect(result).toBe('?/?');
  });
});

describe('getAvailableEditionSlots', () => {
  it('should generate numbered slots based on edition_total', () => {
    const slots = getAvailableEditionSlots(3, 0, false, []);

    expect(slots).toEqual([
      { label: '1', value: 'numbered:1', edition_type: 'numbered', edition_number: 1 },
      { label: '2', value: 'numbered:2', edition_type: 'numbered', edition_number: 2 },
      { label: '3', value: 'numbered:3', edition_type: 'numbered', edition_number: 3 },
    ]);
  });

  it('should include AP slots when ap_total is set', () => {
    const slots = getAvailableEditionSlots(2, 1, false, []);

    expect(slots).toHaveLength(3);
    expect(slots[2]).toEqual({ label: 'AP', value: 'ap:1', edition_type: 'ap', edition_number: 1 });
  });

  it('should label AP slots with numbers when ap_total > 1', () => {
    const slots = getAvailableEditionSlots(1, 2, false, []);

    expect(slots).toHaveLength(3);
    expect(slots[1]).toEqual({ label: 'AP1', value: 'ap:1', edition_type: 'ap', edition_number: 1 });
    expect(slots[2]).toEqual({ label: 'AP2', value: 'ap:2', edition_type: 'ap', edition_number: 2 });
  });

  it('should filter out already added editions', () => {
    const existing = [
      { id: '1', edition_type: 'numbered', edition_number: 2, status: 'in_studio' as const, inventory_number: null },
    ];
    const slots = getAvailableEditionSlots(3, 0, false, existing);

    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.label)).toEqual(['1', '3']);
  });

  it('should filter out already added AP editions', () => {
    const existing = [
      { id: '1', edition_type: 'ap', edition_number: 1, status: 'in_studio' as const, inventory_number: null },
    ];
    const slots = getAvailableEditionSlots(0, 2, false, existing);

    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe('AP2');
  });

  it('should return single Unique slot for unique artworks', () => {
    const slots = getAvailableEditionSlots(null, null, true, []);

    expect(slots).toEqual([
      { label: 'Unique', value: 'unique:0', edition_type: 'unique', edition_number: 0 },
    ]);
  });

  it('should return empty for unique artwork that already has edition', () => {
    const existing = [
      { id: '1', edition_type: 'unique', edition_number: null, status: 'in_studio' as const, inventory_number: null },
    ];
    const slots = getAvailableEditionSlots(null, null, true, existing);

    expect(slots).toHaveLength(0);
  });

  it('should return empty when all editions are added', () => {
    const existing = [
      { id: '1', edition_type: 'numbered', edition_number: 1, status: 'in_studio' as const, inventory_number: null },
      { id: '2', edition_type: 'numbered', edition_number: 2, status: 'in_studio' as const, inventory_number: null },
    ];
    const slots = getAvailableEditionSlots(2, 0, false, existing);

    expect(slots).toHaveLength(0);
  });

  it('should handle null edition_total and ap_total', () => {
    const slots = getAvailableEditionSlots(null, null, false, []);

    expect(slots).toHaveLength(0);
  });
});

describe('createNewEditionFromSlot', () => {
  it('should create NewEditionData from a numbered slot', () => {
    const slot = { label: '3', value: 'numbered:3', edition_type: 'numbered' as const, edition_number: 3 };
    const result = createNewEditionFromSlot(slot);

    expect(result).toEqual({
      edition_type: 'numbered',
      edition_number: 3,
      status: 'in_studio',
      inventory_number: '',
      notes: '',
    });
  });

  it('should create NewEditionData from an AP slot', () => {
    const slot = { label: 'AP1', value: 'ap:1', edition_type: 'ap' as const, edition_number: 1 };
    const result = createNewEditionFromSlot(slot);

    expect(result).toEqual({
      edition_type: 'ap',
      edition_number: 1,
      status: 'in_studio',
      inventory_number: '',
      notes: '',
    });
  });
});
