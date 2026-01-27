/**
 * 批量选择工具栏组件
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SelectionToolbarProps {
  selectMode: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectMode: () => void;
  onSelectAll: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export const SelectionToolbar = memo(function SelectionToolbar({
  selectMode,
  selectedCount,
  totalCount,
  onToggleSelectMode,
  onSelectAll,
  onExport,
  onDelete,
}: SelectionToolbarProps) {
  const { t } = useTranslation('artworks');

  if (!selectMode) {
    return (
      <Button variant="outline" size="small" onClick={onToggleSelectMode}>
        {t('bulkActions.manage')}
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="small" onClick={onSelectAll}>
        {selectedCount === totalCount
          ? t('bulkActions.deselectAll')
          : t('bulkActions.selectAll')}
      </Button>
      {selectedCount > 0 && (
        <>
          <Button variant="outline" size="small" onClick={onExport}>
            {t('bulkActions.export')} ({selectedCount})
          </Button>
          <Button variant="destructive-outline" size="small" onClick={onDelete}>
            {t('bulkActions.delete')} ({selectedCount})
          </Button>
        </>
      )}
      <Button variant="outline" size="small" onClick={onToggleSelectMode}>
        {t('bulkActions.cancel')}
      </Button>
    </div>
  );
});
