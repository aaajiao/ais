import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UIMessage } from 'ai';
import { prepareMessagesForModel, estimateTokens } from '../message-utils';

/**
 * 守护测试（P1-1 + P1-2）：
 * - useServerSideCompaction=true（Sonnet 4.6+/Opus 4.6+/4.7）：跳过客户端 token 截断兜底
 *   → 长上下文应该原样返回（依赖服务端 compact_20260112）
 * - useServerSideCompaction=false（OpenAI + 不支持 compact 的 Claude 模型如 Haiku 4.5、
 *   Sonnet 4.5）：保留旧的截断逻辑 → 超长上下文应当被截断
 *
 * 历史背景：commit 2c5a016 之前用 `JSON.stringify().length / 3` 估算 token 数，对中英
 * 混合不准确。改用 Anthropic 官方 contextManagement 后曾**一刀切**地对所有 Anthropic
 * 模型跳过截断 —— 后果是 Haiku 4.5 / Sonnet 4.5 收到 compact_20260112（它们不支持）
 * 直接报 "Conversation too long"（v1.x 实证）。修复：option 改为显式 boolean
 * `useServerSideCompaction`，由 caller 用 supportsCompactBeta(modelId) 判断。
 */
describe('prepareMessagesForModel — server-side compaction branching', () => {
  // 构造一组「人为超长」的消息，确保 estimateTokensFromModel > maxTokens
  function buildLongMessages(count: number, charsPerMsg: number): UIMessage[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: 'x'.repeat(charsPerMsg) }],
    })) as UIMessage[];
  }

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('useServerSideCompaction=false（OpenAI / Haiku 4.5）：超长消息被客户端截断', async () => {
    const longMessages = buildLongMessages(20, 50_000);
    const result = await prepareMessagesForModel(longMessages, 10_000, {
      useServerSideCompaction: false,
    });

    // 截断逻辑：保留第一条 + 最近 N 条，总长度应小于原始
    expect(result.length).toBeLessThan(longMessages.length);

    // 应该触发 [message-utils] Truncated messages 日志
    const truncateLogged = logSpy.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('Truncated')
    );
    expect(truncateLogged).toBe(true);
  });

  it('useServerSideCompaction=true（Sonnet 4.6+）：超长消息原样返回，依赖服务端 compaction', async () => {
    const longMessages = buildLongMessages(20, 50_000);
    const result = await prepareMessagesForModel(longMessages, 10_000, {
      useServerSideCompaction: true,
    });

    // 不应触发客户端截断日志
    const truncateLogged = logSpy.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('Truncated')
    );
    expect(truncateLogged).toBe(false);

    // pruneMessages 不会因长度而删消息（这些都是 user/assistant text，无工具调用），
    // 所以返回数应等于输入数（除非 emptyMessages: 'remove' 删了空消息，但这里没有空消息）
    expect(result.length).toBe(longMessages.length);
  });

  it('缺省 options 行为：保守走客户端截断兜底（向后兼容历史调用）', async () => {
    const longMessages = buildLongMessages(20, 50_000);
    // 不传 options，应当走客户端截断（保守默认，避免无声给非 compact 模型透传 compact 假设）
    const result = await prepareMessagesForModel(longMessages, 10_000);

    expect(result.length).toBeLessThan(longMessages.length);
  });

  it('短消息：两条路径都不截断', async () => {
    const shortMessages = buildLongMessages(2, 100);

    const clientPath = await prepareMessagesForModel(shortMessages, 150_000, {
      useServerSideCompaction: false,
    });
    const compactPath = await prepareMessagesForModel(shortMessages, 150_000, {
      useServerSideCompaction: true,
    });

    expect(clientPath.length).toBe(2);
    expect(compactPath.length).toBe(2);
  });
});

describe('estimateTokens (legacy, used by deprecated truncateMessages)', () => {
  it('returns a non-negative number for empty input', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('grows with message size', () => {
    const small: UIMessage[] = [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ] as UIMessage[];
    const large: UIMessage[] = [
      { id: 'b', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(10_000) }] },
    ] as UIMessage[];
    expect(estimateTokens(large)).toBeGreaterThan(estimateTokens(small));
  });
});
