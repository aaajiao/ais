import { describe, it, expect } from 'vitest';
import {
  buildProviderOptions,
  buildSystemMessage,
  buildStopConditions,
  buildStepLogPayload,
  truncateForLog,
} from '../chat';
import { getSystemPromptByProvider } from '../lib/system-prompt';

/**
 * Integration / contract tests (v1.2.4):
 *   getSystemPromptByProvider + buildProviderOptions + buildSystemMessage 协同 contract
 *
 * 这些测试**不**调真 streamText（mock 太重，价值低）。它们守护的契约是：
 *   1. anthropic 路径仍然是中文 imperative 风格（v1.2.3 行为）
 *   2. openai 路径是英文 + tool preambles + few-shot 示例（v1.2.4 引入）
 *   3. 两个路径都包含核心业务规则（status / 确认卡片）
 *   4. providerOptions / system message / stop conditions 三件套未被破坏
 *
 * 这一层测试如果通过，配合 system-prompt.test.ts 的细粒度断言、search-editions.test.ts 的
 * 三段式 hint 守护，就足以让 GPT 路径的 system prompt 不会被无意中回退到 v1.2.3 中文版。
 */

describe('chat integration — per-provider system prompt contract (v1.2.4)', () => {
  describe('anthropic path keeps v1.2.3 imperative style', () => {
    const prompt = getSystemPromptByProvider('anthropic', 'aaajiao');

    it('includes the Chinese imperative tool routing block', () => {
      expect(prompt).toContain('工具调用强制路由');
      expect(prompt).toContain('先调用工具再回答');
    });

    it('mentions search_editions location parameter in Chinese', () => {
      expect(prompt).toMatch(/location 参数/);
    });

    it('includes confirmation card requirement (Chinese)', () => {
      expect(prompt).toContain('确认卡片');
    });

    it('does NOT contain the english tool preamble keywords', () => {
      expect(prompt).not.toMatch(/USE search_editions DIRECTLY/);
      expect(prompt).not.toMatch(/DO NOT call search_locations first/i);
    });

    it('does NOT contain the openai null-instruction (parity guard)', () => {
      // The "Pass null for unused parameters" rule is OpenAI-only — Anthropic
      // path must remain byte-identical to v1.2.3 (Sonnet behavior is locked).
      expect(prompt).not.toMatch(/Pass\s+`?null`?\s+for any tool parameter/i);
      expect(prompt).not.toMatch(/DO NOT use empty string/);
    });
  });

  describe('openai path uses tool preambles + english + few-shot', () => {
    const prompt = getSystemPromptByProvider('openai', 'aaajiao');

    it('starts in English ("You are the AI assistant")', () => {
      expect(prompt.startsWith('You are the AI assistant')).toBe(true);
    });

    it('contains the explicit "USE search_editions DIRECTLY" instruction', () => {
      expect(prompt).toContain('USE search_editions DIRECTLY');
    });

    it('contains the negative instruction "DO NOT call search_locations first"', () => {
      expect(prompt).toMatch(/DO NOT call search_locations first/);
    });

    it('contains the london few-shot example (the key GPT-5 failure mode)', () => {
      expect(prompt).toContain('在 london 画廊有哪些作品');
      expect(prompt).toMatch(/search_editions\(\{ location: ['"]London['"] \}\)/);
    });

    it('contains the sale-recording few-shot (search → generate_update_confirmation)', () => {
      // From example 3 in the prompt
      expect(prompt).toMatch(/Alice/);
      expect(prompt).toMatch(/generate_update_confirmation/);
    });

    it('uses condition→action markdown table (key style differentiator)', () => {
      expect(prompt).toMatch(/\|\s*If the user mentions/);
    });

    it('explicitly instructs to use null for unused parameters (v1.3.1 strict-mode fix)', () => {
      // Regression guard for the OpenAI strict structured outputs bug:
      // GPT was filling optional fields with type defaults ('', 0, first enum value)
      // because @ai-sdk/openai's JSON schema does not mark .optional() as nullable.
      // Prompt-level fix: tell GPT explicitly that null = unset.
      expect(prompt).toMatch(/Pass\s+`?null`?/);
      expect(prompt).toMatch(/DO NOT use empty string|DO NOT use\s+`?""`?|DO NOT use\s+`?0`?/);
      // The search reverse example must show what NOT to do (default-padded call)
      expect(prompt).toMatch(/edition_type:\s*['"]unique['"]/);
      expect(prompt).toMatch(/edition_number:\s*0/);
    });

    it('parameter passing rule covers update + export tools, not just search (v1.3.3)', () => {
      // After v1.3.2 made update / execute / export tools strict-mode safe at the
      // schema layer, the prompt must explicitly tell GPT that the same "no defaults"
      // rule applies — otherwise GPT can still pad updates with `condition: 'excellent'`,
      // `location_id: ''`, etc. which OVERWRITE database values (worse than search).
      // Section title must NOT be limited to "for search tools" anymore.
      expect(prompt).toMatch(/Parameter passing rules.*ALL tools/i);
      expect(prompt).not.toMatch(/Parameter passing rules\s*—\s*CRITICAL for search tools/i);
      // Update tools section: must call out the data-overwrite risk
      expect(prompt).toMatch(/Update tools/);
      expect(prompt).toMatch(/OVERWRITE/);
      expect(prompt).toMatch(/location_id:\s*['"]{2}/);
      // Export tools mentioned (so all 3 tool families covered)
      expect(prompt).toMatch(/Export tools/);
    });
  });

  describe('shared business rules — both prompts must include these', () => {
    const anthropicPrompt = getSystemPromptByProvider('anthropic', 'TestArtist');
    const openaiPrompt = getSystemPromptByProvider('openai', 'TestArtist');

    it('both inject the artistName', () => {
      expect(anthropicPrompt).toMatch(/TestArtist/);
      expect(openaiPrompt).toMatch(/TestArtist/);
    });

    it('both list all 9 edition status codes', () => {
      const statuses = [
        'in_production',
        'in_studio',
        'at_gallery',
        'at_museum',
        'in_transit',
        'sold',
        'gifted',
        'lost',
        'damaged',
      ];
      for (const s of statuses) {
        expect(anthropicPrompt).toContain(s);
        expect(openaiPrompt).toContain(s);
      }
    });

    it('both reference the confirmation-card workflow', () => {
      expect(anthropicPrompt).toMatch(/确认卡片/);
      expect(openaiPrompt).toMatch(/generate_update_confirmation/);
      expect(openaiPrompt).toMatch(/confirmation/i);
    });

    it('both list the same NOT-supported operations', () => {
      // inventory numbers / certificate numbers / locations are UI-only
      expect(anthropicPrompt).toMatch(/库存编号/);
      expect(openaiPrompt).toMatch(/inventory numbers/i);

      expect(anthropicPrompt).toMatch(/证书编号/);
      expect(openaiPrompt).toMatch(/certificate numbers/i);
    });

    it('both reference all 4 read-only search tools by name', () => {
      for (const tool of ['search_editions', 'search_artworks', 'get_statistics', 'search_history']) {
        expect(anthropicPrompt).toContain(tool);
        expect(openaiPrompt).toContain(tool);
      }
    });
  });

  describe('three-piece infrastructure stack still wired correctly', () => {
    it('buildSystemMessage(anthropic) wraps prompt with cacheControl=ephemeral', () => {
      const sysMsg = buildSystemMessage(
        getSystemPromptByProvider('anthropic'),
        'anthropic'
      );
      expect(typeof sysMsg).toBe('object');
      expect((sysMsg as unknown as { providerOptions: { anthropic: { cacheControl: { type: string } } } })
        .providerOptions.anthropic.cacheControl.type).toBe('ephemeral');
    });

    it('buildSystemMessage(openai) returns plain string (no cacheControl)', () => {
      const sysMsg = buildSystemMessage(getSystemPromptByProvider('openai'), 'openai');
      expect(typeof sysMsg).toBe('string');
      // sanity: the string still contains the GPT-5 preamble
      expect(sysMsg as string).toMatch(/USE search_editions DIRECTLY/);
    });

    it('buildProviderOptions(anthropic, off) STILL returns {} (key v1.2.3 regression assertion)', () => {
      // 这条断言是 v1.2.3 hotfix 的核心保护项 —— 如果未来某个 PR 误改成
      // { anthropic: { thinking: { type: 'disabled' } } } 之类的写法，Claude 行为会变。
      expect(buildProviderOptions(false, 'claude-sonnet-4-6', 'anthropic')).toEqual({});
    });

    it('buildProviderOptions(openai gpt-5.4, off) returns reasoningEffort: low', () => {
      expect(buildProviderOptions(false, 'gpt-5.4', 'openai')).toEqual({
        openai: { reasoningEffort: 'low' },
      });
    });

    it('buildStopConditions returns 2-element array (stepCountIs + hasToolCall)', () => {
      const conditions = buildStopConditions();
      expect(conditions).toHaveLength(2);
    });
  });
});

describe('buildStepLogPayload — onStepFinish observability (v1.2.4)', () => {
  it('captures stepNumber, model, toolCalls (name+input), toolResults (name+output)', () => {
    const payload = buildStepLogPayload(
      {
        stepNumber: 0,
        model: { provider: 'openai', modelId: 'gpt-5.4' },
        toolCalls: [
          { toolName: 'search_editions', input: { location: 'London' } },
        ],
        toolResults: [
          { toolName: 'search_editions', output: { editions: [], hint: 'has_editions' } },
        ],
        finishReason: 'tool-calls',
        usage: { totalTokens: 1234 },
      },
      'user-123',
      'gpt-5.4'
    );
    expect(payload.userId).toBe('user-123');
    expect(payload.modelId).toBe('gpt-5.4');
    expect(payload.stepNumber).toBe(0);
    expect(payload.stepProvider).toBe('openai');
    expect(payload.toolCalls).toEqual([
      { name: 'search_editions', input: '{"location":"London"}' },
    ]);
    expect(payload.toolResults).toHaveLength(1);
    expect(payload.finishReason).toBe('tool-calls');
  });

  it('handles undefined toolCalls / toolResults gracefully (text-only step)', () => {
    const payload = buildStepLogPayload(
      { stepNumber: 1, finishReason: 'stop' },
      'u',
      'm'
    );
    expect(payload.toolCalls).toEqual([]);
    expect(payload.toolResults).toEqual([]);
  });

  it('truncates oversized inputs to keep Vercel logs lean', () => {
    const huge = { huge: 'x'.repeat(10_000) };
    const payload = buildStepLogPayload(
      {
        stepNumber: 0,
        toolCalls: [{ toolName: 'search_editions', input: huge }],
      },
      'u',
      'm'
    );
    const input = (payload.toolCalls as Array<{ input: string }>)[0].input;
    expect(input.length).toBeLessThan(300);
    expect(input).toMatch(/…\(\+\d+\)/); // shows truncation marker
  });
});

describe('truncateForLog', () => {
  it('returns short strings unchanged (no JSON.stringify when already a string)', () => {
    expect(truncateForLog('hi')).toBe('hi');
    expect(truncateForLog({ a: 1 })).toBe('{"a":1}');
  });

  it('truncates and shows the elided length', () => {
    const long = 'x'.repeat(500);
    const out = truncateForLog(long, 100);
    expect(out).toMatch(/…\(\+\d+\)$/);
    expect(out.length).toBeLessThan(120);
  });

  it('handles unserializable values without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => truncateForLog(circular)).not.toThrow();
  });
});
