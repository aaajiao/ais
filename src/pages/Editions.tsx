import { useState, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EditionStatus } from '@/lib/database.types';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import ListEndIndicator from '@/components/ui/ListEndIndicator';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { SearchInput } from '@/components/ui/SearchInput';
import { Image } from 'lucide-react';
import { queryKeys } from '@/lib/queryKeys';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter =
    (searchParams.get('status') as FilterStatus) || 'all';

  const [filter, setFilter] = useState<FilterStatus>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  // Status counts for filter tabs
  const { data: statusCounts } = useEditionStatusCounts();

  // Create query function with current filters - use debounced search to reduce API calls
  const filters = useMemo(
    () => ({
      status: filter,
      search: debouncedSearchQuery,
    }),
    [filter, debouncedSearchQuery]
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

  // Handle filter change
  const handleFilterChange = useCallback(
    (newFilter: FilterStatus) => {
      setFilter(newFilter);
      if (newFilter !== 'all') {
        setSearchParams({ status: newFilter });
      } else {
        setSearchParams({});
      }
      // Reset scroll position
      parentRef.current?.scrollTo(0, 0);
    },
    [setSearchParams, parentRef]
  );

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
