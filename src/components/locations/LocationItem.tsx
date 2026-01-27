/**
 * 位置列表项组件
 * 显示位置信息，支持编辑和删除操作
 */

import { useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Location } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Home, Image, Building2, MapPin, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface LocationItemProps {
  location: Location;
  usageCount?: number;
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => Promise<void>;
}

// 位置类型图标
const TYPE_ICONS: Record<LocationType, ReactNode> = {
  studio: <Home className="w-5 h-5" />,
  gallery: <Image className="w-5 h-5" />,
  museum: <Building2 className="w-5 h-5" />,
  other: <MapPin className="w-5 h-5" />,
};

export default function LocationItem({
  location,
  usageCount,
  onEdit,
  onDelete,
}: LocationItemProps) {
  const { t } = useTranslation('common');
  const { t: tLocations } = useTranslation('locations');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // 检查是否有详情信息
  const hasDetails = Boolean(location.address || location.contact || location.notes);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(location);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('location.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [location, onDelete, t]);

  return (
    <div className="group relative">
      <div
        className={`flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors ${hasDetails ? 'cursor-pointer' : ''} ${expanded ? 'rounded-b-none' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-muted-foreground flex-shrink-0">{TYPE_ICONS[location.type]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{location.name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {location.city && <span>{location.city}</span>}
              {location.city && location.country && <span>·</span>}
              {location.country && <span>{location.country}</span>}
              {location.aliases && location.aliases.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-xs">{t('location.alias')}: {location.aliases.join(', ')}</span>
                </>
              )}
            </div>
          </div>
          {usageCount !== undefined && usageCount > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
              {t('location.editionsCount', { count: usageCount })}
            </span>
          )}
          {/* 展开/收起图标 */}
          {hasDetails && (
            <span className="text-muted-foreground flex-shrink-0 ml-1">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div
          className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
          onClick={e => e.stopPropagation()}
        >
          <IconButton
            variant="ghost"
            size="sm"
            label={t('location.editLocation')}
            onClick={() => onEdit(location)}
          >
            <Pencil />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('location.deleteLocation')}
            onClick={() => setShowDeleteConfirm(true)}
            className="hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>

      {/* 展开的详情区域 */}
      {expanded && hasDetails && (
        <div className="px-4 py-3 bg-muted/20 border-t border-border/50 rounded-b-lg text-sm space-y-2">
          {location.address && (
            <div>
              <span className="text-muted-foreground">{tLocations('fields.address')}: </span>
              <span>{location.address}</span>
            </div>
          )}
          {location.contact && (
            <div>
              <span className="text-muted-foreground">{tLocations('fields.contact')}: </span>
              <span>{location.contact}</span>
            </div>
          )}
          {location.notes && (
            <div>
              <span className="text-muted-foreground">{tLocations('fields.notes')}: </span>
              <span className="whitespace-pre-wrap">{location.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div
            className="bg-card border border-border rounded-xl p-6 w-full max-w-sm max-h-[85dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">{t('location.confirmDelete')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('location.confirmDeleteMessage', { name: location.name })}
            </p>

            {deleteError && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? t('location.deleting') : t('delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
