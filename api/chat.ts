import { streamText, isStepCount, hasToolCall, toUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { ProviderOptions, SystemModelMessage } from '@ai-sdk/provider-utils';
import { verifyAuth, unauthorizedResponse } from './lib/auth.js';
import {
  DEFAULT_EXPANSION_MODEL,
  DEFAULT_MODEL,
  getModel,
  getProviderName,
  getReasoningProviderOptions,
  getSupabase,
  resolveModelId,
  supportsCompactBeta,
  type ProviderName,
} from './lib/model-provider.js';
import { getSystemPromptByProvider } from './lib/system-prompt.js';
import { createTools } from './tools/index.js';
import { prepareMessagesForModel } from './lib/message-utils.js';

// Vercel Edge Function
export const config = {
  runtime: 'edge',
};

// 替代旧的 Parameters<typeof streamText>[0]['providerOptions'] hack：
// v6.0.175 起 ai 包内部从 @ai-sdk/provider-utils 引入 ProviderOptions
// 但未在 ai 顶层 re-export，因此直接从 provider-utils 拿。
type StreamTextProviderOptions = ProviderOptions;

/**
 * 构造 streamText 的 providerOptions（顶层），按 provider 分支注入推理强度。
 *
 * 深度推理开关 off → 'low'，on → 'high'，两家统一（细节见 getReasoningProviderOptions）：
 *   - Anthropic（Claude 5 系列）：{ thinking: { type: 'adaptive' }, effort }。5 系列不传
 *     thinking 就是 adaptive thinking 开启、默认 effort high/medium，"关"必须显式传 low。
 *   - OpenAI（GPT-6 系列）：{ reasoningEffort, reasoningSummary: null }。显式传 effort
 *     （v1.2.3 起的规则：不依赖服务端默认值；GPT-6 永远不发 'none'）。
 *
 * Anthropic 另加 toolStreaming: false：@ai-sdk/anthropic 流式调用时默认给每个工具开
 * eager_input_streaming，API 不再校验工具入参 JSON。v1.10 实测 claude-sonnet-5 在深度推理开启的
 * 追问里约一半概率给 search_locations 发出 `{"query": }`，前端显示红色
 * AI_InvalidToolInputError（模型随后会重试）；关掉后 10/10 正常。前端不展示流式工具入参，关掉无感知。
 *
 * 注：cacheControl 不在这里，而是放在 system message 的 providerOptions 里
 *     （见 buildSystemMessage），这样不影响 OpenAI 路径请求体。
 */
export function buildProviderOptions(
  thinkingEnabled: boolean,
  provider: ProviderName
): StreamTextProviderOptions {
  const options = getReasoningProviderOptions(provider, thinkingEnabled ? 'high' : 'low');
  if (provider === 'anthropic') {
    options.anthropic = { ...options.anthropic, toolStreaming: false };
  }
  return options;
}

/**
 * 构造 system message。
 * - Anthropic 路径：返回带 cacheControl: ephemeral 的 SystemModelMessage，
 *   让 1400 字符 system prompt 走 prompt caching（节省 ~30% 输入 token）。
 * - OpenAI 路径：返回 string，请求体中不会出现任何 cacheControl 字段
 *   （AI SDK 按 provider 名称过滤 message-level providerOptions）。
 *
 * AI SDK 会把 message.providerOptions[<providerId>] 透传给该 provider，
 * 其他 provider 的 providerOptions 会被忽略 —— 因此即便我们对所有路径都返回带
 * anthropic.cacheControl 的 message，OpenAI 请求体也不会变。这里仍然按 provider
 * 区分返回类型，是为了让 OpenAI 路径在 d.ts 层面看不到任何 anthropic 字段，更直观。
 */
export function buildSystemMessage(
  prompt: string,
  provider: ProviderName
): string | SystemModelMessage {
  if (provider !== 'anthropic') {
    return prompt;
  }
  return {
    role: 'system',
    content: prompt,
    providerOptions: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      },
    },
  };
}

