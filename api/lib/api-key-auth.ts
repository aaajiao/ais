/**
 * API Key 认证模块
 *
 * 提供 API Key 的生成、哈希和验证功能，
 * 供外部 AI 代理通过结构化查询端点访问库存数据。
 */

import { createClient } from '@supabase/supabase-js';
import { getHeader, type CompatibleRequest } from './auth.js';

export interface ApiKeyAuthResult {
  success: boolean;
  userId?: string;
  keyId?: string;
  permissions?: string[];
  error?: string;
}

/**
 * 生成 API Key
 * 格式：ak_<32 hex chars>
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `ak_${hex}`;
}

/**
 * 获取 key 的前缀（用于 UI 展示）
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 8);
}

/**
 * SHA-256 哈希 API Key
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 延迟创建 Supabase 客户端（使用 service key 绕过 RLS）
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

/**
 * 验证 API Key
 * 支持两种方式：
 * 1. X-API-Key header
 * 2. Authorization: Bearer ak_xxx（通过 ak_ 前缀自动识别）
 */
export async function verifyApiKey(req: CompatibleRequest): Promise<ApiKeyAuthResult> {
  const apiKeyHeader = getHeader(req, 'X-API-Key');
  const authHeader = getHeader(req, 'Authorization');

  let rawKey: string | null = null;

  if (apiKeyHeader?.startsWith('ak_')) {
    rawKey = apiKeyHeader;
  } else if (authHeader?.startsWith('Bearer ak_')) {
    rawKey = authHeader.replace('Bearer ', '');
  }

  if (!rawKey || !rawKey.startsWith('ak_')) {
    return { success: false, error: 'Missing or invalid API key' };
  }

  const keyHash = await hashApiKey(rawKey);
  const supabase = getSupabase();

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('id, user_id, permissions, revoked_at, request_count')
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyRecord) {
    return { success: false, error: 'Invalid API key' };
  }

  if (keyRecord.revoked_at) {
    return { success: false, error: 'API key has been revoked' };
  }

  // 异步更新使用统计（不阻塞响应）
  supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      request_count: (keyRecord.request_count || 0) + 1,
    })
    .eq('id', keyRecord.id)
    .then(() => { /* silent */ });

  return {
    success: true,
    userId: keyRecord.user_id,
    keyId: keyRecord.id,
    permissions: keyRecord.permissions,
  };
}
