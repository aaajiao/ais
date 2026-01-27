import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', true && 'active')).toBe('base active');
    expect(cn('base', false && 'active')).toBe('base');
  });

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });

  it('should handle arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('should handle objects', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });

  it('should merge Tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle complex Tailwind merges', () => {
    expect(cn('p-4 bg-red-500', 'p-2')).toBe('bg-red-500 p-2');
  });

  it('should return empty string for no arguments', () => {
    expect(cn()).toBe('');
  });
});
