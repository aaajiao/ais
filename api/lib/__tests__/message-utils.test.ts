import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateText, tool, type ModelMessage, type UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
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

/**
 * 守护测试（v1.9.1）：Anthropic 400 "thinking blocks in the latest assistant message cannot be modified"
 *
 * 复现链路：上一轮回答用了工具且开了深度推理 → 存下的 assistant UIMessage 有两个 step，各带一个签名
 * thinking。旧实现 pruneMessages({ toolCalls: 'before-last-2-messages' }) 删掉 step1 的 tool-call /
 * tool-result 却保留 reasoning → 两个 assistant 消息相邻 → @ai-sdk/anthropic 合并成
 * [thinking(step1), thinking(step2), text] → API 在 messages.3.content.1 报错。历史存在 localStorage，
 * 每次提问都带着它，只有清空对话才恢复。
 *
 * 这里走真实的 @ai-sdk/anthropic / @ai-sdk/openai 请求体转换（只 mock fetch），断言发给 API 的 body：
 * - 任何 assistant 消息里的 thinking 都只来自同一次原始响应（同一个 step）
 * - 最新 assistant 消息的 thinking 序列与原始响应完全一致
 * - 每个 tool_result 都有对应的 tool_use；不存在只有 thinking 的 assistant 消息
 */
