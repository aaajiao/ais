import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Package, Layers, MapPin, Link as LinkIcon, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useDashboardStats, useRecentUpdates } from '@/hooks/queries/useDashboard';

const COLLAPSED_COUNT = 5;

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { t: tStatus } = useTranslation('status');
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');

  const [expanded, setExpanded] = useState(false);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useDashboardStats();

  const {
    data: recentUpdates = [],
    isLoading: updatesLoading,
    error: updatesError,
  } = useRecentUpdates();

  const loading = statsLoading || updatesLoading;
  const error = statsError || updatesError;

  // 格式化日期
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return tCommon('today');
    if (diffDays === 1) return tCommon('yesterday');
    if (diffDays < 7) return tCommon('daysAgo', { count: diffDays });
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error instanceof Error ? error.message : tCommon('error')}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>
        {/* 骨架屏 - 不对称网格 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 mb-8">
          <div className="col-span-2 md:row-span-2 bg-card border border-border rounded-xl p-6">
            <div className="h-16 w-24 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="h-9 w-12 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-6 w-24 bg-muted rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const displayStats = {
    totalArtworks: 0,
    totalEditions: 0,
    inStudio: 0,
    atGallery: 0,
    atMuseum: 0,
    sold: 0,
    ...stats,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-[var(--spacing-nav-bottom)] lg:pb-8">
      <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>

      {/* 统计卡片 - 不对称网格 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 mb-8">
        {/* 主卡片 - 总作品数 */}
        <Link
          to="/artworks"
          className="col-span-2 md:row-span-2 bg-card border border-border rounded-xl p-6 card-interactive animate-enter"
        >
          <div className="text-5xl md:text-6xl lg:text-7xl font-mono font-bold tracking-tighter">
            {displayStats.totalArtworks}
          </div>
          <div className="text-muted-foreground text-sm uppercase tracking-wider mt-2">
            {t('stats.totalArtworks')}
          </div>
        </Link>

        {/* 在库 */}
        <Link
          to="/editions?status=in_studio"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-1"
        >
          <div
            className="text-3xl font-mono font-bold"
            style={{ color: 'var(--status-available)' }}
          >
            {displayStats.inStudio}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="in_studio" size="sm" />
            <span>{tStatus('in_studio')}</span>
          </div>
        </Link>

        {/* 外借中 */}
        <Link
          to="/editions?status=at_gallery"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-2"
        >
          <div
            className="text-3xl font-mono font-bold"
            style={{ color: 'var(--status-consigned)' }}
          >
            {displayStats.atGallery}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="at_gallery" size="sm" />
            <span>{tStatus('at_gallery')}</span>
          </div>
        </Link>

        {/* 展览中 */}
        <Link
          to="/editions?status=at_museum"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-3"
        >
          <div
            className="text-3xl font-mono font-bold"
            style={{ color: 'var(--status-museum)' }}
          >
            {displayStats.atMuseum}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="at_museum" size="sm" />
            <span>{tStatus('at_museum')}</span>
          </div>
        </Link>

        {/* 已售 */}
        <Link
          to="/editions?status=sold"
          className="bg-card border border-border rounded-xl p-4 card-interactive animate-enter animate-enter-4"
        >
          <div
            className="text-3xl font-mono font-bold"
            style={{ color: 'var(--status-sold)' }}
          >
            {displayStats.sold}
          </div>
          <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <StatusIndicator status="sold" size="sm" />
            <span>{tStatus('sold')}</span>
          </div>
        </Link>
      </div>

      {/* 快捷操作 */}
      <div className="mb-8 xl:mb-10">
        <h2 className="text-section-title uppercase text-muted-foreground mb-4 xl:mb-5">
          {t('quickActions')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Link
            to="/artworks"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <Package className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">{tNav('artworks')}</span>
          </Link>
          <Link
            to="/editions"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <Layers className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">{tNav('editions')}</span>
          </Link>
          <Link
            to="/locations"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <MapPin className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">{tNav('locations')}</span>
          </Link>
          <Link
            to="/links"
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 card-interactive"
          >
            <LinkIcon className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">{tNav('links')}</span>
          </Link>
          <Link
            to="/chat"
            className="hidden lg:flex bg-card border border-border rounded-xl p-4 flex-col items-center justify-center gap-2 card-interactive"
          >
            <MessageSquare className="w-6 h-6 xl:w-7 xl:h-7" />
            <span className="text-xs uppercase tracking-wider">{tNav('chat')}</span>
          </Link>
        </div>
      </div>

      {/* 最近更新 */}
      <div>
        <h2 className="text-section-title uppercase text-muted-foreground mb-4 xl:mb-5">
          {t('recentUpdates')}
        </h2>
        {recentUpdates.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            {t('noUpdates')}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {(expanded ? recentUpdates : recentUpdates.slice(0, COLLAPSED_COUNT)).map((update) => (
              <Link
                key={update.id}
                to={
                  update.editionId
                    ? `/editions/${update.editionId}`
                    : `/artworks/${update.artworkId}`
                }
                className="flex items-center justify-between p-4 hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex items-center gap-3">
                  <StatusIndicator status={update.status} size="md" />
                  <div>
                    <p className="font-medium">{update.title}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {tStatus(update.status)}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {formatDate(update.date)}
                </span>
              </Link>
            ))}
            {recentUpdates.length > COLLAPSED_COUNT && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-accent transition-colors rounded-b-xl"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    {t('showLess')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    {t('showMore', { count: recentUpdates.length - COLLAPSED_COUNT })}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
