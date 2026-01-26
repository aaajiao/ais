import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

// 默认模型 ID
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// 默认查询扩展模型（用于后台任务的快速模型）
export const DEFAULT_EXPANSION_MODEL = 'claude-3-5-haiku-20241022';

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
