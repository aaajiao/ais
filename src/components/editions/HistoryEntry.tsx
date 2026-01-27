/**
 * 单条历史记录组件
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditionHistory, ActionConfig } from './historyTypes';

interface HistoryEntryProps {
  item: EditionHistory;
  isFirst: boolean;
  config: ActionConfig;
  actionLabel: string;
  description: string;
  relativeTime: string;
  dateTime: string;
}

export const HistoryEntry = memo(function HistoryEntry({
  item,
  isFirst,
  config,
  actionLabel,
  description,
  relativeTime,
  dateTime,
}: HistoryEntryProps) {
  const { t } = useTranslation('history');

  return (
    <div className="relative pl-10">
      {/* Node icon */}
      <div
        className={`
          absolute left-0 w-8 h-8 rounded-full flex items-center justify-center
          ${config.bgColor} ${config.color}
          ${isFirst ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        `}
      >
        {config.icon}
      </div>

      {/* Content card */}
      <div
        className={`
          p-3 rounded-lg border
          ${isFirst ? 'bg-card border-primary/30' : 'bg-muted/30 border-border'}
        `}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm font-medium ${config.color}`}>
            {actionLabel}
          </span>
          <span className="text-xs text-muted-foreground" title={dateTime}>
            {relativeTime}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-foreground">{description}</p>

        {/* Notes (if present and not the main content) */}
        {item.notes &&
          item.action !== 'file_added' &&
          item.action !== 'condition_update' && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {t('details.notes')}: {item.notes}
            </p>
          )}

        {/* Operator */}
        {item.created_by && (
          <p className="text-xs text-muted-foreground mt-1">
            {t('details.operator')}: {item.created_by}
          </p>
        )}
      </div>
    </div>
  );
});
