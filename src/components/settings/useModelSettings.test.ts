import { describe, it, expect } from 'vitest';
import { formatModelIdForDisplay } from './useModelSettings';

describe('formatModelIdForDisplay', () => {
  describe('Claude model IDs', () => {
    it('should strip date suffix from claude-sonnet model', () => {
      expect(formatModelIdForDisplay('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5');
    });

    it('should strip date suffix from claude-haiku model', () => {
      expect(formatModelIdForDisplay('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
    });

    it('should strip date suffix from claude-opus model', () => {
      expect(formatModelIdForDisplay('claude-opus-4-5-20251015')).toBe('claude-opus-4-5');
    });

    it('should handle different version numbers', () => {
      expect(formatModelIdForDisplay('claude-sonnet-3-5-20240620')).toBe('claude-sonnet-3-5');
      expect(formatModelIdForDisplay('claude-haiku-3-0-20240307')).toBe('claude-haiku-3-0');
    });
  });

  describe('Non-Claude model IDs', () => {
    it('should return OpenAI model IDs unchanged', () => {
      expect(formatModelIdForDisplay('gpt-4o')).toBe('gpt-4o');
      expect(formatModelIdForDisplay('gpt-4-turbo')).toBe('gpt-4-turbo');
      expect(formatModelIdForDisplay('gpt-3.5-turbo')).toBe('gpt-3.5-turbo');
    });

    it('should return other model IDs unchanged', () => {
      expect(formatModelIdForDisplay('some-other-model')).toBe('some-other-model');
      expect(formatModelIdForDisplay('custom-model-v1')).toBe('custom-model-v1');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(formatModelIdForDisplay('')).toBe('');
    });

    it('should not strip non-date suffixes', () => {
      // This doesn't match the pattern (not 8 digits at the end)
      expect(formatModelIdForDisplay('claude-sonnet-4-5-preview')).toBe('claude-sonnet-4-5-preview');
    });

    it('should handle model IDs without version numbers', () => {
      expect(formatModelIdForDisplay('claude-instant')).toBe('claude-instant');
    });
  });
});
