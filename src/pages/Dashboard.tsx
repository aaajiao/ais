import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Database, EditionStatus } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];

// 部分选择的类型
type EditionStatusOnly = Pick<Edition, 'status'>;
type EditionPartial = Pick<Edition, 'id' | 'artwork_id' | 'edition_number' | 'edition_type' | 'status' | 'updated_at'>;
type ArtworkPartial = Pick<Artwork, 'id' | 'title_en' | 'title_cn'>;

interface RecentUpdate {
  id: string;
  type: 'edition' | 'artwork';
  title: string;
  action: string;
  date: string;
  editionId?: string;
  artworkId?: string;
}

// 状态图标
const statusIcons: Record<EditionStatus, string> = {
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

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalArtworks: 0,
    totalEditions: 0,
    inStudio: 0,
    atGallery: 0,
    sold: 0,
  });
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      setLoading(true);

      // 获取统计数据
      const [artworksResult, editionsResult] = await Promise.all([
        supabase.from('artworks').select('*', { count: 'exact', head: true }),
        supabase.from('editions').select('status').returns<EditionStatusOnly[]>(),
      ]);

      const editions = editionsResult.data || [];
      const inStudio = editions.filter((e: EditionStatusOnly) => e.status === 'in_studio').length;
      const atGallery = editions.filter((e: EditionStatusOnly) => e.status === 'at_gallery').length;
      const sold = editions.filter((e: EditionStatusOnly) => e.status === 'sold').length;

      setStats({
        totalArtworks: artworksResult.count || 0,
        totalEditions: editions.length,
        inStudio,
        atGallery,
        sold,
      });

      // 获取最近更新的版本
      const { data: recentEditions } = await supabase
        .from('editions')
        .select('id, artwork_id, edition_number, edition_type, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5)
        .returns<EditionPartial[]>();

      if (recentEditions && recentEditions.length > 0) {
        // 获取关联的作品信息
        const artworkIds = [...new Set(recentEditions.map((e: EditionPartial) => e.artwork_id).filter(Boolean))];
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id, title_en, title_cn')
          .in('id', artworkIds)
          .returns<ArtworkPartial[]>();

        const artworksMap = (artworks || []).reduce((acc: Record<string, ArtworkPartial>, art: ArtworkPartial) => {
          acc[art.id] = art;
          return acc;
        }, {} as Record<string, ArtworkPartial>);

        const updates: RecentUpdate[] = recentEditions.map((edition: EditionPartial) => {
          const artwork = edition.artwork_id ? artworksMap[edition.artwork_id] : null;
          const editionLabel = edition.edition_type === 'unique'
            ? '独版'
            : edition.edition_type === 'ap'
              ? `AP${edition.edition_number || ''}`
              : `${edition.edition_number || '?'}`;

          return {
            id: edition.id,
            type: 'edition' as const,
            title: artwork ? `${artwork.title_en} - ${editionLabel}` : editionLabel,
            action: `状态: ${statusIcons[edition.status as EditionStatus] || ''}`,
            date: edition.updated_at,
            editionId: edition.id,
            artworkId: edition.artwork_id,
          };
        });

        setRecentUpdates(updates);
      }
    } catch (err) {
      console.error('获取仪表盘数据失败:', err);
      setError(err instanceof Error ? err.message : '获取仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  }

  // 格式化日期
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">首页</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">首页</h1>
        {/* 骨架屏 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="h-9 w-12 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-6 w-24 bg-muted rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
        </div>
        <div className="h-6 w-24 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">首页</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Link
          to="/artworks"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <div className="text-3xl font-bold">{stats.totalArtworks}</div>
          <div className="text-muted-foreground text-sm">总作品</div>
        </Link>
        <Link
          to="/editions?status=in_studio"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <div className="text-3xl font-bold text-green-500">{stats.inStudio}</div>
          <div className="text-muted-foreground text-sm flex items-center gap-1">
            <span>🟢</span> 在库
          </div>
        </Link>
        <Link
          to="/editions?status=at_gallery"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <div className="text-3xl font-bold text-yellow-500">{stats.atGallery}</div>
          <div className="text-muted-foreground text-sm flex items-center gap-1">
            <span>🟡</span> 寄售中
          </div>
        </Link>
        <Link
          to="/editions?status=sold"
          className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
        >
          <div className="text-3xl font-bold text-red-500">{stats.sold}</div>
          <div className="text-muted-foreground text-sm flex items-center gap-1">
            <span>🔴</span> 已售
          </div>
        </Link>
      </div>

      {/* 快捷操作 */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Link
            to="/artworks"
            className="bg-card border border-border rounded-xl p-4 text-center hover:bg-accent transition-colors"
          >
            <span className="text-2xl mb-2 block">🔍</span>
            <span className="text-sm">搜索作品</span>
          </Link>
          <Link
            to="/editions"
            className="bg-card border border-border rounded-xl p-4 text-center hover:bg-accent transition-colors"
          >
            <span className="text-2xl mb-2 block">📦</span>
            <span className="text-sm">浏览版本</span>
          </Link>
          <Link
            to="/import"
            className="bg-card border border-border rounded-xl p-4 text-center hover:bg-accent transition-colors"
          >
            <span className="text-2xl mb-2 block">📥</span>
            <span className="text-sm">导入作品</span>
          </Link>
          <Link
            to="/chat"
            className="bg-card border border-border rounded-xl p-4 text-center hover:bg-accent transition-colors"
          >
            <span className="text-2xl mb-2 block">💬</span>
            <span className="text-sm">AI 对话</span>
          </Link>
          <Link
            to="/settings"
            className="bg-card border border-border rounded-xl p-4 text-center hover:bg-accent transition-colors"
          >
            <span className="text-2xl mb-2 block">⚙️</span>
            <span className="text-sm">设置</span>
          </Link>
        </div>
      </div>

      {/* 最近更新 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">最近更新</h2>
        {recentUpdates.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            暂无更新记录
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {recentUpdates.map(update => (
              <Link
                key={update.id}
                to={update.editionId ? `/editions/${update.editionId}` : `/artworks/${update.artworkId}`}
                className="flex items-center justify-between p-4 hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <div>
                  <p className="font-medium">{update.title}</p>
                  <p className="text-sm text-muted-foreground">{update.action}</p>
                </div>
                <span className="text-sm text-muted-foreground">{formatDate(update.date)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
