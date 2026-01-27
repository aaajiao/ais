/**
 * 添加备注区域组件
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface AddNoteSectionProps {
  show: boolean;
  noteText: string;
  saving: boolean;
  onNoteChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const AddNoteSection = memo(function AddNoteSection({
  show,
  noteText,
  saving,
  onNoteChange,
  onSave,
  onCancel,
}: AddNoteSectionProps) {
  const { t } = useTranslation('history');
  const { t: tCommon } = useTranslation('common');

  if (!show) return null;

  return (
    <div className="mb-4 p-4 bg-muted/50 rounded-lg">
      <textarea
        value={noteText}
        onChange={e => onNoteChange(e.target.value)}
        placeholder={t('notePlaceholder')}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        rows={3}
        autoFocus
      />
      <div className="flex gap-3 justify-end mt-2">
        <Button variant="ghost" size="small" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <Button
          size="small"
          onClick={onSave}
          disabled={saving || !noteText.trim()}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
});
