import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import ExportDialog from '@/components/export/ExportDialog';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import ListEndIndicator from '@/components/ui/ListEndIndicator';
import { Button } from '@/components/ui/button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Image, Check } from 'lucide-react';
import { queryKeys } from '@/lib/queryKeys';
import {
  useArtworksQueryFn,
  useArtworksTotalCount,
  getArtworkMainStatus,
  type ArtworkWithStats,
} from '@/hooks/queries/useArtworks';
import {
  useInfiniteVirtualList,
  isGroupHeader,
  type GroupHeaderData,
} from '@/hooks/useInfiniteVirtualList';

type FilterStatus = 'all' | 'in_studio' | 'at_gallery' | 'sold';

export default function Artworks() {
  const { t, i18n } = useTranslation('artworks');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 批量选择状态
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Total count for "全部" tab
  const { data: totalCount } = useArtworksTotalCount();

  // Create query function with current filters
  const filters = useMemo(
    () => ({
      status: filter,
      search: searchQuery,
    }),
    [filter, searchQuery]
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

  // 切换选择模式
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds(new Set());
  };

  // 切换选中状态
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    if (!selectMode) return;
    e.preventDefault();
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选/全不选 (只对已加载的项目)
  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((a) => a.id)));
    }
  };

  // 批量删除（软删除）
  const handleBatchDelete = async () => {
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
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('批量删除失败:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Calculate total editions for selected artworks
  const selectedEditionsCount = useMemo(() => {
    return items
      .filter((a) => selectedIds.has(a.id))
      .reduce((sum, a) => sum + a.editions.length, 0);
  }, [items, selectedIds]);

  if (isLoading && items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>
        {/* 骨架屏 */}
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
    <div className="p-6 flex flex-col h-[calc(100dvh-152px)] md:h-[calc(100dvh-73px)]">
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
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <Button
                variant="outline"
                size="small"
                onClick={handleSelectAll}
              >
                {selectedIds.size === items.length ? t('bulkActions.deselectAll') : t('bulkActions.selectAll')}
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => setShowExportDialog(true)}
                  >
                    {t('bulkActions.export')} ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive-outline"
                    size="small"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    {t('bulkActions.delete')} ({selectedIds.size})
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="small"
                onClick={toggleSelectMode}
              >
                {t('bulkActions.cancel')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="small"
              onClick={toggleSelectMode}
            >
              {t('bulkActions.manage')}
            </Button>
          )}
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2" role="listbox" aria-label={t('filters.label')}>
        <ToggleChip
          selected={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {t('filters.all')} ({totalCount ?? '...'})
        </ToggleChip>
        <ToggleChip
          selected={filter === 'in_studio'}
          onClick={() => setFilter('in_studio')}
        >
          <StatusIndicator status="in_studio" size="sm" />
          {t('filters.inStudio')}
        </ToggleChip>
        <ToggleChip
          selected={filter === 'at_gallery'}
          onClick={() => setFilter('at_gallery')}
        >
          <StatusIndicator status="at_gallery" size="sm" />
          {t('filters.atGallery')}
        </ToggleChip>
        <ToggleChip
          selected={filter === 'sold'}
          onClick={() => setFilter('sold')}
        >
          <StatusIndicator status="sold" size="sm" />
          {t('filters.sold')}
        </ToggleChip>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none"
        />
      </div>

      {/* 虚拟滚动列表 */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
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
              const mainStatus = getArtworkMainStatus(artwork.editions);
              const isSelected = selectedIds.has(artwork.id);

              const cardContent = (
                <div className="flex gap-4">
                  {/* 选择框 */}
                  {selectMode && (
                    <div
                      className="flex items-center"
                      onClick={(e) => toggleSelect(artwork.id, e)}
                    >
                      <div
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary-foreground" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 缩略图 */}
                  <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    {artwork.thumbnail_url ? (
                      <img
                        src={artwork.thumbnail_url}
                        alt={artwork.title_en}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Image className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  {/* 作品信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium truncate">
                        {artwork.title_en}
                        {artwork.title_cn && (
                          <span className="text-muted-foreground ml-2">
                            {artwork.title_cn}
                          </span>
                        )}
                      </h3>
                      {mainStatus && (
                        <StatusIndicator status={mainStatus} size="lg" />
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mt-1">
                      {artwork.year && <span>{artwork.year}</span>}
                      {artwork.type && <span> · {artwork.type}</span>}
                    </p>

                    {/* 版本统计 */}
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {artwork.stats.total > 0 && (
                        <>
                          <span>{t('totalEditions', { count: artwork.stats.total })}</span>
                          {artwork.stats.inStudio > 0 && (
                            <span className="flex items-center gap-1">
                              <StatusIndicator status="in_studio" size="sm" />
                              {artwork.stats.inStudio}
                            </span>
                          )}
                          {artwork.stats.atGallery > 0 && (
                            <span className="flex items-center gap-1">
                              <StatusIndicator status="at_gallery" size="sm" />
                              {artwork.stats.atGallery}
                            </span>
                          )}
                          {artwork.stats.sold > 0 && (
                            <span className="flex items-center gap-1">
                              <StatusIndicator status="sold" size="sm" />
                              {artwork.stats.sold}
                            </span>
                          )}
                        </>
                      )}
                      {artwork.stats.total === 0 && <span>{t('noEditionsYet')}</span>}
                    </div>
                  </div>
                </div>
              );

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
                      {cardContent}
                    </div>
                  ) : (
                    <Link
                      to={`/artworks/${artwork.id}`}
                      className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors mb-3"
                    >
                      {cardContent}
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
