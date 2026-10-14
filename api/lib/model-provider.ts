import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { createClient } from '@supabase/supabase-js';

export { DEFAULT_MODEL, DEFAULT_EXPANSION_MODEL, isAllowedModelId, resolveModelId } from './model-ids.js';

export type ProviderName = 'anthropic' | 'openai';

/**
 * Anthropic 服务端 compaction（`contextManagement.compact_20260112`）支持的模型列表。
 *
 * 官方文档：https://platform.claude.com/docs/en/build-with-claude/compaction-threshold
 *
 * 关键铁律：把 compact_20260112 发给**不在此列表**的 Claude 模型会被服务端拒，错误以
 * "context too long" 形式上抛 —— 即使对话历史是空的也会失败，迷惑性极高（v1.x 实证）。
 *
 * 文档列出的 5 系列全部支持（4 系列已不在允许范围内，不再列出）。新模型发布时
 * 先查文档确认进入支持列表，再加入这里。**不要靠 startsWith 推断**。
 */
const COMPACT_SUPPORTED_MODELS: ReadonlySet<string> = new Set([
  'claude-fable-5-1',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-sonnet-5',
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
export function getProviderName(modelId: string): ProviderName {
  // gpt-6* → OpenAI；claude-* 以及未知前缀均回退到 Anthropic（与 getModel 一致）
  return modelId.startsWith('gpt-') ? 'openai' : 'anthropic';
}

/**
 * 推理强度对应的 providerOptions（深度推理开关 off → 'low'，on → 'high'）。
 *
 * Anthropic（Claude 5 系列）：
 *   - 5 系列不传 thinking 字段就是 adaptive thinking **开启**，默认 effort 为 high
 *     （Sonnet 5.5 / Fable 5.1）或 medium（Opus 5.5 / Haiku 5.5）。所以"关"必须显式
 *     降低 effort，不能像 4 系列那样传 {}。
 *   - `{ type: 'enabled', budgetTokens }` 在 Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 上不支持；
 *     `{ type: 'disabled' }` 在 Opus 5.5 / Sonnet 5.5 / Fable 上不允许。统一用 adaptive + effort。
 *   - display 用默认的 omitted：前端不展示 reasoning，省掉 thinking 文本流式时间。
 *
 * OpenAI（GPT-6 系列，Responses API）：
 *   - 四个 gpt-6 模型都接受 low / high；gpt-6-astra / gpt-6.1-sol 不接受 'none'
 *     （SDK 会带 warning 静默丢弃，退回服务端默认值），所以永远不发 'none'。
 *   - reasoningSummary: null —— AI SDK 7 对非 none effort 默认开 detailed 摘要，显式关掉。
 *
 * 前提：modelId 已经过 resolveModelId（只有 Claude 5 / GPT-6），两家所有允许的模型都
 * 接受 low / high，所以这里只按 provider 分支。
 */
export function getReasoningProviderOptions(
  provider: ProviderName,
  level: 'low' | 'high'
): ProviderOptions {
  if (provider === 'openai') {
    return { openai: { reasoningEffort: level, reasoningSummary: null } };
  }
  return { anthropic: { thinking: { type: 'adaptive' }, effort: level } };
}

/**
 * 根据模型 ID 动态选择 provider
 */
export function getModel(modelId: string) {
  if (getProviderName(modelId) === 'openai') {
    return getOpenAIProvider()(modelId);
  }
  if (!modelId.startsWith('claude-')) {
    console.warn(`[chat] Unknown model prefix for "${modelId}", falling back to Anthropic`);
  }
  return getAnthropicProvider()(modelId);
}
