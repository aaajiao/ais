// 真实 API 冒烟测试：按 api/chat.ts 的方式构造 streamText（推理强度、compaction、system prompt、
// 工具、停止条件、历史准备），直接请求 Anthropic / OpenAI。
//
// 什么时候跑：升级 AI SDK、换模型代际、改 providerOptions 或 message-utils 之后，发版前。
// vitest 里的 SDK 测试只 mock 网络，验证"请求体长什么样"；这里验证"真实 API 接不接受"。
//
// - 读 .env.local 的 ANTHROPIC_API_KEY / OPENAI_API_KEY，会产生少量真实调用费用（完整一轮约百次请求）
// - 工具是真实定义，数据库换成假的 Supabase（任何查询都返回空），不读写任何数据
// - 模型列表来自 api/models.ts（与线上设置页一致：账号可用 ∩ model-ids 白名单）
//
// 用法：
//   bun run smoke:live                                   # 全部模型 + 换模型 + 旧历史 + generateText
//   bun run smoke:live --only=claude-sonnet-5,gpt-6-luna # 只跑这些模型的矩阵
//   bun run smoke:live --quick                           # 只跑矩阵
//   bun run smoke:live --repeat=4 --only=claude-sonnet-5 # 重复跑，查偶发问题
//   bun run smoke:live --url=https://...                 # URL 提取用的页面
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { readUIMessageStream, streamText, toUIMessageStream, type UIMessage } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

const { buildProviderOptions, buildSystemMessage, buildStopConditions } = await import('../api/chat.js');
const { DEFAULT_EXPANSION_MODEL, DEFAULT_MODEL, getModel, getProviderName, supportsCompactBeta } = await import(
  '../api/lib/model-provider.js'
);
const { getSystemPromptByProvider } = await import('../api/lib/system-prompt.js');
const { createTools } = await import('../api/tools/index.js');
const { prepareMessagesForModel } = await import('../api/lib/message-utils.js');
const { expandSearchQuery } = await import('../api/lib/search-utils.js');
const { extractArtworkFromUrl } = await import('../api/lib/artwork-extractor.js');
const { default: modelsHandler } = await import('../api/models.js');

const args = process.argv.slice(2);
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const onlyModels = option('only')?.split(',').filter(Boolean);
const repeat = Math.max(1, Number(option('repeat') ?? 1));
const concurrency = Math.max(1, Number(option('concurrency') ?? 4));
const quick = args.includes('--quick');
const extractionUrl = option('url') ?? 'https://eventstructure.com/Guard-I';

// 假 Supabase：任意链式调用（.from().select().eq()…）都可以 await，结果为空
function fakeQuery(): unknown {
  const result = { data: [], error: null, count: 0, status: 200 };
  const proxy: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
          Promise.resolve(result).then(resolve, reject);
      }
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}
const fakeSupabase = new Proxy({}, { get: () => () => fakeQuery() }) as unknown as SupabaseClient;

// 历史准备会打 [message-utils] 日志，冒烟输出只保留结果行
const print = console.log.bind(console);
console.log = () => {};

const user = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });

type TurnResult = {
  ok: boolean;
  ms: number;
  steps: number;
  toolCalls: string[];
  textChars: number;
  error?: string;
  assistant?: UIMessage;
};

function describe(error: unknown): string {
  const e = error as { message?: string; statusCode?: number; responseBody?: string; cause?: { message?: string } };
  const body = typeof e?.responseBody === 'string' ? ` body=${e.responseBody.slice(0, 300)}` : '';
  const cause = e?.cause?.message ? ` cause=${e.cause.message}` : '';
  return `${e?.statusCode ?? ''} ${e?.message ?? String(error)}${cause}${body}`.trim().slice(0, 600);
}

