import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟内数据视为新鲜
      gcTime: 1000 * 60 * 30, // 30 分钟后垃圾回收
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦不自动刷新
    },
  },
});
