import { createClient } from '@supabase/supabase-js';

export interface AuthResult {
  success: boolean;
  userId?: string;
  userEmail?: string;
  error?: string;
}

/**
 * 验证请求的身份认证
 * 使用 Supabase 验证 Bearer token
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');

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
    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowedEmails.length > 0 && !allowedEmails.includes(user.email?.toLowerCase() || '')) {
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
