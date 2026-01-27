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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
      setConfirmingDelete(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('location.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [location, onDelete, t]);

  return (
    <div className="group relative">
      <div
        className={`p-3 bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors ${hasDetails ? 'cursor-pointer' : ''} ${expanded ? 'rounded-b-none' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* 第一行：图标 + 名称 + 操作按钮 */}
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground flex-shrink-0">{TYPE_ICONS[location.type]}</span>
          <p className="font-medium truncate flex-1 min-w-0">{location.name}</p>

          {/* 操作按钮 - 移动端始终可见，桌面端 hover 显示 */}
          <div
            className="flex items-center gap-1 text-muted-foreground lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <IconButton
              variant="ghost"
              size="sm"
              label={t('location.editLocation')}
              onClick={() => onEdit(location)}
              className="hover:text-foreground"
            >
              <Pencil />
            </IconButton>
            {confirmingDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="mini"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? t('location.deleting') : t('confirm')}
                </Button>
                <Button
                  variant="secondary"
                  size="mini"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                >
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <IconButton
                variant="ghost"
                size="sm"
                label={t('location.deleteLocation')}
                onClick={() => setConfirmingDelete(true)}
                className="hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 />
              </IconButton>
            )}
          </div>
        </div>

        {/* 第二行：城市/国家 + 版本数量 + 展开箭头 */}
        <div className="flex items-center gap-2 mt-1 ml-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 flex-1 min-w-0 truncate">
            {location.city && <span>{location.city}</span>}
            {location.city && location.country && <span>·</span>}
            {location.country && <span>{location.country}</span>}
            {location.aliases && location.aliases.length > 0 && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline text-xs truncate">
                  {t('location.alias')}: {location.aliases.join(', ')}
                </span>
              </>
            )}
          </div>
          {usageCount !== undefined && usageCount > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
              {t('location.editionsCount', { count: usageCount })}
            </span>
          )}
          {/* 展开/收起图标 */}
          {hasDetails && (
            <span className="flex-shrink-0">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          )}
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

      {/* 删除错误提示 */}
      {deleteError && (
        <div className="mt-2 text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
          {deleteError}
        </div>
      )}
    </div>
  );
}
