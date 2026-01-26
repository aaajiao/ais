import { describe, it, expect } from 'vitest';
import {
  analyzeNumberPattern,
  suggestNextNumber,
  validateNumberFormat,
  isNumberUnique,
} from './inventoryNumber';

describe('analyzeNumberPattern', () => {
  describe('empty input handling', () => {
    it('should return null for empty array', () => {
      expect(analyzeNumberPattern([])).toBeNull();
    });

    it('should return null for array with only empty strings', () => {
      expect(analyzeNumberPattern(['', '  ', ''])).toBeNull();
    });
  });

  describe('AAJ-YYYY-NNN format', () => {
    it('should detect AAJ-2024-001 format', () => {
      const pattern = analyzeNumberPattern(['AAJ-2024-001', 'AAJ-2024-002']);
      expect(pattern).not.toBeNull();
      expect(pattern?.prefix).toBe('AAJ');
      expect(pattern?.hasYear).toBe(true);
      expect(pattern?.sequenceDigits).toBe(3);
      expect(pattern?.separator).toBe('-');
    });

    it('should detect 4-digit sequence', () => {
      const pattern = analyzeNumberPattern(['AAJ-2024-0001']);
      expect(pattern?.sequenceDigits).toBe(4);
    });

    it('should detect different prefix', () => {
      const pattern = analyzeNumberPattern(['XYZ-2024-001']);
      expect(pattern?.prefix).toBe('XYZ');
    });
  });

  describe('AAJ-NNN format (no year)', () => {
    it('should detect AAJ-001 format', () => {
      const pattern = analyzeNumberPattern(['AAJ-001', 'AAJ-002']);
      expect(pattern).not.toBeNull();
      expect(pattern?.prefix).toBe('AAJ');
      expect(pattern?.hasYear).toBe(false);
      expect(pattern?.sequenceDigits).toBe(3);
    });
  });

  describe('YYYY-NNN format (no prefix)', () => {
    it('should detect 2024-001 format', () => {
      const pattern = analyzeNumberPattern(['2024-001', '2024-002']);
      expect(pattern).not.toBeNull();
      expect(pattern?.prefix).toBeNull();
      expect(pattern?.hasYear).toBe(true);
      expect(pattern?.sequenceDigits).toBe(3);
    });
  });

  describe('AAJ/YYYY/NNN format (slash separator)', () => {
    it('should detect AAJ/2024/001 format', () => {
      const pattern = analyzeNumberPattern(['AAJ/2024/001']);
      expect(pattern).not.toBeNull();
      expect(pattern?.separator).toBe('/');
    });
  });

  describe('pure numeric format', () => {
    it('should detect 001 format', () => {
      const pattern = analyzeNumberPattern(['001', '002', '003']);
      expect(pattern).not.toBeNull();
      expect(pattern?.prefix).toBeNull();
      expect(pattern?.hasYear).toBe(false);
      expect(pattern?.sequenceDigits).toBe(3);
      expect(pattern?.separator).toBe('');
    });
  });

  describe('pattern threshold (50%)', () => {
    it('should detect pattern when over 50% match', () => {
      const pattern = analyzeNumberPattern([
        'AAJ-2024-001',
        'AAJ-2024-002',
        'INVALID',
      ]);
      expect(pattern).not.toBeNull();
      expect(pattern?.prefix).toBe('AAJ');
    });

    it('should return null when under 50% match', () => {
      const pattern = analyzeNumberPattern([
        'AAJ-2024-001',
        'RANDOM-TEXT',
        'OTHER-FORMAT',
        'SOMETHING',
      ]);
      expect(pattern).toBeNull();
    });
  });
});

