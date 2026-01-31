import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建搜索版本工具
 */
export function createSearchEditionsTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '搜索版本，可以按作品名称、状态、位置、版本类型、品相、买家、价格等搜索',
    inputSchema: z.object({
      artwork_title: z.string().optional().describe('作品标题'),
      edition_number: z.number().optional().describe('版本号'),
      status: z.string().optional().describe('状态'),
      location: z.string().optional().describe('位置'),
      edition_type: z.enum(['numbered', 'ap', 'unique']).optional().describe('版本类型'),
      condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional().describe('品相'),
      inventory_number: z.string().optional().describe('库存编号'),
      buyer_name: z.string().optional().describe('买家名称'),
      price_min: z.number().optional().describe('最低价格'),
      price_max: z.number().optional().describe('最高价格'),
      sold_after: z.string().optional().describe('售出日期起始 (YYYY-MM-DD)'),
      sold_before: z.string().optional().describe('售出日期结束 (YYYY-MM-DD)'),
    }),
    execute: async ({
      artwork_title,
      edition_number,
      status,
      location,
      edition_type,
      condition,
      inventory_number,
      buyer_name,
      price_min,
      price_max,
      sold_after,
      sold_before,
    }) => {
      const { supabase } = ctx;

      // 先搜索作品（排除已删除的）
      let artworkIds: string[] = [];
      if (artwork_title) {
        const sanitized = sanitizeSearchTerm(artwork_title);
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id')
          .is('deleted_at', null)
          .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);
        artworkIds = artworks?.map(a => a.id) || [];
      }

      // 搜索版本
      let queryBuilder = supabase
        .from('editions')
        .select(`
          *,
          artworks (id, title_en, title_cn, year, edition_total),
          locations (id, name, city)
        `);

      if (artworkIds.length > 0) {
        queryBuilder = queryBuilder.in('artwork_id', artworkIds);
      }
      if (edition_number !== undefined) {
        queryBuilder = queryBuilder.eq('edition_number', edition_number);
      }
      if (status) {
        queryBuilder = queryBuilder.eq('status', status);
      }
      if (edition_type) {
        queryBuilder = queryBuilder.eq('edition_type', edition_type);
      }
      if (condition) {
        queryBuilder = queryBuilder.eq('condition', condition);
      }
      if (inventory_number) {
        const sanitized = sanitizeSearchTerm(inventory_number);
        queryBuilder = queryBuilder.ilike('inventory_number', `%${sanitized}%`);
      }
      if (buyer_name) {
        const sanitized = sanitizeSearchTerm(buyer_name);
        queryBuilder = queryBuilder.ilike('buyer_name', `%${sanitized}%`);
      }
      if (price_min !== undefined) {
        queryBuilder = queryBuilder.gte('sale_price', price_min);
      }
      if (price_max !== undefined) {
        queryBuilder = queryBuilder.lte('sale_price', price_max);
      }
      if (sold_after) {
        queryBuilder = queryBuilder.gte('sale_date', sold_after);
      }
      if (sold_before) {
        queryBuilder = queryBuilder.lte('sale_date', sold_before);
      }

      const { data, error } = await queryBuilder.limit(20);

      if (error) {
        return { error: error.message };
      }

      // 如果指定了位置，进行过滤
      let editions = data || [];
      if (location) {
        editions = editions.filter(e =>
          e.locations?.name?.toLowerCase().includes(location.toLowerCase()) ||
          e.locations?.city?.toLowerCase().includes(location.toLowerCase())
        );
      }

      if (editions.length === 0) {
        const searchTerms = [artwork_title, status, location].filter(Boolean).join('、');
        return {
          editions: [],
          message: searchTerms
            ? t('editions.noResultsWithTerms', { terms: searchTerms })
            : t('editions.noResultsEmpty')
        };
      }

      return { editions };
    },
    // 控制返回给模型的内容，避免模型重复描述搜索结果
    toModelOutput({ output }) {
      const result = output as { editions?: Array<unknown>; message?: string; error?: string };

      if (result.error) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: t('search.error', { error: result.error }) }],
        };
      }

      if (!result.editions || result.editions.length === 0) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: result.message || t('editions.noMatch') }],
        };
      }

      // 只告诉模型找到了多少结果，详情由前端渲染
      return {
        type: 'content' as const,
        value: [{
          type: 'text' as const,
          text: t('editions.found', { count: result.editions.length })
        }],
      };
    },
  });
}
