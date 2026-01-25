import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Database, EditionStatus } from '@/lib/database.types';
import ExportDialog from '@/components/export/ExportDialog';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];

interface ArtworkWithStats extends Artwork {
  editions: Edition[];
  stats: {
    total: number;
    inStudio: number;
    atGallery: number;
    sold: number;
  };
}

type FilterStatus = 'all' | 'in_studio' | 'at_gallery' | 'sold';

// 状态图标映射
const statusIcons: Record<string, string> = {
  in_production: '🔵',
  in_studio: '🟢',
  at_gallery: '🟡',
  at_museum: '🟣',
  in_transit: '🔵',
  sold: '🔴',
  gifted: '🟠',
  lost: '⚫',
  damaged: '⚪',
};

export default function Artworks() {
  const [artworks, setArtworks] = useState<ArtworkWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 批量选择状态
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // 获取作品数据
  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        setLoading(true);
        setError(null);

        // 获取所有作品
        const { data: artworksData, error: artworksError } = await supabase
          .from('artworks')
          .select('*')
          .order('created_at', { ascending: false });

        if (artworksError) throw artworksError;

        // 获取所有版本
        const { data: editionsData, error: editionsError } = await supabase
          .from('editions')
          .select('*')
          .returns<Edition[]>();

        if (editionsError) throw editionsError;

        // 组合数据并计算统计
        const artworksWithStats: ArtworkWithStats[] = (artworksData || []).map((artwork: Artwork) => {
          const editions = (editionsData || []).filter((e: Edition) => e.artwork_id === artwork.id);
          return {
            ...artwork,
            editions,
            stats: {
              total: editions.length,
              inStudio: editions.filter((e: Edition) => e.status === 'in_studio').length,
              atGallery: editions.filter((e: Edition) => e.status === 'at_gallery').length,
              sold: editions.filter((e: Edition) => e.status === 'sold').length,
            },
          };
        });

        setArtworks(artworksWithStats);
      } catch (err) {
        console.error('获取作品失败:', err);
        setError(err instanceof Error ? err.message : '获取作品失败');
      } finally {
        setLoading(false);
      }
    };

    fetchArtworks();
  }, []);

  // 筛选和搜索
  const filteredArtworks = useMemo(() => {
    let result = artworks;

    // 按状态筛选
    if (filter !== 'all') {
      result = result.filter(artwork => {
        const hasMatchingEdition = artwork.editions.some(e => {
          if (filter === 'in_studio') return e.status === 'in_studio';
          if (filter === 'at_gallery') return e.status === 'at_gallery';
          if (filter === 'sold') return e.status === 'sold';
          return false;
        });
        return hasMatchingEdition;
      });
    }

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(artwork =>
        artwork.title_en.toLowerCase().includes(query) ||
        artwork.title_cn?.toLowerCase().includes(query) ||
        artwork.year?.includes(query) ||
        artwork.type?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [artworks, filter, searchQuery]);

  // 获取作品的主要状态（用于显示）
  const getMainStatus = (editions: Edition[]): EditionStatus | null => {
    if (editions.length === 0) return null;
    // 优先级：at_gallery > in_studio > sold > others
    if (editions.some(e => e.status === 'at_gallery')) return 'at_gallery';
    if (editions.some(e => e.status === 'in_studio')) return 'in_studio';
    if (editions.some(e => e.status === 'sold')) return 'sold';
    return editions[0].status;
  };

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

  // 全选/全不选
  const handleSelectAll = () => {
    if (selectedIds.size === filteredArtworks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArtworks.map(a => a.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      setDeleting(true);

      // 获取所有要删除的作品的版本 ID
      const artworksToDelete = artworks.filter(a => selectedIds.has(a.id));
      const allEditionIds = artworksToDelete.flatMap(a => a.editions.map(e => e.id));

      // 删除版本历史
      if (allEditionIds.length > 0) {
        await supabase
          .from('edition_history')
          .delete()
          .in('edition_id', allEditionIds);

        // 删除版本
        await supabase
          .from('editions')
          .delete()
          .in('artwork_id', Array.from(selectedIds));
      }

      // 删除作品
      const { error: deleteError } = await supabase
        .from('artworks')
        .delete()
        .in('id', Array.from(selectedIds));

      if (deleteError) throw deleteError;

      // 更新本地状态
      setArtworks(prev => prev.filter(a => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('批量删除失败:', err);
      setError(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // 按时间分组
  const groupedArtworks = useMemo(() => {
    const groups: { label: string; artworks: ArtworkWithStats[] }[] = [];
    const groupMap = new Map<string, ArtworkWithStats[]>();

    filteredArtworks.forEach(artwork => {
      const date = new Date(artwork.created_at);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(artwork);
    });

    // 按时间倒序排列
    const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => b.localeCompare(a));

    sortedKeys.forEach(key => {
      const [year, month] = key.split('-');
      groups.push({
        label: `${year}年${month}月`,
        artworks: groupMap.get(key)!,
      });
    });

    return groups;
  }, [filteredArtworks]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">作品</h1>
        {/* 骨架屏 */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 w-16 bg-muted rounded-full animate-pulse" />
          ))}
        </div>
        <div className="h-12 bg-muted rounded-xl mb-6 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
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
        <h1 className="text-2xl font-bold mb-6">作品</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
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
            <h3 className="text-lg font-semibold mb-2">确认批量删除</h3>
            <p className="text-muted-foreground mb-2">
              确定要删除选中的 {selectedIds.size} 个作品吗？
            </p>
            {(() => {
              const totalEditions = artworks
                .filter(a => selectedIds.has(a.id))
                .reduce((sum, a) => sum + a.editions.length, 0);
              return totalEditions > 0 ? (
                <p className="text-destructive text-sm mb-4">
                  将同时删除 {totalEditions} 个版本及其所有历史记录！
                </p>
              ) : null;
            })()}
            <p className="text-sm text-destructive mb-4">此操作不可撤销！</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 标题和批量操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">作品</h1>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                {selectedIds.size === filteredArtworks.length ? '全不选' : '全选'}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={() => setShowExportDialog(true)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    导出 ({selectedIds.size})
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-1.5 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    删除 ({selectedIds.size})
                  </button>
                </>
              )}
              <button
                onClick={toggleSelectMode}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={toggleSelectMode}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              批量管理
            </button>
          )}
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'all'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          全部 ({artworks.length})
        </button>
        <button
          onClick={() => setFilter('in_studio')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'in_studio'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          🟢 在库
        </button>
        <button
          onClick={() => setFilter('at_gallery')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'at_gallery'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          🟡 寄售
        </button>
        <button
          onClick={() => setFilter('sold')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'sold'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          🔴 已售
        </button>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="搜索作品..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none"
        />
      </div>

      {/* 作品列表（按时间分组） */}
      <div className="space-y-6">
        {filteredArtworks.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            {searchQuery || filter !== 'all' ? '没有找到匹配的作品' : '暂无作品数据'}
          </div>
        ) : (
          groupedArtworks.map(group => (
            <div key={group.label}>
              {/* 分组标题 */}
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <span>📅</span>
                <span>{group.label}</span>
                <span className="text-xs">({group.artworks.length})</span>
              </h2>

              {/* 该组的作品列表 */}
              <div className="space-y-3">
                {group.artworks.map(artwork => {
                  const mainStatus = getMainStatus(artwork.editions);
                  const isSelected = selectedIds.has(artwork.id);

                  const cardContent = (
                    <div className="flex gap-4">
                      {/* 选择框 */}
                      {selectMode && (
                        <div
                          className="flex items-center"
                          onClick={(e) => toggleSelect(artwork.id, e)}
                        >
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-border hover:border-primary/50'
                          }`}>
                            {isSelected && (
                              <span className="text-primary-foreground text-sm">✓</span>
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
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">
                            🖼
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
                            <span className="text-lg flex-shrink-0">
                              {statusIcons[mainStatus]}
                            </span>
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
                              <span>共 {artwork.stats.total} 版</span>
                              {artwork.stats.inStudio > 0 && (
                                <span className="text-green-600">🟢 {artwork.stats.inStudio}</span>
                              )}
                              {artwork.stats.atGallery > 0 && (
                                <span className="text-yellow-600">🟡 {artwork.stats.atGallery}</span>
                              )}
                              {artwork.stats.sold > 0 && (
                                <span className="text-red-600">🔴 {artwork.stats.sold}</span>
                              )}
                            </>
                          )}
                          {artwork.stats.total === 0 && (
                            <span>暂无版本</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  // 选择模式下用 div，否则用 Link
                  if (selectMode) {
                    return (
                      <div
                        key={artwork.id}
                        onClick={(e) => toggleSelect(artwork.id, e)}
                        className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {cardContent}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={artwork.id}
                      to={`/artworks/${artwork.id}`}
                      className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
                    >
                      {cardContent}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
