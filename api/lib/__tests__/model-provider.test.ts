import { describe, it, expect } from 'vitest';
import {
  supportsCompactBeta,
  getProviderName,
  getReasoningProviderOptions,
  DEFAULT_MODEL,
  DEFAULT_EXPANSION_MODEL,
} from '../model-provider';

/**
 * 守护测试：`compact_20260112` 模型白名单 —— 任何对该 list 的修改都必须经过这里。
 *
 * 历史背景：v1.x 实证，`contextManagement.compact_20260112` 是 Anthropic beta，只有
 * 部分模型支持。给不支持的模型（当年是 Haiku 4.5 / Sonnet 4.5）发会被服务端拒，
 * 错误以 "Conversation too long" 形式上抛 —— 即使历史为空也失败。
 *
 * 修复后用 supportsCompactBeta(modelId) 显式判断。这组测试**钉死**白名单内容，
 * 防止以后改成 startsWith / 模糊匹配。
 *
 * 维护说明：白名单只列允许使用的模型（v1.10.2 起是 Claude 5.1 / 5.5 代）。Anthropic
 * 发布新版本时查 compaction 文档确认支持后再扩 list；"NOT supported" 用例也要同步更新。
 */
describe('supportsCompactBeta — model whitelist', () => {
  it.each([
    'claude-fable-5-1',
    'claude-mythos-5-1',
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
  ])('%s supported', (modelId) => {
    expect(supportsCompactBeta(modelId)).toBe(true);
  });

  it('4 系列与 mythos-preview 已移出白名单（不再允许使用）', () => {
    expect(supportsCompactBeta('claude-sonnet-4-6')).toBe(false);
    expect(supportsCompactBeta('claude-opus-4-7')).toBe(false);
    expect(supportsCompactBeta('claude-haiku-4-5')).toBe(false);
    expect(supportsCompactBeta('claude-mythos-preview')).toBe(false);
  });

  it('5.0 代已移出白名单（v1.10.2 起不再允许使用）', () => {
    for (const modelId of ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-mythos-5']) {
      expect(supportsCompactBeta(modelId)).toBe(false);
    }
  });

  it('GPT 模型 NOT supported（compact 是 Anthropic 特性）', () => {
    expect(supportsCompactBeta('gpt-6.1-sol')).toBe(false);
    expect(supportsCompactBeta('gpt-6-astra')).toBe(false);
  });

  it('未知 / 空 modelId NOT supported（防御默认，不靠前缀推断）', () => {
    expect(supportsCompactBeta('')).toBe(false);
    expect(supportsCompactBeta('claude-sonnet-5-6')).toBe(false);
    expect(supportsCompactBeta('claude-future-9-9')).toBe(false);
    expect(supportsCompactBeta('claude-')).toBe(false);
  });

  it('默认主模型 DEFAULT_MODEL 必须支持 compact（否则 contextManagement 注入会拒）', () => {
    expect(supportsCompactBeta(DEFAULT_MODEL)).toBe(true);
  });

  it('默认翻译模型 DEFAULT_EXPANSION_MODEL 也在白名单内（Haiku 5.5；search-utils 本身不注入 compact）', () => {
    expect(supportsCompactBeta(DEFAULT_EXPANSION_MODEL)).toBe(true);
  });
});

describe('getProviderName — provider 推断', () => {
  it('claude-* → anthropic', () => {
    expect(getProviderName('claude-sonnet-5-5')).toBe('anthropic');
    expect(getProviderName('claude-haiku-5-5')).toBe('anthropic');
  });

  it('gpt-* → openai', () => {
    expect(getProviderName('gpt-6-astra')).toBe('openai');
    expect(getProviderName('gpt-6.1-sol')).toBe('openai');
  });

  it('未知前缀 fallback anthropic（与 getModel 保持一致）', () => {
    expect(getProviderName('unknown-model')).toBe('anthropic');
  });

  it('空 modelId → anthropic（DEFAULT_MODEL 的 provider）', () => {
    expect(getProviderName('')).toBe('anthropic');
  });
});

describe('getReasoningProviderOptions — 推理强度', () => {
  it.each([
    ['anthropic', 'low', { anthropic: { thinking: { type: 'adaptive' }, effort: 'low' } }],
    ['anthropic', 'high', { anthropic: { thinking: { type: 'adaptive' }, effort: 'high' } }],
    ['openai', 'low', { openai: { reasoningEffort: 'low', reasoningSummary: null } }],
    ['openai', 'high', { openai: { reasoningEffort: 'high', reasoningSummary: null } }],
  ] as const)('%s %s', (provider, level, expected) => {
    expect(getReasoningProviderOptions(provider, level)).toEqual(expected);
  });
});
