/**
 * 外部结构化查询端点
 *
 * POST /api/external/v1/query
 * Header: X-API-Key: ak_xxx
 * Body: { action, params, locale? }
 *
 * 允许外部 AI 代理通过 API Key 只读查询库存数据
 */

import { createClient } from '@supabase/supabase-js';
import { verifyApiKey } from '../../lib/api-key-auth.js';
import { getJsonBody } from '../../lib/auth.js';
import { createReadOnlyTools, READ_ONLY_ACTIONS } from '../../tools/index.js';
import type { ReadOnlyAction } from '../../tools/index.js';
import type { Locale } from '../../lib/i18n.js';

export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
};

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

export default async function handler(request: Request) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' } }),
      { status: 405, headers: CORS_HEADERS }
    );
  }

  // 验证 API Key
  const auth = await verifyApiKey(request);
  if (!auth.success) {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INVALID_API_KEY', message: auth.error } }),
      { status: 401, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await getJsonBody<{
      action: string;
      params?: Record<string, unknown>;
      locale?: string;
    }>(request);

    // 验证 action
    if (!body.action || !READ_ONLY_ACTIONS.includes(body.action as ReadOnlyAction)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: `Invalid action "${body.action}". Available actions: ${READ_ONLY_ACTIONS.join(', ')}`,
          },
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const action = body.action as ReadOnlyAction;
    const params = body.params || {};
    const locale = (body.locale === 'zh' ? 'zh' : 'en') as Locale;

    // 创建工具上下文
    const supabase = getSupabase();
    const tools = createReadOnlyTools({
      supabase,
      userId: auth.userId!,
      locale,
    });

    // 执行工具
    const toolDef = tools[action];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (toolDef as any).execute(params);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: crypto.randomUUID(),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[external-query] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
