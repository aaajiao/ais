/**
 * 网络状态 Hook
 * 监听浏览器的在线/离线状态变化
 *
 * 补偿浏览器 online/offline 事件不可靠的问题：
 * - visibilitychange 时重新检查
 * - 离线状态下周期性轮询（30s）
 */

import { useState, useEffect, useCallback } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const syncStatus = useCallback(() => {
    setIsOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 离线状态下每 30 秒检查一次，防止 online 事件漏掉
    const interval = setInterval(syncStatus, 30_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [syncStatus]);

  return {
    isOnline,
    isOffline: !isOnline,
  };
}
