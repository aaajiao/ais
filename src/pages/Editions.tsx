import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Database, EditionStatus } from '@/lib/database.types';
import { StatusIndicator, getStatusLabel } from '@/components/ui/StatusIndicator';
import { Image } from 'lucide-react';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];
type Location = Database['public']['Tables']['locations']['Row'];

interface EditionWithDetails extends Edition {
  artwork?: Artwork | null;
  location?: Location | null;
}

type FilterStatus = 'all' | 'in_studio' | 'at_gallery' | 'at_museum' | 'sold' | 'in_transit';

// 筛选按钮配置
const filterButtons: { key: FilterStatus; label: string; status?: EditionStatus }[] = [
  { key: 'all', label: '全部' },
  { key: 'in_studio', label: '在库', status: 'in_studio' },
  { key: 'at_gallery', label: '寄售', status: 'at_gallery' },
  { key: 'at_museum', label: '美术馆', status: 'at_museum' },
  { key: 'in_transit', label: '运输中', status: 'in_transit' },
  { key: 'sold', label: '已售', status: 'sold' },
];

export default function Editions() {
  const [editions, setEditions] = useState<EditionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 获取版本数据
  useEffect(() => {
    const fetchEditions = async () => {
      try {
        setLoading(true);
        setError(null);

        // 获取所有版本
        const { data: editionsData, error: editionsError } = await supabase
          .from('editions')
          .select('*')
          .order('updated_at', { ascending: false })
          .returns<Edition[]>();

        if (editionsError) throw editionsError;

        // 获取所有作品（排除已删除的）
        const artworkIds = [...new Set((editionsData || []).map((e: Edition) => e.artwork_id).filter(Boolean))];
        let artworksMap: Record<string, Artwork> = {};

        if (artworkIds.length > 0) {
          const { data: artworksData, error: artworksError } = await supabase
            .from('artworks')
            .select('*')
            .in('id', artworkIds)
            .is('deleted_at', null)
            .returns<Artwork[]>();

          if (!artworksError && artworksData) {
            artworksMap = artworksData.reduce((acc: Record<string, Artwork>, art: Artwork) => {
              acc[art.id] = art;
              return acc;
            }, {} as Record<string, Artwork>);
          }
        }

        // 获取所有位置
        const locationIds = [...new Set((editionsData || []).map((e: Edition) => e.location_id).filter(Boolean))];
        let locationsMap: Record<string, Location> = {};

        if (locationIds.length > 0) {
          const { data: locationsData, error: locationsError } = await supabase
            .from('locations')
            .select('*')
            .in('id', locationIds)
            .returns<Location[]>();

          if (!locationsError && locationsData) {
            locationsMap = locationsData.reduce((acc: Record<string, Location>, loc: Location) => {
              acc[loc.id] = loc;
              return acc;
            }, {} as Record<string, Location>);
          }
        }

        // 合并数据
        const editionsWithDetails: EditionWithDetails[] = (editionsData || []).map((edition: Edition) => ({
          ...edition,
          artwork: edition.artwork_id ? artworksMap[edition.artwork_id] : null,
          location: edition.location_id ? locationsMap[edition.location_id] : null,
        }));

        setEditions(editionsWithDetails);
      } catch (err) {
        console.error('获取版本失败:', err);
        setError(err instanceof Error ? err.message : '获取版本失败');
      } finally {
        setLoading(false);
      }
    };

    fetchEditions();
  }, []);

  // 格式化版本号
  const formatEditionNumber = (edition: EditionWithDetails): string => {
    if (edition.edition_type === 'unique') return '独版';
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${edition.artwork?.edition_total || '?'}`;
  };

  // 筛选和搜索
  const filteredEditions = useMemo(() => {
    let result = editions;

    // 按状态筛选
    if (filter !== 'all') {
      result = result.filter(edition => edition.status === filter);
    }

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(edition =>
        edition.artwork?.title_en.toLowerCase().includes(query) ||
        edition.artwork?.title_cn?.toLowerCase().includes(query) ||
        edition.inventory_number?.toLowerCase().includes(query) ||
        edition.location?.name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [editions, filter, searchQuery]);

  // 计算各状态数量
  const statusCounts = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      all: editions.length,
      in_studio: 0,
      at_gallery: 0,
      at_museum: 0,
      in_transit: 0,
      sold: 0,
    };

    editions.forEach(edition => {
      if (edition.status in counts) {
        counts[edition.status as FilterStatus]++;
      }
    });

    return counts;
  }, [editions]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">版本</h1>
        {/* 骨架屏 */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-10 w-16 bg-muted rounded-full animate-pulse" />
          ))}
        </div>
        <div className="h-12 bg-muted rounded-xl mb-6 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
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
        <h1 className="text-2xl font-bold mb-6">版本</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">版本</h1>

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {filterButtons.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filter === btn.key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {btn.status && <StatusIndicator status={btn.status} size="sm" />}
            {btn.label}
            {btn.key === 'all' && ` (${statusCounts.all})`}
          </button>
        ))}
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="搜索版本（作品名、编号、位置）..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none"
        />
      </div>

      {/* 版本列表 */}
      <div className="space-y-4">
        {filteredEditions.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            {searchQuery || filter !== 'all' ? '没有找到匹配的版本' : '暂无版本数据'}
          </div>
        ) : (
          filteredEditions.map(edition => (
            <Link
              key={edition.id}
              to={`/editions/${edition.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
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
                        {edition.artwork?.title_en || '未知作品'}
                        {edition.artwork?.title_cn && (
                          <span className="text-muted-foreground ml-2">
                            {edition.artwork.title_cn}
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatEditionNumber(edition)}
                        {edition.inventory_number && (
                          <span className="ml-2">#{edition.inventory_number}</span>
                        )}
                      </p>
                    </div>
                    <StatusIndicator status={edition.status} size="lg" />
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span>{getStatusLabel(edition.status)}</span>
                    {edition.location && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{edition.location.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
