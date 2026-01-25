import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PageResult } from '@/lib/paginationUtils';

export interface FlattenedItem<T> {
  type: 'header' | 'item';
  key: string;
  data: T | GroupHeaderData;
}

export interface GroupHeaderData {
  groupKey: string;
  label: string;
  count: number;
}

export interface UseInfiniteVirtualListOptions<T> {
  queryKey: readonly unknown[];
  queryFn: (params: { pageParam: string | null }) => Promise<PageResult<T>>;
  getItemId: (item: T) => string;
  enabled?: boolean;
  groupBy?: (item: T) => string;
  groupLabelFn?: (key: string) => string;
  estimateSize?: (item: FlattenedItem<T>) => number;
  overscan?: number;
}

export interface UseInfiniteVirtualListReturn<T> {
  // Data
  items: T[];
  flattenedItems: FlattenedItem<T>[];
  totalLoaded: number;

  // State
  isLoading: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  hasNextPage: boolean;

  // Virtualizer
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  parentRef: React.RefObject<HTMLDivElement>;

  // Actions
  fetchNextPage: () => void;
  refetch: () => void;
}

export function useInfiniteVirtualList<T>({
  queryKey,
  queryFn,
  getItemId,
  enabled = true,
  groupBy,
  groupLabelFn,
  estimateSize = () => 96,
  overscan = 5,
}: UseInfiniteVirtualListOptions<T>): UseInfiniteVirtualListReturn<T> {
  const parentRef = useRef<HTMLDivElement>(null);

  // Use React Query's useInfiniteQuery
  const {
    data,
    fetchNextPage,
    hasNextPage = false,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn({ pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled,
  });

  // Flatten all pages into a single array
  const items = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data?.pages]);

  // Create flattened items with optional grouping
  const flattenedItems = useMemo<FlattenedItem<T>[]>(() => {
    if (!groupBy) {
      return items.map((item) => ({
        type: 'item' as const,
        key: getItemId(item),
        data: item,
      }));
    }

    // Group items while preserving order
    const groups = new Map<string, T[]>();
    const groupOrder: string[] = [];

    items.forEach((item) => {
      const key = groupBy(item);
      if (!groups.has(key)) {
        groups.set(key, []);
        groupOrder.push(key);
      }
      groups.get(key)!.push(item);
    });

    const result: FlattenedItem<T>[] = [];
    groupOrder.forEach((groupKey) => {
      const groupItems = groups.get(groupKey)!;
      result.push({
        type: 'header',
        key: `header-${groupKey}`,
        data: {
          groupKey,
          label: groupLabelFn?.(groupKey) ?? groupKey,
          count: groupItems.length,
        },
      });
      groupItems.forEach((item) => {
        result.push({
          type: 'item',
          key: getItemId(item),
          data: item,
        });
      });
    });

    return result;
  }, [items, groupBy, groupLabelFn, getItemId]);

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: flattenedItems.length + (hasNextPage ? 1 : 0), // +1 for loading indicator
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (index >= flattenedItems.length) return 48; // Loading indicator height
      return estimateSize(flattenedItems[index]);
    },
    overscan,
  });

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    const virtualItems = virtualizer.getVirtualItems();
    const lastItem = virtualItems[virtualItems.length - 1];

    if (
      lastItem &&
      lastItem.index >= flattenedItems.length - overscan &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    virtualizer,
    flattenedItems.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    overscan,
  ]);

  // Attach scroll listener
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Also check on virtual items change
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    handleScroll();
  }, [virtualItems, handleScroll]);

  return {
    items,
    flattenedItems,
    totalLoaded: items.length,
    isLoading,
    isFetchingNextPage,
    error: error as Error | null,
    hasNextPage,
    virtualizer,
    parentRef: parentRef as React.RefObject<HTMLDivElement>,
    fetchNextPage,
    refetch,
  };
}

// Type guard for group header
export function isGroupHeader<T>(
  item: FlattenedItem<T>
): item is FlattenedItem<T> & { data: GroupHeaderData } {
  return item.type === 'header';
}
