import { describe, it, expect } from 'vitest';
import { getSystemPrompt } from '../system-prompt';

/**
 * 守护测试：保护 commit 2c5a016（GPT 工具调用修复）引入的「工具调用强制路由」段。
 * 这段提示词对 OpenAI 模型至关重要 —— GPT 对 description 的解读比 Claude 更字面，
 * 缺少这段会导致 GPT 凭记忆作答而不调用工具。
 *
 * 如果未来某个 PR 想精简 system prompt 删掉这段，这个测试会立刻失败提醒。
 */
describe('getSystemPrompt', () => {
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
});
