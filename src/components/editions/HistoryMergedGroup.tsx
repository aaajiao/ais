/**
 * 合并历史记录组组件
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { MergedHistoryItem, ActionConfig, EditionHistory } from './historyTypes';

interface HistoryMergedGroupProps {
  merged: MergedHistoryItem;
  isFirst: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  config: ActionConfig;
  actionLabel: string;
  relativeTime: string;
  dateTime: string;
  getItemDescription: (item: EditionHistory) => string;
  locale: string;
}

export const HistoryMergedGroup = memo(function HistoryMergedGroup({
  merged,
  isFirst,
  isExpanded,
  onToggle,
  config,
  actionLabel,
  relativeTime,
  dateTime,
  getItemDescription,
  locale,
}: HistoryMergedGroupProps) {
  const { t } = useTranslation('history');

  const getMergedSummary = () => {
    const count = merged.items.length;
    switch (merged.action) {
      case 'file_added':
        return t('merged.filesAdded', { count });
      case 'file_deleted':
        return t('merged.filesDeleted', { count });
      case 'condition_update':
        return t('merged.notes', { count });
      default:
        return t('merged.records', { count });
    }
  };

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
          p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors
          ${isFirst ? 'bg-card border-primary/30' : 'bg-muted/30 border-border'}
        `}
        onClick={onToggle}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${config.color}`}>
              {actionLabel}
            </span>
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {t('times', { count: merged.items.length })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" title={dateTime}>
              {relativeTime}
            </span>
            <span className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          </div>
        </div>

        {/* Collapsed summary */}
        {!isExpanded && (
          <p className="text-sm text-muted-foreground">{getMergedSummary()}</p>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-2 space-y-2 border-t border-border pt-2">
            {merged.items.map(item => (
              <div key={item.id} className="text-sm break-words">
                <span className="text-muted-foreground text-xs">
                  {new Date(item.created_at).toLocaleTimeString(
                    locale === 'zh' ? 'zh-CN' : 'en-US',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                </span>
                <span className="ml-2">{getItemDescription(item)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
