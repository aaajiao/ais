import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateApiKey, getKeyPrefix, hashApiKey, verifyApiKey } from '../lib/api-key-auth';

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

interface SelectStub {
  data: unknown;
  error: unknown;
}

interface MockSupabase {
  selectStub: SelectStub;
  updates: Array<{ table: string; payload: unknown; id: unknown }>;
  client: {
    from: (table: string) => unknown;
  };
}

function createMockSupabase(selectStub: SelectStub): MockSupabase {
  const updates: Array<{ table: string; payload: unknown; id: unknown }> = [];

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single() {
                  return Promise.resolve(selectStub);
                },
              };
            },
          };
        },
        update(payload: unknown) {
          return {
            eq(_col: string, id: unknown) {
              updates.push({ table, payload, id });
              return {
                then(onFulfilled: () => void) {
                  onFulfilled();
                  return Promise.resolve();
                },
              };
            },
          };
        },
      };
    },
  };

  return { selectStub, updates, client };
}

let mockState: MockSupabase;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockState.client,
}));

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', { headers });
}

describe('verifyApiKey', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'http://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
  });

  it('rejects when no Authorization or X-API-Key header is set', async () => {
    mockState = createMockSupabase({ data: null, error: null });
    const result = await verifyApiKey(makeRequest({}));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing or invalid API key/i);
  });

  it('rejects when Authorization header has wrong format', async () => {
    mockState = createMockSupabase({ data: null, error: null });
    const result = await verifyApiKey(makeRequest({ authorization: 'Bearer something-else' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing or invalid API key/i);
  });

  it('rejects X-API-Key header without ak_ prefix', async () => {
    mockState = createMockSupabase({ data: null, error: null });
    const result = await verifyApiKey(makeRequest({ 'x-api-key': 'plain-token' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing or invalid API key/i);
  });

  it('rejects when no matching key row is found', async () => {
    mockState = createMockSupabase({ data: null, error: { message: 'no rows' } });
    const result = await verifyApiKey(
      makeRequest({ authorization: 'Bearer ak_unknown1234567890abcdef0123456789' }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid API key/i);
  });

  it('rejects revoked keys', async () => {
    mockState = createMockSupabase({
      data: {
        id: 'k1',
        user_id: 'u1',
        permissions: ['read'],
        revoked_at: '2025-01-01T00:00:00Z',
        request_count: 0,
      },
      error: null,
    });
    const result = await verifyApiKey(
      makeRequest({ authorization: 'Bearer ak_revoked1234567890abcdef0123456789' }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/revoked/i);
  });

  it('returns success and userId for an active key (Bearer)', async () => {
    mockState = createMockSupabase({
      data: {
        id: 'key-active-id',
        user_id: 'user-abc',
        permissions: ['read', 'list'],
        revoked_at: null,
        request_count: 7,
      },
      error: null,
    });
    const result = await verifyApiKey(
      makeRequest({ authorization: 'Bearer ak_active1234567890abcdef0123456789' }),
    );
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-abc');
    expect(result.keyId).toBe('key-active-id');
    expect(result.permissions).toEqual(['read', 'list']);
  });

  it('returns success for X-API-Key header form', async () => {
    mockState = createMockSupabase({
      data: {
        id: 'key-xapi',
        user_id: 'user-xapi',
        permissions: ['read'],
        revoked_at: null,
        request_count: 1,
      },
      error: null,
    });
    const result = await verifyApiKey(
      makeRequest({ 'x-api-key': 'ak_xapi1234567890abcdef0123456789aa' }),
    );
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-xapi');
  });

  it('updates last_used_at and increments request_count on success', async () => {
    mockState = createMockSupabase({
      data: {
        id: 'key-track',
        user_id: 'user-track',
        permissions: [],
        revoked_at: null,
        request_count: 4,
      },
      error: null,
    });

    const result = await verifyApiKey(
      makeRequest({ authorization: 'Bearer ak_track1234567890abcdef0123456789' }),
    );
    expect(result.success).toBe(true);

    await new Promise((r) => setImmediate(r));

    expect(mockState.updates).toHaveLength(1);
    const update = mockState.updates[0];
    expect(update.table).toBe('api_keys');
    expect(update.id).toBe('key-track');
    const payload = update.payload as { last_used_at: string; request_count: number };
    expect(payload.request_count).toBe(5);
    expect(typeof payload.last_used_at).toBe('string');
    expect(Number.isFinite(Date.parse(payload.last_used_at))).toBe(true);
  });

  it('does not run update when key is revoked', async () => {
    mockState = createMockSupabase({
      data: {
        id: 'rev',
        user_id: 'u',
        permissions: [],
        revoked_at: '2024-12-01',
        request_count: 0,
      },
      error: null,
    });
    await verifyApiKey(
      makeRequest({ authorization: 'Bearer ak_rev1234567890abcdef0123456789ab' }),
    );
    expect(mockState.updates).toHaveLength(0);
  });
});
