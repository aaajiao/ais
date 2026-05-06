import { describe, it, expect } from 'vitest';
import { createExecuteUpdateTool } from '../execute-update';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CapturedCall {
  table: string;
  op: 'select' | 'update' | 'insert';
  payload?: unknown;
  filters: Array<{ col: string; val: unknown }>;
  selectArgs?: string;
}

interface MockOptions {
  selectResult?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
}

function createMockSupabase(opts: MockOptions = {}) {
  const calls: CapturedCall[] = [];
  const selectResult = opts.selectResult ?? { data: null, error: null };
  const updateResult = opts.updateResult ?? { data: null, error: null };
  const insertResult = opts.insertResult ?? { data: null, error: null };

  const supabase = {
    from(table: string) {
      return {
        select(arg?: string) {
          const call: CapturedCall = { table, op: 'select', filters: [], selectArgs: arg };
          calls.push(call);
          const builder = {
            eq(col: string, val: unknown) {
              call.filters.push({ col, val });
              return builder;
            },
            single() {
              return Promise.resolve(selectResult);
            },
          };
          return builder;
        },
        update(payload: unknown) {
          const call: CapturedCall = { table, op: 'update', payload, filters: [] };
          calls.push(call);
          const builder = {
            eq(col: string, val: unknown) {
              call.filters.push({ col, val });
              return builder;
            },
            select() {
              return {
                single() {
                  return Promise.resolve(updateResult);
                },
              };
            },
          };
          return builder;
        },
        insert(payload: unknown) {
          const call: CapturedCall = { table, op: 'insert', payload, filters: [] };
          calls.push(call);
          return Promise.resolve(insertResult);
        },
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

function getExec(tool: ReturnType<typeof createExecuteUpdateTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('execute_edition_update', () => {
  it('rejects when confirmed=false (write gating)', async () => {
    const { supabase, calls } = createMockSupabase();
    const tool = createExecuteUpdateTool({ supabase, userId: 'u-1', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'sold' },
      confirmed: false,
    })) as { error?: string };
    expect(result.error).toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it('rejects when the edition belongs to another user', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          artworks: { user_id: 'OTHER-user' },
        },
        error: null,
      },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'sold' },
      confirmed: true,
    })) as { error?: string };
    expect(result.error).toBeTruthy();
    expect(calls.find((c) => c.op === 'update')).toBeUndefined();
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });

  it('rejects when the select returns no row (not found / soft-deleted)', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: { data: null, error: { message: 'not found' } },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-missing',
      updates: { status: 'sold' },
      confirmed: true,
    })) as { error?: string };
    expect(result.error).toBeTruthy();
    expect(calls.find((c) => c.op === 'update')).toBeUndefined();
  });

  it('joins artworks!inner(user_id) when looking up the edition', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1', status: 'in_studio' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { notes: 'hi' },
      confirmed: true,
    });
    const select = calls.find((c) => c.op === 'select' && c.table === 'editions');
    expect(select).toBeDefined();
    expect(select?.selectArgs).toContain('artworks!inner(user_id)');
    expect(select?.filters).toEqual([{ col: 'id', val: 'ed-1' }]);
  });

  it('records edition_history with action=sold when status changes to sold', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          location_id: 'loc-old',
          artworks: { user_id: 'me' },
        },
        error: null,
      },
      updateResult: { data: { id: 'ed-1', status: 'sold' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'sold', sale_price: 1000, sale_currency: 'USD', buyer_name: 'Alice' },
      confirmed: true,
    })) as { success?: boolean };
    expect(result.success).toBe(true);

    const insert = calls.find((c) => c.op === 'insert' && c.table === 'edition_history');
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.action).toBe('sold');
    expect(payload.from_status).toBe('in_studio');
    expect(payload.to_status).toBe('sold');
    expect(payload.related_party).toBe('Alice');
    expect(payload.price).toBe(1000);
    expect(payload.currency).toBe('USD');
    expect(payload.created_by).toBe('me');
    expect(payload.edition_id).toBe('ed-1');
  });

  it('records edition_history with action=consigned when status -> at_gallery', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1', status: 'at_gallery' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'at_gallery' },
      confirmed: true,
    });
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'edition_history');
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.action).toBe('consigned');
  });

  it('records edition_history with action=returned for at_gallery -> in_studio', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'at_gallery', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1', status: 'in_studio' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'in_studio' },
      confirmed: true,
    });
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'edition_history');
    expect((insert!.payload as Record<string, unknown>).action).toBe('returned');
  });

  it('records location_change history when only location changes', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          location_id: 'old-loc',
          artworks: { user_id: 'me' },
        },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { location_id: 'new-loc' },
      confirmed: true,
    });
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'edition_history');
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.action).toBe('location_change');
    expect(payload.from_location).toBe('old-loc');
    expect(payload.to_location).toBe('new-loc');
  });

  it('does not insert history when neither status nor location nor condition changes', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          location_id: 'loc-1',
          condition: 'good',
          artworks: { user_id: 'me' },
        },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { notes: 'just a note' },
      confirmed: true,
    });
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });

  it('inserts a condition_update history row when condition changes', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', condition: 'good', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { condition: 'damaged' },
      confirmed: true,
    });
    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'edition_history');
    expect(inserts.length).toBe(1);
    expect((inserts[0].payload as Record<string, unknown>).action).toBe('condition_update');
  });

  it('maps sold_at -> sale_date in the update payload', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { sold_at: '2025-02-01' },
      confirmed: true,
    });
    const update = calls.find((c) => c.op === 'update' && c.table === 'editions');
    const payload = update!.payload as Record<string, unknown>;
    expect(payload.sale_date).toBe('2025-02-01');
    expect(payload.sold_at).toBeUndefined();
  });

  it('returns the supabase update error message verbatim', async () => {
    const { supabase } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: null, error: { message: 'permission denied' } },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: { status: 'sold' },
      confirmed: true,
    })) as { error?: string };
    expect(result.error).toBe('permission denied');
  });

  // --- v1.3.2 regression: OpenAI strict default-payload defense ---

  it('all-null payload returns "no fields to update" error and skips DB writes', async () => {
    const { supabase, calls } = createMockSupabase();
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: {
        status: null,
        location_id: null,
        sale_price: null,
        sale_currency: null,
        buyer_name: null,
        sold_at: null,
        notes: null,
        condition: null,
        condition_notes: null,
        storage_detail: null,
        consignment_start: null,
        consignment_end: null,
        loan_start: null,
        loan_end: null,
      },
      confirmed: true,
    })) as { error?: string };
    expect(result.error).toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it('default-padded payload (empty strings, 0, null) only updates fields user actually mentioned', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          location_id: 'loc-old',
          condition: 'good',
          notes: 'existing note',
          artworks: { user_id: 'me' },
        },
        error: null,
      },
      updateResult: { data: { id: 'ed-1', status: 'sold' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    // Simulate GPT strict-mode default-padded payload: user only said "mark as sold"
    // but the model also sent default values for every other optional field
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: {
        status: 'sold',
        location_id: '',
        sale_price: 0,
        sale_currency: '',
        buyer_name: '',
        sold_at: '',
        notes: '',
        condition: '',
        condition_notes: '',
        storage_detail: '',
        consignment_start: '',
        consignment_end: '',
        loan_start: '',
        loan_end: '',
      },
      confirmed: true,
    });
    const update = calls.find((c) => c.op === 'update' && c.table === 'editions');
    expect(update).toBeDefined();
    const payload = update!.payload as Record<string, unknown>;
    // status was actually mentioned, so it should be in the payload
    expect(payload.status).toBe('sold');
    // updated_at is always set
    expect(payload.updated_at).toBeDefined();
    // EVERY other field MUST be absent — never write '' to UUID FK / 0 to price / '' to date
    expect(payload).not.toHaveProperty('location_id');
    expect(payload).not.toHaveProperty('sale_price');
    expect(payload).not.toHaveProperty('sale_currency');
    expect(payload).not.toHaveProperty('buyer_name');
    expect(payload).not.toHaveProperty('sale_date');
    expect(payload).not.toHaveProperty('sold_at');
    expect(payload).not.toHaveProperty('notes');
    expect(payload).not.toHaveProperty('condition');
    expect(payload).not.toHaveProperty('condition_notes');
    expect(payload).not.toHaveProperty('storage_detail');
    expect(payload).not.toHaveProperty('consignment_start');
    expect(payload).not.toHaveProperty('consignment_end');
    expect(payload).not.toHaveProperty('loan_start');
    expect(payload).not.toHaveProperty('loan_end');
  });

  it('never writes empty string to UUID FK column location_id', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { notes: 'updated note', location_id: '' },
      confirmed: true,
    });
    const update = calls.find((c) => c.op === 'update' && c.table === 'editions');
    const payload = update!.payload as Record<string, unknown>;
    expect(payload.location_id).toBeUndefined();
    expect(payload).not.toHaveProperty('location_id');
    // notes (real value) should be set
    expect(payload.notes).toBe('updated note');
  });

  it('does not write sale_price=0 (treats 0 as "unset")', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { notes: 'x', sale_price: 0 },
      confirmed: true,
    });
    const update = calls.find((c) => c.op === 'update' && c.table === 'editions');
    const payload = update!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('sale_price');
  });

  it('does not write empty-string date fields to date columns', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: { id: 'ed-1', status: 'in_studio', artworks: { user_id: 'me' } },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: {
        notes: 'x',
        sold_at: '',
        consignment_start: '',
        consignment_end: '',
        loan_start: '',
        loan_end: '',
      },
      confirmed: true,
    });
    const update = calls.find((c) => c.op === 'update' && c.table === 'editions');
    const payload = update!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('sale_date');
    expect(payload).not.toHaveProperty('sold_at');
    expect(payload).not.toHaveProperty('consignment_start');
    expect(payload).not.toHaveProperty('consignment_end');
    expect(payload).not.toHaveProperty('loan_start');
    expect(payload).not.toHaveProperty('loan_end');
  });

  it('does not insert status_change history when default-padded status equals current status', async () => {
    const { supabase, calls } = createMockSupabase({
      selectResult: {
        data: {
          id: 'ed-1',
          status: 'in_studio',
          location_id: 'loc-1',
          condition: 'good',
          artworks: { user_id: 'me' },
        },
        error: null,
      },
      updateResult: { data: { id: 'ed-1' }, error: null },
    });
    const tool = createExecuteUpdateTool({ supabase, userId: 'me', locale: 'zh' });
    // GPT default-pads status to 'in_studio' (first/default enum value), but it equals current
    await getExec(tool)({
      edition_id: 'ed-1',
      updates: { notes: 'just adding a note', status: 'in_studio' },
      confirmed: true,
    });
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });
});
