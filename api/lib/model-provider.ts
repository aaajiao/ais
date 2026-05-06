import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

// 默认模型 ID（使用别名，自动指向最新快照版本）
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

// 默认查询扩展模型（用于后台任务的快速模型）
export const DEFAULT_EXPANSION_MODEL = 'claude-haiku-4-5';

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
