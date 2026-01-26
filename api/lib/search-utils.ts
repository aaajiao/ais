import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getModel, DEFAULT_EXPANSION_MODEL } from './model-provider.js';

/**
 * SQL 注入防护：转义 ILIKE 搜索中的特殊字符
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * 扩展英文搜索词的单复数形式
 * 仅用于纯英文短词（<20字符）的快速路径
 * @returns 扩展后的搜索词数组，如果不适用则返回 null
 */
export function expandEnglishPluralForms(term: string): string[] | null {
  // 快速路径：纯英文且较短的单词
  if (!/^[a-z]+$/i.test(term) || term.length >= 20) {
    return null; // 不适用快速路径，需要 AI 扩展
  }

  const normalized = term.toLowerCase();
  const variants = new Set<string>([normalized]);

  // 基本单复数处理
  if (normalized.endsWith('ies') && normalized.length > 4) {
    // batteries -> battery
    variants.add(normalized.slice(0, -3) + 'y');
  } else if (normalized.endsWith('es') && normalized.length > 3) {
    // boxes -> box
    variants.add(normalized.slice(0, -2));
  } else if (normalized.endsWith('s') && normalized.length > 2) {
    // materials -> material
    variants.add(normalized.slice(0, -1));
  }

  // 添加复数形式
  if (!normalized.endsWith('s')) {
    variants.add(normalized + 's');
  }

  return [...variants];
}

/**
 * AI 驱动的搜索词扩展
 * 使用 LLM 将用户查询翻译并扩展为多个搜索变体
 * @param term 用户输入的搜索词
 * @param modelId 使用的模型 ID（来自用户设置）
 */
export async function expandSearchQuery(
  term: string,
  modelId?: string
): Promise<string[]> {
  // 快速路径：纯英文且较短的单词，只做基本的单复数处理
  const pluralForms = expandEnglishPluralForms(term);
  if (pluralForms) {
    return pluralForms;
  }

  // 对于非纯英文（如中文）或复杂查询，使用 AI 扩展
  try {
    // 选择模型：优先使用用户配置，否则使用默认快速模型
    const selectedModelId = modelId || DEFAULT_EXPANSION_MODEL;
    const model = getModel(selectedModelId);

    console.log('[expandSearchQuery] Using model:', selectedModelId, 'for term:', term);

    const result = await generateText({
      model,
      output: Output.object({
        schema: z.object({
          searchTerms: z.array(z.string()).describe('English search term variants'),
        }),
      }),
      prompt: `You are a search query expander for an art inventory database. The materials field in the database is stored in English.

Given the user's search term: "${term}"

Generate 2-5 English search variants that should be used to search the materials field. Include:
1. Direct translation if it's not in English
2. Singular and plural forms
3. Common synonyms or related terms in art/materials context

Rules:
- Output ONLY lowercase English words
- Each variant should be a single word or short phrase
- Focus on exact matches for database ILIKE search
- Don't include the original term if it's not English

Example:
- Input: "磁铁" → ["magnet", "magnets", "magnetic"]
- Input: "木头" → ["wood", "wooden", "timber"]
- Input: "LED" → ["led", "leds", "light"]`,
    });

    if (result.output?.searchTerms && result.output.searchTerms.length > 0) {
      console.log('[expandSearchQuery] AI expanded:', term, '→', result.output.searchTerms);
      return result.output.searchTerms;
    }
  } catch (error) {
    console.warn('[expandSearchQuery] AI expansion failed, falling back:', error);
  }

  // 回退：返回原始词
  return [term.toLowerCase()];
}
