import { describe, it, expect } from 'vitest';
import { selectBestImage } from '../lib/image-downloader';

describe('selectBestImage', () => {
  describe('empty input handling', () => {
    it('should return null for empty array', () => {
      expect(selectBestImage([])).toBeNull();
    });
  });

  describe('single image', () => {
    it('should return the only image', () => {
      expect(selectBestImage(['https://example.com/image.jpg'])).toBe('https://example.com/image.jpg');
    });
  });

  describe('CDN priority', () => {
    it('should prefer payload.cargocollective.com images', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://payload.cargocollective.com/1/image.jpg',
        'https://other.com/image.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://payload.cargocollective.com/1/image.jpg');
    });

    it('should prefer cargo.site images', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://files.cargo.site/image.jpg',
        'https://other.com/image.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://files.cargo.site/image.jpg');
    });

    it('should return first CDN image when multiple CDN images exist', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://payload.cargocollective.com/1/first-cdn.jpg',
        'https://payload.cargocollective.com/1/second-cdn.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://payload.cargocollective.com/1/first-cdn.jpg');
    });
  });

  describe('size-based selection (when no CDN)', () => {
    it('should prefer images with size >= 1000 in URL', () => {
      const images = [
        'https://example.com/image_500.jpg',
        'https://example.com/image_1200.jpg',
        'https://example.com/image_800.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/image_1200.jpg');
    });

    it('should find size at boundary (exactly 1000)', () => {
      const images = [
        'https://example.com/image_999.jpg',
        'https://example.com/image_1000.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/image_1000.jpg');
    });

    it('should not select images with size < 1000', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://example.com/image_999.jpg',
        'https://example.com/image_500.jpg',
      ];
      // No large images, should return first
      expect(selectBestImage(images)).toBe('https://example.com/first.jpg');
    });

    it('should handle various size formats in URL', () => {
      const images = [
        'https://example.com/thumb_100.jpg',
        'https://example.com/full_2000.png',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/full_2000.png');
    });
  });

  describe('fallback to first image', () => {
    it('should return first image when no CDN or large images', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://other.com/second.jpg',
        'https://another.com/third.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/first.jpg');
    });

    it('should return first image when URLs have no size info', () => {
      const images = [
        'https://example.com/artwork.jpg',
        'https://example.com/photo.png',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/artwork.jpg');
    });
  });

  describe('priority order', () => {
    it('should prefer CDN over large size', () => {
      const images = [
        'https://example.com/large_2000.jpg',
        'https://payload.cargocollective.com/small.jpg',
      ];
      // CDN should win even without size info
      expect(selectBestImage(images)).toBe('https://payload.cargocollective.com/small.jpg');
    });

    it('should prefer large size over first when no CDN', () => {
      const images = [
        'https://example.com/first.jpg',
        'https://example.com/large_1500.jpg',
      ];
      expect(selectBestImage(images)).toBe('https://example.com/large_1500.jpg');
    });
  });
});
