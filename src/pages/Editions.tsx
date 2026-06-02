import { useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useQuery } from '@tanstack/react-query';
import type { EditionStatus } from '@/lib/database.types';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import ListEndIndicator from '@/components/ui/ListEndIndicator';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { SearchInput } from '@/components/ui/SearchInput';
import { Image, X, MapPin, User } from 'lucide-react';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import {
  useEditionsQueryFn,
  useEditionStatusCounts,
  type EditionWithDetails,
} from '@/hooks/queries/useEditions';
import { useInfiniteVirtualList } from '@/hooks/useInfiniteVirtualList';

type FilterStatus =
  | 'all'
  | 'in_studio'
  | 'at_gallery'
  | 'at_museum'
  | 'sold'
  | 'in_transit';

// 筛选按钮配置
const filterButtons: {
  key: FilterStatus;
  labelKey: string;
  status?: EditionStatus;
}[] = [
  { key: 'all', labelKey: 'filters.all' },
  { key: 'in_studio', labelKey: 'filters.inStudio', status: 'in_studio' },
  { key: 'at_gallery', labelKey: 'filters.atGallery', status: 'at_gallery' },
  { key: 'at_museum', labelKey: 'filters.atMuseum', status: 'at_museum' },
  { key: 'in_transit', labelKey: 'filters.inTransit', status: 'in_transit' },
  { key: 'sold', labelKey: 'filters.sold', status: 'sold' },
];