/**
 * 构造 streamText 的 stopWhen 数组。
 * - hasToolCall('generate_update_confirmation')：模型生成确认卡片即停步（自然停止信号）
 * - isStepCount(8)：兜底硬上限，防止工具链失控（曾导致工具链断裂 bug）
 *
 * 数组语义：满足任一条件即停止（v6.0.132+ 支持，d.ts:2736）。
 *
 * 不带泛型注解：让 TS 按 isStepCount / hasToolCall 自身签名（StopCondition<any>）推断，
 * 与 streamText 的 stopWhen?: StopCondition<NoInfer<typeof tools>> 兼容（any 兼容一切）。
 * 显式 <TOOLS extends ToolSet> 会被 NoInfer 屏蔽反向推断，导致 nodenext typecheck 失败。
 */
export function buildStopConditions() {
  return [isStepCount(8), hasToolCall('generate_update_confirmation')];
}

/**
 * 截断字符串（用于 step log 的 input/output payload，避免 Vercel logs 爆炸）。
 * 200 字符是经验值：足以看清工具调用的关键参数（location='London'、status='sold'），
 * 同时一个 step 即便有 4-5 个工具调用也不会超过单条 log 的合理上限。
 */
export function truncateForLog(value: unknown, max = 200): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = '[unserializable]';
  }
  if (s == null) return '';
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}

/**
 * 把单个 step 的工具调用决策序列化成一条 log 行。导出供测试断言。
 * 关键字段：stepNumber / model / toolCalls(name+input) / toolResults(name+output)
 *           / finishReason / usage。
 *
 * 设计动机：v1.2.0–v1.2.3 4 次 hotfix 都打偏，根因之一是 onStepFinish / telemetry
 * 完全没接，无法看到 GPT 实际调了哪些工具传了什么参数。这条 log 让"GPT 没调
 * search_editions(location='London') 反而调 search_locations"这类问题肉眼可见。
 */
export function buildStepLogPayload(
  step: {
    stepNumber?: number;
    model?: { provider?: string; modelId?: string };
    toolCalls?: ReadonlyArray<{ toolName: string; input?: unknown }>;
    toolResults?: ReadonlyArray<{ toolName: string; output?: unknown }>;
    finishReason?: string;
    usage?: unknown;
  },
  userId: string,
  modelId: string
): Record<string, unknown> {
  return {
    userId,
    modelId,
    stepNumber: step.stepNumber,
    stepProvider: step.model?.provider,
    stepModelId: step.model?.modelId,
    toolCalls: (step.toolCalls || []).map((c) => ({
      name: c.toolName,
      input: truncateForLog(c.input),
    })),
    toolResults: (step.toolResults || []).map((r) => ({
      name: r.toolName,
      output: truncateForLog(r.output),
    })),
    finishReason: step.finishReason,
    usage: step.usage,
  };
}

/**
 * Fire-and-forget step logger。绝不抛错（外层 try/catch + 内部 try/catch 双保险）。
 *
 * 不导出 console 副作用以外的东西：未来若需切换到 OTel exporter，只改这一处。
 */
