/**
 * 作品列表卡片组件
 * 只渲染卡片内容，外层包裹由父组件决定
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Image, Check } from 'lucide-react';
import {
  getArtworkMainStatus,
  type ArtworkWithStats,
} from '@/hooks/queries/useArtworks';

interface ArtworkListCardProps {
  artwork: ArtworkWithStats;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
}

export const ArtworkListCard = memo(function ArtworkListCard({
  artwork,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: ArtworkListCardProps) {
  const { t } = useTranslation('artworks');
  const mainStatus = getArtworkMainStatus(artwork.editions);

  return (
    <div className="flex gap-4">
      {/* Selection checkbox */}
      {selectMode && onToggleSelect && (
        <div
          className="flex items-center"
          onClick={e => onToggleSelect(artwork.id, e)}
        >
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-primary border-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {isSelected && <Check className="w-4 h-4 text-primary-foreground" />}
          </div>
        </div>
      )}

      {/* Thumbnail */}
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

      {/* Artwork info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium truncate">
            {artwork.title_en}
            {artwork.title_cn && (
              <span className="text-muted-foreground ml-2">{artwork.title_cn}</span>
            )}
          </h3>
          {mainStatus && <StatusIndicator status={mainStatus} size="lg" />}
        </div>

        <p className="text-sm text-muted-foreground mt-1">
          {artwork.year && <span>{artwork.year}</span>}
          {artwork.type && <span> · {artwork.type}</span>}
        </p>

        {/* Edition stats */}
        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
          {artwork.stats.total > 0 ? (
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
          ) : (
            <span>{t('noEditionsYet')}</span>
          )}
        </div>
      </div>
    </div>
  );
});
