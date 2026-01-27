import { describe, it, expect } from 'vitest';
import {
  initFormDataFromArtwork,
  formatEditionNumber,
  createDefaultNewEdition,
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

describe('createDefaultNewEdition', () => {
  it('should create default edition data with edition_number = count + 1', () => {
    const result = createDefaultNewEdition(0);

    expect(result).toEqual({
      edition_type: 'numbered',
      edition_number: 1,
      status: 'in_studio',
      inventory_number: '',
      notes: '',
    });
  });

  it('should increment edition_number based on existing count', () => {
    const result = createDefaultNewEdition(5);

    expect(result.edition_number).toBe(6);
  });

  it('should always use in_studio as default status', () => {
    const result = createDefaultNewEdition(10);

    expect(result.status).toBe('in_studio');
  });

  it('should always use numbered as default edition_type', () => {
    const result = createDefaultNewEdition(3);

    expect(result.edition_type).toBe('numbered');
  });
});
