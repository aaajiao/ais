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
