import { streamText, stepCountIs, hasToolCall, type UIMessage } from 'ai';
import type { ProviderOptions, SystemModelMessage } from '@ai-sdk/provider-utils';
import { verifyAuth, unauthorizedResponse } from './lib/auth.js';
import { getModel, getSupabase, getProviderName } from './lib/model-provider.js';
import { getSystemPrompt } from './lib/system-prompt.js';
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
 * 构造 streamText 的 providerOptions（顶层）。
 *
 * 设计取向：thinking 开关只对 Anthropic 生效。
 *   - Anthropic thinking 和 OpenAI reasoningEffort 虽然都是「让模型多想」，
 *     但底层机制差异大，强行绑同一个开关会引入：
 *       1. GPT-5.4 不接受 'minimal'，旧模型不支持 reasoningEffort 字段
 *       2. high reasoning + 搜索类查询有循环风险（生产观察到无限搜索）
 *   - 改为：thinking off → 两家都走默认；thinking on → 仅 Anthropic 走 thinking
 *   - OpenAI 路径不被 thinking 开关影响，由模型自身默认行为决定
 *
 * thinking on：
 *   - THINKING_BUDGET=adaptive → { type: 'adaptive', display: 'summarized' }（Anthropic v3.0.74 GA）
 *   - 其他值（数字 / 缺省）→ { type: 'enabled', budgetTokens: number || 4000 }
 *
 * 注：cacheControl 不在这里，而是放在 system message 的 providerOptions 里
 *     （见 buildSystemMessage），这样不影响 OpenAI 路径请求体。
 */
export function buildProviderOptions(thinkingEnabled: boolean): StreamTextProviderOptions {
  if (!thinkingEnabled) {
    return {};
  }

  const rawBudget = process.env.THINKING_BUDGET;
  const thinking =
    rawBudget === 'adaptive'
      ? { type: 'adaptive' as const, display: 'summarized' as const }
      : { type: 'enabled' as const, budgetTokens: Number(rawBudget) || 4000 };

  return {
    anthropic: { thinking },
  };
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
  provider: 'anthropic' | 'openai'
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
 * - stepCountIs(8)：兜底硬上限，防止工具链失控（曾导致工具链断裂 bug）
 *
 * 数组语义：满足任一条件即停止（v6.0.132+ 支持，d.ts:2736）。
 *
 * 不带泛型注解：让 TS 按 stepCountIs / hasToolCall 自身签名（StopCondition<any>）推断，
 * 与 streamText 的 stopWhen?: StopCondition<NoInfer<typeof tools>> 兼容（any 兼容一切）。
 * 显式 <TOOLS extends ToolSet> 会被 NoInfer 屏蔽反向推断，导致 nodenext typecheck 失败。
 */
export function buildStopConditions() {
  return [stepCountIs(8), hasToolCall('generate_update_confirmation')];
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
      model = 'claude-sonnet-4-6',
      extractionModel,
      searchExpansionModel,
      thinkingEnabled = false,
      artistName,
      locale = 'zh',
    } = body;

    // 2. 安全日志（不记录敏感消息内容）
    const requestSize = JSON.stringify(uiMessages || []).length;
    console.log('[chat] Request', {
      userId: auth.userId,
      model,
      extractionModel: extractionModel || 'default',
      searchExpansionModel: searchExpansionModel || 'default',
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
    //    - Anthropic 路径：依赖服务端 contextManagement.compact 处理超长，跳过客户端 token 截断兜底
    //    - OpenAI 路径：保留 prepareMessagesForModel 既有的 token 截断兜底
    const modelMessages = await prepareMessagesForModel(uiMessages as UIMessage[], 150000, {
      provider,
    });

    // 5. providerOptions：thinking + （仅 Anthropic）contextManagement
    const providerOptions = buildProviderOptions(thinkingEnabled);
    if (provider === 'anthropic') {
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
      system: buildSystemMessage(getSystemPrompt(artistName), provider),
      messages: modelMessages,
      tools,
      stopWhen: buildStopConditions(),
      providerOptions,
      onError({ error }) {
        // 记录流式错误（不中断流）
        console.error('[chat] Stream error:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError(error) {
        // 提取错误信息发送给客户端
        console.error('[chat] Response error:', error);
        return error instanceof Error ? error.message : 'Unknown error';
      },
    });
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
