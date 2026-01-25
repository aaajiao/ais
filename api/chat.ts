import { streamText, tool, convertToModelMessages, type UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth, unauthorizedResponse } from './lib/auth';

// 延迟创建 provider 实例的函数
function getAnthropicProvider() {
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
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

// 获取模型的函数
function getModel(modelKey: string) {
  const anthropic = getAnthropicProvider();
  const openai = getOpenAIProvider();

  // 精选模型列表
  const modelMap: Record<string, ReturnType<typeof anthropic>> = {
    // Anthropic Claude 系列
    'claude-sonnet-4.5': anthropic('claude-sonnet-4-5-20250929'),
    'claude-opus-4.5': anthropic('claude-opus-4-5-20251124'),
    'claude-haiku-4.5': anthropic('claude-haiku-4-5-20251015'),
    // OpenAI GPT 系列
    'gpt-5.2': openai('gpt-5.2'),
    'gpt-5.1': openai('gpt-5.1'),
    'gpt-4.1': openai('gpt-4.1'),
  };

  return modelMap[modelKey] || modelMap['claude-sonnet-4.5'];
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

重要规则：
- 对于查询操作，直接执行并返回结果
- 对于修改操作（更新状态、记录销售等），必须先生成确认卡片让用户确认
- 使用中文回复用户
- 回答要简洁明了
- 当工具返回的结果包含 message 字段时，务必将该信息传达给用户
- 如果数据库为空或没有找到数据，要明确告知用户，不要沉默不语

导出功能：
- 当用户说「导出 XXX」或「导出作品」时，使用 export_artworks 工具
- 支持 PDF 和 Markdown 两种格式
- 用户可选择是否包含价格、状态、位置信息
- 如果用户只说「备份数据」，提醒他们前往「设置」页面使用完整备份功能（JSON/CSV）

版本状态说明：
- in_production: 制作中 🔵
- in_studio: 在库 🟢
- at_gallery: 寄售 🟡
- at_museum: 美术馆 🟣
- in_transit: 运输中 🔵
- sold: 已售 🔴
- gifted: 赠送 🟠
- lost: 遗失 ⚫
- damaged: 损坏 ⚪

当用户说类似 "xxx 卖了" 或 "xxx 已售" 时，你需要：
1. 搜索对应的版本
2. 生成更新确认卡片，包含状态变更为 sold
3. 如果用户提供了价格信息，也一并记录`;

// 定义工具 - 使用函数形式以便延迟获取 supabase
function getTools() {
  const supabase = getSupabase();

  return {
    // 搜索作品
    search_artworks: tool({
      description: '搜索艺术作品，可以按标题、年份、类型搜索',
      inputSchema: z.object({
        query: z.string().optional().describe('搜索关键词（标题）'),
        year: z.string().optional().describe('年份'),
        type: z.string().optional().describe('作品类型'),
      }),
      execute: async ({ query, year, type }) => {
        let queryBuilder = supabase.from('artworks').select('*');

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
      description: '搜索版本，可以按作品名称、状态、位置搜索',
      inputSchema: z.object({
        artwork_title: z.string().optional().describe('作品标题'),
        edition_number: z.number().optional().describe('版本号'),
        status: z.string().optional().describe('状态'),
        location: z.string().optional().describe('位置'),
      }),
      execute: async ({ artwork_title, edition_number, status, location }) => {
        // 先搜索作品
        let artworkIds: string[] = [];
        if (artwork_title) {
          const sanitized = sanitizeSearchTerm(artwork_title);
          const { data: artworks } = await supabase
            .from('artworks')
            .select('id')
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
          const { data: artworks } = await supabase.from('artworks').select('id');
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
            const name = (e.locations as { name: string } | null)?.name || '未知';
            locationCounts[name] = (locationCounts[name] || 0) + 1;
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

        return {
          success: true,
          message: '更新成功',
          edition: data,
        };
      },
    }),

    // 搜索位置
    search_locations: tool({
      description: '搜索位置/画廊',
      inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
      }),
      execute: async ({ query }) => {
        const sanitized = sanitizeSearchTerm(query);
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%`)
          .limit(10);

        if (error) {
          return { error: error.message };
        }

        return { locations: data || [] };
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
          const { data: artworks, error } = await supabase
            .from('artworks')
            .select('id, title_en')
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
    const { messages: uiMessages, model = 'claude-sonnet-4.5' } = body;

    // 2. 安全日志（不记录敏感消息内容）
    console.log('[chat] Request', {
      userId: auth.userId,
      model,
      messageCount: uiMessages?.length,
    });

    // 获取模型（延迟初始化）
    const selectedModel = getModel(model);

    // 获取工具（延迟初始化）
    const tools = getTools();

    // 使用官方的 convertToModelMessages 转换 UIMessage 到 CoreMessage
    const modelMessages = await convertToModelMessages(uiMessages as UIMessage[]);

    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      maxSteps: 5,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('[chat] Error:', (error as Error).message);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
