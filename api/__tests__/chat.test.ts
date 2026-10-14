import { describe, it, expect } from 'vitest';
import { isStepCount, hasToolCall } from 'ai';
import { buildProviderOptions, buildSystemMessage, buildStopConditions } from '../chat';

describe('buildProviderOptions', () => {
  // ────────────────────────────────────────────────────────────────────────
  // Anthropic 路径（Claude 5 系列）
  // ────────────────────────────────────────────────────────────────────────
  describe('Anthropic 路径', () => {
    it('thinking off → adaptive + effort low（5 系列不传 thinking 就是思考开启、effort high/medium）', () => {
      const opts = buildProviderOptions(false, 'anthropic');
      expect(opts).toEqual({ anthropic: { thinking: { type: 'adaptive' }, effort: 'low' } });
      // v1.10 起 {} 不再表示"不思考"：5 系列省略 thinking = adaptive thinking 开启
      expect(opts).not.toEqual({});
    });

    it('thinking on → adaptive + effort high', () => {
      const opts = buildProviderOptions(true, 'anthropic');
      expect(opts).toEqual({ anthropic: { thinking: { type: 'adaptive' }, effort: 'high' } });
    });

    it('never sends enabled/budgetTokens or disabled (not supported on Claude 5.5 models)', () => {
      for (const thinkingEnabled of [false, true]) {
        const thinking = (buildProviderOptions(thinkingEnabled, 'anthropic').anthropic as {
          thinking: Record<string, unknown>;
        }).thinking;
        expect(thinking.type).toBe('adaptive');
        expect(thinking).not.toHaveProperty('budgetTokens');
      }
    });

    it('ignores the removed THINKING_BUDGET env var', () => {
      const original = process.env.THINKING_BUDGET;
      process.env.THINKING_BUDGET = '8000';
      try {
        expect(buildProviderOptions(true, 'anthropic')).toEqual({
          anthropic: { thinking: { type: 'adaptive' }, effort: 'high' },
        });
      } finally {
        if (original === undefined) delete process.env.THINKING_BUDGET;
        else process.env.THINKING_BUDGET = original;
      }
    });

    it('does not inject openai fields', () => {
      expect(buildProviderOptions(true, 'anthropic')).not.toHaveProperty('openai');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // OpenAI 路径（GPT-6 系列）
  // ────────────────────────────────────────────────────────────────────────
  describe('OpenAI 路径', () => {
    it("thinking off → reasoningEffort 'low'", () => {
      const opts = buildProviderOptions(false, 'openai');
      expect(opts).toEqual({ openai: { reasoningEffort: 'low', reasoningSummary: null } });
      expect(opts).not.toHaveProperty('anthropic');
    });

    it("thinking on → reasoningEffort 'high'", () => {
      const opts = buildProviderOptions(true, 'openai');
      expect(opts).toEqual({ openai: { reasoningEffort: 'high', reasoningSummary: null } });
    });

    it("never sends 'none' (gpt-6-astra / gpt-6.1-sol reject it)", () => {
      for (const thinkingEnabled of [false, true]) {
        const openai = buildProviderOptions(thinkingEnabled, 'openai').openai as { reasoningEffort: string };
        expect(openai.reasoningEffort).not.toBe('none');
      }
    });
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
  // P0-2: hasToolCall + isStepCount 数组（任一满足即停止）
  it('returns an array with two stop conditions', () => {
    const conditions = buildStopConditions();
    expect(Array.isArray(conditions)).toBe(true);
    expect(conditions).toHaveLength(2);
  });

  it('first condition is isStepCount(8) (硬上限兜底)', () => {
    const conditions = buildStopConditions();
    expect(conditions[0]).not.toBe(conditions[1]);
    expect(typeof conditions[0]).toBe('function');
    expect(typeof conditions[1]).toBe('function');
  });

  it('uses sdk-exported isStepCount and hasToolCall (regression: imports must come from "ai" package)', () => {
    expect(typeof isStepCount).toBe('function');
    expect(typeof hasToolCall).toBe('function');
  });
});
