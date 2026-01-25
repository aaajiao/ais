import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { StatusIndicator, getStatusLabel } from '@/components/ui/StatusIndicator';
import { Search, Package, FileDown, MessageSquare, MapPin } from 'lucide-react';
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
  status: EditionStatus;
  date: string;
  editionId?: string;
  artworkId?: string;
}

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

      // 获取统计数据（排除已删除的作品）
      const [artworksResult, editionsResult] = await Promise.all([
        supabase.from('artworks').select('*', { count: 'exact', head: true }).is('deleted_at', null),
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
        // 获取关联的作品信息（排除已删除的）
        const artworkIds = [...new Set(recentEditions.map((e: EditionPartial) => e.artwork_id).filter(Boolean))];
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id, title_en, title_cn')
          .in('id', artworkIds)
          .is('deleted_at', null)
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
            status: edition.status as EditionStatus,
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
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-page-title mb-6 xl:mb-8">首页</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-page-title mb-6 xl:mb-8">首页</h1>
        {/* 骨架屏 - 不对称网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          <div className="col-span-2 md:row-span-2 bg-card border border-border rounded-xl p-6">
            <div className="h-16 w-24 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="h-9 w-12 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-6 w-24 bg-muted rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-page-title mb-6 xl:mb-8">首页</h1>

      {/* 统计卡片 - 不对称网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
        {/* 主卡片 - 总作品数 */}
        <Link
          to="/artworks"
          className="col-span-2 md:row-span-2 bg-card border border-border rounded-xl p-6 card-interactive animate-enter"
        >
          <div className="text-5xl md:text-6xl lg:text-7xl font-mono font-bold tracking-tighter">
            {stats.totalArtworks}
          </div>
          <div className="text-muted-foreground text-sm uppercase tracking-wider mt-2">
            总作品 / Total Works
          </div>
        </Link>

        {/* 在库 */}
        <Link
          to="/editions?status=in_studio"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-1"
        >
          <div className="text-3xl font-mono font-bold" style={{ color: 'var(--status-available)' }}>
            {stats.inStudio}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="in_studio" size="sm" />
            <span>在库</span>
          </div>
        </Link>

        {/* 寄售 */}
        <Link
          to="/editions?status=at_gallery"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-2"
        >
          <div className="text-3xl font-mono font-bold" style={{ color: 'var(--status-consigned)' }}>
            {stats.atGallery}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="at_gallery" size="sm" />
            <span>寄售</span>
          </div>
        </Link>

        {/* 已售 */}
        <Link
          to="/editions?status=sold"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-3"
        >
          <div className="text-3xl font-mono font-bold" style={{ color: 'var(--status-sold)' }}>
            {stats.sold}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="sold" size="sm" />
            <span>已售</span>
          </div>
        </Link>
      </div>

      {/* 快捷操作 */}
      <div className="mb-8 xl:mb-10">
        <h2 className="text-section-title uppercase text-muted-foreground mb-4 xl:mb-5">快捷操作</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Link
            to="/artworks"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <Search className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">搜索</span>
          </Link>
          <Link
            to="/editions"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <Package className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">版本</span>
          </Link>
          <Link
            to="/import"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <FileDown className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">导入</span>
          </Link>
          <Link
            to="/chat"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <MessageSquare className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">对话</span>
          </Link>
          <Link
            to="/locations"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <MapPin className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">位置</span>
          </Link>
        </div>
      </div>

      {/* 最近更新 */}
      <div>
        <h2 className="text-section-title uppercase text-muted-foreground mb-4 xl:mb-5">最近更新</h2>
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
                <div className="flex items-center gap-3">
                  <StatusIndicator status={update.status} size="md" />
                  <div>
                    <p className="font-medium">{update.title}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {getStatusLabel(update.status)}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {formatDate(update.date)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
