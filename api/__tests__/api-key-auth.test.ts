import { describe, it, expect } from 'vitest';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../lib/api-key-auth';

describe('generateApiKey', () => {
  it('should generate key with ak_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith('ak_')).toBe(true);
  });

  it('should generate key of correct length (ak_ + 32 hex chars = 35)', () => {
    const key = generateApiKey();
    expect(key.length).toBe(35);
  });

  it('should generate hex characters after prefix', () => {
    const key = generateApiKey();
    const hex = key.slice(3);
    expect(/^[0-9a-f]{32}$/.test(hex)).toBe(true);
  });

  it('should generate unique keys', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
    expect(keys.size).toBe(20);
  });
});

describe('getKeyPrefix', () => {
  it('should return first 8 characters', () => {
    expect(getKeyPrefix('ak_abcdef1234567890')).toBe('ak_abcde');
  });

  it('should return correct prefix for generated key', () => {
    const key = generateApiKey();
    const prefix = getKeyPrefix(key);
    expect(prefix.length).toBe(8);
    expect(key.startsWith(prefix)).toBe(true);
  });
});

describe('hashApiKey', () => {
  it('should return hex string of 64 chars (SHA-256)', async () => {
    const hash = await hashApiKey('ak_test1234567890');
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('should produce consistent hash for same input', async () => {
    const key = 'ak_consistent_test_key';
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different keys', async () => {
    const hash1 = await hashApiKey('ak_key_one');
    const hash2 = await hashApiKey('ak_key_two');
    expect(hash1).not.toBe(hash2);
  });

  it('should not return the original key', async () => {
    const key = 'ak_test1234567890';
    const hash = await hashApiKey(key);
    expect(hash).not.toContain('ak_');
    expect(hash).not.toBe(key);
  });
});
