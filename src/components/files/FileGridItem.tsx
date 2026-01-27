/**
 * 文件网格项组件
 * 网格视图的单个文件项，带悬浮操作层
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Trash2 } from 'lucide-react';
import { getFileTypeIcon } from '@/lib/fileIcons';
import { ImagePreview } from './ImagePreview';
import type { FileGridItemProps } from './types';

export const FileGridItem = memo(function FileGridItem({
  file,
  isEditing,
  onOpen,
  onRequestDelete,
}: FileGridItemProps) {
  const { t } = useTranslation('common');

  return (
    <div className="group relative bg-muted/50 rounded-lg overflow-hidden aspect-square hover:ring-2 hover:ring-primary/50 transition-all">
      {/* 图片预览或图标 */}
      {file.file_type === 'image' && file.source_type === 'upload' ? (
        <ImagePreview file={file} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          {getFileTypeIcon(file.file_type, 'w-12 h-12')}
        </div>
      )}

      {/* 悬浮操作层 - 触摸设备始终可见，鼠标设备 hover 显示 */}
      <div className="hover-action-buttons absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
        <button
          onClick={() => onOpen(file)}
          className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white"
          title={t('files.open')}
        >
          <Eye className="w-5 h-5" />
        </button>
        {isEditing && (
          <button
            onClick={() => onRequestDelete(file.id)}
            className="p-2 bg-white/20 hover:bg-red-500/50 rounded-full text-white"
            title={t('delete')}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 文件名 */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 truncate">
        {file.file_name || t('files.unnamed')}
      </div>
    </div>
  );
});
