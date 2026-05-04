import { describe, it, expect, vi, beforeEach } from 'vitest';

interface AuthStub {
  success: boolean;
  userId?: string;
  error?: string;
}

let authStub: AuthStub;
const capturedToolCtxs: Array<{ userId: string; locale: string }> = [];
let capturedSearchParams: unknown = null;
let searchResult: unknown = { artworks: [] };

vi.mock('../../lib/api-key-auth.js', () => ({
  verifyApiKey: vi.fn(async () => authStub),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}),
}));

vi.mock('../../tools/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../tools/index.js')>('../../tools/index.js');
  return {
    ...actual,
    createReadOnlyTools: (ctx: { userId: string; locale: string }) => {
      capturedToolCtxs.push({ userId: ctx.userId, locale: ctx.locale });
      const stub = (params: unknown) => {
        capturedSearchParams = params;
        return Promise.resolve(searchResult);
      };
      return {
        search_artworks: { execute: stub },
        search_editions: { execute: stub },
        search_locations: { execute: stub },
        search_history: { execute: stub },
        get_statistics: { execute: stub },
      };
    },
  };
});

import handler from '../v1/query';

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/external/v1/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('external/v1/query', () => {
  beforeEach(() => {
    authStub = { success: true, userId: 'authenticated-user' };
    capturedToolCtxs.length = 0;
    capturedSearchParams = null;
    searchResult = { artworks: [] };
  });

  it('responds 204 to OPTIONS preflight', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/query', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });

  it('rejects non-POST methods with 405', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/query', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('returns 401 INVALID_API_KEY when verifyApiKey fails', async () => {
    authStub = { success: false, error: 'bad key' };
    const res = await handler(postRequest({ action: 'search_artworks' }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_API_KEY');
  });

  it('returns 400 INVALID_ACTION when action is unknown or write-only', async () => {
    const cases = ['execute_edition_update', 'import_artwork_from_url', 'export_artworks', 'something_random', ''];
    for (const action of cases) {
      const res = await handler(postRequest({ action }));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_ACTION');
    }
  });

  it('passes the API-key-derived userId into the tool context (cannot be spoofed)', async () => {
    authStub = { success: true, userId: 'real-owner' };
    const res = await handler(
      postRequest({
        action: 'search_artworks',
        params: { query: 'cat', user_id: 'attacker', userId: 'attacker' },
      }),
    );
    expect(res.status).toBe(200);
    expect(capturedToolCtxs).toHaveLength(1);
    expect(capturedToolCtxs[0].userId).toBe('real-owner');
  });

  it('forwards params to the tool unchanged (tool layer enforces user scoping internally)', async () => {
    await handler(
      postRequest({
        action: 'search_artworks',
        params: { materials: 'magnet', is_unique: true },
      }),
    );
    expect(capturedSearchParams).toEqual({ materials: 'magnet', is_unique: true });
  });

  it('defaults locale to en, accepts zh', async () => {
    await handler(postRequest({ action: 'search_artworks', params: {} }));
    expect(capturedToolCtxs[0].locale).toBe('en');

    await handler(postRequest({ action: 'search_artworks', params: {}, locale: 'zh' }));
    expect(capturedToolCtxs[1].locale).toBe('zh');

    await handler(postRequest({ action: 'search_artworks', params: {}, locale: 'fr' }));
    expect(capturedToolCtxs[2].locale).toBe('en');
  });

  it('returns success envelope with timestamp and request_id', async () => {
    searchResult = { artworks: [{ id: '1', title_en: 'A' }] };
    const res = await handler(postRequest({ action: 'search_artworks', params: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      action: string;
      data: unknown;
      meta: { timestamp: string; request_id: string };
    };
    expect(body.success).toBe(true);
    expect(body.action).toBe('search_artworks');
    expect(body.data).toEqual({ artworks: [{ id: '1', title_en: 'A' }] });
    expect(typeof body.meta.timestamp).toBe('string');
    expect(typeof body.meta.request_id).toBe('string');
  });

  it('returns 500 QUERY_ERROR when the tool throws', async () => {
    searchResult = Promise.reject(new Error('boom'));
    const res = await handler(postRequest({ action: 'search_artworks', params: {} }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('QUERY_ERROR');
    expect(body.error.message).toMatch(/boom/);
  });
});
