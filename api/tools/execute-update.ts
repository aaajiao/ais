import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { createT } from '../lib/i18n.js';

/**
 * 创建执行版本更新工具
 */
export function createExecuteUpdateTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '执行版本更新（仅在用户确认后调用）',
    inputSchema: z.object({
      edition_id: z.string().describe('版本 ID'),
      updates: z.object({
        status: z.string().optional(),
        location_id: z.string().optional(),
        sale_price: z.number().optional(),
        sale_currency: z.string().optional(),
        buyer_name: z.string().optional().describe('买家名称（仅 sold 状态，gifted 请用 notes）'),
        sold_at: z.string().optional(),
        notes: z.string().optional(),
        condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
        condition_notes: z.string().optional(),
        storage_detail: z.string().optional(),
        consignment_start: z.string().optional(),
        consignment_end: z.string().optional(),
        loan_start: z.string().optional(),
        loan_end: z.string().optional(),
      }).describe('要更新的字段'),
      confirmed: z.boolean().describe('用户是否已确认'),
    }),
    execute: async ({ edition_id, updates, confirmed }) => {
      const { supabase } = ctx;

      if (!confirmed) {
        return { error: t('update.notConfirmed') };
      }

      // 获取原始数据用于历史记录，并验证所有权
      const { data: originalEdition } = await supabase
        .from('editions')
        .select('*, artworks!inner(user_id)')
        .eq('id', edition_id)
        .single();

      // 验证版本属于当前用户
      const artworkOwner = (originalEdition as Record<string, unknown>)?.artworks as { user_id: string } | null;
      if (!originalEdition || artworkOwner?.user_id !== ctx.userId) {
        return { error: t('update.editionNotFound') };
      }

      // 构建更新数据，处理字段映射 (sold_at -> sale_date)
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.status) updateData.status = updates.status;
      if (updates.location_id) updateData.location_id = updates.location_id;
      if (updates.sale_price) updateData.sale_price = updates.sale_price;
      if (updates.sale_currency) updateData.sale_currency = updates.sale_currency;
      if (updates.buyer_name) updateData.buyer_name = updates.buyer_name;
      if (updates.sold_at) updateData.sale_date = updates.sold_at; // 字段映射
      if (updates.notes) updateData.notes = updates.notes;
      if (updates.condition) updateData.condition = updates.condition;
      if (updates.condition_notes) updateData.condition_notes = updates.condition_notes;
      if (updates.storage_detail) updateData.storage_detail = updates.storage_detail;
      if (updates.consignment_start) updateData.consignment_start = updates.consignment_start;
      if (updates.consignment_end) updateData.consignment_end = updates.consignment_end;
      if (updates.loan_start) updateData.loan_start = updates.loan_start;
      if (updates.loan_end) updateData.loan_end = updates.loan_end;

      // 执行更新
      const { data, error } = await supabase
        .from('editions')
        .update(updateData)
        .eq('id', edition_id)
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }

      // 记录历史 - 使用正确的枚举值和字段
      if (updates.status && updates.status !== originalEdition?.status) {
        // 根据状态变更类型选择正确的 action 枚举值
        let historyAction: string = 'status_change';
        if (updates.status === 'sold') historyAction = 'sold';
        else if (updates.status === 'at_gallery') historyAction = 'consigned';
        else if (updates.status === 'in_studio' && originalEdition?.status === 'at_gallery') historyAction = 'returned';

        await supabase.from('edition_history').insert({
          edition_id,
          action: historyAction,
          from_status: originalEdition?.status || null,
          to_status: updates.status,
          from_location: originalEdition?.location_id || null,
          to_location: updates.location_id || originalEdition?.location_id || null,
          related_party: updates.buyer_name || null,
          price: updates.sale_price || null,
          currency: updates.sale_currency || null,
          notes: '通过 AI 助手更新',
          created_by: ctx.userId,
        });
      } else if (updates.location_id && updates.location_id !== originalEdition?.location_id) {
        // 位置变更
        await supabase.from('edition_history').insert({
          edition_id,
          action: 'location_change',
          from_location: originalEdition?.location_id || null,
          to_location: updates.location_id,
          notes: '通过 AI 助手更新',
          created_by: ctx.userId,
        });
      }

      // 品相变更记录
      if (updates.condition && updates.condition !== originalEdition?.condition) {
        await supabase.from('edition_history').insert({
          edition_id,
          action: 'condition_update',
          notes: `品相从 ${originalEdition?.condition || '未设置'} 更新为 ${updates.condition}。通过 AI 助手更新。`,
          created_by: ctx.userId,
        });
      }

      return {
        success: true,
        message: t('update.success'),
        edition: data,
      };
    },
  });
}
