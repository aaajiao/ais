import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stepCountIs, hasToolCall } from 'ai';
import { buildProviderOptions, buildSystemMessage, buildStopConditions } from '../chat';

describe('buildProviderOptions', () => {
  const originalBudget = process.env.THINKING_BUDGET;

  beforeEach(() => {
    delete process.env.THINKING_BUDGET;
  });

  afterEach(() => {
    if (originalBudget === undefined) {
      delete process.env.THINKING_BUDGET;
    } else {
      process.env.THINKING_BUDGET = originalBudget;
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Anthropic 路径
  // ────────────────────────────────────────────────────────────────────────
  describe('Anthropic 路径', () => {
    it('thinking off → 返回空对象（Claude 模型行为零变化的关键回归断言）', () => {
      const opts = buildProviderOptions(false, 'claude-sonnet-4-6', 'anthropic');
      expect(opts).toEqual({});
      expect(opts).not.toHaveProperty('anthropic');
    });

    it('thinking on → 默认 budgetTokens 4000', () => {
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      expect(opts.anthropic).toEqual({
        thinking: { type: 'enabled', budgetTokens: 4000 },
      });
    });

    it('thinking on → 不注入 openai 字段', () => {
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      expect(opts).not.toHaveProperty('openai');
    });

    it('thinking on + THINKING_BUDGET=8000 → budgetTokens 覆盖', () => {
      process.env.THINKING_BUDGET = '8000';
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      expect(opts.anthropic).toMatchObject({
        thinking: { type: 'enabled', budgetTokens: 8000 },
      });
    });

    it('thinking on + 无效 THINKING_BUDGET → fallback 4000', () => {
      process.env.THINKING_BUDGET = 'not-a-number';
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      expect(opts.anthropic).toMatchObject({
        thinking: { type: 'enabled', budgetTokens: 4000 },
      });
    });

    it('thinking on + THINKING_BUDGET=adaptive → 走 adaptive 模式（v3.0.74 GA）', () => {
      process.env.THINKING_BUDGET = 'adaptive';
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      expect(opts.anthropic).toEqual({
        thinking: { type: 'adaptive', display: 'summarized' },
      });
    });

    it('adaptive 模式不带 budgetTokens（由模型自决）', () => {
      process.env.THINKING_BUDGET = 'adaptive';
      const opts = buildProviderOptions(true, 'claude-sonnet-4-6', 'anthropic');
      const thinking = (opts.anthropic as { thinking: Record<string, unknown> }).thinking;
      expect(thinking).not.toHaveProperty('budgetTokens');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // OpenAI 路径（v1.2.3 修复 GPT 不调工具问题）
  // ────────────────────────────────────────────────────────────────────────
  describe('OpenAI 路径 — gpt-5.4 / gpt-5.5（项目实际使用的模型）', () => {
    // 项目只用 gpt-5.4 / gpt-5.5（含 -mini 变体）。这两个默认 reasoning_effort='none'，
    // 必须显式给 effort 才能让模型正常调工具。
    const cases = [
      { model: 'gpt-5.4', off: 'low', on: 'high' },
      { model: 'gpt-5.4-mini', off: 'low', on: 'high' },
      { model: 'gpt-5.5', off: 'low', on: 'high' },
      { model: 'gpt-5.5-mini', off: 'low', on: 'high' },
    ] as const;

    for (const { model, off, on } of cases) {
      it(`${model} thinking off → reasoningEffort: '${off}'`, () => {
        const opts = buildProviderOptions(false, model, 'openai');
        expect(opts.openai).toEqual({ reasoningEffort: off });
        expect(opts).not.toHaveProperty('anthropic');
      });

      it(`${model} thinking on → reasoningEffort: '${on}'`, () => {
        const opts = buildProviderOptions(true, model, 'openai');
        expect(opts.openai).toEqual({ reasoningEffort: on });
        expect(opts).not.toHaveProperty('anthropic');
      });
    }
  });

  describe('OpenAI 路径 — 未列出的模型（保守降级）', () => {
    // 项目暂不使用，但保留兜底：未匹配的模型不传 reasoningEffort 字段。
    // 这避免在 gpt-4 系列（不支持该字段）或未知模型上引入兼容性问题。
    const unsupportedModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-5', 'gpt-5-pro', 'o3-mini'];

    for (const model of unsupportedModels) {
      it(`${model} thinking off → 不传任何 providerOptions（{}）`, () => {
        const opts = buildProviderOptions(false, model, 'openai');
        expect(opts).toEqual({});
      });

      it(`${model} thinking on → 不传任何 providerOptions（{}）`, () => {
        const opts = buildProviderOptions(true, model, 'openai');
        expect(opts).toEqual({});
      });
    }
  });
});

describe('buildSystemMessage', () => {
  // P0-1: cacheControl 注入 —— Anthropic 走 ephemeral，OpenAI 不动
  it('returns plain string for openai (no cacheControl in request body)', () => {
    const result = buildSystemMessage('hello', 'openai');
    expect(result).toBe('hello');
  });

  it('returns SystemModelMessage with anthropic.cacheControl=ephemeral for anthropic', () => {
    const result = buildSystemMessage('hello', 'anthropic');
    expect(result).toEqual({
      role: 'system',
      content: 'hello',
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    });
  });

  it('preserves the system prompt content verbatim (anthropic)', () => {
    const prompt = 'Long prompt with\n中文 and special chars: 🎨';
    const result = buildSystemMessage(prompt, 'anthropic');
    expect((result as { content: string }).content).toBe(prompt);
  });

  it('does NOT inject any openai key under message-level providerOptions', () => {
    const result = buildSystemMessage('hello', 'anthropic');
    const opts = (result as { providerOptions: Record<string, unknown> }).providerOptions;
    expect(opts).not.toHaveProperty('openai');
  });
});

describe('buildStopConditions', () => {
  // P0-2: hasToolCall + stepCountIs 数组（任一满足即停止）
  it('returns an array with two stop conditions', () => {
    const conditions = buildStopConditions();
    expect(Array.isArray(conditions)).toBe(true);
    expect(conditions).toHaveLength(2);
  });

  it('first condition is stepCountIs(8) (硬上限兜底)', () => {
    const conditions = buildStopConditions();
    expect(conditions[0]).not.toBe(conditions[1]);
    expect(typeof conditions[0]).toBe('function');
    expect(typeof conditions[1]).toBe('function');
  });

  it('uses sdk-exported stepCountIs and hasToolCall (regression: imports must come from "ai" package)', () => {
    expect(typeof stepCountIs).toBe('function');
    expect(typeof hasToolCall).toBe('function');
  });
});
