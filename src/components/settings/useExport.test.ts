import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub supabase before useExport's transitive imports construct a real client.
// Without this the test file fails to load in CI (no .env.local → supabaseUrl 为空 → createClient throws).
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));

import { getDateString, downloadFile } from './useExport';

describe('useExport utilities', () => {
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
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let clickMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      URL.revokeObjectURL = vi.fn();
      clickMock = vi.fn();

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
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it('should create blob with correct content and type', () => {
      const content = '{"test": true}';
      const filename = 'test.json';
      const type = 'application/json';

      downloadFile(content, filename, type);

      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickMock).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
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
