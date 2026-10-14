import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getModelDisplayName, readStoredModelId, MODEL_STORAGE_KEYS } from './modelIds';

// Bun + happy-dom 下 globalThis.localStorage 的 API 不完整（缺 clear/removeItem），用 Map 实现一个
function makeMemoryStorage(): Storage {
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
}

describe('getModelDisplayName', () => {
  it.each([
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5'],
    ['claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5'],
    ['claude-fable-5-1', 'Claude Fable 5.1'],
    ['claude-opus-5', 'Claude Opus 5'],
    ['gpt-6-astra', 'GPT-6 Astra'],
    ['gpt-6.1-sol', 'GPT-6.1 Sol'],
    ['gpt-6-luna', 'GPT-6 Luna'],
  ])('%s → %s', (modelId, name) => {
    expect(getModelDisplayName(modelId)).toBe(name);
  });

  it('returns unknown ids unchanged', () => {
    expect(getModelDisplayName('custom-model')).toBe('custom-model');
  });
});

describe('readStoredModelId', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
  });

  it('returns an allowed stored model id', () => {
    localStorage.setItem(MODEL_STORAGE_KEYS.chat, 'gpt-6.1-sol');
    expect(readStoredModelId(MODEL_STORAGE_KEYS.chat)).toBe('gpt-6.1-sol');
    expect(localStorage.getItem(MODEL_STORAGE_KEYS.chat)).toBe('gpt-6.1-sol');
  });

  it.each(['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'gpt-5.5', 'o3-mini'])(
    'removes the stale id %s saved by an older version',
    (staleModelId) => {
      localStorage.setItem(MODEL_STORAGE_KEYS.searchExpansion, staleModelId);
      expect(readStoredModelId(MODEL_STORAGE_KEYS.searchExpansion)).toBe('');
      expect(localStorage.getItem(MODEL_STORAGE_KEYS.searchExpansion)).toBeNull();
    }
  );

  it('returns an empty string when nothing is stored', () => {
    expect(readStoredModelId(MODEL_STORAGE_KEYS.extraction)).toBe('');
  });
});
