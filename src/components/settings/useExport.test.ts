import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatCSVRow, getDateString, downloadFile } from './useExport';

describe('useExport utilities', () => {
  describe('formatCSVRow', () => {
    it('should format simple values', () => {
      const row = ['a', 'b', 'c'];
      expect(formatCSVRow(row)).toBe('"a","b","c"');
    });

    it('should escape double quotes', () => {
      const row = ['Hello "World"', 'Test'];
      expect(formatCSVRow(row)).toBe('"Hello ""World""","Test"');
    });

    it('should handle null and undefined values', () => {
      const row = [null, undefined, 'value'];
      expect(formatCSVRow(row)).toBe('"","","value"');
    });

    it('should handle numbers', () => {
      const row = [1, 2.5, 100];
      expect(formatCSVRow(row)).toBe('"1","2.5","100"');
    });

    it('should handle booleans', () => {
      const row = [true, false];
      expect(formatCSVRow(row)).toBe('"true","false"');
    });

    it('should handle empty array', () => {
      expect(formatCSVRow([])).toBe('');
    });

    it('should handle values with commas', () => {
      const row = ['Hello, World', 'Test'];
      expect(formatCSVRow(row)).toBe('"Hello, World","Test"');
    });

    it('should handle values with newlines', () => {
      const row = ['Line1\nLine2', 'Test'];
      expect(formatCSVRow(row)).toBe('"Line1\nLine2","Test"');
    });

    it('should handle mixed types', () => {
      const row = ['text', 123, true, null, undefined];
      expect(formatCSVRow(row)).toBe('"text","123","true","",""');
    });
  });

  describe('getDateString', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return date in YYYY-MM-DD format', () => {
      vi.setSystemTime(new Date('2024-03-15T10:30:00Z'));
      expect(getDateString()).toBe('2024-03-15');
    });

    it('should handle single digit month and day', () => {
      vi.setSystemTime(new Date('2024-01-05T10:30:00Z'));
      expect(getDateString()).toBe('2024-01-05');
    });

    it('should handle end of year', () => {
      vi.setSystemTime(new Date('2024-12-31T23:59:59Z'));
      expect(getDateString()).toBe('2024-12-31');
    });
  });

  describe('downloadFile', () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let clickMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      revokeObjectURLMock = vi.fn();
      clickMock = vi.fn();

      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      vi.spyOn(document, 'createElement').mockImplementation(() => {
        const element = {
          href: '',
          download: '',
          click: clickMock,
        };
        return element as unknown as HTMLAnchorElement;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create blob with correct content and type', () => {
      const content = '{"test": true}';
      const filename = 'test.json';
      const type = 'application/json';

      downloadFile(content, filename, type);

      expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should add BOM for CSV files', () => {
      const content = 'a,b,c';
      const filename = 'test.csv';
      const type = 'text/csv;charset=utf-8';

      downloadFile(content, filename, type);

      // The Blob should contain BOM prefix
      expect(createObjectURLMock).toHaveBeenCalled();
    });

    it('should set correct download filename', () => {
      const content = 'test';
      const filename = 'my-file.txt';
      const type = 'text/plain';

      downloadFile(content, filename, type);

      expect(clickMock).toHaveBeenCalled();
    });
  });
});
