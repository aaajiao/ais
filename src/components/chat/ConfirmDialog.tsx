import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Use translation defaults if not provided
  const finalConfirmText = confirmText ?? t('confirm');
  const finalCancelText = cancelText ?? t('cancel');

  // 按 ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(e.target as Node) &&
        isOpen &&
        !isLoading
      ) {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isLoading, onCancel]);

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 对话框 */}
      <div
        ref={dialogRef}
        className="relative bg-card border border-border rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <p className="text-muted-foreground">{message}</p>
        </div>

        {/* 操作按钮 */}
        <div className="px-6 py-4 bg-muted/30 flex justify-end gap-3">
          <Button
            variant="outline"
            size="small"
            onClick={onCancel}
            disabled={isLoading}
          >
            {finalCancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            size="small"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('confirmDialog.processing')}
              </span>
            ) : (
              finalConfirmText
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 简单的确认钩子
export function useConfirmDialog() {
  const confirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger';
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      // 这里可以用全局状态管理或者 context 来实现
      // 简化实现：直接使用 window.confirm
      const result = window.confirm(`${options.title}\n\n${options.message}`);
      resolve(result);
    });
  };

  return { confirm };
}
