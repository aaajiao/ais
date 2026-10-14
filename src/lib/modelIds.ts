/**
 * 模型 ID 规则的前端镜像（只允许 Claude 5.1 / 5.5 这一代与 GPT-6 系列）。
 *
 * 来源：api/lib/model-ids.ts —— 前端不能 import api/，改这里必须同步改那边，
 * api/lib/__tests__/model-ids.test.ts 守护两边一致。
 */

/** 主聊天默认模型（后端 DEFAULT_MODEL） */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-5-5';

/** 搜索扩展默认模型（后端 DEFAULT_EXPANSION_MODEL） */
export const DEFAULT_SEARCH_EXPANSION_MODEL = 'claude-haiku-5-5';

const ANTHROPIC_MODEL_PATTERN = /^claude-(opus|sonnet|haiku|fable|mythos)-5-[1-9]\d?$/;
const OPENAI_MODEL_PATTERN = /^gpt-6(?:\.\d+)?-([a-z]+)$/;
const OPENAI_EXCLUDED_VARIANTS: ReadonlySet<string> = new Set(['chat', 'codex']);

export function isAllowedModelId(modelId: unknown): modelId is string {
  if (typeof modelId !== 'string') return false;
  if (ANTHROPIC_MODEL_PATTERN.test(modelId)) return true;
  const openaiMatch = modelId.match(OPENAI_MODEL_PATTERN);
  return openaiMatch !== null && !OPENAI_EXCLUDED_VARIANTS.has(openaiMatch[1]);
}

/** localStorage 里保存模型选择的键 */
export const MODEL_STORAGE_KEYS = {
  chat: 'ai-model',
  extraction: 'extraction-model',
  searchExpansion: 'search-expansion-model',
} as const;

/**
 * 读取保存的模型 ID。旧版本存下的 4 系列 / GPT-5 / o 系列 ID 不再允许：
 * 从 localStorage 删除并返回空字符串（调用方回退到各自的默认值）。
 */
export function readStoredModelId(key: string): string {
  const stored = localStorage.getItem(key);
  if (!stored) return '';
  if (isAllowedModelId(stored)) return stored;
  localStorage.removeItem(key);
  return '';
}

/**
 * 模型显示名：claude-sonnet-5-5 → Claude Sonnet 5.5，claude-opus-5 → Claude Opus 5，
 * gpt-6.1-sol → GPT-6.1 Sol。不认识的 ID 原样返回。
 */
export function getModelDisplayName(modelId: string): string {
  const claudeMatch = modelId.match(/^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?$/);
  if (claudeMatch) {
    const [, line, major, minor] = claudeMatch;
    return `Claude ${capitalize(line)} ${minor ? `${major}.${minor}` : major}`;
  }

  const gptMatch = modelId.match(/^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/);
  if (gptMatch) {
    const [, version, variant] = gptMatch;
    return `GPT-${version} ${capitalize(variant)}`;
  }

  return modelId;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
