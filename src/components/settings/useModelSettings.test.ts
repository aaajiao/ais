import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { formatModelIdForDisplay, useModelSettings } from './useModelSettings';

describe('formatModelIdForDisplay', () => {
  describe('Claude model IDs', () => {
    it('should strip date suffix from claude-sonnet model', () => {
      expect(formatModelIdForDisplay('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5');
    });

    it('should strip date suffix from claude-haiku model', () => {
      expect(formatModelIdForDisplay('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
    });

    it('should strip date suffix from claude-opus model', () => {
      expect(formatModelIdForDisplay('claude-opus-4-5-20251015')).toBe('claude-opus-4-5');
    });

    it('should handle different version numbers', () => {
      expect(formatModelIdForDisplay('claude-sonnet-3-5-20240620')).toBe('claude-sonnet-3-5');
      expect(formatModelIdForDisplay('claude-haiku-3-0-20240307')).toBe('claude-haiku-3-0');
    });
  });

  describe('Non-Claude model IDs', () => {
    it('should return OpenAI model IDs unchanged', () => {
      expect(formatModelIdForDisplay('gpt-4o')).toBe('gpt-4o');
      expect(formatModelIdForDisplay('gpt-4-turbo')).toBe('gpt-4-turbo');
      expect(formatModelIdForDisplay('gpt-3.5-turbo')).toBe('gpt-3.5-turbo');
    });

    it('should return other model IDs unchanged', () => {
      expect(formatModelIdForDisplay('some-other-model')).toBe('some-other-model');
      expect(formatModelIdForDisplay('custom-model-v1')).toBe('custom-model-v1');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(formatModelIdForDisplay('')).toBe('');
    });

    it('should not strip non-date suffixes', () => {
      // This doesn't match the pattern (not 8 digits at the end)
      expect(formatModelIdForDisplay('claude-sonnet-4-5-preview')).toBe('claude-sonnet-4-5-preview');
    });

    it('should handle model IDs without version numbers', () => {
      expect(formatModelIdForDisplay('claude-instant')).toBe('claude-instant');
    });
  });
});

describe('useModelSettings - thinkingEnabled', () => {
  // Bun + happy-dom 下 globalThis.localStorage 的 API 不完整（缺 clear/removeItem），
  // 用 Map 自己实现一个完全合规的 shim，每个测试隔离。
  const makeMemoryStorage = (): Storage => {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    };
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
    // useModelSettings 在挂载时会 fetch /api/models —— 用 vi.stubGlobal 阻断真实请求
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ anthropic: [], openai: [], defaultModel: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
  });

  it('defaults thinkingEnabled to false when localStorage is empty', () => {
    const { result } = renderHook(() => useModelSettings());
    expect(result.current.thinkingEnabled).toBe(false);
  });

  it('reads thinkingEnabled=true from localStorage on init', () => {
    localStorage.setItem('thinking-enabled', 'true');
    const { result } = renderHook(() => useModelSettings());
    expect(result.current.thinkingEnabled).toBe(true);
  });

  it('persists thinkingEnabled to localStorage and re-reads correctly', () => {
    const { result, unmount } = renderHook(() => useModelSettings());
    expect(result.current.thinkingEnabled).toBe(false);

    act(() => {
      result.current.setThinkingEnabled(true);
    });
    expect(result.current.thinkingEnabled).toBe(true);
    expect(localStorage.getItem('thinking-enabled')).toBe('true');

    // 卸载 + 重新挂载 → 仍然为 true
    unmount();
    const { result: result2 } = renderHook(() => useModelSettings());
    expect(result2.current.thinkingEnabled).toBe(true);
  });

  it('toggles back to false and persists', () => {
    localStorage.setItem('thinking-enabled', 'true');
    const { result } = renderHook(() => useModelSettings());
    expect(result.current.thinkingEnabled).toBe(true);

    act(() => {
      result.current.setThinkingEnabled(false);
    });
    expect(result.current.thinkingEnabled).toBe(false);
    expect(localStorage.getItem('thinking-enabled')).toBe('false');
  });
});
