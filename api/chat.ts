import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth, unauthorizedResponse } from './lib/auth.js';
import { extractArtworkFromUrl } from './lib/artwork-extractor.js';
import { selectBestImage } from './lib/image-downloader.js';

// 延迟创建 provider 实例的函数
function getAnthropicProvider() {
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Explicitly set baseURL to avoid issues with system ANTHROPIC_BASE_URL
    // (e.g., Claude Desktop sets it without /v1)
    baseURL: 'https://api.anthropic.com/v1',
  });
}

function getOpenAIProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// 延迟创建 Supabase 客户端
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

// 默认模型 ID
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// 根据模型 ID 动态选择 provider
function getModel(modelId: string) {
  const anthropic = getAnthropicProvider();
  const openai = getOpenAIProvider();

  // 使用完整的模型 ID
  const id = modelId || DEFAULT_MODEL;

  // 根据模型 ID 前缀判断使用哪个 provider
  if (id.startsWith('claude-')) {
    return anthropic(id);
  } else if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    return openai(id);
  }

  // 默认使用 Anthropic
  console.warn(`[chat] Unknown model prefix for "${id}", falling back to Anthropic`);
  return anthropic(id);
}

/**
 * SQL 注入防护：转义 ILIKE 搜索中的特殊字符
 */
function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

// 系统提示词
const systemPrompt = `你是 aaajiao 艺术作品库存管理系统的 AI 助手。你可以帮助用户：
1. 查询作品和版本信息
2. 更新版本状态（如标记为已售、寄售、在库等）
3. 记录销售信息（价格、买家、日期）
4. 管理版本位置
5. 从网页 URL 导入作品

重要规则：
- 对于查询操作，直接执行并返回结果
- 对于修改操作（更新状态、记录销售等），必须先生成确认卡片让用户确认
- 对于导入操作，直接执行并返回结果
- 使用中文回复用户
- 回答要简洁明了
- 当工具返回的结果包含 message 字段时，务必将该信息传达给用户
- 如果数据库为空或没有找到数据，要明确告知用户，不要沉默不语

导入功能：
- 当用户说「导入 URL」、「从 URL 添加作品」或直接发送网址时，使用 import_artwork_from_url 工具
- 导入会自动抓取网页、提取作品信息、下载缩略图并创建作品
- 如果作品已存在（通过 source_url 匹配），会更新而非重复创建
- 导入完成后告知用户作品名称和导入结果

导出功能：
- 当用户说「导出 XXX」或「导出作品」时，使用 export_artworks 工具
- 支持 PDF 和 Markdown 两种格式
- 用户可选择是否包含价格、状态、位置信息
- 如果用户只说「备份数据」，提醒他们前往「设置」页面使用完整备份功能（JSON/CSV）

版本状态说明：
- in_production: 制作中 🔵
- in_studio: 在库 🟢
- at_gallery: 外借中 🟡（借给画廊、私人藏家、机构等）
- at_museum: 展览中 🟣（在美术馆展览）
- in_transit: 运输中 🔵
- sold: 已售 🔴
- gifted: 赠送 🟠
- lost: 遗失 ⚫
- damaged: 损坏 ⚪

当用户说类似 "xxx 卖了" 或 "xxx 已售" 时，你需要：
1. 搜索对应的版本
2. 生成更新确认卡片，包含状态变更为 sold
3. 如果用户提供了价格信息，也一并记录

搜索能力：
- 可以按材料搜索作品（如「找所有用磁铁的作品」）
- 可以按版本类型筛选（如「所有 AP 版本」）
- 可以按品相筛选（如「品相为差的版本」）
- 可以按买家搜索（如「某某买的作品」）
- 可以按价格范围搜索（如「售价超过 10000 的版本」）
- 可以查询历史记录（如「这个版本什么时候卖的」「去年的销售记录」）

修改能力：
- 可以更新版本品相（condition）和品相备注
- 可以更新存储位置详情（storage_detail）
- 可以设置借展日期（consignment_start, loan_end）

不支持的操作（请用户通过界面操作）：
- 修改作品基本信息（标题、年份、材料等）
- 创建或修改位置
- 分配库存编号
- 修改证书编号`;

