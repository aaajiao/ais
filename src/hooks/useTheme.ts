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
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => resolveTheme(getInitialTheme()));

  // 应用主题到 DOM
  const applyTheme = useCallback((resolved: 'dark' | 'light') => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
  }, []);

  // 使用 useLayoutEffect 确保主题在渲染前应用，避免闪烁
  useLayoutEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme, applyTheme]);

  // 设置主题
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  // 切换主题（在 light/dark 之间切换）
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  return {
    theme,           // 用户设置的主题 (dark/light/system)
    resolvedTheme,   // 实际应用的主题 (dark/light)
    setTheme,        // 设置主题
    toggleTheme,     // 切换主题
  };
}