export default function Editions() {
  const { t } = useTranslation('editions');
  const { t: tStatus } = useTranslation('status');
  useDocumentTitle(t('nav:editions'));
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter =
    (searchParams.get('status') as FilterStatus) || 'all';
  const locationIdParam = searchParams.get('locationId');
  // ?buyerName= 跳转入口：Diaspora named_private pin "查看全部" 跳过来时按 buyer
  // 模糊匹配。跟 locationId 同模式（URL 单值参数 + active chip + 清除按钮）。
  const buyerNameParam = searchParams.get('buyerName');

  const [filter, setFilter] = useState<FilterStatus>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Status counts for filter tabs
  const { data: statusCounts } = useEditionStatusCounts();

  // 从 URL 进来的位置过滤：拉一下名字用于 active chip 展示
  const { data: filterLocation } = useQuery<{ id: string; name: string } | null>({
    queryKey: queryKeys.locations.detail(locationIdParam || ''),
    queryFn: async () => {
      if (!locationIdParam) return null;
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('id', locationIdParam)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
    enabled: !!locationIdParam,
  });

  // Create query function with current filters - use debounced search to reduce API calls
  const filters = useMemo(
    () => ({
      status: filter,
      search: debouncedSearchQuery,
      locationId: locationIdParam ?? undefined,
      buyerName: buyerNameParam ?? undefined,
    }),
    [filter, debouncedSearchQuery, locationIdParam, buyerNameParam]
  );

  const queryFn = useEditionsQueryFn(filters);

  // Use infinite virtual list
  const {
    items,
    flattenedItems,
    totalLoaded,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    virtualizer,
    parentRef,
  } = useInfiniteVirtualList<EditionWithDetails>({
    queryKey: queryKeys.editions.infinite(filters),
    queryFn,
    getItemId: (item) => item.id,
    estimateSize: () => 96,
  });

  // Handle filter change —— 保留 locationId 等其他参数，仅更新 status
  const handleFilterChange = useCallback(
    (newFilter: FilterStatus) => {
      setFilter(newFilter);
      const next = new URLSearchParams(searchParams);
      if (newFilter !== 'all') {
        next.set('status', newFilter);
      } else {
        next.delete('status');
      }
      setSearchParams(next);
      // Reset scroll position
      parentRef.current?.scrollTo(0, 0);
    },
    [setFilter, searchParams, setSearchParams, parentRef]
  );

  // 清除位置筛选 —— 保留 status / search 其他参数
  const handleClearLocation = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('locationId');
    setSearchParams(next);
    parentRef.current?.scrollTo(0, 0);
  }, [searchParams, setSearchParams, parentRef]);

  // 清除 buyer 筛选 —— 同 location 模式
  const handleClearBuyerName = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('buyerName');
    setSearchParams(next);
    parentRef.current?.scrollTo(0, 0);
  }, [searchParams, setSearchParams, parentRef]);

  // 格式化版本号
  const formatEditionNumber = (edition: EditionWithDetails): string => {
    if (edition.edition_type === 'unique') return t('unique');
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${edition.artwork?.edition_total || '?'}`;
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>
        {/* 骨架屏 */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-10 w-16 bg-muted rounded-full animate-pulse"
            />
          ))}
        </div>
        <div className="h-12 bg-muted rounded-xl mb-6 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-muted rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-[calc(100dvh-var(--spacing-chrome-mobile))] lg:h-[calc(100dvh-var(--spacing-chrome-desktop))]">
      <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>

      {/* 位置过滤 active chip —— 从位置页跳转过来时显示，点 × 清除 */}
      {locationIdParam && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleClearLocation}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-sm"
            aria-label={t('filters.clearLocation')}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>
              {t('filters.locationLabel')}: {filterLocation?.name || locationIdParam}
            </span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* buyer 过滤 active chip —— 从 Diaspora named_private 跳转过来时显示 */}
      {buyerNameParam && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleClearBuyerName}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-sm"
            aria-label={t('filters.clearBuyerName')}
          >
            <User className="w-3.5 h-3.5" />
            <span>
              {t('filters.buyerNameLabel')}: {buyerNameParam}
            </span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2" role="listbox" aria-label={t('filters.label')}>
        {filterButtons.map((btn) => (
          <ToggleChip
            key={btn.key}
            selected={filter === btn.key}
            onClick={() => handleFilterChange(btn.key)}
          >
            {btn.status && <StatusIndicator status={btn.status} size="sm" />}
            {t(btn.labelKey)}
            {btn.key === 'all' && statusCounts && ` (${statusCounts.all})`}
          </ToggleChip>
        ))}
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <SearchInput
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={setSearchQuery}
          onDebouncedChange={setDebouncedSearchQuery}
          className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none"
        />
      </div>

      {/* 虚拟滚动列表 */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ contain: 'strict' }}
      >
        {flattenedItems.length === 0 && !isLoading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            {searchQuery || filter !== 'all'
              ? t('noMatch')
              : t('noEditions')}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flattenedItems[virtualRow.index];

              // Loading indicator at end
              if (!item) {
                return (
                  <div
                    key="loading-indicator"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ListEndIndicator
                      isLoading={isFetchingNextPage}
                      hasMore={hasNextPage}
                      totalLoaded={totalLoaded}
                    />
                  </div>
                );
              }

              const edition = item.data as EditionWithDetails;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Link
                    to={`/editions/${edition.id}`}
                    className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors mb-4"
                  >
                    <div className="flex gap-4">
                      {/* 缩略图 */}
                      <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                        {edition.artwork?.thumbnail_url ? (
                          <img
                            src={edition.artwork.thumbnail_url}
                            alt={edition.artwork.title_en}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Image className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      {/* 版本信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium truncate">
                              {edition.artwork?.title_en || t('unknownArtwork')}
                              {edition.artwork?.title_cn && (
                                <span className="text-muted-foreground ml-2">
                                  {edition.artwork.title_cn}
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatEditionNumber(edition)}
                              {edition.inventory_number && (
                                <span className="ml-2">
                                  #{edition.inventory_number}
                                </span>
                              )}
                            </p>
                          </div>
                          <StatusIndicator status={edition.status} size="lg" />
                        </div>

                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span>{tStatus(edition.status)}</span>
                          {edition.location && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                {edition.location.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* End indicator when not using virtual scroll */}
        {!hasNextPage && totalLoaded > 0 && flattenedItems.length > 0 && (
          <ListEndIndicator
            isLoading={false}
            hasMore={false}
            totalLoaded={totalLoaded}
          />
        )}
      </div>
    </div>
  );
}
