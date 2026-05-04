import { describe, it, expect } from 'vitest';
import handler from '../v1/schema';

describe('external/v1/schema (GET)', () => {
  it('returns 405 for non-GET methods', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/schema', { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('handles CORS preflight (OPTIONS) with 204 + CORS headers', async () => {
    const res = await handler(
      new Request('http://localhost/api/external/v1/schema', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns the schema with available actions and auth info', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/schema', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      authentication: { type: string; header: string };
      actions: Record<string, unknown>;
    };
    expect(body.name).toBeTruthy();
    expect(body.authentication.type).toBe('api_key');
    expect(body.authentication.header).toBe('X-API-Key');
    expect(Object.keys(body.actions)).toEqual(
      expect.arrayContaining([
        'search_artworks',
        'search_editions',
        'search_locations',
        'search_history',
        'get_statistics',
      ]),
    );
  });

  it('does not advertise any write actions (no execute_/import_/export_ etc.)', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/schema', { method: 'GET' }));
    const body = (await res.json()) as { actions: Record<string, unknown> };
    const names = Object.keys(body.actions);
    for (const n of names) {
      expect(n.startsWith('execute_')).toBe(false);
      expect(n.startsWith('import_')).toBe(false);
      expect(n.startsWith('export_')).toBe(false);
      expect(n.startsWith('generate_')).toBe(false);
    }
  });
});
