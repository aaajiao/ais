/**
 * 显示模式检测 Hook
 * 检测应用是否运行在 PWA standalone 模式
 *
 * PWA standalone 模式下浏览器导航栏被隐藏，需要应用自己处理导航
 */

import { useState, useEffect } from 'react';

export function useDisplayMode() {
  const [isStandalone, setIsStandalone] = useState(() => {
    // 初始值：同步检测，避免首屏闪烁
    if (typeof window === 'undefined') return false;

    // iOS Safari PWA 检测
    const isIOSStandalone = (window.navigator as any).standalone === true;

    // 标准 PWA 检测 (Android Chrome, Desktop Chrome/Edge/Safari)
    const isMediaStandalone = window.matchMedia('(display-mode: standalone)').matches;

    return isIOSStandalone || isMediaStandalone;
  });

  useEffect(() => {
    // 监听 display-mode 变化（用户可能在浏览时安装 PWA）
    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const handleChange = (e: MediaQueryListEvent) => {
      const isIOSStandalone = (window.navigator as any).standalone === true;
      setIsStandalone(e.matches || isIOSStandalone);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return {
    isStandalone,
    isBrowser: !isStandalone,
  };
}
