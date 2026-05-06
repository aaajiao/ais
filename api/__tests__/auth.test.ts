import { describe, it, expect, vi, beforeEach } from 'vitest';

interface AuthState {
  getUser: (token: string) => Promise<{
    data: { user: { id: string; email?: string } | null };
    error: { message: string } | null;
  }>;
}

let authState: AuthState;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: (token: string) => authState.getUser(token),
    },
  }),
}));

import { verifyAuth, getHeader, getJsonBody, unauthorizedResponse } from '../lib/auth';

function makeRequest(headers: Record<string, string>, body?: unknown): Request {
  return new Request('http://localhost/test', {
    headers,
    method: body ? 'POST' : 'GET',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('getHeader', () => {
  it('reads from a standard Request headers object', () => {
    const req = new Request('http://x', { headers: { 'X-Foo': 'bar' } });
    expect(getHeader(req, 'X-Foo')).toBe('bar');
  });

  it('reads case-insensitively from a VercelRequest-like object', () => {
    const req = { headers: { 'x-foo': 'bar' } } as unknown as Parameters<typeof getHeader>[0];
    expect(getHeader(req, 'X-Foo')).toBe('bar');
  });

  it('returns null when the header is missing', () => {
    const req = { headers: {} } as unknown as Parameters<typeof getHeader>[0];
    expect(getHeader(req, 'X-Missing')).toBeNull();
  });

  it('returns the first value if header is array-valued (VercelRequest)', () => {
    const req = { headers: { 'x-foo': ['a', 'b'] } } as unknown as Parameters<typeof getHeader>[0];
    expect(getHeader(req, 'X-Foo')).toBe('a');
  });
});

describe('getJsonBody', () => {
  it('parses a real Request body', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const body = await getJsonBody<{ a: number }>(req);
    expect(body).toEqual({ a: 1 });
  });

  it('returns the already-parsed body for a VercelRequest', async () => {
    const req = { body: { hello: 'world' } } as unknown as Parameters<typeof getJsonBody>[0];
    const body = await getJsonBody<{ hello: string }>(req);
    expect(body).toEqual({ hello: 'world' });
  });
});

describe('unauthorizedResponse', () => {
  it('returns a 401 with JSON error', async () => {
    const res = unauthorizedResponse('Nope');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Nope' });
  });
});

describe('verifyAuth', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'http://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    process.env.ALLOWED_EMAILS = '';
    authState = {
      getUser: async () => ({ data: { user: null }, error: { message: 'not set' } }),
    };
  });

  it('rejects when Authorization header is missing', async () => {
    const result = await verifyAuth(makeRequest({}));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing/i);
  });

  it('rejects when Authorization header has wrong scheme', async () => {
    const result = await verifyAuth(makeRequest({ authorization: 'Basic abc' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing/i);
  });

  it('rejects when token is empty (Bearer with no value)', async () => {
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer ' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Empty/i);
  });

  it('rejects when Supabase returns an error / no user', async () => {
    authState = {
      getUser: async () => ({ data: { user: null }, error: { message: 'invalid jwt' } }),
    };
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer bad-token' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid or expired/i);
  });

  it('returns userId and email for a valid token', async () => {
    authState = {
      getUser: async () => ({
        data: { user: { id: 'u-123', email: 'someone@example.com' } },
        error: null,
      }),
    };
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer ok-token' }));
    expect(result.success).toBe(true);
    expect(result.userId).toBe('u-123');
    expect(result.userEmail).toBe('someone@example.com');
  });

  it('enforces ALLOWED_EMAILS when set', async () => {
    process.env.ALLOWED_EMAILS = 'permitted@example.com,other@example.com';
    authState = {
      getUser: async () => ({
        data: { user: { id: 'u-deny', email: 'attacker@example.com' } },
        error: null,
      }),
    };
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorized/i);
  });

  it('admits emails in the ALLOWED_EMAILS list (case-insensitive)', async () => {
    process.env.ALLOWED_EMAILS = 'Permitted@Example.com';
    authState = {
      getUser: async () => ({
        data: { user: { id: 'u-ok', email: 'permitted@example.com' } },
        error: null,
      }),
    };
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
    expect(result.success).toBe(true);
    expect(result.userId).toBe('u-ok');
  });

  it('returns server config error when env vars are missing', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/configuration/i);
  });

  it('returns Authentication failed when getUser throws', async () => {
    authState = {
      getUser: async () => {
        throw new Error('boom');
      },
    };
    const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Authentication failed/i);
  });

  // v1.3.5 fail-closed 守护 ——
  // 历史 bug：ALLOWED_EMAILS 不设时旧逻辑直接放行所有 Supabase 认证用户，
  // 导致任何 Google 账号都能调 /api/chat 烧掉 Anthropic 账单。
  describe('production fail-closed when ALLOWED_EMAILS missing (v1.3.5)', () => {
    it('refuses auth in production when ALLOWED_EMAILS is empty', async () => {
      process.env.VERCEL_ENV = 'production';
      process.env.ALLOWED_EMAILS = '';
      authState = {
        getUser: async () => ({
          data: { user: { id: 'u-any', email: 'any@example.com' } },
          error: null,
        }),
      };
      const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/misconfigured/i);
      delete process.env.VERCEL_ENV;
    });

    it('refuses auth in production when ALLOWED_EMAILS is whitespace-only', async () => {
      process.env.VERCEL_ENV = 'production';
      process.env.ALLOWED_EMAILS = '   ,  ,';
      authState = {
        getUser: async () => ({
          data: { user: { id: 'u-any', email: 'any@example.com' } },
          error: null,
        }),
      };
      const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/misconfigured/i);
      delete process.env.VERCEL_ENV;
    });

    it('production with ALLOWED_EMAILS configured still works normally', async () => {
      process.env.VERCEL_ENV = 'production';
      process.env.ALLOWED_EMAILS = 'owner@example.com';
      authState = {
        getUser: async () => ({
          data: { user: { id: 'u-owner', email: 'owner@example.com' } },
          error: null,
        }),
      };
      const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u-owner');
      delete process.env.VERCEL_ENV;
    });

    it('preview / dev environments fall through to fail-open + warn (no production gate)', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.ALLOWED_EMAILS = '';
      authState = {
        getUser: async () => ({
          data: { user: { id: 'u-preview', email: 'tester@example.com' } },
          error: null,
        }),
      };
      const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u-preview');
      delete process.env.VERCEL_ENV;
    });

    it('non-Vercel environment (no VERCEL_ENV at all) still fail-opens — local dev', async () => {
      delete process.env.VERCEL_ENV;
      process.env.ALLOWED_EMAILS = '';
      authState = {
        getUser: async () => ({
          data: { user: { id: 'u-local', email: 'dev@example.com' } },
          error: null,
        }),
      };
      const result = await verifyAuth(makeRequest({ authorization: 'Bearer t' }));
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u-local');
    });
  });
});