describe('prepareMessagesForModel — thinking blocks survive history pruning', () => {
  type AnthropicBlock = {
    type: string;
    text?: string;
    signature?: string;
    id?: string;
    tool_use_id?: string;
    content?: unknown;
  };
  type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] };
  type OpenAIInputItem = { type?: string; id?: string; role?: string; content?: unknown };

  const signed = (step: string) => ({ anthropic: { signature: `sig-${step}` } });

  const user = (id: string, text: string): UIMessage =>
    ({ id, role: 'user', parts: [{ type: 'text', text }] }) as UIMessage;

  // 单 step 回答：[thinking, text]
  const plainAnswer = (id: string, step: string, text = `answer ${step}`): UIMessage =>
    ({
      id,
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'reasoning', text: `thinking ${step}`, providerMetadata: signed(step), state: 'done' },
        { type: 'text', text, state: 'done' },
      ],
    }) as UIMessage;

  const searchPart = (toolCallId: string, output: unknown = { results: [{ id: 'ed-1' }, { id: 'ed-2' }] }) => ({
    type: 'tool-search_editions',
    toolCallId,
    state: 'output-available',
    input: { location: 'London' },
    output,
  });

  // 两个 step 的工具回答：step1 [thinking, tool_use] → tool_result → step2 [thinking, 最后一段]
  const toolAnswer = (
    id: string,
    prefix: string,
    finalPart: Record<string, unknown>,
    output?: unknown
  ): UIMessage =>
    ({
      id,
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'reasoning', text: `thinking ${prefix}-s1`, providerMetadata: signed(`${prefix}-s1`), state: 'done' },
        searchPart(`${prefix}-search`, output),
        { type: 'step-start' },
        { type: 'reasoning', text: `thinking ${prefix}-s2`, providerMetadata: signed(`${prefix}-s2`), state: 'done' },
        finalPart,
      ],
    }) as UIMessage;

  const textPart = (text: string) => ({ type: 'text', text, state: 'done' });

  const confirmPart = (toolCallId: string) => ({
    type: 'tool-generate_update_confirmation',
    toolCallId,
    state: 'output-available',
    input: { editionId: 'ed-1', status: 'sold' },
    output: { confirmation: { editionId: 'ed-1', status: 'sold' } },
  });

  // 只 mock fetch：请求体由真实的 @ai-sdk/anthropic 生成
  async function captureAnthropicRequest(modelMessages: ModelMessage[]): Promise<AnthropicMessage[]> {
    const bodies: Array<{ messages: AnthropicMessage[] }> = [];
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'ok' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await generateText({
      model: anthropic('claude-sonnet-4-6'),
      messages: modelMessages,
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 4000 } } },
    });

    expect(bodies).toHaveLength(1);
    return bodies[0].messages;
  }

  // 只 mock fetch：请求体由真实的 @ai-sdk/openai（Responses API，store 默认 true）生成
  async function captureOpenAIInput(modelMessages: ModelMessage[]): Promise<OpenAIInputItem[]> {
    const bodies: Array<{ input: OpenAIInputItem[] }> = [];
    const openai = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        throw new Error('request captured');
      },
    });

    await expect(
      generateText({ model: openai('gpt-5.4'), messages: modelMessages, maxRetries: 0 })
    ).rejects.toThrow();

    expect(bodies).toHaveLength(1);
    return bodies[0].input;
  }

  const thinkingSignatures = (message: AnthropicMessage) =>
    message.content.filter((block) => block.type === 'thinking').map((block) => block.signature);

  // 签名 sig-<step>：同一条 assistant 消息里的 thinking 必须来自同一个 step
  function expectNoMergedThinking(messages: AnthropicMessage[]) {
    for (const message of messages.filter((m) => m.role === 'assistant')) {
      const steps = new Set(thinkingSignatures(message).map((signature) => signature?.replace(/^sig-/, '')));
      expect(steps.size).toBeLessThanOrEqual(1);
    }
  }

  // 每个 tool_result 都紧跟在含同 id tool_use 的 assistant 消息之后；不存在只有 thinking 的 assistant 消息
  function expectWellFormedTurns(messages: AnthropicMessage[]) {
    messages.forEach((message, index) => {
      if (message.role === 'assistant') {
        expect(message.content.some((block) => block.type !== 'thinking')).toBe(true);
        return;
      }
      for (const block of message.content.filter((b) => b.type === 'tool_result')) {
        const previous = messages[index - 1];
        expect(previous?.role).toBe('assistant');
        expect(previous.content.some((b) => b.type === 'tool_use' && b.id === block.tool_use_id)).toBe(true);
      }
    });
  }

  const latestAssistant = (messages: AnthropicMessage[]) =>
    messages.filter((m) => m.role === 'assistant').at(-1)!;

  const assistantWithSignature = (messages: AnthropicMessage[], signature: string) =>
    messages.find((m) => m.role === 'assistant' && thinkingSignatures(m).includes(signature));

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it.each([
    ['compaction path', true],
    ['client truncation path', false],
  ])('普通追问：上一轮多 step 工具回答原样回传，不再合并成 messages.3.content.1（%s）', async (_label, useServerSideCompaction) => {
    const history = [
      user('u1', '你好'),
      plainAnswer('a1', 'a1'),
      user('u2', 'London 有哪些作品？'),
      toolAnswer('a2', 'a2', textPart('找到 2 件作品。')),
      user('u3', '还有别的吗？'),
    ];

    const modelMessages = await prepareMessagesForModel(history, 150_000, { useServerSideCompaction });
    const body = await captureAnthropicRequest(modelMessages);

    expectNoMergedThinking(body);
    expectWellFormedTurns(body);

    // 用户报错的位置：旧实现在这里是 [thinking(a2-s1), thinking(a2-s2), text]
    expect(body[3].role).toBe('assistant');
    expect(body[3].content.map((block) => block.type)).toEqual(['thinking', 'tool_use']);
    expect(thinkingSignatures(body[3])).toEqual(['sig-a2-s1']);

    // 最新 assistant 消息 = step2 的原始响应
    const latest = latestAssistant(body);
    expect(latest.content.map((block) => block.type)).toEqual(['thinking', 'text']);
    expect(thinkingSignatures(latest)).toEqual(['sig-a2-s2']);

    // 更早的轮次不再携带 thinking（工具调用之外允许省略）
    expect(assistantWithSignature(body, 'sig-a1')).toBeUndefined();
  });

  it('确认卡片流程：最新 assistant 以 tool_use 结束，其 thinking 与 tool_result 原样保留', async () => {
    const history = [
      user('u1', '你好'),
      plainAnswer('a1', 'a1'),
      user('u2', '把 London 那件标记为已售'),
      toolAnswer('a2', 'a2', confirmPart('a2-confirm')),
      user('u3', '确认'),
    ];

    const body = await captureAnthropicRequest(
      await prepareMessagesForModel(history, 150_000, { useServerSideCompaction: true })
    );

    expectNoMergedThinking(body);
    expectWellFormedTurns(body);

    const latest = latestAssistant(body);
    expect(latest.content.map((block) => block.type)).toEqual(['thinking', 'tool_use']);
    expect(thinkingSignatures(latest)).toEqual(['sig-a2-s2']);

    // tool_result 紧跟在最新 assistant 之后，与确认文字合并在同一条 user 消息里
    const last = body.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'a2-confirm' });
  });

  it('更早的多 step 工具轮次：工具调用与 reasoning 一起剥离，不留孤立 thinking', async () => {
    const history = [
      user('u1', 'London 有哪些作品？'),
      toolAnswer('a1', 'a1', textPart('找到 2 件作品。')),
      user('u2', '谢谢'),
      plainAnswer('a2', 'a2'),
      user('u3', '再见'),
    ];

    const modelMessages = await prepareMessagesForModel(history, 150_000, { useServerSideCompaction: true });
    const body = await captureAnthropicRequest(modelMessages);

    expectNoMergedThinking(body);
    expectWellFormedTurns(body);

    // a1 只剩文字，没有 thinking / tool_use / tool_result
    const olderAssistant = body.find((m) => m.role === 'assistant')!;
    expect(olderAssistant.content).toEqual([{ type: 'text', text: '找到 2 件作品。' }]);
    expect(
      body.flatMap((m) => m.content).some((block) => block.type === 'tool_use' || block.type === 'tool_result')
    ).toBe(false);

    expect(thinkingSignatures(latestAssistant(body))).toEqual(['sig-a2']);
  });

  it('中断保存的未完成工具调用（input-available）：整个未完成 step 丢弃，不报 MissingToolResults', async () => {
    const interrupted = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'reasoning', text: 'thinking a1', providerMetadata: signed('a1'), state: 'done' },
        { type: 'tool-search_editions', toolCallId: 'a1-search', state: 'input-available', input: { location: 'London' } },
      ],
    } as UIMessage;

    const body = await captureAnthropicRequest(
      await prepareMessagesForModel([user('u1', 'London 有哪些作品？'), interrupted, user('u2', '继续')], 150_000, {
        useServerSideCompaction: true,
      })
    );

    expectWellFormedTurns(body);
    expect(body.flatMap((m) => m.content).some((block) => block.type === 'tool_use')).toBe(false);
    expect(body.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('第二个 step 在正文前被中断：丢弃只剩 thinking 的 step，前一个完整 step 成为最新 assistant 消息', async () => {
    const interrupted = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'reasoning', text: 'thinking a1-s1', providerMetadata: signed('a1-s1'), state: 'done' },
        searchPart('a1-search'),
        { type: 'step-start' },
        { type: 'reasoning', text: 'thinking a1-s2', providerMetadata: signed('a1-s2'), state: 'done' },
      ],
    } as UIMessage;

    const body = await captureAnthropicRequest(
      await prepareMessagesForModel([user('u1', 'London 有哪些作品？'), interrupted, user('u2', '继续')], 150_000, {
        useServerSideCompaction: true,
      })
    );

    expectNoMergedThinking(body);
    expectWellFormedTurns(body);

    const latest = latestAssistant(body);
    expect(latest.content.map((block) => block.type)).toEqual(['thinking', 'tool_use']);
    expect(thinkingSignatures(latest)).toEqual(['sig-a1-s1']);
    expect(body.at(-1)!.content.map((block) => block.type)).toEqual(['tool_result', 'text']);
  });

  it('客户端截断兜底只裁更早的轮次：最近一轮即使很大也整轮保留，不留孤立 tool_result', async () => {
    const history = [
      user('u1', '你好'),
      plainAnswer('a1', 'a1', '很长的回答'.repeat(2_000)),
      user('u2', 'London 有哪些作品？'),
      toolAnswer('a2', 'a2', textPart('找到很多作品。'), { results: 'x'.repeat(6_000) }),
      user('u3', '还有别的吗？'),
    ];

    const modelMessages = await prepareMessagesForModel(history, 1_000, { useServerSideCompaction: false });
    const body = await captureAnthropicRequest(modelMessages);

    const truncateLogged = logSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('Truncated'));
    expect(truncateLogged).toBe(true);

    // 更早的长回答被裁掉，开头的 user 消息保留
    expect(JSON.stringify(body)).not.toContain('很长的回答');
    expect(body[0].role).toBe('user');
    expect(body[0].content[0]).toMatchObject({ type: 'text', text: '你好' });

    // 最近一轮的两个 step 都在，tool_use / tool_result 成对
    expectNoMergedThinking(body);
    expectWellFormedTurns(body);
    expect(assistantWithSignature(body, 'sig-a2-s1')!.content.map((block) => block.type)).toEqual(['thinking', 'tool_use']);
    expect(thinkingSignatures(latestAssistant(body))).toEqual(['sig-a2-s2']);
  });

  it('传入 tools 时历史工具结果走 toModelOutput 摘要，而不是原始数据库行', async () => {
    const tools = {
      search_editions: tool({
        inputSchema: z.object({ location: z.string() }),
        execute: async () => ({ results: [] }),
        toModelOutput: () => ({ type: 'text' as const, value: 'SUMMARY: 2 editions (ed-1, ed-2)' }),
      }),
    };

    const history = [
      user('u1', 'London 有哪些作品？'),
      toolAnswer('a1', 'a1', textPart('找到 2 件作品。'), { results: [{ id: 'ed-1', buyer_name: 'RAW_BUYER' }] }),
      user('u2', '还有别的吗？'),
    ];

    const body = await captureAnthropicRequest(
      await prepareMessagesForModel(history, 150_000, { useServerSideCompaction: true, tools })
    );

    const serialized = JSON.stringify(body);
    expect(serialized).toContain('SUMMARY: 2 editions (ed-1, ed-2)');
    expect(serialized).not.toContain('RAW_BUYER');
  });

  describe('OpenAI Responses API（store=true）', () => {
    const openaiReasoning = (itemId: string) => ({
      type: 'reasoning',
      text: '',
      providerMetadata: { openai: { itemId } },
      state: 'done',
    });
    const openaiText = (itemId: string, text: string) => ({
      type: 'text',
      text,
      providerMetadata: { openai: { itemId } },
      state: 'done',
    });
    const gptAnswer = (id: string, parts: Array<Record<string, unknown>>): UIMessage =>
      ({ id, role: 'assistant', parts: [{ type: 'step-start' }, ...parts] }) as UIMessage;

    it('更早轮次的文字以内联 assistant 消息发送，不再引用已剥离 reasoning 的 msg item；最近一轮引用成对保留', async () => {
      const history = [
        user('u1', '你好'),
        gptAnswer('a1', [openaiReasoning('rs_a1'), openaiText('msg_a1', 'answer a1')]),
        user('u2', '再问一次'),
        gptAnswer('a2', [openaiReasoning('rs_a2'), openaiText('msg_a2', 'answer a2')]),
        user('u3', '谢谢'),
      ];

      const input = await captureOpenAIInput(
        await prepareMessagesForModel(history, 150_000, { useServerSideCompaction: false })
      );

      const references = input.filter((item) => item.type === 'item_reference').map((item) => item.id);
      expect(references).toEqual(['rs_a2', 'msg_a2']);
      expect(input).toContainEqual(expect.objectContaining({ role: 'assistant', content: 'answer a1' }));
    });

    it('最近一轮在 reasoning 后被中断：不发送后面没有内容的 reasoning item', async () => {
      const history = [
        user('u1', 'London 有哪些作品？'),
        gptAnswer('a1', [
          openaiReasoning('rs_a1'),
          { type: 'tool-search_editions', toolCallId: 'call-1', state: 'input-available', input: { location: 'London' } },
        ]),
        user('u2', '继续'),
      ];

      const input = await captureOpenAIInput(
        await prepareMessagesForModel(history, 150_000, { useServerSideCompaction: false })
      );

      expect(input.some((item) => item.type === 'item_reference')).toBe(false);
      expect(input.every((item) => item.role === 'user')).toBe(true);
    });
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
