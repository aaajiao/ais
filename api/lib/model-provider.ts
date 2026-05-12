import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

// 默认模型 ID（使用别名，自动指向最新快照版本）
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

// 默认查询扩展模型（用于后台任务的快速模型）
export const DEFAULT_EXPANSION_MODEL = 'claude-haiku-4-5';

/**
 * Anthropic 服务端 compaction（`contextManagement.compact_20260112`）支持的模型列表。
 *
 * 官方文档：https://platform.claude.com/docs/en/build-with-claude/compaction
 *
 * 关键铁律：把 compact_20260112 发给**不在此列表**的 Claude 模型（如 Haiku 4.5、
 * Sonnet 4.5）会被服务端拒，错误以 "context too long" 形式上抛 —— 即使对话历史
 * 是空的也会失败，迷惑性极高（v1.x 实证）。
 *
 * 新版本发布时（如 Sonnet 4.7、Haiku 4.6 等）需要查 Anthropic compaction 文档
 * 确认是否进入支持列表，再加入这里。**不要靠 startsWith 推断**。
 */
const COMPACT_SUPPORTED_MODELS: ReadonlySet<string> = new Set([
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-mythos-preview',
]);

/**
 * 判断模型是否支持 `compact_20260112` 服务端 compaction。
 * Caller 用这个返回值决定：
 *   - true → 在 streamText 的 providerOptions 注入 contextManagement，跳过客户端截断
 *   - false → 不注入 contextManagement，走 prepareMessagesForModel 客户端 token 截断兜底
 */
export function supportsCompactBeta(modelId: string): boolean {
  return COMPACT_SUPPORTED_MODELS.has(modelId);
}

/**
 * 延迟创建 Anthropic provider 实例
 */
export function getAnthropicProvider() {
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Explicitly set baseURL to avoid issues with system ANTHROPIC_BASE_URL
    // (e.g., Claude Desktop sets it without /v1)
    baseURL: 'https://api.anthropic.com/v1',
  });
}

/**
 * 延迟创建 OpenAI provider 实例
 */
export function getOpenAIProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * 延迟创建 Supabase 客户端
 */
export function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

/**
 * 根据模型 ID 推断 provider 名称（不实例化 provider，纯函数）。
 * 与 getModel 的 prefix 判断逻辑保持一致 —— 修改一处必须同步修改另一处。
 *
 * 用途：chat.ts 需要知道当前路径是 Anthropic 还是 OpenAI，以决定是否注入
 *      Anthropic-only 的 providerOptions（cacheControl / contextManagement）。
 */
export function getProviderName(modelId: string): 'anthropic' | 'openai' {
  const id = modelId || DEFAULT_MODEL;
  if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    return 'openai';
  }
  // claude-* 以及未知前缀均回退到 Anthropic（与 getModel 一致）
  return 'anthropic';
}

/**
 * 根据模型 ID 与 thinking 开关推断 OpenAI reasoningEffort 值。
 *
 * 背景：@ai-sdk/openai v3 默认走 Responses API。`gpt-5.1+` / `gpt-5.4` / `gpt-5.5`
 * 的默认 reasoning_effort 是 `'none'` —— 模型几乎不做内部规划，多步工具调用决策
 * 失效（v1.2.2 实证：用户问"什么作品在 london"GPT 完全不调 search 工具）。
 * 必须显式传一个非零的 effort 才能让模型正常调用工具。
 *
 * 项目实际只用 gpt-5.4 / gpt-5.5（含 -mini 变体）：两者都需显式 effort。
 *   - thinking off → 'low'（不再退化到 none，仍调工具但 reasoning 开销小）
 *   - thinking on → 'high'（深度推理；曾在 v1.2.0 配 stepCountIs(5) 时引发循环，
 *     当前 stepCountIs(8) + hasToolCall 应已缓解；如再现循环可降到 'medium'）
 *
 * 其他模型（gpt-4 / claude-* / 未知前缀）→ 返回 undefined，调用方不传字段。
 *
 * 不同模型族 reasoningEffort enum 不统一（见 docs/ai-chat-tools.md 矩阵），
 * 任何 hardcode 单一值都会在某些模型上 break。
 */
export function getOpenAIReasoningEffort(
  modelId: string,
  thinkingEnabled: boolean
): 'low' | 'high' | undefined {
  // 匹配 gpt-5.4 / gpt-5.5 / gpt-5.4-mini / gpt-5.5-mini 等所有变体
  if (/^gpt-5\.(4|5)/.test(modelId)) {
    return thinkingEnabled ? 'high' : 'low';
  }
  return undefined;
}

/**
 * 根据模型 ID 动态选择 provider
 */
export function getModel(modelId: string) {
  const anthropic = getAnthropicProvider();
  const openai = getOpenAIProvider();

  // 使用完整的模型 ID
  const id = modelId || DEFAULT_MODEL;

  // 根据模型 ID 前缀判断使用哪个 provider
  if (id.startsWith('claude-')) {
    return anthropic(id);
  } else if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    return openai(id);
  }

  // 默认使用 Anthropic
  console.warn(`[chat] Unknown model prefix for "${id}", falling back to Anthropic`);
  return anthropic(id);
}
