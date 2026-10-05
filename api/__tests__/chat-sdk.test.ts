// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultChatTransport, readUIMessageStream, tool, type ToolSet, type UIMessage } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import handler from '../chat.js';
import * as auth from '../lib/auth.js';
import * as models from '../lib/model-provider.js';
import * as toolRegistry from '../tools/index.js';

type ModelStream = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type ModelChunk = ModelStream['stream'] extends ReadableStream<infer Chunk> ? Chunk : never;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function step(chunks: ModelChunk[], reason: 'stop' | 'tool-calls' = 'stop'): ModelStream {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        ...chunks,
        { type: 'finish', finishReason: { unified: reason, raw: reason }, usage },
      ],
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  };
}

function textStep(): ModelStream {
  return step([
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '找到 ' },
    { type: 'text-delta', id: 'text-1', delta: '**2** 件作品。' },
    { type: 'text-end', id: 'text-1' },
  ]);
}

function toolStep(toolName: string, toolCallId: string, input: object): ModelStream {
  return step([{ type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) }], 'tool-calls');
}

async function sendChat(model: string, thinkingEnabled = false) {
  // Exercise the HTTP/SSE boundary used by useChat without a server or any network request.
  const transport = new DefaultChatTransport({
    api: 'http://localhost/api/chat',
    body: { model, thinkingEnabled },
    fetch: async (url, init) => {
      const response = await handler(new Request(url, init));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      return response;
    },
  });
  const stream = await transport.sendMessages({
    chatId: 'sdk-regression',
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: undefined,
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '查询 London 的作品' }] }],
  });
  const errors: unknown[] = [];
  const messages: UIMessage[] = [];
  for await (const message of readUIMessageStream({ stream, onError: error => errors.push(error) })) {
    messages.push(message);
  }
  return { messages, finalMessage: messages.at(-1), errors };
}

function installModel(model: MockLanguageModelV4, tools: ToolSet = {}) {
  vi.spyOn(models, 'getModel').mockReturnValue(model);
  // The reduced registry keeps real SDK schema validation/tool execution, without database writes.
  vi.spyOn(toolRegistry, 'createTools').mockReturnValue(tools as ReturnType<typeof toolRegistry.createTools>);
}

describe('AI SDK 7 chat HTTP stream and tool loop', () => {
  beforeEach(() => {
    vi.spyOn(auth, 'verifyAuth').mockResolvedValue({ success: true, userId: 'test-user' });
    vi.spyOn(models, 'getSupabase').mockReturnValue({} as ReturnType<typeof models.getSupabase>);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['gpt-5.4', false, { openai: { reasoningEffort: 'low', reasoningSummary: null } }],
    ['gpt-5.5', true, { openai: { reasoningEffort: 'high', reasoningSummary: null } }],
    ['claude-haiku-4-5', false, {}],
    ['claude-sonnet-4-6', false, { anthropic: { contextManagement: { edits: [{ type: 'compact_20260112' }] } } }],
  ] as const)('streams %s text and preserves provider options (thinking %s)', async (modelId, thinking, options) => {
    const model = new MockLanguageModelV4({ doStream: textStep() });
    installModel(model);

    const result = await sendChat(modelId, thinking);

    expect(result.errors).toEqual([]);
    expect(result.finalMessage?.parts).toContainEqual({ type: 'text', text: '找到 **2** 件作品。', state: 'done' });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0].providerOptions).toEqual(options);
    expect(model.doStreamCalls[0].prompt[0]).toMatchObject({ role: 'system' });
    if (modelId.startsWith('claude-')) {
      expect(model.doStreamCalls[0].prompt[0]).toMatchObject({
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      });
    } else {
      expect(model.doStreamCalls[0].prompt[0]).not.toHaveProperty('providerOptions');
    }
  });

  it('executes search, streams the confirmation card, and stops before another model step', async () => {
    const search = vi.fn(async () => ({ editions: [{ id: 'edition-1' }] }));
    const confirmation = vi.fn(async () => ({ editionId: 'edition-1', requiresConfirmation: true }));
    const executeUpdate = vi.fn(async () => ({ success: true }));
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep('search_editions', 'search-1', { location: 'London' }),
        toolStep('generate_update_confirmation', 'confirm-1', { editionId: 'edition-1' }),
        toolStep('execute_edition_update', 'update-1', { editionId: 'edition-1' }),
      ],
    });
    installModel(model, {
      search_editions: tool({ inputSchema: z.object({ location: z.string() }), execute: search }),
      generate_update_confirmation: tool({ inputSchema: z.object({ editionId: z.string() }), execute: confirmation }),
      execute_edition_update: tool({ inputSchema: z.object({ editionId: z.string() }), execute: executeUpdate }),
    });

    const result = await sendChat('gpt-5.4');

    expect(result.errors).toEqual([]);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({ location: 'London' }, expect.any(Object));
    expect(confirmation).toHaveBeenCalledOnce();
    expect(executeUpdate).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].prompt).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'tool' })]));
    expect(result.finalMessage?.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-search_editions', state: 'output-available', output: { editions: [{ id: 'edition-1' }] } }),
      expect.objectContaining({ type: 'tool-generate_update_confirmation', state: 'output-available', output: { editionId: 'edition-1', requiresConfirmation: true } }),
    ]));
  });

  it('caps a tool loop at eight model calls', async () => {
    let count = 0;
    const model = new MockLanguageModelV4({ doStream: async () => toolStep('search_editions', `search-${++count}`, {}) });
    installModel(model, {
      search_editions: tool({ inputSchema: z.object({}), execute: async () => ({ editions: [] }) }),
    });

    const result = await sendChat('claude-sonnet-4-6');

    expect(result.errors).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(8);
    expect(result.finalMessage?.parts.filter(part => part.type === 'tool-search_editions')).toHaveLength(8);
  });

  it('forwards streamed provider errors to the client instead of leaving a pending response', async () => {
    const model = new MockLanguageModelV4({
      doStream: step([{ type: 'error', error: new Error('Model temporarily unavailable') }]),
    });
    installModel(model);

    const result = await sendChat('gpt-5.4');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBeInstanceOf(Error);
    expect((result.errors[0] as Error).message).toBe('Model temporarily unavailable');
  });
});