// 定义工具 - 使用函数形式以便延迟获取 supabase
function getTools(extractionModel?: string) {
  const supabase = getSupabase();

  return {
    // 搜索作品
    search_artworks: tool({
      description: '搜索艺术作品，可以按标题、年份、类型、材料搜索',
      inputSchema: z.object({
        query: z.string().optional().describe('搜索关键词（标题）'),
        year: z.string().optional().describe('年份'),
        type: z.string().optional().describe('作品类型'),
        materials: z.string().optional().describe('材料关键词'),
        is_unique: z.boolean().optional().describe('是否独版作品'),
      }),
      execute: async ({ query, year, type, materials, is_unique }) => {
        // 排除已删除的作品
        let queryBuilder = supabase.from('artworks').select('*').is('deleted_at', null);

        if (query) {
          const sanitized = sanitizeSearchTerm(query);
          queryBuilder = queryBuilder.or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);
        }
        if (year) {
          queryBuilder = queryBuilder.eq('year', year);
        }
        if (type) {
          const sanitized = sanitizeSearchTerm(type);
          queryBuilder = queryBuilder.ilike('type', `%${sanitized}%`);
        }
        if (materials) {
          const sanitized = sanitizeSearchTerm(materials);
          queryBuilder = queryBuilder.ilike('materials', `%${sanitized}%`);
        }
        if (is_unique !== undefined) {
          queryBuilder = queryBuilder.eq('is_unique', is_unique);
        }

        const { data, error } = await queryBuilder.limit(10);

        if (error) {
          return { error: error.message };
        }

        const artworks = data || [];
        if (artworks.length === 0) {
          return {
            artworks: [],
            message: query
              ? `没有找到与「${query}」相关的作品。数据库中可能还没有添加作品数据。`
              : '数据库中还没有任何作品数据。请先添加一些作品。'
          };
        }

        return { artworks };
      },
    }),

    // 搜索版本
    search_editions: tool({
      description: '搜索版本，可以按作品名称、状态、位置、版本类型、品相、买家、价格等搜索',
      inputSchema: z.object({
        artwork_title: z.string().optional().describe('作品标题'),
        edition_number: z.number().optional().describe('版本号'),
        status: z.string().optional().describe('状态'),
        location: z.string().optional().describe('位置'),
        edition_type: z.enum(['numbered', 'ap', 'unique']).optional().describe('版本类型'),
        condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional().describe('品相'),
        inventory_number: z.string().optional().describe('库存编号'),
        buyer_name: z.string().optional().describe('买家名称'),
        price_min: z.number().optional().describe('最低价格'),
        price_max: z.number().optional().describe('最高价格'),
        sold_after: z.string().optional().describe('售出日期起始 (YYYY-MM-DD)'),
        sold_before: z.string().optional().describe('售出日期结束 (YYYY-MM-DD)'),
      }),
      execute: async ({ artwork_title, edition_number, status, location, edition_type, condition, inventory_number, buyer_name, price_min, price_max, sold_after, sold_before }) => {
        // 先搜索作品（排除已删除的）
        let artworkIds: string[] = [];
        if (artwork_title) {
          const sanitized = sanitizeSearchTerm(artwork_title);
          const { data: artworks } = await supabase
            .from('artworks')
            .select('id')
            .is('deleted_at', null)
            .or(`title_en.ilike.%${sanitized}%,title_cn.ilike.%${sanitized}%`);
          artworkIds = artworks?.map(a => a.id) || [];
        }

        // 搜索版本
        let queryBuilder = supabase
          .from('editions')
          .select(`
            *,
            artworks (id, title_en, title_cn, year, edition_total),
            locations (id, name, city)
          `);

        if (artworkIds.length > 0) {
          queryBuilder = queryBuilder.in('artwork_id', artworkIds);
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

        const { data, error } = await queryBuilder.limit(20);

        if (error) {
          return { error: error.message };
        }

        // 如果指定了位置，进行过滤
        let editions = data || [];
        if (location) {
          editions = editions.filter(e =>
            e.locations?.name?.toLowerCase().includes(location.toLowerCase()) ||
            e.locations?.city?.toLowerCase().includes(location.toLowerCase())
          );
        }

        if (editions.length === 0) {
          const searchTerms = [artwork_title, status, location].filter(Boolean).join('、');
          return {
            editions: [],
            message: searchTerms
              ? `没有找到符合条件的版本（搜索：${searchTerms}）。数据库中可能还没有相关数据。`
              : '数据库中还没有任何版本数据。请先添加一些作品和版本。'
          };
        }

        return { editions };
      },
    }),

    // 获取统计信息
    get_statistics: tool({
      description: '获取库存统计信息',
      inputSchema: z.object({
        type: z.enum(['overview', 'by_status', 'by_location']).describe('统计类型'),
      }),
      execute: async ({ type }) => {
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
    }),

    // 生成更新确认卡片
    generate_update_confirmation: tool({
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
          consignment_start: z.string().optional().describe('借展/寄售开始日期'),
          loan_end: z.string().optional().describe('借展结束日期'),
        }).describe('要更新的字段'),
        reason: z.string().describe('更新原因/说明'),
      }),
      execute: async ({ edition_id, updates, reason }) => {
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
    }),

    // 执行更新（在用户确认后调用）
    execute_edition_update: tool({
      description: '执行版本更新（仅在用户确认后调用）',
      inputSchema: z.object({
        edition_id: z.string().describe('版本 ID'),
        updates: z.object({
          status: z.string().optional(),
          location_id: z.string().optional(),
          sale_price: z.number().optional(),
          sale_currency: z.string().optional(),
          buyer_name: z.string().optional(),
          sold_at: z.string().optional(),
          notes: z.string().optional(),
          condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
          condition_notes: z.string().optional(),
          storage_detail: z.string().optional(),
          consignment_start: z.string().optional(),
          loan_end: z.string().optional(),
        }).describe('要更新的字段'),
        confirmed: z.boolean().describe('用户是否已确认'),
      }),
      execute: async ({ edition_id, updates, confirmed }) => {
        if (!confirmed) {
          return { error: '用户未确认，操作取消' };
        }

        // 获取原始数据用于历史记录
        const { data: originalEdition } = await supabase
          .from('editions')
          .select('*')
          .eq('id', edition_id)
          .single();

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
          });
        } else if (updates.location_id && updates.location_id !== originalEdition?.location_id) {
          // 位置变更
          await supabase.from('edition_history').insert({
            edition_id,
            action: 'location_change',
            from_location: originalEdition?.location_id || null,
            to_location: updates.location_id,
            notes: '通过 AI 助手更新',
          });
        }

        // 品相变更记录
        if (updates.condition && updates.condition !== originalEdition?.condition) {
          await supabase.from('edition_history').insert({
            edition_id,
            action: 'condition_update',
            notes: `品相从 ${originalEdition?.condition || '未设置'} 更新为 ${updates.condition}。通过 AI 助手更新。`,
          });
        }

        return {
          success: true,
          message: '更新成功',
          edition: data,
        };
      },
    }),

    // 搜索位置
    search_locations: tool({
      description: '搜索位置/画廊，可以按名称、城市、类型、国家搜索',
      inputSchema: z.object({
        query: z.string().optional().describe('搜索关键词（名称或城市）'),
        type: z.enum(['studio', 'gallery', 'museum', 'other']).optional().describe('位置类型'),
        country: z.string().optional().describe('国家'),
      }),
      execute: async ({ query, type, country }) => {
        let queryBuilder = supabase.from('locations').select('*');

        if (query) {
          const sanitized = sanitizeSearchTerm(query);
          queryBuilder = queryBuilder.or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%`);
        }
        if (type) {
          queryBuilder = queryBuilder.eq('type', type);
        }
        if (country) {
          const sanitized = sanitizeSearchTerm(country);
          queryBuilder = queryBuilder.ilike('country', `%${sanitized}%`);
        }

        const { data, error } = await queryBuilder.limit(10);

        if (error) {
          return { error: error.message };
        }

        return { locations: data || [] };
      },
    }),

    // 搜索历史记录
    search_history: tool({
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
        let queryBuilder = supabase
          .from('edition_history')
          .select(`
            *,
            editions (
              id,
              edition_number,
              edition_type,
              artworks (id, title_en, title_cn)
            )
          `)
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
                message: `没有找到作品「${artwork_title}」的版本历史记录`,
              };
            }
          } else {
            return {
              history: [],
              message: `没有找到名为「${artwork_title}」的作品`,
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
            message: '没有找到匹配的历史记录',
          };
        }

        return { history: data };
      },
    }),

    // 导出作品
    export_artworks: tool({
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
            return { error: `找不到名为「${artwork_title}」的作品` };
          }

          // 如果只有一个匹配，直接使用
          if (artworks.length === 1) {
            finalArtworkIds = [artworks[0].id];
          } else {
            // 多个匹配，返回列表让用户选择
            return {
              type: 'multiple_matches',
              matches: artworks.map(a => ({ id: a.id, title: a.title_en })),
              message: `找到 ${artworks.length} 个匹配的作品，请指定具体的作品名称或使用作品 ID`,
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
          message: `已准备好 ${format.toUpperCase()} 导出，点击下方按钮下载`,
        };
      },
    }),

    // 从 URL 导入作品
    import_artwork_from_url: tool({
      description: '从网页 URL 抓取作品信息并自动创建作品。会自动提取标题、年份、类型、尺寸、材料等信息，并获取缩略图 URL。',
      inputSchema: z.object({
        url: z.string().url().describe('作品页面的完整 URL'),
      }),
      execute: async ({ url }) => {
        console.log('[import_artwork_from_url] Starting import:', url, 'model:', extractionModel || 'default');

        // 1. 抓取并解析网页（使用配置的提取模型）
        const extractResult = await extractArtworkFromUrl(url, extractionModel);

        if (!extractResult.success || !extractResult.artwork) {
          return {
            error: extractResult.error || '无法从页面提取作品信息',
          };
        }

        const { artwork, images } = extractResult;
        console.log('[import_artwork_from_url] Extracted:', artwork.title_en);

        // 2. 检查是否已存在（通过 source_url）
        let existingId: string | null = null;
        const { data: existingByUrl } = await supabase
          .from('artworks')
          .select('id, title_en')
          .eq('source_url', url)
          .is('deleted_at', null)
          .maybeSingle();

        if (existingByUrl) {
          existingId = existingByUrl.id;
          console.log('[import_artwork_from_url] Found existing by URL:', existingId);
        }

        // 3. 如果没有通过 URL 找到，尝试通过标题匹配
        if (!existingId && artwork.title_en) {
          const { data: existingByTitle } = await supabase
            .from('artworks')
            .select('id, source_url')
            .eq('title_en', artwork.title_en)
            .is('deleted_at', null);

          if (existingByTitle && existingByTitle.length === 1) {
            const matched = existingByTitle[0];
            // 如果两者都有 source_url 且不同，视为不同作品
            if (!(url && matched.source_url && url !== matched.source_url)) {
              existingId = matched.id;
              console.log('[import_artwork_from_url] Found existing by title:', existingId);
            }
          }
        }

        // 4. 准备作品数据
        const artworkData: Record<string, unknown> = {
          title_en: artwork.title_en,
          title_cn: artwork.title_cn,
          year: artwork.year,
          type: artwork.type,
          dimensions: artwork.dimensions,
          materials: artwork.materials,
          duration: artwork.duration,
          source_url: url,
          updated_at: new Date().toISOString(),
        };

        let artworkId: string;
        let action: 'created' | 'updated';

        // 5. 创建或更新作品
        if (existingId) {
          // 更新现有作品
          const { error: updateError } = await supabase
            .from('artworks')
            .update(artworkData)
            .eq('id', existingId);

          if (updateError) {
            return { error: `更新作品失败: ${updateError.message}` };
          }

          artworkId = existingId;
          action = 'updated';
        } else {
          // 创建新作品
          artworkData.created_at = new Date().toISOString();
          const { data: newArtwork, error: insertError } = await supabase
            .from('artworks')
            .insert(artworkData)
            .select('id')
            .single();

          if (insertError || !newArtwork) {
            return { error: `创建作品失败: ${insertError?.message || '未知错误'}` };
          }

          artworkId = newArtwork.id;
          action = 'created';
        }

        // 6. 设置缩略图 URL（存储远程 URL，后续由系统自动压缩上传）
        const bestImage = selectBestImage(images);

        if (bestImage) {
          console.log('[import_artwork_from_url] Setting thumbnail URL:', bestImage);
          await supabase
            .from('artworks')
            .update({ thumbnail_url: bestImage })
            .eq('id', artworkId);
        }

        // 7. 返回结果
        const actionText = action === 'created' ? '已创建' : '已更新';
        const thumbnailText = bestImage ? '，已获取缩略图' : '';

        return {
          success: true,
          action,
          artwork_id: artworkId,
          artwork_title: artwork.title_en,
          has_thumbnail: !!bestImage,
          message: `${actionText}作品「${artwork.title_en}」${thumbnailText}`,
        };
      },
    }),
  };
}

// Vercel Edge Function
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 1. 验证身份认证
    const auth = await verifyAuth(req);
    if (!auth.success) {
      return unauthorizedResponse(auth.error || 'Unauthorized');
    }

    const body = await req.json();
    const { messages: uiMessages, model = 'claude-sonnet-4.5', extractionModel } = body;

    // 2. 安全日志（不记录敏感消息内容）
    console.log('[chat] Request', {
      userId: auth.userId,
      model,
      extractionModel: extractionModel || 'default',
      messageCount: uiMessages?.length,
    });

    // 获取模型（延迟初始化）
    const selectedModel = getModel(model);

    // 获取工具（延迟初始化，传入提取模型）
    const tools = getTools(extractionModel);

    // 使用官方的 convertToModelMessages 转换 UIMessage 到 CoreMessage
    const modelMessages = await convertToModelMessages(uiMessages as UIMessage[]);

    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const err = error as Error & { cause?: Error; status?: number; statusText?: string };
    console.error('[chat] Error:', {
      message: err.message,
      name: err.name,
      cause: err.cause?.message,
      status: err.status,
      statusText: err.statusText,
      stack: err.stack?.slice(0, 500),
    });

    // 返回更具体的错误信息
    const errorMessage = err.message || 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
