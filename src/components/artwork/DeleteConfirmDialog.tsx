import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface DeleteConfirmDialogProps {
  artworkTitle: string;
  editionsCount: number;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({
  artworkTitle,
  editionsCount,
  deleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('artworkDetail');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full max-h-[85dvh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">{t('deleteDialog.title')}</h3>
        <p className="text-muted-foreground mb-4">
          {t('deleteDialog.message', { title: artworkTitle })}
          {editionsCount > 0 && (
            <span className="block text-muted-foreground mt-2">
              {t('deleteDialog.editionsWarning', { count: editionsCount })}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground mb-4">{t('deleteDialog.trashHint')}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1"
          >
            {deleting ? t('deleteDialog.deleting') : tCommon('confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
