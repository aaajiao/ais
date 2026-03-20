/**
 * 网络状态 Hook
 *
 * navigator.onLine 只检测网络接口，不验证实际互联网连通性。
 * 所以在离线状态下，通过实际 fetch 请求来验证是否恢复。
 */

import { useState, useEffect, useRef } from 'react';

const PING_INTERVAL = 15_000; // 离线时每 15 秒探测一次

async function checkConnectivity(): Promise<boolean> {
  try {
    const resp = await fetch('/api/models', {
      method: 'HEAD',
      cache: 'no-store',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // 页面切回前台时做一次真实探测
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkConnectivity().then(setIsOnline);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 离线时启动轮询探测，在线时停止
  useEffect(() => {
    if (!isOnline) {
      intervalRef.current = setInterval(() => {
        checkConnectivity().then((online) => {
          if (online) setIsOnline(true);
        });
      }, PING_INTERVAL);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isOnline]);

  return {
    isOnline,
    isOffline: !isOnline,
  };
}
