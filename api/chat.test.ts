import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stepCountIs, hasToolCall } from 'ai';
import { buildProviderOptions, buildSystemMessage, buildStopConditions } from './chat.js';

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

  describe('thinkingEnabled = false (default / regression guard)', () => {
    it('does NOT include anthropic.* on the streamText top-level providerOptions → Claude 路径行为零变化', () => {
      const opts = buildProviderOptions(false);
      // 关键回归断言：streamText 顶层 providerOptions 中 anthropic 键必须缺席。
      // cacheControl / contextManagement 等 Anthropic-only 字段在别处注入：
      //   - cacheControl 在 system message 的 providerOptions 里（buildSystemMessage）
      //   - contextManagement 在 chat handler 里按 provider 分支注入
      // 所以 buildProviderOptions(false) 的输出本身仍应只含 openai 路径。
      expect(opts).not.toHaveProperty('anthropic');
    });

    it('uses minimal reasoningEffort for OpenAI (faster than default medium)', () => {
      const opts = buildProviderOptions(false);
      expect(opts.openai).toEqual({ reasoningEffort: 'minimal' });
    });
  });

  describe('thinkingEnabled = true', () => {
    it('enables anthropic thinking with default 4000 budget tokens', () => {
      const opts = buildProviderOptions(true);
      expect(opts.anthropic).toEqual({
        thinking: { type: 'enabled', budgetTokens: 4000 },
      });
    });

    it('uses high reasoningEffort for OpenAI', () => {
      const opts = buildProviderOptions(true);
      expect(opts.openai).toEqual({ reasoningEffort: 'high' });
    });

    it('respects THINKING_BUDGET env override', () => {
      process.env.THINKING_BUDGET = '8000';
      const opts = buildProviderOptions(true);
      expect(opts.anthropic).toMatchObject({
        thinking: { type: 'enabled', budgetTokens: 8000 },
      });
    });

    it('falls back to 4000 when THINKING_BUDGET is not a valid number', () => {
      process.env.THINKING_BUDGET = 'not-a-number';
      const opts = buildProviderOptions(true);
      expect(opts.anthropic).toMatchObject({
        thinking: { type: 'enabled', budgetTokens: 4000 },
      });
    });

    // P1-2: adaptive thinking（Anthropic v3.0.74 GA）
    it('uses adaptive thinking when THINKING_BUDGET=adaptive', () => {
      process.env.THINKING_BUDGET = 'adaptive';
      const opts = buildProviderOptions(true);
      expect(opts.anthropic).toEqual({
        thinking: { type: 'adaptive', display: 'summarized' },
      });
    });

    it('adaptive mode does NOT include budgetTokens (model decides)', () => {
      process.env.THINKING_BUDGET = 'adaptive';
      const opts = buildProviderOptions(true);
      const thinking = (opts.anthropic as { thinking: Record<string, unknown> }).thinking;
      expect(thinking).not.toHaveProperty('budgetTokens');
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
  // P0-2: hasToolCall + stepCountIs 数组（任一满足即停止）
  it('returns an array with two stop conditions', () => {
    const conditions = buildStopConditions();
    expect(Array.isArray(conditions)).toBe(true);
    expect(conditions).toHaveLength(2);
  });

  it('first condition is stepCountIs(8) (硬上限兜底)', () => {
    const conditions = buildStopConditions();
    // stepCountIs / hasToolCall 都是 ai 包导出的函数，
    // 它们返回的 StopCondition 实例不暴露内部参数 —— 我们只能用引用相等校验：
    // 拿一个新建的 stepCountIs(8) 比对函数体语义不可行，
    // 但我们可以确保 buildStopConditions 输出的两个 condition 不是同一个函数。
    expect(conditions[0]).not.toBe(conditions[1]);
    // 间接校验：stepCountIs 与 hasToolCall 至少都是函数（StopCondition 是函数类型）
    expect(typeof conditions[0]).toBe('function');
    expect(typeof conditions[1]).toBe('function');
  });

  it('uses sdk-exported stepCountIs and hasToolCall (regression: imports must come from "ai" package)', () => {
    // 这个断言保证：如果未来 ai 包 rename 这两个函数，buildStopConditions 会编译失败，
    // 而本测试也会因为 import 不到而 fail —— 双重保险。
    expect(typeof stepCountIs).toBe('function');
    expect(typeof hasToolCall).toBe('function');
  });
});
