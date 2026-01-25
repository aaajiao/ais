/**
 * 位置列表项组件
 * 显示位置信息，支持编辑和删除操作
 */

import { useState, useCallback } from 'react';
import type { Location } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';

interface LocationItemProps {
  location: Location;
  usageCount?: number;
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => Promise<void>;
}

// 位置类型图标
const TYPE_ICONS: Record<LocationType, string> = {
  studio: '🏠',
  gallery: '🖼',
  museum: '🏛',
  other: '📍',
};

export default function LocationItem({
  location,
  usageCount,
  onEdit,
  onDelete,
}: LocationItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(location);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }, [location, onDelete]);

  return (
    <div className="group relative">
      <div className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-lg flex-shrink-0">{TYPE_ICONS[location.type]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{location.name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {location.city && <span>{location.city}</span>}
              {location.city && location.country && <span>·</span>}
              {location.country && <span>{location.country}</span>}
              {location.aliases && location.aliases.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-xs">别名: {location.aliases.join(', ')}</span>
                </>
              )}
            </div>
          </div>
          {usageCount !== undefined && usageCount > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
              {usageCount} 个版本
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
          <button
            onClick={() => onEdit(location)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="编辑位置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            title="删除位置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-card border border-border rounded-xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-muted-foreground mb-4">
              确定要删除位置 "{location.name}" 吗？此操作无法撤销。
            </p>

            {deleteError && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-muted text-foreground rounded-lg hover:bg-muted/80 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
