import { describe, it, expect } from 'vitest';
import { createUpdateConfirmationTool } from '../update-confirmation';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CapturedCall {
  table: string;
  selectArgs?: string;
  filters: Array<{ col: string; val: unknown }>;
}

interface MockOptions {
  selectResult?: { data: unknown; error: unknown };
}

function createMockSupabase(opts: MockOptions = {}) {
  const calls: CapturedCall[] = [];
  const selectResult = opts.selectResult ?? {
    data: {
      id: 'ed-1',
      edition_number: 1,
      status: 'in_studio',
      artworks: { title_en: 'X', title_cn: '', edition_total: 5, user_id: 'me' },
      locations: { name: 'Studio' },
    },
    error: null,
  };
  const supabase = {
    from(table: string) {
      return {
        select(arg?: string) {
          const call: CapturedCall = { table, filters: [], selectArgs: arg };
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
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

function getExec(tool: ReturnType<typeof createUpdateConfirmationTool>) {
  return (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute;
}

describe('generate_update_confirmation default-payload defense', () => {
  it('rejects all-null payload as "no fields to update"', async () => {
    const { supabase, calls } = createMockSupabase();
    const tool = createUpdateConfirmationTool({ supabase, userId: 'me', locale: 'zh' });
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
      },
      reason: 'r',
    })) as { error?: string };
    expect(result.error).toBeTruthy();
    // Should not even hit supabase
    expect(calls.length).toBe(0);
  });

  it('confirmation card excludes default-padded empty fields', async () => {
    const { supabase } = createMockSupabase();
    const tool = createUpdateConfirmationTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
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
      reason: '已售出',
    })) as { type?: string; updates?: Record<string, unknown> };
    expect(result.type).toBe('confirmation_card');
    expect(result.updates).toEqual({ status: 'sold' });
    // No fake "condition: excellent" or "location_id: ''" in the card the user sees
    expect(result.updates).not.toHaveProperty('condition');
    expect(result.updates).not.toHaveProperty('location_id');
    expect(result.updates).not.toHaveProperty('sale_price');
    expect(result.updates).not.toHaveProperty('notes');
  });

  it('preserves multiple real user-mentioned fields', async () => {
    const { supabase } = createMockSupabase();
    const tool = createUpdateConfirmationTool({ supabase, userId: 'me', locale: 'zh' });
    const result = (await getExec(tool)({
      edition_id: 'ed-1',
      updates: {
        status: 'sold',
        sale_price: 12000,
        sale_currency: 'USD',
        buyer_name: 'Alice',
        // padded:
        location_id: '',
        condition: '',
        notes: '',
      },
      reason: '出售给 Alice',
    })) as { updates?: Record<string, unknown> };
    expect(result.updates).toEqual({
      status: 'sold',
      sale_price: 12000,
      sale_currency: 'USD',
      buyer_name: 'Alice',
    });
  });
});
