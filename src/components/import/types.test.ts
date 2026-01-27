import { describe, it, expect } from 'vitest';
import { getArtworkUid } from './types';

describe('getArtworkUid', () => {
  describe('with source_url', () => {
    it('should return source_url when available', () => {
      const artwork = {
        title_en: 'Test Artwork',
        source_url: 'https://example.com/artwork/123',
      };
      expect(getArtworkUid(artwork, 0)).toBe('https://example.com/artwork/123');
    });

    it('should return source_url regardless of index', () => {
      const artwork = {
        title_en: 'Test Artwork',
        source_url: 'https://example.com/unique-url',
      };
      expect(getArtworkUid(artwork, 5)).toBe('https://example.com/unique-url');
      expect(getArtworkUid(artwork, 100)).toBe('https://example.com/unique-url');
    });
  });

  describe('without source_url', () => {
    it('should return title_en::index when source_url is null', () => {
      const artwork = {
        title_en: 'My Artwork',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 0)).toBe('My Artwork::0');
      expect(getArtworkUid(artwork, 5)).toBe('My Artwork::5');
    });

    it('should return title_en::index when source_url is undefined', () => {
      const artwork = {
        title_en: 'Another Artwork',
      };
      expect(getArtworkUid(artwork, 3)).toBe('Another Artwork::3');
    });

    it('should return title_en::index when source_url is empty string', () => {
      const artwork = {
        title_en: 'Empty URL Artwork',
        source_url: '',
      };
      expect(getArtworkUid(artwork, 2)).toBe('Empty URL Artwork::2');
    });
  });

  describe('edge cases', () => {
    it('should handle title with special characters', () => {
      const artwork = {
        title_en: 'Artwork: "Special" / Characters',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 1)).toBe('Artwork: "Special" / Characters::1');
    });

    it('should handle empty title', () => {
      const artwork = {
        title_en: '',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 0)).toBe('::0');
    });

    it('should handle Chinese title', () => {
      const artwork = {
        title_en: '中文标题',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 0)).toBe('中文标题::0');
    });

    it('should handle title with unicode characters', () => {
      const artwork = {
        title_en: 'Émoji 🎨 Art',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 0)).toBe('Émoji 🎨 Art::0');
    });

    it('should handle large index numbers', () => {
      const artwork = {
        title_en: 'Large Index Artwork',
        source_url: null,
      };
      expect(getArtworkUid(artwork, 99999)).toBe('Large Index Artwork::99999');
    });
  });
});
