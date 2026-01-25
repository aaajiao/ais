import { useState, useEffect, useCallback, useLayoutEffect } from 'react';

type Theme = 'dark' | 'light' | 'system';

// 获取系统主题偏好
const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

// 获取初始主题
const getInitialTheme = (): Theme => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['dark', 'light', 'system'].includes(stored)) {
      return stored;
    }
  }
  return 'system';
};

// 计算解析后的主题
const resolveTheme = (theme: Theme): 'dark' | 'light' => {
  return theme === 'system' ? getSystemTheme() : theme;
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  // 直接从 theme 派生 resolvedTheme，避免额外的 state
  const resolvedTheme = resolveTheme(theme);

  // 应用主题到 DOM
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // 设置主题
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  // 切换主题（在 light/dark 之间切换）
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  // 监听系统主题变化 - 强制组件重新渲染以获取新的 resolvedTheme
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // 强制重新渲染以重新计算 resolvedTheme
      forceUpdate(n => n + 1);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return {
    theme,           // 用户设置的主题 (dark/light/system)
    resolvedTheme,   // 实际应用的主题 (dark/light)
    setTheme,        // 设置主题
    toggleTheme,     // 切换主题
  };
}
