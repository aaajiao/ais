/**
 * 链接管理 API
 *
 * GET    - 获取所有链接（需认证）
 * POST   - 创建新链接（需认证）
 * PATCH  - 更新链接设置（需认证）
 * DELETE - 删除链接（需认证）
 */

import { createClient } from '@supabase/supabase-js';
import { verifyAuth, unauthorizedResponse, getJsonBody } from '../lib/auth.js';

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

// 生成唯一 token
function generateToken(): string {
  return crypto.randomUUID();
}

export default async function handler(request: Request) {
  const method = request.method;

  if (method === 'GET') {
    return handleGet(request);
  } else if (method === 'POST') {
    return handlePost(request);
  } else if (method === 'PATCH') {
    return handlePatch(request);
  } else if (method === 'DELETE') {
    return handleDelete(request);
  } else {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleGet(request: Request) {
  // 验证认证
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    // 获取所有链接
    const { data: links, error } = await supabase
      .from('gallery_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[links] Failed to fetch links:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch links' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 获取每个链接关联位置的作品数量
    const linksWithStats = await Promise.all(
      (links || []).map(async (link) => {
        // 查找位置 ID
        const { data: location } = await supabase
          .from('locations')
          .select('id')
          .eq('name', link.gallery_name)
          .single();

        let editionCount = 0;
        if (location) {
          // 统计该位置的版本数量
          const { count } = await supabase
            .from('editions')
            .select('*', { count: 'exact', head: true })
            .eq('location_id', location.id);
          editionCount = count || 0;
        }

        return {
          ...link,
          edition_count: editionCount,
        };
      })
    );

    return new Response(
      JSON.stringify({ links: linksWithStats }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[links] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handlePost(request: Request) {
  // 验证认证
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const body = await getJsonBody<{
      location_name: string;
      show_prices?: boolean;
    }>(request);

    if (!body.location_name) {
      return new Response(
        JSON.stringify({ error: 'location_name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 检查位置是否存在
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id, name')
      .eq('name', body.location_name)
      .single();

    if (locationError || !location) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 检查是否已存在该位置的链接
    const { data: existing } = await supabase
      .from('gallery_links')
      .select('id')
      .eq('gallery_name', body.location_name)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Link already exists for this location' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 创建链接（不设置 created_by，避免外键约束问题）
    const { data: link, error } = await supabase
      .from('gallery_links')
      .insert({
        gallery_name: body.location_name,
        token: generateToken(),
        status: 'active',
        show_prices: body.show_prices ?? true,
        access_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[links] Failed to create link:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ link }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[links] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handlePatch(request: Request) {
  // 验证认证
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const body = await getJsonBody<{
      id: string;
      status?: 'active' | 'disabled';
      show_prices?: boolean;
      reset_token?: boolean;
    }>(request);

    if (!body.id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 构建更新对象
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.show_prices !== undefined) updates.show_prices = body.show_prices;
    if (body.reset_token) updates.token = generateToken();

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No updates provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 更新链接
    const { data: link, error } = await supabase
      .from('gallery_links')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('[links] Failed to update link:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ link }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[links] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleDelete(request: Request) {
  // 验证认证
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 删除链接
    const { error } = await supabase
      .from('gallery_links')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[links] Failed to delete link:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to delete link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[links] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