/** 一轮对话：与 api/chat.ts handler 相同的消息准备与 streamText 参数，按前端的方式还原 assistant UIMessage */
async function chatTurn(model: string, thinkingEnabled: boolean, uiMessages: UIMessage[]): Promise<TurnResult> {
  const started = Date.now();
  const provider = getProviderName(model);
  const tools = createTools({
    supabase: fakeSupabase,
    userId: '00000000-0000-0000-0000-000000000000',
    extractionModel: model,
    searchExpansionModel: DEFAULT_EXPANSION_MODEL,
    locale: 'zh',
  });
  const useCompact = provider === 'anthropic' && supportsCompactBeta(model);
  const toolCalls: string[] = [];
  let steps = 0;
  let streamError: string | undefined;

  try {
    const messages = await prepareMessagesForModel(uiMessages, 150000, {
      useServerSideCompaction: useCompact,
      tools,
      provider,
    });
    const providerOptions = buildProviderOptions(thinkingEnabled, provider);
    if (useCompact) {
      providerOptions.anthropic = {
        ...(providerOptions.anthropic ?? {}),
        contextManagement: { edits: [{ type: 'compact_20260112' }] },
      };
    }

    const result = streamText({
      model: getModel(model),
      instructions: buildSystemMessage(getSystemPromptByProvider(provider), provider),
      messages,
      tools,
      stopWhen: buildStopConditions(),
      providerOptions,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(240_000),
      onStepEnd(step) {
        steps++;
        for (const call of step.toolCalls) toolCalls.push(call.toolName);
      },
      onError({ error }) {
        streamError = describe(error);
      },
    });
    const stream = toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: provider === 'openai',
      onError(error) {
        streamError ??= describe(error);
        return describe(error);
      },
    });

    let assistant: UIMessage | undefined;
    for await (const snapshot of readUIMessageStream({ stream })) assistant = snapshot;

    const parts = assistant?.parts ?? [];
    const textChars = parts.reduce((n, part) => n + (part.type === 'text' ? part.text.length : 0), 0);
    // 工具入参非法等错误不一定让流失败，但会作为 output-error 工具卡片显示给用户
    const toolError = parts.find(
      (part) => part.type.startsWith('tool-') && 'state' in part && part.state === 'output-error'
    );
    const error = streamError ?? (toolError && 'errorText' in toolError ? String(toolError.errorText) : undefined);
    return {
      ok: !error && !!assistant && (textChars > 0 || toolCalls.length > 0),
      ms: Date.now() - started,
      steps,
      toolCalls,
      textChars,
      error,
      assistant,
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, steps, toolCalls, textChars: 0, error: describe(error) };
  }
}

const results: Array<{ ok: boolean; line: string }> = [];
function record(section: string, ok: boolean, label: string, detail: string) {
  const line = `[${section}] ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${detail}`;
  results.push({ ok, line });
  print(line);
}
function recordTurn(section: string, label: string, r: TurnResult) {
  const detail = `${(r.ms / 1000).toFixed(1).padStart(5)}s  steps=${r.steps} tools=[${r.toolCalls.join(',')}] text=${r.textChars}`;
  record(section, r.ok, label, r.error ? `${detail}  ERROR: ${r.error}` : detail);
}

const Q1 = '在 London 有哪些作品？';
const Q2 = '还有别的吗？';
const level = (thinking: boolean) => (thinking ? 'on ' : 'off');

/** 提问 + 追问；追问可以换模型，验证历史在 provider 之间切换时仍被接受 */
async function questionAndFollowUp(section: string, model: string, thinking: boolean, followUpModel = model) {
  const history = [user('u1', Q1)];
  const first = await chatTurn(model, thinking, history);
  recordTurn(section, `${model} ${level(thinking)} question`, first);
  if (!first.assistant) return;
  const second = await chatTurn(followUpModel, thinking, [...history, first.assistant, user('u2', Q2)]);
  const after = followUpModel === model ? '' : ` (after ${model})`;
  recordTurn(section, `${followUpModel} ${level(thinking)} follow-up${after}`, second);
}

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
    })
  );
}

