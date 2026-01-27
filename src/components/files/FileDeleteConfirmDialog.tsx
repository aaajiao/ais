/**
 * 文件删除确认对话框
 * 用于网格视图的删除确认
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface FileDeleteConfirmDialogProps {
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const FileDeleteConfirmDialog = memo(function FileDeleteConfirmDialog({
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: FileDeleteConfirmDialogProps) {
  const { t } = useTranslation('common');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full max-h-[85dvh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">{t('files.confirmDelete')}</h3>
        <p className="text-muted-foreground mb-4">
          {t('files.confirmDeleteMessage')}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="small" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            size="small"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('files.deleting') : t('files.confirmDelete')}
          </Button>
        </div>
      </div>
    </div>
  );
});
