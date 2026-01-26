import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';

/**
 * 创建搜索位置工具
 */
export function createSearchLocationsTool(ctx: ToolContext) {
  return tool({
    description: '搜索位置/画廊，可以按名称、城市、类型、国家搜索',
    inputSchema: z.object({
      query: z.string().optional().describe('搜索关键词（名称或城市）'),
      type: z.enum(['studio', 'gallery', 'museum', 'other']).optional().describe('位置类型'),
      country: z.string().optional().describe('国家'),
    }),
    execute: async ({ query, type, country }) => {
      const { supabase } = ctx;

      let queryBuilder = supabase.from('locations').select('*');

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
  });
}
