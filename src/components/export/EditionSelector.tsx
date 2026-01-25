import { useTranslation } from 'react-i18next';
import { useEditionsByArtwork } from '@/hooks/queries/useEditions';
import { StatusIndicator } from '@/components/ui/StatusIndicator';

interface EditionSelectorProps {
  artworkId: string;
  editionTotal: number | null;
  mode: 'all' | 'selected';
  onModeChange: (mode: 'all' | 'selected') => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function EditionSelector({
  artworkId,
  editionTotal,
  mode,
  onModeChange,
  selectedIds,
  onSelectionChange,
}: EditionSelectorProps) {
  const { t } = useTranslation('editions');
  const { t: tStatus } = useTranslation('status');
  const { data: editions = [], isLoading } = useEditionsByArtwork(artworkId);

  // 格式化版本编号
  const formatEditionNumber = (edition: {
    edition_type: string;
    edition_number: number | null;
  }): string => {
    if (edition.edition_type === 'unique') return t('unique');
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${editionTotal || '?'}`;
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    onSelectionChange(editions.map((e) => e.id));
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  // 切换单个版本选中状态
  const toggleEdition = (editionId: string) => {
    if (selectedIds.includes(editionId)) {
      onSelectionChange(selectedIds.filter((id) => id !== editionId));
    } else {
      onSelectionChange([...selectedIds, editionId]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="h-10 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (editions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
        {t('selector.noEditions')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 模式选择 */}
      <div className="space-y-2">
        <label
          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
            mode === 'all'
              ? 'bg-primary/10 border border-primary/30'
              : 'hover:bg-muted border border-transparent'
          }`}
        >
          <input
            type="radio"
            name="editionMode"
            checked={mode === 'all'}
            onChange={() => onModeChange('all')}
            className="w-4 h-4 accent-primary"
          />
          <span>{t('selector.allEditions', { count: editions.length })}</span>
        </label>

        <label
          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
            mode === 'selected'
              ? 'bg-primary/10 border border-primary/30'
              : 'hover:bg-muted border border-transparent'
          }`}
        >
          <input
            type="radio"
            name="editionMode"
            checked={mode === 'selected'}
            onChange={() => onModeChange('selected')}
            className="w-4 h-4 accent-primary"
          />
          <span>{t('selector.selectSpecific')}</span>
        </label>
      </div>

      {/* 版本列表（仅在选择特定版本时显示） */}
      {mode === 'selected' && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* 快捷操作 */}
          <div className="flex gap-2 p-2 bg-muted/50 border-b border-border">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {t('selector.selectAll')}
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-xs text-primary hover:underline"
            >
              {t('selector.deselectAll')}
            </button>
            {selectedIds.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t('selector.selected', { count: selectedIds.length })}
              </span>
            )}
          </div>

          {/* 版本复选框列表 */}
          <div className="max-h-48 overflow-y-auto">
            {editions.map((edition) => (
              <label
                key={edition.id}
                className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(edition.id)}
                  onChange={() => toggleEdition(edition.id)}
                  className="w-4 h-4 accent-primary"
                />
                <StatusIndicator status={edition.status} size="sm" />
                <span className="font-medium">{formatEditionNumber(edition)}</span>
                <span className="text-sm text-muted-foreground">
                  {tStatus(edition.status)}
                </span>
                {edition.location && (
                  <span className="text-sm text-muted-foreground ml-auto">
                    {edition.location.name}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