// ── 模型列表：与线上设置页一致 ─────────────────────────────────────────────
const modelsResponse = await modelsHandler(new Request('http://localhost/api/models'));
const available = (await modelsResponse.json()) as { anthropic: Array<{ id: string }>; openai: Array<{ id: string }> };
const claudeModels = available.anthropic.map((m) => m.id);
const gptModels = available.openai.map((m) => m.id);
const models = [...claudeModels, ...gptModels].filter((id) => !onlyModels || onlyModels.includes(id));
print(`models: ${models.join(', ') || '(none)'}`);
if (models.length === 0) {
  print('No models to test. Check ANTHROPIC_API_KEY / OPENAI_API_KEY in .env.local and --only.');
  process.exit(1);
}

print(`\n== A. ${models.length} models × deep reasoning off/on × question + follow-up${repeat > 1 ? ` × ${repeat}` : ''}`);
const matrix = Array.from({ length: repeat }, () => models.flatMap((m) => [[m, false], [m, true]] as const)).flat();
await pool(matrix, concurrency, ([model, thinking]) => questionAndFollowUp('A', model, thinking));

if (!quick) {
  const claude = claudeModels.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : claudeModels[0];
  const gpt = gptModels[0];

  print('\n== B. switching provider mid-conversation');
  if (claude && gpt) {
    await questionAndFollowUp('B', claude, true, gpt);
    await questionAndFollowUp('B', gpt, true, claude);
  } else {
    print('   skipped: needs both a Claude and a GPT model');
  }

  print('\n== C. v1.9-era history with signed thinking blocks (must be stripped on the Claude path)');
  if (claude) {
    const signature = (step: string) => ({ anthropic: { signature: `EqQBCkgIBRABGAIiQOLD-v1.9-${step}` } });
    const oldHistory: UIMessage[] = [
      user('u1', Q1),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'reasoning', text: 'old thinking s1', providerMetadata: signature('s1'), state: 'done' },
          {
            type: 'tool-search_editions',
            toolCallId: 'toolu_old_1',
            state: 'output-available',
            input: { location: 'London' },
            output: { results: [] },
          },
          { type: 'step-start' },
          { type: 'reasoning', text: 'old thinking s2', providerMetadata: signature('s2'), state: 'done' },
          { type: 'text', text: '目前在 London 没有找到作品。', state: 'done' },
        ],
      },
      user('u2', Q2),
    ];
    for (const thinking of [false, true]) {
      recordTurn('C', `${claude} ${level(thinking)} old history`, await chatTurn(claude, thinking, oldHistory));
    }
  }

  print('\n== D. generateText paths (search expansion, URL extraction)');
  const fastGpt = gptModels.find((id) => id.endsWith('-luna')) ?? gpt;
  for (const model of [DEFAULT_EXPANSION_MODEL, fastGpt].filter(Boolean)) {
    const started = Date.now();
    const terms = await expandSearchQuery('磁铁', model);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    record('D', terms.length > 1, `expandSearchQuery(磁铁, ${model})`, `${seconds.padStart(5)}s  -> ${JSON.stringify(terms)}`);
  }
  for (const model of [claude, gpt].filter(Boolean)) {
    const started = Date.now();
    const result = await extractArtworkFromUrl(extractionUrl, model, 'en');
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const detail = result.success
      ? `${result.artwork?.title_en} / ${result.artwork?.year}`
      : JSON.stringify(result).slice(0, 300);
    record('D', !!result.success, `extractArtworkFromUrl(${model})`, `${seconds.padStart(5)}s  -> ${detail}`);
  }
}

const failed = results.filter((r) => !r.ok);
print(`\n== SUMMARY: ${results.length - failed.length}/${results.length} passed`);
for (const f of failed) print(f.line);
process.exit(failed.length > 0 ? 1 : 0);
