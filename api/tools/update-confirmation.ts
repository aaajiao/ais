import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';

/**
 * 创建生成更新确认卡片工具
 */
export function createUpdateConfirmationTool(ctx: ToolContext) {
  return tool({
    description: '生成版本更新的确认卡片，用户必须确认后才能执行更新',
    inputSchema: z.object({
      edition_id: z.string().describe('版本 ID'),
      updates: z.object({
        status: z.string().optional().describe('新状态'),
        location_id: z.string().optional().describe('新位置 ID'),
        sale_price: z.number().optional().describe('销售价格'),
        sale_currency: z.string().optional().describe('货币'),
        buyer_name: z.string().optional().describe('买家名称'),
        sold_at: z.string().optional().describe('销售日期'),
        notes: z.string().optional().describe('备注'),
        condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional().describe('品相'),
        condition_notes: z.string().optional().describe('品相备注'),
        storage_detail: z.string().optional().describe('存储位置详情'),
        consignment_start: z.string().optional().describe('借出日期（at_gallery 状态）'),
        consignment_end: z.string().optional().describe('预计归还日期（at_gallery 状态）'),
        loan_start: z.string().optional().describe('展期开始日期（at_museum 状态）'),
        loan_end: z.string().optional().describe('展期结束日期（at_museum 状态）'),
      }).describe('要更新的字段'),
      reason: z.string().describe('更新原因/说明'),
    }),
    execute: async ({ edition_id, updates, reason }) => {
      const { supabase } = ctx;

      // 获取当前版本信息
      const { data: edition, error } = await supabase
        .from('editions')
        .select(`
          *,
          artworks (title_en, title_cn, edition_total),
          locations (name)
        `)
        .eq('id', edition_id)
        .single();

      if (error || !edition) {
        return { error: '找不到该版本' };
      }

      // 返回确认卡片数据
      return {
        type: 'confirmation_card',
        edition_id,
        current: {
          artwork_title: edition.artworks?.title_en || '',
          edition_number: edition.edition_number,
          edition_total: edition.artworks?.edition_total,
          status: edition.status,
          location: edition.locations?.name,
        },
        updates,
        reason,
        requires_confirmation: true,
      };
    },
  });
}
