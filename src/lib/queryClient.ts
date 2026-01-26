import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟内数据视为新鲜
      gcTime: 1000 * 60 * 60 * 24, // 24 小时后垃圾回收（匹配持久化 maxAge）
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦不自动刷新
      networkMode: 'offlineFirst', // 离线优先模式
    },
  },
});
