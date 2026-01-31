import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm, expandSearchQuery } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建搜索作品工具
 */
export function createSearchArtworksTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '搜索艺术作品，可以按标题、年份、类型、材料搜索。支持中英文搜索，系统会自动翻译和扩展搜索词',
    inputSchema: z.object({
      query: z.string().optional().describe('搜索关键词（标题）'),
      year: z.string().optional().describe('年份'),
      type: z.string().optional().describe('作品类型'),
      materials: z.string().optional().describe('材料关键词（支持中英文）'),
      is_unique: z.boolean().optional().describe('是否独版作品'),
    }),
    execute: async ({ query, year, type, materials, is_unique }) => {
      const { supabase, searchExpansionModel } = ctx;

      // 排除已删除的作品
      let queryBuilder = supabase.from('artworks').select('*').is('deleted_at', null);

      if (query) {
        const sanitized = sanitizeSearchTerm(query);
        queryBuilder = queryBuilder.or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);
      }
      if (year) {
        queryBuilder = queryBuilder.eq('year', year);
      }
      if (type) {
        // 对 type 也使用 AI 扩展（可能是中文）
        const typeVariants = await expandSearchQuery(type, searchExpansionModel);
        const typeFilters = typeVariants.map(v => `type.ilike.%${sanitizeSearchTerm(v)}%`);
        queryBuilder = queryBuilder.or(typeFilters.join(','));
      }
      if (materials) {
        // 使用 AI 驱动的查询扩展（处理翻译、单复数、同义词）
        const variants = await expandSearchQuery(materials, searchExpansionModel);
        const filters = variants.map(v => `materials.ilike.%${sanitizeSearchTerm(v)}%`);
        queryBuilder = queryBuilder.or(filters.join(','));
      }
      if (is_unique !== undefined) {
        queryBuilder = queryBuilder.eq('is_unique', is_unique);
      }

      const { data, error } = await queryBuilder.limit(10);

      if (error) {
        return { error: error.message };
      }

      const artworks = data || [];
      if (artworks.length === 0) {
        return {
          artworks: [],
          message: query
            ? t('search.noResultsWithQuery', { query })
            : t('search.noResultsEmpty')
        };
      }

      return { artworks };
    },
    // 控制返回给模型的内容：包含 ID 和关键标识字段，以便后续工具调用
    toModelOutput({ output }) {
      const result = output as { artworks?: Array<Record<string, unknown>>; message?: string; error?: string };

      if (result.error) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: t('search.error', { error: result.error }) }],
        };
      }

      if (!result.artworks || result.artworks.length === 0) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: result.message || t('search.noArtworksFound') }],
        };
      }

      const summary = result.artworks.map((a: Record<string, unknown>) => {
        const parts = [
          `id: ${a.id}`,
          a.title_en || a.title_cn ? `title: ${a.title_en || a.title_cn}` : null,
          a.year ? `year: ${a.year}` : null,
          a.type ? `type: ${a.type}` : null,
          a.is_unique ? 'unique' : null,
        ].filter(Boolean).join(', ');
        return `- ${parts}`;
      }).join('\n');

      return {
        type: 'content' as const,
        value: [{
          type: 'text' as const,
          text: `${t('search.artworksFound', { count: result.artworks.length })}\n${summary}`
        }],
      };
    },
  });
}
