import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';
import { sanitizeSearchTerm } from '../lib/search-utils.js';
import { createT } from '../lib/i18n.js';
import {
  normalizeString,
  normalizeNumber,
  normalizeEnum,
} from '../lib/normalize-filters.js';

const EDITION_TYPES = ['numbered', 'ap', 'unique'] as const;
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged'] as const;

/**
 * 创建搜索版本工具
 */
export function createSearchEditionsTool(ctx: ToolContext) {
  const t = createT(ctx.locale);
  return tool({
    description: `Search artwork editions (individual physical copies) by artwork title, edition number, status, location, edition type, condition, inventory number, buyer, price range, or sale date.
USE THIS WHEN the user mentions:
- A location, city, country, gallery, or museum name (e.g. "London", "北京", "Pace Gallery", "UCCA", "Germany", "在德国的版本", "什么作品在 london") — pass the place string to the \`location\` parameter (it matches name, city, AND country).
- A status (sold, in_studio, at_gallery, at_museum, in_transit, gifted, lost, damaged, in_production).
- A buyer / collector name, a price range, or a sale date range.
- A specific edition number, edition type (numbered/ap/unique), condition, or inventory number.
Examples: "什么作品在 london" → location:"London"; "Pace Gallery 有哪些版本" → location:"Pace Gallery"; "已售的版本" → status:"sold"; "某某买的作品" → buyer_name:"某某".`,
    inputSchema: z.object({
      artwork_title: z.string().nullable().optional().describe('作品标题'),
      edition_number: z.number().nullable().optional().describe('版本号'),
      status: z.string().nullable().optional().describe('状态'),
      location: z.string().nullable().optional().describe('Location filter — matches against location name, city, OR country (e.g. "London", "北京", "Pace Gallery", "UCCA", "Germany"). Pass the place string the user mentioned.'),
      edition_type: z.enum(EDITION_TYPES).nullable().optional().describe('版本类型'),
      condition: z.enum(CONDITIONS).nullable().optional().describe('品相'),
      inventory_number: z.string().nullable().optional().describe('库存编号'),
      buyer_name: z.string().nullable().optional().describe('买家名称'),
      price_min: z.number().nullable().optional().describe('最低价格'),
      price_max: z.number().nullable().optional().describe('最高价格'),
      sold_after: z.string().nullable().optional().describe('售出日期起始 (YYYY-MM-DD)'),
      sold_before: z.string().nullable().optional().describe('售出日期结束 (YYYY-MM-DD)'),
    }),
    execute: async (raw) => {
      const r = raw as Record<string, unknown>;
      const artwork_title = normalizeString(r.artwork_title);
      const edition_number = normalizeNumber(r.edition_number);
      const status = normalizeString(r.status);
      const location = normalizeString(r.location);
      const edition_type = normalizeEnum(r.edition_type, EDITION_TYPES);
      const condition = normalizeEnum(r.condition, CONDITIONS);
      const inventory_number = normalizeString(r.inventory_number);
      const buyer_name = normalizeString(r.buyer_name);
      const price_min = normalizeNumber(r.price_min);
      const price_max = normalizeNumber(r.price_max);
      const sold_after = normalizeString(r.sold_after);
      const sold_before = normalizeString(r.sold_before);

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
      // 三段式 hint（v1.2.4 改动）：让模型能区分"地点完全没匹配"和"地点匹配但没 edition 关联"
      // 这两种语义对用户的回答完全不同 ——
      //   no_location_match    → "不存在该地点"
      //   location_no_editions → "存在地点 X，但当前没有 edition 在那里"
      //   has_editions         → 正常返回 editions
      let locationIds: string[] = [];
      let matchedLocations: Array<{ id: string; name: string | null; city: string | null }> = [];
      if (location) {
        const sanitized = sanitizeSearchTerm(location);
        const { data: locations } = await supabase
          .from('locations')
          .select('id, name, city')
          .eq('user_id', ctx.userId)
          .or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,country.ilike.%${sanitized}%`);
        matchedLocations = (locations as typeof matchedLocations) || [];
        locationIds = matchedLocations.map(l => l.id);
        if (locationIds.length === 0) {
          return {
            editions: [],
            hint: 'no_location_match' as const,
            location,
            message: t('editions.noResultsWithTerms', { terms: location }),
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
        // 当只是按 location 过滤而没有 edition，返回 location_no_editions hint
        // ——告诉模型"地点找到了，但没 edition 关联到那里"
        if (location && matchedLocations.length > 0) {
          return {
            editions: [],
            hint: 'location_no_editions' as const,
            location,
            matched_locations: matchedLocations,
            message: searchTerms
              ? t('editions.noResultsWithTerms', { terms: searchTerms })
              : t('editions.noResultsEmpty'),
          };
        }
        return {
          editions: [],
          message: searchTerms
            ? t('editions.noResultsWithTerms', { terms: searchTerms })
            : t('editions.noResultsEmpty')
        };
      }

      return location ? { editions, hint: 'has_editions' as const } : { editions };
    },
    // 控制返回给模型的内容：包含 ID 和关键标识字段，以便后续工具调用
    toModelOutput({ output }) {
      const result = output as {
        editions?: Array<Record<string, unknown>>;
        message?: string;
        error?: string;
        hint?: 'no_location_match' | 'location_no_editions' | 'has_editions';
        location?: string;
        matched_locations?: Array<{ id: string; name: string | null; city: string | null }>;
      };

      if (result.error) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: t('search.error', { error: result.error }) }],
        };
      }

      if (!result.editions || result.editions.length === 0) {
        // 三段式 hint 对应不同的模型可见文本
        // 'no_location_match' → 明确告诉模型该地点不存在
        // 'location_no_editions' → 告诉模型地点存在但没 edition 关联（带匹配到的位置名）
        // 其他空结果 → 沿用 result.message
        let text: string;
        if (result.hint === 'no_location_match' && result.location) {
          text = t('editions.noLocationMatch', { location: result.location });
        } else if (result.hint === 'location_no_editions' && result.location) {
          const names = (result.matched_locations || [])
            .map(l => l.name || l.city)
            .filter(Boolean)
            .join('、');
          text = t('editions.locationNoEditions', {
            location: result.location,
            count: result.matched_locations?.length ?? 0,
            names: names || '-',
          });
        } else {
          text = result.message || t('editions.noMatch');
        }
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text }],
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
