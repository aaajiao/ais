import { describe, it, expect } from 'vitest';
import { supportsCompactBeta, getProviderName, DEFAULT_MODEL, DEFAULT_EXPANSION_MODEL } from '../model-provider';

/**
 * 守护测试：`compact_20260112` 模型白名单 —— 任何对该 list 的修改都必须经过这里。
 *
 * 历史背景：v1.x 实证，`contextManagement.compact_20260112` 是 Anthropic beta，只有
 * Sonnet 4.6+ / Opus 4.6+/4.7 支持。给 Haiku 4.5 / Sonnet 4.5 发会被服务端拒，
 * 错误以 "Conversation too long" 形式上抛 —— 即使历史为空也失败。
 *
 * 修复后用 supportsCompactBeta(modelId) 显式判断。这组测试**钉死**白名单内容，
 * 防止以后改成 startsWith / 模糊匹配。
 *
 * 维护说明：Anthropic 发布新版本（如 Sonnet 4.7、Haiku 4.6）时查 compaction 文档
 * 确认支持后再扩 list；这里的 "should NOT support" 用例也要同步更新。
 */
describe('supportsCompactBeta — model whitelist', () => {
  it('Sonnet 4.6 supported', () => {
    expect(supportsCompactBeta('claude-sonnet-4-6')).toBe(true);
  });

  it('Opus 4.6 supported', () => {
    expect(supportsCompactBeta('claude-opus-4-6')).toBe(true);
  });

  it('Opus 4.7 supported', () => {
    expect(supportsCompactBeta('claude-opus-4-7')).toBe(true);
  });

  it('mythos preview supported', () => {
    expect(supportsCompactBeta('claude-mythos-preview')).toBe(true);
  });

  it('Haiku 4.5 NOT supported（v1.x 修复触发原因）', () => {
    expect(supportsCompactBeta('claude-haiku-4-5')).toBe(false);
  });

  it('Sonnet 4.5 NOT supported（v1.x 修复触发原因）', () => {
    expect(supportsCompactBeta('claude-sonnet-4-5')).toBe(false);
  });

  it('Opus 4.5 NOT supported', () => {
    expect(supportsCompactBeta('claude-opus-4-5')).toBe(false);
  });

  it('GPT 模型 NOT supported（compact 是 Anthropic 特性）', () => {
    expect(supportsCompactBeta('gpt-5.5')).toBe(false);
    expect(supportsCompactBeta('gpt-5.4-mini')).toBe(false);
  });

  it('未知 / 空 modelId NOT supported（防御默认）', () => {
    expect(supportsCompactBeta('')).toBe(false);
    expect(supportsCompactBeta('claude-future-9-9')).toBe(false);
    expect(supportsCompactBeta('claude-')).toBe(false);
  });

  it('默认主模型 DEFAULT_MODEL 必须支持 compact（否则 contextManagement 注入会拒）', () => {
    expect(supportsCompactBeta(DEFAULT_MODEL)).toBe(true);
  });

  it('默认翻译模型 DEFAULT_EXPANSION_MODEL 不必支持 compact（search-utils 不注入）', () => {
    // 不强求 true 也不强求 false，但要确认它不会被误塞 compact —— 当前 Haiku 4.5 = false
    expect(supportsCompactBeta(DEFAULT_EXPANSION_MODEL)).toBe(false);
  });
});

describe('getProviderName — provider 推断', () => {
  it('claude-* → anthropic', () => {
    expect(getProviderName('claude-sonnet-4-6')).toBe('anthropic');
    expect(getProviderName('claude-haiku-4-5')).toBe('anthropic');
  });

  it('gpt-* → openai', () => {
    expect(getProviderName('gpt-5.5')).toBe('openai');
    expect(getProviderName('gpt-5.4-mini')).toBe('openai');
  });

  it('o1 / o3 / o4 → openai', () => {
    expect(getProviderName('o1-preview')).toBe('openai');
    expect(getProviderName('o3-mini')).toBe('openai');
    expect(getProviderName('o4-mini')).toBe('openai');
  });

  it('未知前缀 fallback anthropic（与 getModel 保持一致）', () => {
    expect(getProviderName('unknown-model')).toBe('anthropic');
  });

  it('空 modelId fallback 默认（claude-sonnet-4-6）→ anthropic', () => {
    expect(getProviderName('')).toBe('anthropic');
  });
});
