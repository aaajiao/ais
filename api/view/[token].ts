/**
 * 公开展示 API
 *
 * GET /api/view/:token - 获取展示内容（无需认证）
 *
 * 返回该位置的所有版本及其关联的作品信息
 */

import { createClient } from '@supabase/supabase-js';

// 使用 Edge Runtime
export const config = {
  runtime: 'edge',
};

// 延迟创建 Supabase 客户端（使用 service key 绕过 RLS）
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

export default async function handler(request: Request) {
  const method = request.method;

  if (method === 'OPTIONS') {
    return handleOptions();
  } else if (method === 'GET') {
    return handleGet(request);
  } else {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function handleGet(request: Request) {
  const supabase = getSupabase();

  try {
    // 从 URL 中提取 token
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 查找链接
    const { data: link, error: linkError } = await supabase
      .from('gallery_links')
      .select('*')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return new Response(
        JSON.stringify({ error: 'invalid', message: '链接无效或已过期' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 检查链接状态
    if (link.status === 'disabled') {
      return new Response(
        JSON.stringify({ error: 'disabled', message: '此链接已被禁用' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 查找位置
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id, name, type')
      .eq('name', link.gallery_name)
      .single();

    if (locationError || !location) {
      return new Response(
        JSON.stringify({ error: 'location_not_found', message: '关联的位置不存在' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 查询该位置的所有版本及关联作品
    const { data: editions, error: editionsError } = await supabase
      .from('editions')
      .select(`
        id,
        inventory_number,
        edition_type,
        edition_number,
        status,
        sale_price,
        sale_currency,
        artwork:artworks (
          id,
          title_en,
          title_cn,
          year,
          type,
          materials,
          dimensions,
          duration,
          thumbnail_url,
          source_url,
          edition_total,
          ap_total,
          is_unique
        )
      `)
      .eq('location_id', location.id)
      .order('created_at', { ascending: false });

    if (editionsError) {
      console.error('[view] Failed to fetch editions:', editionsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch editions' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 更新访问统计（异步，不阻塞响应）
    supabase
      .from('gallery_links')
      .update({
        access_count: (link.access_count || 0) + 1,
        last_accessed: new Date().toISOString(),
      })
      .eq('id', link.id)
      .then(() => {
        // 静默更新
      });

    // 处理返回数据
    const items = (editions || []).map((edition) => {
      const artwork = edition.artwork as unknown as {
        id: string;
        title_en: string;
        title_cn: string | null;
        year: string | null;
        type: string | null;
        materials: string | null;
        dimensions: string | null;
        duration: string | null;
        thumbnail_url: string | null;
        source_url: string | null;
        edition_total: number | null;
        ap_total: number | null;
        is_unique: boolean | null;
      } | null;

      // 跳过没有关联作品的版本
      if (!artwork) {
        return null;
      }

      // 格式化版本编号（如 "2/3" 或 "AP 1/2" 或 "Unique"）
      let editionLabel = '';
      if (edition.edition_type === 'unique' || artwork.is_unique) {
        editionLabel = 'Unique';
      } else if (edition.edition_type === 'ap') {
        if (edition.edition_number && artwork.ap_total) {
          editionLabel = `AP ${edition.edition_number}/${artwork.ap_total}`;
        } else if (edition.edition_number) {
          editionLabel = `AP ${edition.edition_number}`;
        } else {
          editionLabel = 'AP';
        }
      } else if (edition.edition_number) {
        if (artwork.edition_total) {
          editionLabel = `${edition.edition_number}/${artwork.edition_total}`;
        } else {
          editionLabel = `${edition.edition_number}`;
        }
      }

      // 格式化版本总数描述（如 "3 版 + 1 AP"）
      let editionInfo = '';
      if (artwork.is_unique) {
        editionInfo = 'Unique';
      } else {
        const parts = [];
        if (artwork.edition_total) {
          parts.push(`${artwork.edition_total} 版`);
        }
        if (artwork.ap_total) {
          parts.push(`${artwork.ap_total} AP`);
        }
        editionInfo = parts.join(' + ');
      }

      return {
        edition_id: edition.id,
        inventory_number: edition.inventory_number,
        edition_label: editionLabel,
        edition_info: editionInfo,
        edition_type: edition.edition_type,
        status: edition.status,
        // 根据配置决定是否包含价格
        price: link.show_prices ? edition.sale_price : null,
        currency: link.show_prices ? edition.sale_currency : null,
        // 作品信息
        artwork: {
          id: artwork.id,
          title_en: artwork.title_en,
          title_cn: artwork.title_cn,
          year: artwork.year,
          type: artwork.type,
          materials: artwork.materials,
          dimensions: artwork.dimensions,
          duration: artwork.duration,
          thumbnail_url: artwork.thumbnail_url,
          source_url: artwork.source_url,
        },
      };
    }).filter(Boolean);

    return new Response(
      JSON.stringify({
        location: {
          name: location.name,
          type: location.type,
        },
        show_prices: link.show_prices,
        items,
        total: items.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // 允许跨域访问（公开 API）
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('[view] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
