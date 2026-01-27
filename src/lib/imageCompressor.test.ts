import { describe, it, expect } from 'vitest';
import {
  needsCompression,
  isImageFile,
  formatFileSize,
  detectFileType,
  detectLinkType,
} from './imageCompressor';

// Mock File for testing
function createMockFile(name: string, size: number, type: string): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

describe('needsCompression', () => {
  it('should return true for large images', () => {
    const file = createMockFile('photo.jpg', 3 * 1024 * 1024, 'image/jpeg');
    expect(needsCompression(file)).toBe(true);
  });

  it('should return false for small images', () => {
    const file = createMockFile('small.jpg', 1 * 1024 * 1024, 'image/jpeg');
    expect(needsCompression(file)).toBe(false);
  });

  it('should return false for non-images', () => {
    const file = createMockFile('doc.pdf', 5 * 1024 * 1024, 'application/pdf');
    expect(needsCompression(file)).toBe(false);
  });

  it('should respect custom threshold', () => {
    const file = createMockFile('photo.jpg', 1.5 * 1024 * 1024, 'image/jpeg');
    expect(needsCompression(file, 1)).toBe(true);
    expect(needsCompression(file, 2)).toBe(false);
  });

  it('should return false for exactly threshold size', () => {
    const file = createMockFile('exact.jpg', 2 * 1024 * 1024, 'image/jpeg');
    expect(needsCompression(file, 2)).toBe(false);
  });
});

describe('isImageFile', () => {
  it('should return true for JPEG', () => {
    const file = createMockFile('photo.jpg', 100, 'image/jpeg');
    expect(isImageFile(file)).toBe(true);
  });

  it('should return true for PNG', () => {
    const file = createMockFile('photo.png', 100, 'image/png');
    expect(isImageFile(file)).toBe(true);
  });

  it('should return true for WebP', () => {
    const file = createMockFile('photo.webp', 100, 'image/webp');
    expect(isImageFile(file)).toBe(true);
  });

  it('should return false for PDF', () => {
    const file = createMockFile('doc.pdf', 100, 'application/pdf');
    expect(isImageFile(file)).toBe(false);
  });

  it('should return false for text', () => {
    const file = createMockFile('readme.txt', 100, 'text/plain');
    expect(isImageFile(file)).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('should handle decimal precision', () => {
    expect(formatFileSize(1234567)).toBe('1.18 MB');
  });
});

describe('detectFileType', () => {
  describe('from File object', () => {
    it('should detect image types', () => {
      expect(detectFileType(createMockFile('photo.jpg', 100, 'image/jpeg'))).toBe('image');
      expect(detectFileType(createMockFile('photo.png', 100, 'image/png'))).toBe('image');
    });

    it('should detect PDF', () => {
      expect(detectFileType(createMockFile('doc.pdf', 100, 'application/pdf'))).toBe('pdf');
    });

    it('should detect video', () => {
      expect(detectFileType(createMockFile('movie.mp4', 100, 'video/mp4'))).toBe('video');
    });

    it('should detect spreadsheet', () => {
      expect(detectFileType(createMockFile('data.csv', 100, 'text/csv'))).toBe('spreadsheet');
    });

    it('should detect markdown', () => {
      expect(detectFileType(createMockFile('readme.md', 100, 'text/markdown'))).toBe('markdown');
    });
  });

  describe('from extension', () => {
    it('should detect by extension when MIME is generic', () => {
      const file = createMockFile('photo.jpg', 100, 'application/octet-stream');
      expect(detectFileType(file)).toBe('image');
    });

    it('should detect video extensions', () => {
      expect(detectFileType(createMockFile('video.mov', 100, ''))).toBe('video');
      expect(detectFileType(createMockFile('video.webm', 100, ''))).toBe('video');
    });

    it('should detect spreadsheet extensions', () => {
      expect(detectFileType(createMockFile('data.xlsx', 100, ''))).toBe('spreadsheet');
      expect(detectFileType(createMockFile('data.xls', 100, ''))).toBe('spreadsheet');
    });

    it('should return other for unknown types', () => {
      expect(detectFileType(createMockFile('unknown.xyz', 100, ''))).toBe('other');
    });
  });

  describe('from string path', () => {
    it('should detect by extension from path', () => {
      expect(detectFileType('path/to/photo.jpg')).toBe('image');
      expect(detectFileType('path/to/doc.pdf')).toBe('pdf');
      expect(detectFileType('path/to/video.mp4')).toBe('video');
    });
  });
});

describe('detectLinkType', () => {
  describe('video platforms', () => {
    it('should detect YouTube', () => {
      expect(detectLinkType('https://youtube.com/watch?v=abc123')).toBe('video');
      expect(detectLinkType('https://www.youtube.com/watch?v=abc123')).toBe('video');
    });

    it('should detect YouTube short links', () => {
      expect(detectLinkType('https://youtu.be/abc123')).toBe('video');
    });

    it('should detect Vimeo', () => {
      expect(detectLinkType('https://vimeo.com/123456')).toBe('video');
    });

    it('should detect Bilibili', () => {
      expect(detectLinkType('https://bilibili.com/video/BV123')).toBe('video');
      expect(detectLinkType('https://www.bilibili.com/video/BV123')).toBe('video');
    });
  });

  describe('document platforms', () => {
    it('should detect Google Docs', () => {
      expect(detectLinkType('https://docs.google.com/document/d/abc')).toBe('document');
    });

    it('should detect Notion', () => {
      expect(detectLinkType('https://notion.so/page-abc123')).toBe('document');
    });

    it('should detect Dropbox (non-share links)', () => {
      expect(detectLinkType('https://dropbox.com/home/folder')).toBe('document');
    });

    it('should not detect Dropbox share links as document', () => {
      expect(detectLinkType('https://dropbox.com/s/abc123/file.pdf')).not.toBe('document');
    });
  });

  describe('spreadsheet platforms', () => {
    it('should detect Google Sheets', () => {
      expect(detectLinkType('https://sheets.google.com/spreadsheets/d/abc')).toBe('spreadsheet');
    });

    it('should detect Airtable', () => {
      expect(detectLinkType('https://airtable.com/app123/tbl456')).toBe('spreadsheet');
    });
  });

  describe('by file extension', () => {
    it('should detect image URLs', () => {
      expect(detectLinkType('https://example.com/photo.jpg')).toBe('image');
      expect(detectLinkType('https://example.com/photo.png')).toBe('image');
      expect(detectLinkType('https://example.com/photo.webp')).toBe('image');
    });

    it('should detect PDF URLs', () => {
      expect(detectLinkType('https://example.com/doc.pdf')).toBe('pdf');
    });

    it('should detect video file URLs', () => {
      expect(detectLinkType('https://example.com/video.mp4')).toBe('video');
      expect(detectLinkType('https://example.com/video.mov')).toBe('video');
    });

    it('should handle URLs with query strings', () => {
      expect(detectLinkType('https://example.com/photo.jpg?size=large')).toBe('image');
    });
  });

  describe('default behavior', () => {
    it('should return link for unknown URLs', () => {
      expect(detectLinkType('https://example.com/page')).toBe('link');
      expect(detectLinkType('https://unknown-site.com/')).toBe('link');
    });
  });
});
