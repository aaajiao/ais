import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';
import {
  normalizeString,
  normalizeBoolean,
} from '../lib/normalize-filters.js';

/**
 * 创建导出作品工具
 *
 * include_* 三个 bool 字段在 GPT 默认填 false 时会丢失关键导出信息，
 * 因此 fallback 到 true（默认全包含），与 v1.3.1 之前的人工调用习惯一致。
 */
export function createExportArtworksTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '导出作品为 PDF 或 Markdown 格式',
    inputSchema: z.object({
      artwork_title: z.string().nullable().optional().describe('作品标题（用于搜索单个作品）'),
      artwork_ids: z.array(z.string()).nullable().optional().describe('作品 ID 列表'),
      format: z.enum(['pdf', 'md']).describe('导出格式：pdf 或 md'),
      include_price: z.boolean().nullable().optional().describe('是否包含价格信息（默认 true）'),
      include_status: z.boolean().nullable().optional().describe('是否包含版本状态详情（默认 true）'),
      include_location: z.boolean().nullable().optional().describe('是否包含位置信息（默认 true）'),
    }),
    execute: async (raw) => {
      const r = raw as Record<string, unknown>;
      const artwork_title = normalizeString(r.artwork_title);
      const artwork_ids = Array.isArray(r.artwork_ids)
        ? (r.artwork_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
      const format = r.format as 'pdf' | 'md';
      const include_price = normalizeBoolean(r.include_price) ?? true;
      const include_status = normalizeBoolean(r.include_status) ?? true;
      const include_location = normalizeBoolean(r.include_location) ?? true;

      const { supabase } = ctx;

      // 如果提供了标题，先搜索作品获取 ID
      let finalArtworkIds = artwork_ids;

      if (artwork_title && finalArtworkIds.length === 0) {
        const sanitized = sanitizeSearchTerm(artwork_title);
        const { data: artworks, error } = await supabase
          .from('artworks')
          .select('id, title_en')
          .eq('user_id', ctx.userId)
          .is('deleted_at', null)
          .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`)
          .limit(5);

        if (error) {
          return { error: error.message };
        }

        if (!artworks || artworks.length === 0) {
          return { error: t('export.artworkNotFound', { title: artwork_title }) };
        }

        if (artworks.length === 1) {
          finalArtworkIds = [artworks[0].id];
        } else {
          return {
            type: 'multiple_matches',
            matches: artworks.map(a => ({ id: a.id, title: a.title_en })),
            message: t('export.multipleMatches', { count: artworks.length }),
          };
        }
      }

      const scope = finalArtworkIds.length === 0 ? 'all' : (finalArtworkIds.length === 1 ? 'single' : 'selected');

      const exportRequest = {
        scope,
        artworkIds: finalArtworkIds.length > 0 ? finalArtworkIds : undefined,
        format,
        options: {
          includePrice: include_price,
          includeStatus: include_status,
          includeLocation: include_location,
        },
      };

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
