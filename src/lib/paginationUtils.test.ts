import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, DEFAULT_PAGE_SIZE } from './paginationUtils';

describe('encodeCursor', () => {
  it('should encode item with updated_at', () => {
    const item = {
      id: '123',
      updated_at: '2024-01-15T10:00:00Z',
      created_at: '2024-01-01T10:00:00Z',
    };
    const cursor = encodeCursor(item);
    const decoded = JSON.parse(atob(cursor));
    expect(decoded.id).toBe('123');
    expect(decoded.timestamp).toBe('2024-01-15T10:00:00Z');
  });

  it('should use created_at when updated_at is missing', () => {
    const item = {
      id: '456',
      created_at: '2024-01-01T10:00:00Z',
    };
    const cursor = encodeCursor(item);
    const decoded = JSON.parse(atob(cursor));
    expect(decoded.timestamp).toBe('2024-01-01T10:00:00Z');
  });

  it('should handle missing timestamps', () => {
    const item = { id: '789' };
    const cursor = encodeCursor(item);
    const decoded = JSON.parse(atob(cursor));
    expect(decoded.timestamp).toBe('');
    expect(decoded.id).toBe('789');
  });

  it('should produce valid base64 string', () => {
    const item = { id: 'test', updated_at: '2024-01-01T00:00:00Z' };
    const cursor = encodeCursor(item);
    expect(() => atob(cursor)).not.toThrow();
  });
});

describe('decodeCursor', () => {
  it('should decode valid cursor', () => {
    const original = { timestamp: '2024-01-15T10:00:00Z', id: '123' };
    const encoded = btoa(JSON.stringify(original));
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(original);
  });

  it('should return null for null input', () => {
    expect(decodeCursor(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(decodeCursor('')).toBeNull();
  });

  it('should return null for invalid base64', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    const invalidJson = btoa('not json');
    expect(decodeCursor(invalidJson)).toBeNull();
  });

  it('should roundtrip correctly', () => {
    const item = {
      id: 'roundtrip-test',
      updated_at: '2024-06-01T12:30:00Z',
    };
    const cursor = encodeCursor(item);
    const decoded = decodeCursor(cursor);
    expect(decoded?.id).toBe('roundtrip-test');
    expect(decoded?.timestamp).toBe('2024-06-01T12:30:00Z');
  });
});

describe('DEFAULT_PAGE_SIZE', () => {
  it('should be 50', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
  });
});
