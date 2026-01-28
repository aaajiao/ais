import { useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

// 从环境变量获取白名单邮箱
const getAllowedEmails = (): string[] => {
  const emails = import.meta.env.VITE_ALLOWED_EMAILS || '';
  return emails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // 检查邮箱是否在白名单中
  const isEmailAllowed = useCallback((email: string): boolean => {
    const allowedEmails = getAllowedEmails();
    // 如果没有配置白名单，则允许所有邮箱（开发模式）
    if (allowedEmails.length === 0) {
      console.warn('警告: 未配置 VITE_ALLOWED_EMAILS，所有邮箱均可登录');
      return true;
    }
    return allowedEmails.includes(email.toLowerCase());
  }, []);

  // 初始化：获取当前会话
  useEffect(() => {
    // 先设置监听器，再获取会话
    // 这样可以确保不会错过任何状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // 登录时验证邮箱白名单
          if (!isEmailAllowed(session.user.email || '')) {
            await supabase.auth.signOut();
            setState({
              user: null,
              session: null,
              loading: false,
              error: '未授权访问，您的邮箱不在允许列表中',
            });
            return;
          }
        }

        // 清除 URL 中的 hash（如果有的话）
        if (window.location.hash && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname);
        }

        setState(prev => ({
          ...prev,
          user: session?.user || null,
          session: session || null,
          loading: false,
          error: event === 'SIGNED_OUT' ? null : prev.error,
        }));
      }
    );

    // 获取初始会话
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (session?.user) {
          // 验证邮箱白名单
          if (!isEmailAllowed(session.user.email || '')) {
            await supabase.auth.signOut();
            setState({
              user: null,
              session: null,
              loading: false,
              error: '未授权访问，您的邮箱不在允许列表中',
            });
            return;
          }
        }

        setState({
          user: session?.user || null,
          session: session || null,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('认证初始化错误:', err);
        setState({
          user: null,
          session: null,
          loading: false,
          error: err instanceof Error ? err.message : '初始化认证失败',
        });
      }
    };

    initializeAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, [isEmailAllowed]);

  // Token 自动刷新：在过期前 5 分钟刷新
  const session = state.session;
  useEffect(() => {
    if (!session?.expires_at) return;

    const checkAndRefresh = async () => {
      const expirationTime = session.expires_at! * 1000; // 转换为毫秒
      const now = Date.now();
      const timeUntilExpiry = expirationTime - now;

      // 剩余 5 分钟时刷新
      if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
        console.log('[auth] Token 即将过期，正在刷新...');
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('[auth] 刷新会话失败:', error);
            setState((prev) => ({
              ...prev,
              error: '会话已过期，请重新登录',
            }));
          } else if (data.session) {
            setState((prev) => ({
              ...prev,
              session: data.session,
              user: data.user || prev.user,
              error: null,
            }));
            console.log('[auth] Token 刷新成功');
          }
        } catch (err) {
          console.error('[auth] 刷新错误:', err);
        }
      }
    };

    // 立即检查一次
    checkAndRefresh();

    // 每分钟检查一次
    const interval = setInterval(checkAndRefresh, 60 * 1000);

    return () => clearInterval(interval);
  }, [session]);

  // Google 登录
  const signInWithGoogle = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '登录失败',
      }));
    }
  };

  // 登出
  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setState({
        user: null,
        session: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '登出失败',
      }));
    }
  };

  // 清除错误
  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return {
    user: state.user,
    session: state.session,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    signInWithGoogle,
    signOut,
    clearError,
  };
}
