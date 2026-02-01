import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建搜索历史记录工具
 */
export function createSearchHistoryTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '查询版本变更历史，可用于了解销售记录、状态变更等',
    inputSchema: z.object({
      edition_id: z.string().optional().describe('版本 ID'),
      artwork_title: z.string().optional().describe('作品标题'),
      action: z.enum([
        'created', 'status_change', 'location_change',
        'sold', 'consigned', 'returned', 'condition_update',
        'file_added', 'file_deleted', 'number_assigned'
      ]).optional().describe('操作类型'),
      after: z.string().optional().describe('起始日期 (YYYY-MM-DD)'),
      before: z.string().optional().describe('结束日期 (YYYY-MM-DD)'),
      related_party: z.string().optional().describe('相关方（买家/机构）'),
    }),
    execute: async ({ edition_id, artwork_title, action, after, before, related_party }) => {
      const { supabase } = ctx;

      let queryBuilder = supabase
        .from('edition_history')
        .select(`
          *,
          editions!inner (
            id,
            edition_number,
            edition_type,
            artworks!inner (id, title_en, title_cn, user_id)
          )
        `)
        .eq('editions.artworks.user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (edition_id) {
        queryBuilder = queryBuilder.eq('edition_id', edition_id);
      }

      // 如果按作品标题搜索，先找到对应的版本 ID
      if (artwork_title) {
        const sanitized = sanitizeSearchTerm(artwork_title);
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id')
          .eq('user_id', ctx.userId)
          .is('deleted_at', null)
          .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);

        if (artworks && artworks.length > 0) {
          const { data: editions } = await supabase
            .from('editions')
            .select('id')
            .in('artwork_id', artworks.map(a => a.id));

          if (editions && editions.length > 0) {
            queryBuilder = queryBuilder.in('edition_id', editions.map(e => e.id));
          } else {
            return {
              history: [],
              message: t('history.noEditionHistory', { title: artwork_title }),
            };
          }
        } else {
          return {
            history: [],
            message: t('history.noArtworkFound', { title: artwork_title }),
          };
        }
      }

      if (action) {
        queryBuilder = queryBuilder.eq('action', action);
      }
      if (after) {
        queryBuilder = queryBuilder.gte('created_at', after);
      }
      if (before) {
        queryBuilder = queryBuilder.lte('created_at', before + 'T23:59:59');
      }
      if (related_party) {
        const sanitized = sanitizeSearchTerm(related_party);
        queryBuilder = queryBuilder.ilike('related_party', `%${sanitized}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        return { error: error.message };
      }

      if (!data || data.length === 0) {
        return {
          history: [],
          message: t('history.noMatch'),
        };
      }

      return { history: data };
    },
  });
}
