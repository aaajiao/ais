/**
 * 作品列表页面
 * 支持筛选、搜索、批量选择、虚拟滚动
 */

import { useState, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import ExportDialog from '@/components/export/ExportDialog';
import ListEndIndicator from '@/components/ui/ListEndIndicator';
import { SearchInput } from '@/components/ui/SearchInput';
import { queryKeys } from '@/lib/queryKeys';
import {
  useArtworksQueryFn,
  useArtworksTotalCount,
  type ArtworkWithStats,
} from '@/hooks/queries/useArtworks';
import {
  useInfiniteVirtualList,
  isGroupHeader,
  type GroupHeaderData,
} from '@/hooks/useInfiniteVirtualList';
import {
  FilterPanel,
  SelectionToolbar,
  ArtworkListCard,
  useArtworksSelection,
  type FilterStatus,
} from '@/components/artworks';
import { Button } from '@/components/ui/button';

// 骨架屏组件（静态提升）
const LoadingSkeleton = (
  <div className="p-6">
    <div className="h-8 w-32 bg-muted rounded mb-6 animate-pulse" />
    <div className="flex gap-2 mb-6">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-10 w-16 bg-muted rounded-full animate-pulse"
        />
      ))}
    </div>
    <div className="h-12 bg-muted rounded-xl mb-6 animate-pulse" />
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-muted rounded-lg animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default function Artworks() {
  const { t, i18n } = useTranslation('artworks');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  // 批量选择状态
  const {
    selectMode,
    selectedIds,
    showDeleteConfirm,
    deleting,
    toggleSelectMode,
    toggleSelect,
    selectAll,
    deselectAll,
    setShowDeleteConfirm,
    setDeleting,
    resetSelection,
  } = useArtworksSelection();

  const [showExportDialog, setShowExportDialog] = useState(false);

  // Total count for "全部" tab
  const { data: totalCount } = useArtworksTotalCount();

  // Create query function with current filters
  const filters = useMemo(
    () => ({
      status: filter,
      search: debouncedSearchQuery,
    }),
    [filter, debouncedSearchQuery]
  );

  const queryFn = useArtworksQueryFn(filters);

  // Group by year-month
  const groupBy = useCallback((artwork: ArtworkWithStats) => {
    const date = new Date(artwork.created_at);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }, []);

  const groupLabelFn = useCallback((key: string) => {
    const [year, month] = key.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (i18n.language === 'en') {
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }
    return `${year}年${parseInt(month)}月`;
  }, [i18n.language]);

  // Use infinite virtual list with grouping
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
    refetch,
  } = useInfiniteVirtualList<ArtworkWithStats>({
    queryKey: queryKeys.artworks.infinite(filters),
    queryFn,
    getItemId: (item) => item.id,
    groupBy,
    groupLabelFn,
    estimateSize: (item) => (item.type === 'header' ? 48 : 112),
  });

  // 全选/全不选 (只对已加载的项目)
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      deselectAll();
    } else {
      selectAll(items.map((a) => a.id));
    }
  }, [selectedIds.size, items, selectAll, deselectAll]);

  // 批量删除（软删除）
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      setDeleting(true);

      // 软删除：设置 deleted_at 时间戳
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from('artworks')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selectedIds));

      if (deleteError) throw deleteError;

      // Refetch data
      await refetch();
      resetSelection();
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('批量删除失败:', err);
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, setDeleting, refetch, resetSelection, setShowDeleteConfirm]);

  // Calculate total editions for selected artworks
  const selectedEditionsCount = useMemo(() => {
    return items
      .filter((a) => selectedIds.has(a.id))
      .reduce((sum, a) => sum + a.editions.length, 0);
  }, [items, selectedIds]);

  if (isLoading && items.length === 0) {
    return LoadingSkeleton;
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
      {/* 导出对话框 */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        artworkIds={Array.from(selectedIds)}
        artworkCount={selectedIds.size}
      />

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('deleteDialog.title')}</h3>
            <p className="text-muted-foreground mb-2">
              {t('deleteDialog.message', { count: selectedIds.size })}
            </p>
            {selectedEditionsCount > 0 && (
              <p className="text-muted-foreground text-sm mb-4">
                {t('deleteDialog.editionsWarning', { count: selectedEditionsCount })}
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              {t('deleteDialog.trashNote')}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1"
              >
                {t('deleteDialog.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleBatchDelete}
                disabled={deleting}
                className="flex-1"
              >
                {deleting ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 标题和批量操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-page-title">{t('title')}</h1>
        <SelectionToolbar
          selectMode={selectMode}
          selectedCount={selectedIds.size}
          totalCount={items.length}
          onToggleSelectMode={toggleSelectMode}
          onSelectAll={handleSelectAll}
          onExport={() => setShowExportDialog(true)}
          onDelete={() => setShowDeleteConfirm(true)}
        />
      </div>

      {/* 筛选标签 */}
      <FilterPanel
        filter={filter}
        onFilterChange={setFilter}
        totalCount={totalCount}
      />

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
              : t('noArtworks')}
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

              // Render group header
              if (isGroupHeader(item)) {
                const headerData = item.data as GroupHeaderData;
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
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider pt-4">
                      {headerData.label}
                      <span className="ml-2 text-xs">({headerData.count})</span>
                    </h2>
                  </div>
                );
              }

              // Render artwork card
              const artwork = item.data as ArtworkWithStats;
              const isSelected = selectedIds.has(artwork.id);

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
                  {selectMode ? (
                    <div
                      onClick={(e) => toggleSelect(artwork.id, e)}
                      className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors mb-3 ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <ArtworkListCard
                        artwork={artwork}
                        selectMode={selectMode}
                        isSelected={isSelected}
                        onToggleSelect={toggleSelect}
                      />
                    </div>
                  ) : (
                    <Link
                      to={`/artworks/${artwork.id}`}
                      className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors mb-3"
                    >
                      <ArtworkListCard
                        artwork={artwork}
                        selectMode={selectMode}
                        isSelected={isSelected}
                        onToggleSelect={toggleSelect}
                      />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* End indicator */}
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
