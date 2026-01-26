import { describe, it, expect } from 'vitest';
import { sanitizeSearchTerm, expandEnglishPluralForms } from '../lib/search-utils';

describe('sanitizeSearchTerm', () => {
  it('should return empty string for empty input', () => {
    expect(sanitizeSearchTerm('')).toBe('');
  });

  it('should return normal text unchanged', () => {
    expect(sanitizeSearchTerm('hello')).toBe('hello');
    expect(sanitizeSearchTerm('artwork title')).toBe('artwork title');
    expect(sanitizeSearchTerm('中文标题')).toBe('中文标题');
  });

  it('should escape backslashes', () => {
    expect(sanitizeSearchTerm('path\\to\\file')).toBe('path\\\\to\\\\file');
    expect(sanitizeSearchTerm('\\')).toBe('\\\\');
  });

  it('should escape percent signs (SQL wildcard)', () => {
    expect(sanitizeSearchTerm('100%')).toBe('100\\%');
    expect(sanitizeSearchTerm('%match%')).toBe('\\%match\\%');
  });

  it('should escape underscores (SQL single char wildcard)', () => {
    expect(sanitizeSearchTerm('file_name')).toBe('file\\_name');
    expect(sanitizeSearchTerm('_prefix')).toBe('\\_prefix');
  });

  it('should handle multiple special characters together', () => {
    expect(sanitizeSearchTerm('100%_test\\path')).toBe('100\\%\\_test\\\\path');
  });

  it('should handle SQL injection attempts', () => {
    // Attempting to inject wildcards
    expect(sanitizeSearchTerm("'; DROP TABLE artworks; --")).toBe("'; DROP TABLE artworks; --");
    expect(sanitizeSearchTerm('%OR%1=1%')).toBe('\\%OR\\%1=1\\%');
  });
});

describe('expandEnglishPluralForms', () => {
  describe('fast path eligibility', () => {
    it('should return null for non-English text (Chinese)', () => {
      expect(expandEnglishPluralForms('磁铁')).toBeNull();
    });

    it('should return null for mixed language', () => {
      expect(expandEnglishPluralForms('hello你好')).toBeNull();
    });

    it('should return null for text with numbers', () => {
      expect(expandEnglishPluralForms('test123')).toBeNull();
    });

    it('should return null for text with spaces', () => {
      expect(expandEnglishPluralForms('hello world')).toBeNull();
    });

    it('should return null for text with special characters', () => {
      expect(expandEnglishPluralForms('hello-world')).toBeNull();
      expect(expandEnglishPluralForms('hello_world')).toBeNull();
    });

    it('should return null for long words (>= 20 chars)', () => {
      expect(expandEnglishPluralForms('supercalifragilisticexpialidocious')).toBeNull();
    });

    it('should handle pure English short words', () => {
      expect(expandEnglishPluralForms('magnet')).not.toBeNull();
      expect(expandEnglishPluralForms('wood')).not.toBeNull();
    });
  });

  describe('plural form generation', () => {
    it('should add -s plural for regular words', () => {
      const result = expandEnglishPluralForms('magnet');
      expect(result).toContain('magnet');
      expect(result).toContain('magnets');
    });

    it('should handle words ending in -s (already plural)', () => {
      const result = expandEnglishPluralForms('materials');
      expect(result).toContain('materials');
      expect(result).toContain('material'); // singular form
    });

    it('should handle -ies to -y conversion', () => {
      const result = expandEnglishPluralForms('batteries');
      expect(result).toContain('batteries');
      expect(result).toContain('battery');
    });

    it('should not convert short -ies words', () => {
      // "dies" is only 4 chars, shouldn't trigger -ies rule (needs > 4)
      // But it DOES trigger -es rule (4 > 3), so we get "di" not "die"
      const result = expandEnglishPluralForms('dies');
      expect(result).toContain('dies');
      expect(result).toContain('di'); // from -es rule: slice(0, -2) = "di"
      expect(result).not.toContain('dy'); // should NOT do -ies conversion
    });

    it('should handle -es to base conversion', () => {
      const result = expandEnglishPluralForms('boxes');
      expect(result).toContain('boxes');
      expect(result).toContain('box');
    });

    it('should not convert short -es words', () => {
      // "yes" is only 3 chars
      const result = expandEnglishPluralForms('yes');
      expect(result).toContain('yes');
      expect(result).not.toContain('y');
    });
  });

  describe('case normalization', () => {
    it('should normalize to lowercase', () => {
      const result = expandEnglishPluralForms('MAGNET');
      expect(result).toContain('magnet');
      expect(result).toContain('magnets');
      expect(result).not.toContain('MAGNET');
    });

    it('should handle mixed case', () => {
      const result = expandEnglishPluralForms('MaGnEt');
      expect(result).toContain('magnet');
    });
  });

  describe('deduplication', () => {
    it('should not duplicate forms', () => {
      const result = expandEnglishPluralForms('magnets');
      // Should not have duplicate 'magnets'
      const magnetsCount = result?.filter(r => r === 'magnets').length;
      expect(magnetsCount).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle single character (but no plural conversion)', () => {
      const result = expandEnglishPluralForms('a');
      expect(result).toContain('a');
      expect(result).toContain('as');
    });

    it('should handle two character words', () => {
      const result = expandEnglishPluralForms('go');
      expect(result).toContain('go');
      expect(result).toContain('gos');
    });

    it('should handle words ending in s that are not plural', () => {
      // "glass" should still get singular form attempted
      const result = expandEnglishPluralForms('glass');
      expect(result).toContain('glass');
      expect(result).toContain('glas'); // from -s rule
    });
  });
});
