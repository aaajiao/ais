import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建获取统计信息工具
 */
export function createGetStatisticsTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '获取库存统计信息',
    inputSchema: z.object({
      type: z.enum(['overview', 'by_status', 'by_location']).describe('统计类型'),
    }),
    execute: async ({ type }) => {
      const { supabase } = ctx;

      if (type === 'overview') {
        // 排除已删除的作品，限定当前用户
        const { data: artworks } = await supabase.from('artworks').select('id').eq('user_id', ctx.userId).is('deleted_at', null);
        const artworkIds = artworks?.map(a => a.id) || [];
        const { data: editions } = artworkIds.length > 0
          ? await supabase.from('editions').select('id, status').in('artwork_id', artworkIds)
          : { data: [] as { id: string; status: string }[] };

        const totalArtworks = artworks?.length || 0;
        const totalEditions = editions?.length || 0;

        if (totalArtworks === 0 && totalEditions === 0) {
          return {
            total_artworks: 0,
            total_editions: 0,
            status_breakdown: {},
            message: t('stats.empty')
          };
        }

        const statusCounts: Record<string, number> = {};
        editions?.forEach(e => {
          statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
        });

        return {
          total_artworks: totalArtworks,
          total_editions: totalEditions,
          status_breakdown: statusCounts,
        };
      }

      if (type === 'by_status') {
        const { data: userArtworks } = await supabase.from('artworks').select('id').eq('user_id', ctx.userId).is('deleted_at', null);
        const userArtworkIds = userArtworks?.map(a => a.id) || [];
        const { data: editions } = userArtworkIds.length > 0
          ? await supabase.from('editions').select('status').in('artwork_id', userArtworkIds)
          : { data: [] as { status: string }[] };
        const statusCounts: Record<string, number> = {};
        editions?.forEach(e => {
          statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
        });
        return { by_status: statusCounts };
      }

      if (type === 'by_location') {
        const { data: locArtworks } = await supabase.from('artworks').select('id').eq('user_id', ctx.userId).is('deleted_at', null);
        const locArtworkIds = locArtworks?.map(a => a.id) || [];
        const { data: editions } = locArtworkIds.length > 0
          ? await supabase.from('editions').select('location_id, locations (name)').in('artwork_id', locArtworkIds)
          : { data: [] as { location_id: string | null; locations: { name: string } | { name: string }[] | null }[] };
        const locationCounts: Record<string, number> = {};
        editions?.forEach(e => {
          // Supabase 返回的 locations 可能是对象或数组
          const loc = e.locations as { name: string } | { name: string }[] | null;
          const name = Array.isArray(loc) ? loc[0]?.name : loc?.name;
          const unknown = t('stats.unknownLocation');
          locationCounts[name || unknown] = (locationCounts[name || unknown] || 0) + 1;
        });
        return { by_location: locationCounts };
      }

      return { error: 'Unknown statistics type' };
    },
  });
}
