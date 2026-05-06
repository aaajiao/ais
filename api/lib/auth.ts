import { createClient } from '@supabase/supabase-js';

export interface AuthResult {
  success: boolean;
  userId?: string;
  userEmail?: string;
  error?: string;
}

// 兼容 Request 和 VercelRequest 的类型
export type CompatibleRequest = Request | {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  method?: string;
};

/**
 * 从请求中获取 header（兼容 Request 和 VercelRequest）
 */
export function getHeader(req: CompatibleRequest, name: string): string | null {
  // 标准 Request API
  if (typeof req.headers.get === 'function') {
    return req.headers.get(name);
  }
  // VercelRequest 的 headers 是对象
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const value = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

/**
 * 从请求中获取 JSON body（兼容 Request 和 VercelRequest）
 */
export async function getJsonBody<T>(req: CompatibleRequest): Promise<T> {
  // 标准 Request API
  if (typeof (req as Request).json === 'function') {
    return (req as Request).json();
  }
  // VercelRequest 的 body 已经被解析
  return (req as { body: T }).body;
}

/**
 * 验证请求的身份认证
 * 使用 Supabase 验证 Bearer token
 */
export async function verifyAuth(req: CompatibleRequest): Promise<AuthResult> {
  const authHeader = getHeader(req, 'Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Missing authorization token' };
  }

  const token = authHeader.replace('Bearer ', '');

  // 空 token 视为未认证
  if (!token) {
    return { success: false, error: 'Empty authorization token' };
  }

  // 使用 anon key 验证 token（不是 service key）
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[auth] Missing Supabase configuration');
    return { success: false, error: 'Server configuration error' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { success: false, error: 'Invalid or expired token' };
    }

    // 验证邮箱白名单
    //
    // 设计：production fail-closed，dev/test fail-open + warn。
    // 历史教训（v1.3.5 之前）：如果 ALLOWED_EMAILS 不设，旧逻辑直接放行所有
    // Supabase 认证用户 → 任何 Google 账号都能调用 /api/chat 烧掉 Anthropic
    // / OpenAI 账单。VITE_ALLOWED_EMAILS 只控前端 UX，绕开 UI 直接 curl
    // 就过。production 必须 fail-closed 才能拦住这条路径。
    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowedEmails.length === 0) {
      if (process.env.VERCEL_ENV === 'production') {
        // production deploy 缺 ALLOWED_EMAILS 是配置错误，必须 fail-closed
        // 避免静默放行任何 Google 用户。本地 dev / test 走 else 分支放行 + warn。
        console.error('[auth] CRITICAL: ALLOWED_EMAILS not configured in production. Refusing all auth.');
        return { success: false, error: 'Server auth misconfigured' };
      }
      console.warn('[auth] ALLOWED_EMAILS not set; allowing all authenticated users (dev/test mode).');
    } else if (!allowedEmails.includes(user.email?.toLowerCase() || '')) {
      return { success: false, error: 'User not authorized' };
    }

    return {
      success: true,
      userId: user.id,
      userEmail: user.email || undefined,
    };
  } catch (error) {
    console.error('[auth] Verification error:', (error as Error).message);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * 创建未授权响应
 */
export function unauthorizedResponse(error: string): Response {
  return new Response(
    JSON.stringify({ error }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
