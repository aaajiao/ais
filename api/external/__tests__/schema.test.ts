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

  it('marks every non-required param as nullable: true (v1.3.4 — OpenAI strict-mode compatibility)', async () => {
    // Why: external clients running OpenAI structured outputs strict mode need
    // the schema to advertise null as a legal value, otherwise their LLM will
    // pad every optional field with a type default ('', 0, first enum value)
    // and silently break the search. Marking nullable: true tells those clients
    // "you can pass null" — same fix as v1.3.1 did internally for our chat.
    const res = await handler(new Request('http://localhost/api/external/v1/schema', { method: 'GET' }));
    const body = (await res.json()) as {
      actions: Record<string, { params?: Record<string, { nullable?: boolean; required?: boolean }> }>;
    };
    for (const [actionName, action] of Object.entries(body.actions)) {
      const params = action.params || {};
      for (const [paramName, param] of Object.entries(params)) {
        if (param.required === true) continue; // required params (get_statistics.type) skip nullable check
        expect(
          param.nullable,
          `${actionName}.${paramName} must be marked nullable: true so OpenAI strict-mode clients know null is legal`,
        ).toBe(true);
      }
    }
  });

  it('exposes parameter_handling section explaining "pass null, not empty/0" (v1.3.4)', async () => {
    const res = await handler(new Request('http://localhost/api/external/v1/schema', { method: 'GET' }));
    const body = (await res.json()) as {
      parameter_handling?: { description?: string; examples?: { good?: unknown; bad?: unknown } };
    };
    expect(body.parameter_handling).toBeDefined();
    expect(body.parameter_handling?.description).toMatch(/null/i);
    expect(body.parameter_handling?.description).toMatch(/empty string|""/);
    expect(body.parameter_handling?.examples?.good).toBeDefined();
    expect(body.parameter_handling?.examples?.bad).toBeDefined();
  });
});
