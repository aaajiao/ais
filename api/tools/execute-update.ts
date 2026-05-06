import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { createT } from '../lib/i18n.js';
import {
  normalizeString,
  normalizeNumber,
  normalizeEnum,
} from '../lib/normalize-filters.js';

const STATUSES = [
  'in_production',
  'in_studio',
  'at_gallery',
  'at_museum',
  'in_transit',
  'sold',
  'gifted',
  'lost',
  'damaged',
] as const;
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged'] as const;
const CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'CHF', 'HKD', 'JPY'] as const;

/**
 * 创建执行版本更新工具
 *
 * OpenAI strict mode 兼容（v1.3.2 起）：所有 optional 字段 .nullable().optional()，
 * execute 入口对每个字段做物理归一（'' / 0 / null / undefined → undefined），
 * 然后只把"用户真正提到的字段"写进 supabase update payload。
 *
 * 这条不是可选优化 —— 任何归一化为 undefined 的字段绝不能进 update payload，
 * 否则会用 null 覆盖既有数据（例如 GPT 默认 location_id='' 会写空串到 UUID FK 列）。
 */
export function createExecuteUpdateTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '执行版本更新（仅在用户确认后调用）',
    inputSchema: z.object({
      edition_id: z.string().describe('版本 ID'),
      updates: z.object({
        status: z.enum(STATUSES).nullable().optional(),
        location_id: z.string().nullable().optional(),
        sale_price: z.number().nullable().optional(),
        sale_currency: z.enum(CURRENCIES).nullable().optional(),
        buyer_name: z.string().nullable().optional().describe('买家名称（仅 sold 状态，gifted 请用 notes）'),
        sold_at: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        condition: z.enum(CONDITIONS).nullable().optional(),
        condition_notes: z.string().nullable().optional(),
        storage_detail: z.string().nullable().optional(),
        consignment_start: z.string().nullable().optional(),
        consignment_end: z.string().nullable().optional(),
        loan_start: z.string().nullable().optional(),
        loan_end: z.string().nullable().optional(),
      }).describe('要更新的字段'),
      confirmed: z.boolean().describe('用户是否已确认'),
    }),
    execute: async ({ edition_id, updates, confirmed }) => {
      const { supabase } = ctx;

      if (!confirmed) {
        return { error: t('update.notConfirmed') };
      }

      const u = (updates ?? {}) as Record<string, unknown>;
      const norm = {
        status: normalizeEnum(u.status, STATUSES),
        location_id: normalizeString(u.location_id),
        sale_price: normalizeNumber(u.sale_price),
        sale_currency: normalizeEnum(u.sale_currency, CURRENCIES),
        buyer_name: normalizeString(u.buyer_name),
        sold_at: normalizeString(u.sold_at),
        notes: normalizeString(u.notes),
        condition: normalizeEnum(u.condition, CONDITIONS),
        condition_notes: normalizeString(u.condition_notes),
        storage_detail: normalizeString(u.storage_detail),
        consignment_start: normalizeString(u.consignment_start),
        consignment_end: normalizeString(u.consignment_end),
        loan_start: normalizeString(u.loan_start),
        loan_end: normalizeString(u.loan_end),
      };

      // 提前拒绝纯默认值 payload —— 没有任何用户真正提到的字段，不应触发任何写
      const hasAnyField = Object.values(norm).some((v) => v !== undefined);
      if (!hasAnyField) {
        return { error: t('update.noFields') };
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

      // 构建 update payload —— 只放归一化后非 undefined 的字段
      // 注意 sold_at → sale_date 字段映射
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (norm.status !== undefined) updateData.status = norm.status;
      if (norm.location_id !== undefined) updateData.location_id = norm.location_id;
      if (norm.sale_price !== undefined) updateData.sale_price = norm.sale_price;
      if (norm.sale_currency !== undefined) updateData.sale_currency = norm.sale_currency;
      if (norm.buyer_name !== undefined) updateData.buyer_name = norm.buyer_name;
      if (norm.sold_at !== undefined) updateData.sale_date = norm.sold_at;
      if (norm.notes !== undefined) updateData.notes = norm.notes;
      if (norm.condition !== undefined) updateData.condition = norm.condition;
      if (norm.condition_notes !== undefined) updateData.condition_notes = norm.condition_notes;
      if (norm.storage_detail !== undefined) updateData.storage_detail = norm.storage_detail;
      if (norm.consignment_start !== undefined) updateData.consignment_start = norm.consignment_start;
      if (norm.consignment_end !== undefined) updateData.consignment_end = norm.consignment_end;
      if (norm.loan_start !== undefined) updateData.loan_start = norm.loan_start;
      if (norm.loan_end !== undefined) updateData.loan_end = norm.loan_end;

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
      //
      // 重要：这里的显式 insert 与 DB 触发器 record_edition_status_change
      // 是绑定的——触发器在 auth.uid() IS NULL（service key 上下文）时跳过，
      // 必须由这里写入历史。删除任何一边都会导致 AI 更新落 0 行历史。
      // 见 supabase/migrations/archived/003_fix_edition_history_double_write.sql
      if (norm.status && norm.status !== originalEdition?.status) {
        let historyAction: string = 'status_change';
        if (norm.status === 'sold') historyAction = 'sold';
        else if (norm.status === 'at_gallery') historyAction = 'consigned';
        else if (norm.status === 'in_studio' && originalEdition?.status === 'at_gallery') historyAction = 'returned';

        await supabase.from('edition_history').insert({
          edition_id,
          action: historyAction,
          from_status: originalEdition?.status || null,
          to_status: norm.status,
          from_location: originalEdition?.location_id || null,
          to_location: norm.location_id || originalEdition?.location_id || null,
          related_party: norm.buyer_name || null,
          price: norm.sale_price ?? null,
          currency: norm.sale_currency || null,
          notes: '通过 AI 助手更新',
          created_by: ctx.userId,
        });
      } else if (norm.location_id && norm.location_id !== originalEdition?.location_id) {
        await supabase.from('edition_history').insert({
          edition_id,
          action: 'location_change',
          from_location: originalEdition?.location_id || null,
          to_location: norm.location_id,
          notes: '通过 AI 助手更新',
          created_by: ctx.userId,
        });
      }

      // 品相变更记录
      if (norm.condition && norm.condition !== originalEdition?.condition) {
        await supabase.from('edition_history').insert({
          edition_id,
          action: 'condition_update',
          notes: `品相从 ${originalEdition?.condition || '未设置'} 更新为 ${norm.condition}。通过 AI 助手更新。`,
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
