import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { Image, RotateCcw, Trash2 } from 'lucide-react';

type Artwork = Database['public']['Tables']['artworks']['Row'];

export default function Trash() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // 获取已删除的作品
  useEffect(() => {
    const fetchDeletedArtworks = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('artworks')
          .select('*')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false });

        if (fetchError) throw fetchError;
        setArtworks(data || []);
      } catch (err) {
        console.error('获取回收站数据失败:', err);
        setError(err instanceof Error ? err.message : '获取回收站数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDeletedArtworks();
  }, []);

  // 恢复作品
  const handleRestore = async (artwork: Artwork) => {
    try {
      setRestoring(artwork.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: restoreError } = await (supabase as any)
        .from('artworks')
        .update({ deleted_at: null })
        .eq('id', artwork.id);

      if (restoreError) throw restoreError;

      // 从列表中移除
      setArtworks(prev => prev.filter(a => a.id !== artwork.id));
    } catch (err) {
      console.error('恢复作品失败:', err);
      setError(err instanceof Error ? err.message : '恢复作品失败');
    } finally {
      setRestoring(null);
    }
  };

  // 永久删除作品
  const handlePermanentDelete = async (artwork: Artwork) => {
    try {
      setDeleting(artwork.id);

      // 获取所有版本 ID
      const { data: editions } = await supabase
        .from('editions')
        .select('id')
        .eq('artwork_id', artwork.id)
        .returns<{ id: string }[]>();

      const editionIds = editions?.map(e => e.id) || [];

      // 删除版本历史
      if (editionIds.length > 0) {
        await supabase
          .from('edition_history')
          .delete()
          .in('edition_id', editionIds);

        // 删除版本文件
        await supabase
          .from('edition_files')
          .delete()
          .in('edition_id', editionIds);

        // 删除版本
        await supabase
          .from('editions')
          .delete()
          .eq('artwork_id', artwork.id);
      }

      // 删除作品
      const { error: deleteError } = await supabase
        .from('artworks')
        .delete()
        .eq('id', artwork.id);

      if (deleteError) throw deleteError;

      // 从列表中移除
      setArtworks(prev => prev.filter(a => a.id !== artwork.id));
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('永久删除失败:', err);
      setError(err instanceof Error ? err.message : '永久删除失败');
    } finally {
      setDeleting(null);
    }
  };

  // 格式化删除时间
  const formatDeletedAt = (dateString: string | null): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天删除';
    if (diffDays === 1) return '昨天删除';
    if (diffDays < 7) return `${diffDays}天前删除`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前删除`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + '删除';
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">回收站</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-muted rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
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
        <h1 className="text-2xl font-bold mb-6">回收站</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 永久删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">永久删除</h3>
            <p className="text-muted-foreground mb-4">
              确定要永久删除这个作品吗？这将同时删除所有关联的版本和历史记录。
            </p>
            <p className="text-sm text-destructive mb-4">此操作不可撤销！</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const artwork = artworks.find(a => a.id === showDeleteConfirm);
                  if (artwork) handlePermanentDelete(artwork);
                }}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? '删除中...' : '永久删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">回收站</h1>

      {artworks.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>回收站是空的</p>
          <p className="text-sm mt-2">删除的作品将在这里显示</p>
        </div>
      ) : (
        <div className="space-y-3">
          {artworks.map(artwork => (
            <div
              key={artwork.id}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex gap-4">
                {/* 缩略图 */}
                <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0 opacity-60">
                  {artwork.thumbnail_url ? (
                    <img
                      src={artwork.thumbnail_url}
                      alt={artwork.title_en}
                      className="w-full h-full object-cover grayscale"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Image className="w-8 h-8" />
                    </div>
                  )}
                </div>

                {/* 作品信息 */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate text-muted-foreground">
                    {artwork.title_en}
                    {artwork.title_cn && (
                      <span className="ml-2">{artwork.title_cn}</span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {artwork.year && <span>{artwork.year}</span>}
                    {artwork.type && <span> · {artwork.type}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDeletedAt(artwork.deleted_at)}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 items-start">
                  <button
                    onClick={() => handleRestore(artwork)}
                    disabled={restoring === artwork.id}
                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                    title="恢复"
                  >
                    <RotateCcw className={`w-5 h-5 ${restoring === artwork.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(artwork.id)}
                    disabled={!!deleting}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                    title="永久删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
