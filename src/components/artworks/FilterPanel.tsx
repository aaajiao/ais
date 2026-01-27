/**
 * 作品筛选面板组件
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { ToggleChip } from '@/components/ui/toggle-chip';
import type { FilterStatus } from './types';

interface FilterPanelProps {
  filter: FilterStatus;
  onFilterChange: (filter: FilterStatus) => void;
  totalCount: number | undefined;
}

export const FilterPanel = memo(function FilterPanel({
  filter,
  onFilterChange,
  totalCount,
}: FilterPanelProps) {
  const { t } = useTranslation('artworks');

  return (
    <div
      className="flex gap-2 mb-6 overflow-x-auto pb-2"
      role="listbox"
      aria-label={t('filters.label')}
    >
      <ToggleChip selected={filter === 'all'} onClick={() => onFilterChange('all')}>
        {t('filters.all')} ({totalCount ?? '...'})
      </ToggleChip>
      <ToggleChip
        selected={filter === 'in_studio'}
        onClick={() => onFilterChange('in_studio')}
      >
        <StatusIndicator status="in_studio" size="sm" />
        {t('filters.inStudio')}
      </ToggleChip>
      <ToggleChip
        selected={filter === 'at_gallery'}
        onClick={() => onFilterChange('at_gallery')}
      >
        <StatusIndicator status="at_gallery" size="sm" />
        {t('filters.atGallery')}
      </ToggleChip>
      <ToggleChip
        selected={filter === 'at_museum'}
        onClick={() => onFilterChange('at_museum')}
      >
        <StatusIndicator status="at_museum" size="sm" />
        {t('filters.atMuseum')}
      </ToggleChip>
      <ToggleChip
        selected={filter === 'in_transit'}
        onClick={() => onFilterChange('in_transit')}
      >
        <StatusIndicator status="in_transit" size="sm" />
        {t('filters.inTransit')}
      </ToggleChip>
      <ToggleChip selected={filter === 'sold'} onClick={() => onFilterChange('sold')}>
        <StatusIndicator status="sold" size="sm" />
        {t('filters.sold')}
      </ToggleChip>
    </div>
  );
});