describe('suggestNextNumber', () => {
  describe('no existing numbers', () => {
    it('should suggest default format for empty array', () => {
      const suggestion = suggestNextNumber([], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-2024-001');
      expect(suggestion.pattern).toBeNull();
      expect(suggestion.existingCount).toBe(0);
    });
  });

  describe('AAJ-YYYY-NNN format', () => {
    it('should increment sequence in same year', () => {
      const suggestion = suggestNextNumber(['AAJ-2024-001', 'AAJ-2024-002'], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-2024-003');
    });

    it('should reset sequence for new year', () => {
      const suggestion = suggestNextNumber(['AAJ-2023-005', 'AAJ-2023-006'], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-2024-001');
    });

    it('should find max sequence correctly', () => {
      const suggestion = suggestNextNumber([
        'AAJ-2024-001',
        'AAJ-2024-010',
        'AAJ-2024-005',
      ], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-2024-011');
      expect(suggestion.maxSequence).toBe(10);
    });
  });

  describe('AAJ-NNN format (no year)', () => {
    it('should increment globally', () => {
      const suggestion = suggestNextNumber(['AAJ-001', 'AAJ-002', 'AAJ-003'], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-004');
    });
  });

  describe('pure numeric format', () => {
    it('should increment numeric sequence', () => {
      const suggestion = suggestNextNumber(['001', '002', '003'], 2024);
      expect(suggestion.nextNumber).toBe('004');
    });

    it('should preserve digit padding', () => {
      const suggestion = suggestNextNumber(['0001', '0002'], 2024);
      expect(suggestion.nextNumber).toBe('0003');
    });
  });

  describe('mixed years', () => {
    it('should handle mixed years correctly', () => {
      const suggestion = suggestNextNumber([
        'AAJ-2023-001',
        'AAJ-2023-002',
        'AAJ-2024-001',
      ], 2024);
      expect(suggestion.nextNumber).toBe('AAJ-2024-002');
    });
  });
});

describe('validateNumberFormat', () => {
  describe('empty input', () => {
    it('should accept empty string', () => {
      expect(validateNumberFormat('')).toEqual({ valid: true });
    });

    it('should accept whitespace-only string', () => {
      expect(validateNumberFormat('  ')).toEqual({ valid: true });
    });
  });

  describe('length validation', () => {
    it('should reject numbers over 50 characters', () => {
      const longNumber = 'A'.repeat(51);
      const result = validateNumberFormat(longNumber);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('过长');
    });

    it('should accept numbers at 50 characters', () => {
      const maxNumber = 'A'.repeat(50);
      const result = validateNumberFormat(maxNumber);
      expect(result.valid).toBe(true);
    });
  });

  describe('character validation', () => {
    it('should accept alphanumeric characters', () => {
      expect(validateNumberFormat('AAJ2024001').valid).toBe(true);
    });

    it('should accept hyphens', () => {
      expect(validateNumberFormat('AAJ-2024-001').valid).toBe(true);
    });

    it('should accept slashes', () => {
      expect(validateNumberFormat('AAJ/2024/001').valid).toBe(true);
    });

    it('should accept underscores', () => {
      expect(validateNumberFormat('AAJ_2024_001').valid).toBe(true);
    });

    it('should reject special characters', () => {
      expect(validateNumberFormat('AAJ@2024').valid).toBe(false);
      expect(validateNumberFormat('AAJ#001').valid).toBe(false);
      expect(validateNumberFormat('AAJ 001').valid).toBe(false); // space
    });

    it('should reject Chinese characters', () => {
      expect(validateNumberFormat('AAJ-2024-中文').valid).toBe(false);
    });
  });

  describe('pattern consistency', () => {
    it('should warn when format differs from pattern', () => {
      const existingPattern = analyzeNumberPattern(['AAJ-2024-001']);
      const result = validateNumberFormat('XYZ-2024-001', existingPattern!);
      // Should still be valid but with a warning message
      expect(result.valid).toBe(true);
      expect(result.message).toContain('不一致');
    });
  });
});

describe('isNumberUnique', () => {
  describe('basic uniqueness', () => {
    it('should return true for unique number', () => {
      expect(isNumberUnique('AAJ-2024-003', ['AAJ-2024-001', 'AAJ-2024-002'])).toBe(true);
    });

    it('should return false for duplicate number', () => {
      expect(isNumberUnique('AAJ-2024-001', ['AAJ-2024-001', 'AAJ-2024-002'])).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should be case insensitive', () => {
      expect(isNumberUnique('aaj-2024-001', ['AAJ-2024-001'])).toBe(false);
      expect(isNumberUnique('AAJ-2024-001', ['aaj-2024-001'])).toBe(false);
    });
  });

  describe('whitespace handling', () => {
    it('should trim whitespace', () => {
      expect(isNumberUnique('  AAJ-2024-001  ', ['AAJ-2024-001'])).toBe(false);
    });

    it('should return true for empty input', () => {
      expect(isNumberUnique('', ['AAJ-2024-001'])).toBe(true);
      expect(isNumberUnique('  ', ['AAJ-2024-001'])).toBe(true);
    });
  });

  describe('exclude functionality', () => {
    it('should exclude specified number from comparison', () => {
      // When editing, we want to exclude the current number
      expect(isNumberUnique('AAJ-2024-001', ['AAJ-2024-001', 'AAJ-2024-002'], 'AAJ-2024-001')).toBe(true);
    });

    it('should still detect duplicates with other numbers', () => {
      expect(isNumberUnique('AAJ-2024-002', ['AAJ-2024-001', 'AAJ-2024-002'], 'AAJ-2024-001')).toBe(false);
    });
  });
});
