/**
 * 文件预览弹窗组件
 * 全屏显示图片预览
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
import { X } from 'lucide-react';
import { formatFileSize } from '@/lib/imageCompressor';
import type { FilePreviewModalProps } from './types';

export const FilePreviewModal = memo(function FilePreviewModal({
  file,
  imageUrl,
  onClose,
}: FilePreviewModalProps) {
  const { t } = useTranslation('common');

  if (!imageUrl || !file) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt={file.file_name || t('files.preview')}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <IconButton
          variant="secondary"
          size="sm"
          label={t('close')}
          onClick={onClose}
          className="absolute -top-3 -right-3 rounded-full bg-white text-black hover:bg-gray-200"
        >
          <X />
        </IconButton>
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-sm p-3 rounded-b-lg">
          {file.file_name}
          {file.file_size && (
            <span className="ml-2 text-white/70">
              ({formatFileSize(file.file_size)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
