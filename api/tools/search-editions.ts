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
          .eq('user_id', ctx.userId)
          .is('deleted_at', null)
          .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);
        artworkIds = artworks?.map(a => a.id) || [];
      }

      // 预查询位置 ID（按名称、城市、国家匹配）
      let locationIds: string[] = [];
      if (location) {
        const sanitized = sanitizeSearchTerm(location);
        const { data: locations } = await supabase
          .from('locations')
          .select('id')
          .eq('user_id', ctx.userId)
          .or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,country.ilike.%${sanitized}%`);
        locationIds = locations?.map(l => l.id) || [];
        if (locationIds.length === 0) {
          return {
            editions: [],
            message: t('editions.noResultsWithTerms', { terms: location })
          };
        }
      }

      // 搜索版本（限定当前用户的作品）
      let queryBuilder = supabase
        .from('editions')
        .select(`
          *,
          artworks!inner (id, title_en, title_cn, year, edition_total, user_id),
          locations (id, name, city)
        `)
        .eq('artworks.user_id', ctx.userId);

      if (artworkIds.length > 0) {
        queryBuilder = queryBuilder.in('artwork_id', artworkIds);
      }
      if (locationIds.length > 0) {
        queryBuilder = queryBuilder.in('location_id', locationIds);
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

      // 位置查询时提高限制，确保返回完整结果
      const queryLimit = location ? 50 : 20;
      const { data, error } = await queryBuilder.limit(queryLimit);

      if (error) {
        return { error: error.message };
      }

      const editions = data || [];

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
    // 控制返回给模型的内容：包含 ID 和关键标识字段，以便后续工具调用
    toModelOutput({ output }) {
      const result = output as { editions?: Array<Record<string, unknown>>; message?: string; error?: string };

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

      const summary = result.editions.map((e: Record<string, unknown>) => {
        const artwork = e.artworks as Record<string, unknown> | null;
        const location = e.locations as Record<string, unknown> | null;
        const parts = [
          `id: ${e.id}`,
          artwork?.title_en || artwork?.title_cn ? `artwork: ${artwork?.title_en || artwork?.title_cn}` : null,
          e.edition_number != null ? `#${e.edition_number}/${artwork?.edition_total || '?'}` : null,
          e.edition_type ? `type: ${e.edition_type}` : null,
          e.status ? `status: ${e.status}` : null,
          location?.name ? `location: ${location.name}` : null,
          e.inventory_number ? `inv: ${e.inventory_number}` : null,
        ].filter(Boolean).join(', ');
        return `- ${parts}`;
      }).join('\n');

      return {
        type: 'content' as const,
        value: [{
          type: 'text' as const,
          text: `${t('editions.found', { count: result.editions.length })}\n${summary}`
        }],
      };
    },
  });
}
