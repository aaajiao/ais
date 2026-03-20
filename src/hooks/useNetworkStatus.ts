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
    // 用 AbortController 设置 5 秒超时，避免长时间挂起
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const resp = await fetch('/api/health', {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // 任何 HTTP 响应（包括 4xx/5xx）都说明网络可达
    return resp.status > 0;
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

  // 离线时：立即探测一次 + 启动轮询；在线时停止
  useEffect(() => {
    if (!isOnline) {
      // 立即验证，不等第一个 interval
      checkConnectivity().then((online) => {
        if (online) setIsOnline(true);
      });

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
