/**
 * 文件列表项组件
 * 列表视图的单个文件项，包含操作按钮和删除确认
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Trash2, Eye, Download } from 'lucide-react';
import { formatFileSize } from '@/lib/imageCompressor';
import { getFileTypeIcon } from '@/lib/fileIcons';
import { ImageThumbnail } from './ImageThumbnail';
import type { FileListItemProps } from './types';

export const FileListItem = memo(function FileListItem({
  file,
  isEditing,
  onOpen,
  onDownload,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
  deletingId,
  formatDate,
}: FileListItemProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
      {/* 缩略图或图标 */}
      {file.file_type === 'image' ? (
        <ImageThumbnail file={file} size={48} />
      ) : (
        <span className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-muted-foreground">
          {getFileTypeIcon(file.file_type, 'w-6 h-6')}
        </span>
      )}

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {file.file_name || t('files.unnamed')}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
          <span>·</span>
          <span>{formatDate(file.created_at)}</span>
          {file.source_type === 'link' && (
            <>
              <span>·</span>
              <span className="text-blue-500">{t('files.externalLink')}</span>
            </>
          )}
        </div>
        {file.description && (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {file.description}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        <IconButton
          variant="ghost"
          size="sm"
          label={t('files.open')}
          onClick={() => onOpen(file)}
        >
          <Eye />
        </IconButton>

        {file.source_type === 'upload' && (
          <IconButton
            variant="ghost"
            size="sm"
            label={t('files.download')}
            onClick={() => onDownload(file)}
          >
            <Download />
          </IconButton>
        )}

        {isEditing && (
          <>
            {confirmDeleteId === file.id ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="mini"
                  onClick={() => onDelete(file)}
                  disabled={deletingId === file.id}
                >
                  {deletingId === file.id ? t('files.deleting') : t('confirm')}
                </Button>
                <Button
                  variant="secondary"
                  size="mini"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <IconButton
                variant="ghost"
                size="sm"
                label={t('delete')}
                onClick={() => setConfirmDeleteId(file.id)}
                className="hover:text-destructive"
              >
                <Trash2 />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
});
