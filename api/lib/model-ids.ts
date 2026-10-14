/**
 * 模型 ID 规则 —— 单一来源，无任何依赖。
 *
 * 只允许 Claude 5.1 / 5.5 这一代与 GPT-6 系列（v1.10 起不再使用 Claude 4 / GPT-5 / o 系列，
 * v1.10.2 起也不再使用 5.0 代的 claude-sonnet-5 / opus-5 / fable-5 / mythos-5）：
 * - api/models.ts 用它过滤 provider 返回的模型列表
 * - chat.ts / artwork-extractor / search-utils 用 resolveModelId 把客户端传来的旧 ID
 *   （localStorage 里的 claude-sonnet-4-6、gpt-5.5 等）收敛到默认模型
 *
 * 前端镜像：src/lib/modelIds.ts（前端不能 import api/，由 model-ids.test.ts 守护两边一致）。
 */

// 默认主聊天模型（URL 提取默认跟随主模型）
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// 默认搜索扩展模型（后台翻译材料 / 类型搜索词的快速模型）
export const DEFAULT_EXPANSION_MODEL = 'claude-haiku-5-5';

// claude-{line}-5-{minor}，minor ≥ 1（5.1 / 5.5 这一代起）；不接受 5.0 代（不带 minor）和带日期后缀的快照
const ANTHROPIC_MODEL_PATTERN = /^claude-(opus|sonnet|haiku|fable|mythos)-5-[1-9]\d?$/;

// gpt-6-{variant} 或 gpt-6.{minor}-{variant}；不接受日期快照和 -chat-latest
const OPENAI_MODEL_PATTERN = /^gpt-6(?:\.\d+)?-([a-z]+)$/;

// @ai-sdk/openai 把 *-chat 当作非推理模型（不发 reasoning effort），codex 不是对话模型
const OPENAI_EXCLUDED_VARIANTS: ReadonlySet<string> = new Set(['chat', 'codex']);

export function isAllowedModelId(modelId: unknown): modelId is string {
  if (typeof modelId !== 'string') return false;
  if (ANTHROPIC_MODEL_PATTERN.test(modelId)) return true;
  const openaiMatch = modelId.match(OPENAI_MODEL_PATTERN);
  return openaiMatch !== null && !OPENAI_EXCLUDED_VARIANTS.has(openaiMatch[1]);
}

/**
 * 客户端传来的模型 ID 不在允许范围内时（旧版本存下的 4 系列 / GPT-5 / o 系列，或空值），
 * 收敛到 fallback。旧模型仍可调用，不收敛的话用户会一直停留在旧模型上而不报错。
 */
export function resolveModelId(modelId: unknown, fallback: string): string {
  if (isAllowedModelId(modelId)) return modelId;
  if (modelId) {
    console.warn(`[model-ids] Unsupported model "${String(modelId)}", using "${fallback}"`);
  }
  return fallback;
}
