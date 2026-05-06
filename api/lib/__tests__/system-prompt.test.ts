import { describe, it, expect } from 'vitest';
import {
  getSystemPrompt,
  getSystemPromptForAnthropic,
  getSystemPromptForOpenAI,
  getSystemPromptByProvider,
} from '../system-prompt';

/**
 * 守护测试：保护 commit 2c5a016（GPT 工具调用修复）引入的「工具调用强制路由」段。
 * 这段提示词对 OpenAI 模型至关重要 —— GPT 对 description 的解读比 Claude 更字面，
 * 缺少这段会导致 GPT 凭记忆作答而不调用工具。
 *
 * 如果未来某个 PR 想精简 system prompt 删掉这段，这个测试会立刻失败提醒。
 *
 * v1.2.4：split into anthropic / openai variants. 旧 getSystemPrompt 默认走 anthropic，
 * 字节级保留 v1.2.3 行为。
 */
describe('getSystemPrompt (legacy default — anthropic variant for backwards compat)', () => {
  it('contains the mandatory tool routing section', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('工具调用强制路由');
  });

  it('explicitly names the tool-routing key tools', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('search_editions');
    expect(prompt).toContain('search_artworks');
    expect(prompt).toContain('get_statistics');
    expect(prompt).toContain('search_history');
  });

  it('instructs the model to call tools before answering', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('先调用工具再回答');
  });

  it('uses the provided artistName', () => {
    const prompt = getSystemPrompt('TestArtist');
    expect(prompt.startsWith('你是 TestArtist')).toBe(true);
  });

  it('falls back to "aaajiao" when artistName is omitted', () => {
    const prompt = getSystemPrompt();
    expect(prompt.startsWith('你是 aaajiao')).toBe(true);
  });

  it('legacy entry returns byte-identical content to anthropic variant', () => {
    expect(getSystemPrompt('X')).toBe(getSystemPromptForAnthropic('X'));
    expect(getSystemPrompt()).toBe(getSystemPromptForAnthropic());
  });
});

describe('getSystemPromptForAnthropic — v1.2.3 中文 imperative 版本', () => {
  it('keeps the original Chinese imperative tool-routing block intact', () => {
    const prompt = getSystemPromptForAnthropic('X');
    expect(prompt).toContain('工具调用强制路由');
    expect(prompt).toContain('先调用工具再回答');
  });

  it('opens with "你是 <name> 艺术作品库存管理系统的 AI 助手"', () => {
    const prompt = getSystemPromptForAnthropic('aaajiao');
    expect(prompt.startsWith('你是 aaajiao 艺术作品库存管理系统的 AI 助手')).toBe(true);
  });

  it('contains all 9 status codes with emoji mapping', () => {
    const prompt = getSystemPromptForAnthropic();
    for (const status of [
      'in_production',
      'in_studio',
      'at_gallery',
      'at_museum',
      'in_transit',
      'sold',
      'gifted',
      'lost',
      'damaged',
    ]) {
      expect(prompt).toContain(status);
    }
    // emoji 映射保留
    expect(prompt).toMatch(/🟢|🔴|🟡/);
  });

  it('mentions confirmation card requirement for write operations', () => {
    const prompt = getSystemPromptForAnthropic();
    expect(prompt).toContain('确认卡片');
  });
});

describe('getSystemPromptForOpenAI — GPT-5 友好的 tool preambles 版本', () => {
  it('contains the explicit "USE search_editions" routing instruction', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/search_editions/);
    expect(prompt).toContain('USE search_editions DIRECTLY');
  });

  it('contains the negative instruction "DO NOT call search_locations first"', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/DO NOT call search_locations first/i);
  });

  it('contains the london few-shot example (the key v1.2.x failure mode)', () => {
    const prompt = getSystemPromptForOpenAI();
    // The specific Chinese user query that v1.2.3 still failed on
    expect(prompt).toContain('在 london 画廊有哪些作品');
    // The expected tool call right after
    expect(prompt).toMatch(/search_editions\(\{ location: ['"]London['"] \}\)/);
  });

  it('contains a sale-recording few-shot (search → confirmation card)', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/generate_update_confirmation/);
    expect(prompt).toMatch(/Alice/);
  });

  it('uses condition→action TABLE format (markdown pipes), not pure imperative list', () => {
    const prompt = getSystemPromptForOpenAI();
    // The routing table uses `| ... | ... |` markdown rows
    expect(prompt).toMatch(/\|\s*If the user mentions/i);
    expect(prompt).toMatch(/\|\s*CALL/);
  });

  it('opens in English (GPT prefers English instructions)', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt.startsWith('You are the AI assistant')).toBe(true);
  });

  it('preserves all 9 status codes (business rule parity)', () => {
    const prompt = getSystemPromptForOpenAI();
    for (const status of [
      'in_production',
      'in_studio',
      'at_gallery',
      'at_museum',
      'in_transit',
      'sold',
      'gifted',
      'lost',
      'damaged',
    ]) {
      expect(prompt).toContain(status);
    }
  });

  it('keeps emoji mapping same as anthropic variant', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/🟢|🔴|🟡/);
  });

  it('reminds GPT to confirm before writing', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/confirm/i);
    expect(prompt).toContain('generate_update_confirmation');
    expect(prompt).toMatch(/NEVER call execute_edition_update without prior user confirmation/i);
  });

  it('lists "NOT supported" operations (parity with anthropic — UI-only changes)', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toMatch(/NOT supported/i);
    expect(prompt).toMatch(/locations/);
    expect(prompt).toMatch(/inventory numbers/);
  });

  it('uses the provided artistName', () => {
    const prompt = getSystemPromptForOpenAI('TestArtist');
    expect(prompt).toContain("TestArtist's art inventory");
  });

  it('falls back to "aaajiao" when artistName is omitted', () => {
    const prompt = getSystemPromptForOpenAI();
    expect(prompt).toContain("aaajiao's art inventory");
  });
});

describe('getSystemPromptByProvider — routing', () => {
  it("'anthropic' routes to anthropic variant (byte-identical)", () => {
    expect(getSystemPromptByProvider('anthropic', 'X')).toBe(getSystemPromptForAnthropic('X'));
  });

  it("'openai' routes to openai variant (byte-identical)", () => {
    expect(getSystemPromptByProvider('openai', 'X')).toBe(getSystemPromptForOpenAI('X'));
  });

  it('the two variants are NOT identical (sanity)', () => {
    expect(getSystemPromptByProvider('anthropic')).not.toBe(getSystemPromptByProvider('openai'));
  });
});
