import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_EXPANSION_MODEL, DEFAULT_MODEL, isAllowedModelId, resolveModelId } from '../model-ids';
import * as clientModelIds from '../../../src/lib/modelIds';

/**
 * 守护测试：只允许 Claude 5 系列与 GPT-6 系列（v1.10 起）。
 * api/lib/model-ids.ts 是来源，src/lib/modelIds.ts 是前端镜像（前端不能 import api/），
 * 两边规则与默认值必须一致。
 */
const ALLOWED = [
  'claude-fable-5-1',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-6.1-sol',
];

const REJECTED = [
  // Claude 4 及更早
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-mythos-preview',
  // 带日期后缀的快照
  'claude-sonnet-5-5-20260928',
  // GPT-5 / GPT-4 / o 系列
  'gpt-5.5',
  'gpt-5.6-sol',
  'gpt-4o',
  'o3-mini',
  'o4-mini',
  // GPT-6 的非对话变体
  'gpt-6-chat-latest',
  'gpt-6-chat',
  'gpt-6-codex',
  'gpt-6-sol-2026-09-22',
  // 其他
  '',
  'claude-',
  'gpt-6',
];

describe('isAllowedModelId', () => {
  it.each(ALLOWED)('allows %s', (modelId) => {
    expect(isAllowedModelId(modelId)).toBe(true);
  });

  it.each(REJECTED)('rejects %s', (modelId) => {
    expect(isAllowedModelId(modelId)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isAllowedModelId(undefined)).toBe(false);
    expect(isAllowedModelId(null)).toBe(false);
    expect(isAllowedModelId(42)).toBe(false);
  });

  it('defaults are allowed models', () => {
    expect(isAllowedModelId(DEFAULT_MODEL)).toBe(true);
    expect(isAllowedModelId(DEFAULT_EXPANSION_MODEL)).toBe(true);
  });
});

describe('resolveModelId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an allowed model id', () => {
    expect(resolveModelId('gpt-6.1-sol', DEFAULT_MODEL)).toBe('gpt-6.1-sol');
  });

  it('coerces a stale stored id to the fallback and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveModelId('claude-sonnet-4-6', DEFAULT_MODEL)).toBe(DEFAULT_MODEL);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('claude-sonnet-4-6'));
  });

  it('uses the fallback silently for empty values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveModelId('', DEFAULT_EXPANSION_MODEL)).toBe(DEFAULT_EXPANSION_MODEL);
    expect(resolveModelId(undefined, DEFAULT_EXPANSION_MODEL)).toBe(DEFAULT_EXPANSION_MODEL);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('src/lib/modelIds.ts parity', () => {
  it('client defaults match the server defaults', () => {
    expect(clientModelIds.DEFAULT_CHAT_MODEL).toBe(DEFAULT_MODEL);
    expect(clientModelIds.DEFAULT_SEARCH_EXPANSION_MODEL).toBe(DEFAULT_EXPANSION_MODEL);
  });

  it.each([...ALLOWED, ...REJECTED])('client and server agree on %s', (modelId) => {
    expect(clientModelIds.isAllowedModelId(modelId)).toBe(isAllowedModelId(modelId));
  });
});
