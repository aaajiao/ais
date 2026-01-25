import { Loader2 } from 'lucide-react';

interface ListEndIndicatorProps {
  isLoading: boolean;
  hasMore: boolean;
  totalLoaded: number;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export default function ListEndIndicator({
  isLoading,
  hasMore,
  totalLoaded,
  emptyMessage = '暂无数据',
  isEmpty = false,
}: ListEndIndicatorProps) {
  if (isEmpty) {
    return (
      <div className="py-8 text-center text-muted-foreground">{emptyMessage}</div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-4 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  if (!hasMore && totalLoaded > 0) {
    return (
      <div className="py-4 text-center text-muted-foreground text-sm">
        已加载全部 {totalLoaded} 条
      </div>
    );
  }

  return null;
}
