import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildProviderOptions } from './chat';

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
    it('does NOT include anthropic.thinking → Claude 路径行为零变化', () => {
      const opts = buildProviderOptions(false);
      // 关键回归断言：anthropic 键必须缺席（或至少不含 thinking）
      // 因为 streamText 会把 providerOptions[providerId] 直接透传给 provider；
      // 缺席 anthropic 键 == provider 走默认路径（不开 thinking）。
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
  });
});
