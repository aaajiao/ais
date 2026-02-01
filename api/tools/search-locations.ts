import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建搜索位置工具
 */
export function createSearchLocationsTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '搜索位置/画廊，可以按名称、城市、类型、国家搜索',
    inputSchema: z.object({
      query: z.string().optional().describe('搜索关键词（名称或城市）'),
      type: z.enum(['studio', 'gallery', 'museum', 'other']).optional().describe('位置类型'),
      country: z.string().optional().describe('国家'),
    }),
    execute: async ({ query, type, country }) => {
      const { supabase } = ctx;

      let queryBuilder = supabase.from('locations').select('*').eq('user_id', ctx.userId);

      if (query) {
        const sanitized = sanitizeSearchTerm(query);
        queryBuilder = queryBuilder.or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%`);
      }
      if (type) {
        queryBuilder = queryBuilder.eq('type', type);
      }
      if (country) {
        const sanitized = sanitizeSearchTerm(country);
        queryBuilder = queryBuilder.ilike('country', `%${sanitized}%`);
      }

      const { data, error } = await queryBuilder.limit(10);

      if (error) {
        return { error: error.message };
      }

      return { locations: data || [] };
    },
    // 控制返回给模型的内容：包含 ID 和关键标识字段，以便后续工具调用
    toModelOutput({ output }) {
      const result = output as { locations?: Array<Record<string, unknown>>; error?: string };

      if (result.error) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: t('search.error', { error: result.error }) }],
        };
      }

      if (!result.locations || result.locations.length === 0) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: t('locations.noMatch') }],
        };
      }

      const summary = result.locations.map((loc: Record<string, unknown>) => {
        const parts = [
          `id: ${loc.id}`,
          loc.name ? `name: ${loc.name}` : null,
          loc.city ? `city: ${loc.city}` : null,
          loc.type ? `type: ${loc.type}` : null,
        ].filter(Boolean).join(', ');
        return `- ${parts}`;
      }).join('\n');

      return {
        type: 'content' as const,
        value: [{
          type: 'text' as const,
          text: `${t('locations.found', { count: result.locations.length })}\n${summary}`
        }],
      };
    },
  });
}
