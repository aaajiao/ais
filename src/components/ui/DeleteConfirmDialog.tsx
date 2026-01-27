/**
 * 通用删除确认对话框组件
 * 可复用于版本删除、作品删除等场景
 */

import { useTranslation } from 'react-i18next';
import { Button } from './button';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  warning?: string;
  warningItems?: string[];
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export default function DeleteConfirmDialog({
  isOpen,
  title,
  message,
  warning,
  warningItems,
  onClose,
  onConfirm,
  isDeleting = false,
  confirmText,
  cancelText,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('common');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="modal-content bg-card border border-border rounded-xl p-6 w-full max-w-md max-h-[85dvh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4">
          {message}
        </p>

        {/* 额外警告项 */}
        {warningItems && warningItems.length > 0 && (
          <ul className="text-yellow-600 text-sm mb-4 space-y-1">
            {warningItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        )}

        {/* 主要警告 */}
        {warning && (
          <p className="text-sm text-destructive mb-4">{warning}</p>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1"
          >
            {cancelText || t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1"
          >
            {isDeleting ? t('deleting') : (confirmText || t('confirm'))}
          </Button>
        </div>
      </div>
    </div>
  );
}
