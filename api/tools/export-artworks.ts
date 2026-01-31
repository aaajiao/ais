import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建导出作品工具
 */
export function createExportArtworksTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '导出作品为 PDF 或 Markdown 格式',
    inputSchema: z.object({
      artwork_title: z.string().optional().describe('作品标题（用于搜索单个作品）'),
      artwork_ids: z.array(z.string()).optional().describe('作品 ID 列表'),
      format: z.enum(['pdf', 'md']).describe('导出格式：pdf 或 md'),
      include_price: z.boolean().optional().describe('是否包含价格信息'),
      include_status: z.boolean().optional().describe('是否包含版本状态详情'),
      include_location: z.boolean().optional().describe('是否包含位置信息'),
    }),
    execute: async ({ artwork_title, artwork_ids, format, include_price, include_status, include_location }) => {
      const { supabase } = ctx;

      // 如果提供了标题，先搜索作品获取 ID
      let finalArtworkIds = artwork_ids || [];

      if (artwork_title && finalArtworkIds.length === 0) {
        const sanitized = sanitizeSearchTerm(artwork_title);
        // 排除已删除的作品
        const { data: artworks, error } = await supabase
          .from('artworks')
          .select('id, title_en')
          .is('deleted_at', null)
          .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`)
          .limit(5);

        if (error) {
          return { error: error.message };
        }

        if (!artworks || artworks.length === 0) {
          return { error: t('export.artworkNotFound', { title: artwork_title }) };
        }

        // 如果只有一个匹配，直接使用
        if (artworks.length === 1) {
          finalArtworkIds = [artworks[0].id];
        } else {
          // 多个匹配，返回列表让用户选择
          return {
            type: 'multiple_matches',
            matches: artworks.map(a => ({ id: a.id, title: a.title_en })),
            message: t('export.multipleMatches', { count: artworks.length }),
          };
        }
      }

      // 确定导出范围
      const scope = finalArtworkIds.length === 0 ? 'all' : (finalArtworkIds.length === 1 ? 'single' : 'selected');

      // 构建导出请求参数
      const exportRequest = {
        scope,
        artworkIds: finalArtworkIds.length > 0 ? finalArtworkIds : undefined,
        format,
        options: {
          includePrice: include_price ?? false,
          includeStatus: include_status ?? false,
          includeLocation: include_location ?? false,
        },
      };

      // 返回导出准备信息（前端会根据这个信息触发下载）
      return {
        type: 'export_ready',
        format,
        scope,
        artworkCount: finalArtworkIds.length || '全部',
        exportRequest,
        message: t('export.ready', { format: format.toUpperCase() }),
      };
    },
  });
}
