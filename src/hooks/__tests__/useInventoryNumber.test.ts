import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface ChainCall {
  method: string;
  args: unknown[];
}

interface BuilderState {
  table: string;
  calls: ChainCall[];
}

const builderRegistry: BuilderState[] = [];
let nextResponse: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};

function setNextResponse(response: { data?: unknown; error?: unknown }) {
  nextResponse = {
    data: response.data ?? null,
    error: response.error ?? null,
  };
}

function createBuilder(state: BuilderState): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          const result = { data: nextResponse.data, error: nextResponse.error };
          try {
            return Promise.resolve(onFulfilled(result));
          } catch (err) {
            if (onRejected) return Promise.resolve(onRejected(err));
            return Promise.reject(err);
          }
        };
      }
      if (typeof prop === 'symbol') return undefined;
      return (...args: unknown[]) => {
        state.calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

const fromMock = vi.fn((table: string) => {
  const state: BuilderState = { table, calls: [] };
  builderRegistry.push(state);
  return createBuilder(state);
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

import { useInventoryNumber } from '../useInventoryNumber';

async function flushAsync() {
  // Allow the initial fetchExistingNumbers promise to settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  builderRegistry.length = 0;
  fromMock.mockClear();
  setNextResponse({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInventoryNumber - initial fetch', () => {
  it('挂载时从 editions 表加载非空 inventory_number', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() => useInventoryNumber());

    await flushAsync();

    const builder = builderRegistry[0];
    expect(builder.table).toBe('editions');

    const select = builder.calls.find((c) => c.method === 'select');
    expect(select?.args[0]).toBe('id, inventory_number');

    const not = builder.calls.find((c) => c.method === 'not');
    expect(not?.args).toEqual(['inventory_number', 'is', null]);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.existingNumbers).toEqual([
      'AAJ-2024-001',
      'AAJ-2024-002',
    ]);
  });

  it('过滤掉 inventory_number 为 null 的记录', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: null },
      ],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await flushAsync();

    expect(result.current.existingNumbers).toEqual(['AAJ-2024-001']);
  });

  it('生成 suggestion 与 pattern (本年度内递增)', async () => {
    const currentYear = new Date().getFullYear();
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: `AAJ-${currentYear}-001` },
        { id: 'e2', inventory_number: `AAJ-${currentYear}-002` },
      ],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await flushAsync();

    expect(result.current.pattern?.prefix).toBe('AAJ');
    expect(result.current.pattern?.hasYear).toBe(true);
    expect(result.current.suggestion?.nextNumber).toBe(
      `AAJ-${currentYear}-003`
    );
  });

  it('supabase 错误时不抛出，仅 console.error 并退出 loading', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    setNextResponse({ data: null, error: { message: 'db down' } });

    const { result } = renderHook(() => useInventoryNumber());
    await flushAsync();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.existingNumbers).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe('useInventoryNumber - checkNumber (debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('空字符串不触发校验，重置 validation', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber(''));
    expect(result.current.isChecking).toBe(false);
    expect(result.current.validation.isUnique).toBe(true);
    expect(result.current.prefixSuggestion).toBeNull();
  });

  it('防抖：在 debounceMs 之前不更新 validation', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result } = renderHook(() =>
      useInventoryNumber({ debounceMs: 300 })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-001'));
    expect(result.current.isChecking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(result.current.isChecking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.isChecking).toBe(false);
    expect(result.current.validation.isUnique).toBe(false);
  });

  it('重复输入：建议下一个可用编号', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-001'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.validation.isUnique).toBe(false);
    expect(result.current.prefixSuggestion).toBe('AAJ-2024-003');
    expect(result.current.validation.message).toBe('AAJ-2024-003');
  });

  it('前缀输入 (以 - 结尾) 推荐下一个序号', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.prefixSuggestion).toBe('AAJ-2024-003');
  });

  it('唯一编号：validation 通过且 prefixSuggestion=null', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-099'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.validation.isUnique).toBe(true);
    expect(result.current.prefixSuggestion).toBeNull();
  });

  it('快速连续输入只保留最后一次校验结果', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-001'));
    act(() => result.current.checkNumber('AAJ-2024-099'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.validation.isUnique).toBe(true);
  });
});

describe('useInventoryNumber - excludeEditionId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('排除当前 edition 自身的编号 (允许保留同号)', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() =>
      useInventoryNumber({ excludeEditionId: 'e1' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-001'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.validation.isUnique).toBe(true);
  });

  it('排除自身后仍能检测出与其它版本的冲突', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() =>
      useInventoryNumber({ excludeEditionId: 'e1' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-002'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.validation.isUnique).toBe(false);
  });

  it('checkNumberSync 同步排除自身编号', async () => {
    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    const { result } = renderHook(() =>
      useInventoryNumber({ excludeEditionId: 'e1' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.checkNumberSync('AAJ-2024-001').isUnique).toBe(true);
    expect(result.current.checkNumberSync('AAJ-2024-002').isUnique).toBe(false);
    expect(result.current.checkNumberSync('').isUnique).toBe(true);
  });
});

describe('useInventoryNumber - cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('卸载时取消未触发的 debounce 定时器', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result, unmount } = renderHook(() => useInventoryNumber());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.checkNumber('AAJ-2024-099'));

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    unmount();
    expect(clearSpy).toHaveBeenCalled();

    // 推进时间，确认不会发生状态更新（已卸载）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  });
});

describe('useInventoryNumber - applySuggestion / refresh', () => {
  it('applySuggestion 返回当前 suggestion.nextNumber', async () => {
    const currentYear = new Date().getFullYear();
    setNextResponse({
      data: [{ id: 'e1', inventory_number: `AAJ-${currentYear}-001` }],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await flushAsync();

    expect(result.current.applySuggestion()).toBe(`AAJ-${currentYear}-002`);
  });

  it('refresh 重新拉取 existingNumbers', async () => {
    setNextResponse({
      data: [{ id: 'e1', inventory_number: 'AAJ-2024-001' }],
    });

    const { result } = renderHook(() => useInventoryNumber());
    await flushAsync();

    expect(builderRegistry).toHaveLength(1);

    setNextResponse({
      data: [
        { id: 'e1', inventory_number: 'AAJ-2024-001' },
        { id: 'e2', inventory_number: 'AAJ-2024-002' },
      ],
    });

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(builderRegistry).toHaveLength(2);
    expect(result.current.existingNumbers).toEqual([
      'AAJ-2024-001',
      'AAJ-2024-002',
    ]);
  });
});
