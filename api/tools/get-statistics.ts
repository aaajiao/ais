import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';

/**
 * 创建获取统计信息工具
 */
export function createGetStatisticsTool(ctx: ToolContext) {
  return tool({
    description: '获取库存统计信息',
    inputSchema: z.object({
      type: z.enum(['overview', 'by_status', 'by_location']).describe('统计类型'),
    }),
    execute: async ({ type }) => {
      const { supabase } = ctx;

      if (type === 'overview') {
        // 排除已删除的作品
        const { data: artworks } = await supabase.from('artworks').select('id').is('deleted_at', null);
        const { data: editions } = await supabase.from('editions').select('id, status');

        const totalArtworks = artworks?.length || 0;
        const totalEditions = editions?.length || 0;

        if (totalArtworks === 0 && totalEditions === 0) {
          return {
            total_artworks: 0,
            total_editions: 0,
            status_breakdown: {},
            message: '数据库中还没有任何作品或版本数据。这是一个空的库存系统，请先添加一些作品数据。'
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
        const { data: editions } = await supabase.from('editions').select('status');
        const statusCounts: Record<string, number> = {};
        editions?.forEach(e => {
          statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
        });
        return { by_status: statusCounts };
      }

      if (type === 'by_location') {
        const { data: editions } = await supabase
          .from('editions')
          .select('location_id, locations (name)');
        const locationCounts: Record<string, number> = {};
        editions?.forEach(e => {
          // Supabase 返回的 locations 可能是对象或数组
          const loc = e.locations as { name: string } | { name: string }[] | null;
          const name = Array.isArray(loc) ? loc[0]?.name : loc?.name;
          locationCounts[name || '未知'] = (locationCounts[name || '未知'] || 0) + 1;
        });
        return { by_location: locationCounts };
      }

      return { error: 'Unknown statistics type' };
    },
  });
}
