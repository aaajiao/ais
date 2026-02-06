/**
 * API Key 管理端点
 *
 * GET    - 列出用户的 API Keys（需认证）
 * POST   - 创建新 API Key（需认证）
 * PATCH  - 撤销 API Key（需认证）
 * DELETE - 删除 API Key（需认证）
 */

import { createClient } from '@supabase/supabase-js';
import { verifyAuth, unauthorizedResponse, getJsonBody } from '../lib/auth.js';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../lib/api-key-auth.js';

export const config = {
  runtime: 'edge',
};

const MAX_ACTIVE_KEYS = 5;

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

export default async function handler(request: Request) {
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (method === 'GET') return handleGet(request);
  if (method === 'POST') return handlePost(request);
  if (method === 'PATCH') return handlePatch(request);
  if (method === 'DELETE') return handleDelete(request);

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}

async function handleGet(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, permissions, last_used_at, request_count, revoked_at, created_at')
      .eq('user_id', auth.userId!)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[api-keys] Failed to fetch keys:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch API keys' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ keys: keys || [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[api-keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handlePost(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const body = await getJsonBody<{ name: string }>(request);

    if (!body.name || !body.name.trim()) {
      return new Response(
        JSON.stringify({ error: 'name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 检查活跃 key 数量
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.userId!)
      .is('revoked_at', null);

    if ((count || 0) >= MAX_ACTIVE_KEYS) {
      return new Response(
        JSON.stringify({ error: `Maximum of ${MAX_ACTIVE_KEYS} active keys reached` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 生成 key
    const rawKey = generateApiKey();
    const keyPrefix = getKeyPrefix(rawKey);
    const keyHash = await hashApiKey(rawKey);

    const { data: key, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: auth.userId!,
        name: body.name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        permissions: ['read'],
      })
      .select('id, name, key_prefix, permissions, last_used_at, request_count, revoked_at, created_at')
      .single();

    if (error) {
      console.error('[api-keys] Failed to create key:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create API key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 返回 key 元数据 + 明文 key（仅此一次）
    return new Response(
      JSON.stringify({ key, rawKey }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[api-keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handlePatch(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth.error || 'Unauthorized');
  }

  const supabase = getSupabase();

  try {
    const body = await getJsonBody<{ id: string }>(request);

    if (!body.id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 撤销 key（验证所有权）
    const { data: key, error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', auth.userId!)
      .is('revoked_at', null)
      .select('id, name, key_prefix, permissions, last_used_at, request_count, revoked_at, created_at')
      .single();

    if (error) {
      console.error('[api-keys] Failed to revoke key:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to revoke API key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ key }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[api-keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleDelete(request: Request) {
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

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId!);

    if (error) {
      console.error('[api-keys] Failed to delete key:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to delete API key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[api-keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