function logStepForObservability(
  step: Parameters<typeof buildStepLogPayload>[0],
  userId: string,
  modelId: string
): void {
  try {
    const payload = buildStepLogPayload(step, userId, modelId);
    console.log('[chat] step', payload);
  } catch (err) {
    // 即便序列化失败也不能 throw —— 上游回调声明为 sync void
    console.error('[chat] buildStepLogPayload threw:', err);
  }
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 1. 验证身份认证
    const auth = await verifyAuth(req);
    if (!auth.success) {
      return unauthorizedResponse(auth.error || 'Unauthorized');
    }

    const body = await req.json();
    const {
      messages: uiMessages,
      thinkingEnabled = false,
      artistName,
      locale = 'zh',
    } = body;

    // 只接受 Claude 5 / GPT-6；旧版本客户端 localStorage 里的 4 系列 / GPT-5 / o 系列 ID
    // 收敛到默认值（URL 提取默认跟随主模型）
    const model = resolveModelId(body.model, DEFAULT_MODEL);
    const extractionModel = resolveModelId(body.extractionModel, model);
    const searchExpansionModel = resolveModelId(body.searchExpansionModel, DEFAULT_EXPANSION_MODEL);

    // 2. 安全日志（不记录敏感消息内容）
    const requestSize = JSON.stringify(uiMessages || []).length;
    console.log('[chat] Request', {
      userId: auth.userId,
      model,
      extractionModel,
      searchExpansionModel,
      thinkingEnabled,
      messageCount: uiMessages?.length,
      requestSizeKB: Math.round(requestSize / 1024),
    });

    // 3. 获取模型和工具（延迟初始化）
    const selectedModel = getModel(model);
    const provider = getProviderName(model);
    const supabase = getSupabase();

    const tools = createTools({
      supabase,
      userId: auth.userId!,
      extractionModel,
      searchExpansionModel,
      locale,
    });

    // 4. 准备消息：
    //    - 服务端 compaction 路径（Claude 5 系列）：跳过客户端截断
    //    - OpenAI 路径：客户端 token 截断兜底
    //    - 传 tools：历史里的工具结果走 toModelOutput 摘要，而不是原始数据库行
    //    - 传 provider：Anthropic 路径不回传任何 thinking 块（preserved thinking 前缀校验，见 message-utils）
    const useCompact = provider === 'anthropic' && supportsCompactBeta(model);
    const modelMessages = await prepareMessagesForModel(uiMessages as UIMessage[], 150000, {
      useServerSideCompaction: useCompact,
      tools,
      provider,
    });

    // 5. providerOptions：推理强度 + （仅支持 compact_20260112 的 Claude 模型注入 contextManagement）
    // 不能用 `provider === 'anthropic'` 一刀切 —— compact_20260112 是 beta 特性，只支持列表里的
    // 模型，发给其他模型会被服务端拒（表现为 "context too long" 即使历史为空），
    // 见 model-provider.supportsCompactBeta。
    const providerOptions = buildProviderOptions(thinkingEnabled, provider);
    if (useCompact) {
      providerOptions.anthropic = {
        ...(providerOptions.anthropic ?? {}),
        contextManagement: {
          edits: [
            {
              type: 'compact_20260112',
              // 默认行为：达到上下文上限时自动 compact，无需自定义 trigger
            },
          ],
        },
      };
    }

    // 6. 流式对话
    const result = streamText({
      model: selectedModel,
      instructions: buildSystemMessage(getSystemPromptByProvider(provider, artistName), provider),
      messages: modelMessages,
      tools,
      stopWhen: buildStopConditions(),
      providerOptions,
      // 每个 step（一次 LLM 调用）完成时记录工具调用决策。
      // 用途：观察 GPT/Claude 在 search_editions(location='London') 这类路由上的实际行为。
      // 关键约束：必须 fire-and-forget + try/catch 吞错。绝不能让 logger 异常中断流。
      onStepEnd(step) {
        try {
          logStepForObservability(step, auth.userId!, model);
        } catch (err) {
          // 日志兜底失败也不能影响流。这里再 catch 一层防御。
          console.error('[chat] onStepEnd logger threw:', err);
        }
      },
      onError({ error }) {
        // 记录流式错误（不中断流）—— 增强：分离 toolName / kind，便于 v1.2.x GPT 排查
        const e = error as {
          toolName?: string;
          message?: string;
          name?: string;
          kind?: string;
          stack?: string;
        };
        console.error('[chat] Stream error:', {
          name: e?.name,
          kind: e?.kind,
          toolName: e?.toolName,
          message: e?.message,
          stack: typeof e?.stack === 'string' ? e.stack.slice(0, 400) : undefined,
        });
      },
    });

    const uiStream = toUIMessageStream({
      stream: result.stream,
      tools,
      // Anthropic 路径下一轮会剥离全部 reasoning（见 message-utils），不必把 thinking 块和签名
      // 存进 localStorage 再发回来；OpenAI 路径需要最近一轮的 reasoning item 配对回传
      sendReasoning: provider === 'openai',
      onError(error) {
        // 提取错误信息发送给客户端
        console.error('[chat] Response error:', error);
        return error instanceof Error ? error.message : 'Unknown error';
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    const err = error as Error & { cause?: Error; status?: number; statusText?: string };
    console.error('[chat] Error:', {
      message: err.message,
      name: err.name,
      cause: err.cause?.message,
      status: err.status,
      statusText: err.statusText,
      stack: err.stack?.slice(0, 500),
    });

    // 返回更具体的错误信息
    const errorMessage = err.message || 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
