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
 * 创建生成更新确认卡片工具
 *
 * 与 execute-update 共用同一份归一化规则。卡片只展示用户真正提到的字段，
 * 避免 GPT default-padded payload 让用户看到一堆"condition: excellent"
 * 之类的虚假改动 —— 用户一确认就会被 execute-update 写进 DB。
 */
export function createUpdateConfirmationTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: '生成版本更新的确认卡片，用户必须确认后才能执行更新',
    inputSchema: z.object({
      edition_id: z.string().describe('版本 ID'),
      updates: z.object({
        status: z.enum(STATUSES).nullable().optional().describe('新状态'),
        location_id: z.string().nullable().optional().describe('新位置 ID'),
        sale_price: z.number().nullable().optional().describe('销售价格'),
        sale_currency: z.enum(CURRENCIES).nullable().optional().describe('货币'),
        buyer_name: z.string().nullable().optional().describe('买家名称（仅 sold 状态，gifted 请用 notes）'),
        sold_at: z.string().nullable().optional().describe('销售日期'),
        notes: z.string().nullable().optional().describe('备注'),
        condition: z.enum(CONDITIONS).nullable().optional().describe('品相'),
        condition_notes: z.string().nullable().optional().describe('品相备注'),
        storage_detail: z.string().nullable().optional().describe('存储位置详情'),
        consignment_start: z.string().nullable().optional().describe('借出日期（at_gallery 状态）'),
        consignment_end: z.string().nullable().optional().describe('预计归还日期（at_gallery 状态）'),
        loan_start: z.string().nullable().optional().describe('展期开始日期（at_museum 状态）'),
        loan_end: z.string().nullable().optional().describe('展期结束日期（at_museum 状态）'),
      }).describe('要更新的字段'),
      reason: z.string().describe('更新原因/说明'),
    }),
    execute: async ({ edition_id, updates, reason }) => {
      const { supabase } = ctx;

      const u = (updates ?? {}) as Record<string, unknown>;
      const norm: Record<string, unknown> = {
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
      const cleanUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(norm)) {
        if (v !== undefined) cleanUpdates[k] = v;
      }

      if (Object.keys(cleanUpdates).length === 0) {
        return { error: t('update.noFields') };
      }

      // 获取当前版本信息（验证所有权）
      const { data: edition, error } = await supabase
        .from('editions')
        .select(`
          *,
          artworks!inner (title_en, title_cn, edition_total, user_id),
          locations (name)
        `)
        .eq('id', edition_id)
        .eq('artworks.user_id', ctx.userId)
        .single();

      if (error || !edition) {
        return { error: t('update.editionNotFound') };
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
        updates: cleanUpdates,
        reason,
        requires_confirmation: true,
      };
    },
  });
}
