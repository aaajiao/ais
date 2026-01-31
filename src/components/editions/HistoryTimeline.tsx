/**
 * 版本历史时间线组件
 * 支持折叠、合并同类操作、限制显示数量
 */

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, insertIntoTable, type EditionHistoryInsert } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { ScrollText } from 'lucide-react';
import { HistoryEntry } from './HistoryEntry';
import { HistoryMergedGroup } from './HistoryMergedGroup';
import { AddNoteSection } from './AddNoteSection';
import {
  ACTION_CONFIG,
  type EditionHistory,
  type HistoryTimelineProps,
} from './historyTypes';
import {
  formatDateTime,
  formatRelativeTime,
  mergeHistory,
  getDescription,
  getActionLabel,
} from './historyUtils';

// Re-export types for backward compatibility
export type { EditionHistory } from './historyTypes';

// Static empty state JSX (hoisted per React best practices)
const emptyStateIcon = <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-50" />;

export default function HistoryTimeline({
  history,
  editionId,
  showAddNoteButton = false,
  onHistoryAdded,
  defaultLimit = 10,
}: HistoryTimelineProps) {
  const { t, i18n } = useTranslation('history');
  const { t: tStatus } = useTranslation('status');
  const queryClient = useQueryClient();
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedMerged, setExpandedMerged] = useState<Set<string>>(new Set());

  // Merge consecutive same-type operations
  const mergedHistory = useMemo(() => mergeHistory(history), [history]);

  // Limit displayed items
  const displayedHistory = useMemo(() => {
    if (showAll) return mergedHistory;
    return mergedHistory.slice(0, defaultLimit);
  }, [mergedHistory, showAll, defaultLimit]);

  const hasMore = mergedHistory.length > defaultLimit;

  // Get description for an item (memoized callback for child components)
  const getItemDescription = useCallback(
    (item: EditionHistory) => getDescription(item, t, tStatus),
    [t, tStatus]
  );

  // Add note handler
  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;

    setSaving(true);

    try {
      const insertData: EditionHistoryInsert = {
        edition_id: editionId,
        action: 'condition_update',
        notes: noteText.trim(),
      };
      const { data, error } = await insertIntoTable('edition_history', insertData);

      if (error) throw error;

      // 更新版本的 updated_at
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('editions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', editionId);

      // 刷新首页最近更新
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates });

      setNoteText('');
      setShowNoteInput(false);
      onHistoryAdded?.(data as EditionHistory);
    } catch (err) {
      console.error('Failed to add note:', err);
      alert(t('addNoteFailed'));
    } finally {
      setSaving(false);
    }
  }, [noteText, editionId, onHistoryAdded, t, queryClient]);

  // Toggle merged group expansion (using functional setState)
  const toggleMergedExpand = useCallback((mergedId: string) => {
    setExpandedMerged(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mergedId)) {
        newSet.delete(mergedId);
      } else {
        newSet.add(mergedId);
      }
      return newSet;
    });
  }, []);

  // Cancel note input
  const handleCancelNote = useCallback(() => {
    setShowNoteInput(false);
    setNoteText('');
  }, []);

  if (history.length === 0 && !showAddNoteButton) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyStateIcon}
        <div className="text-sm">{t('noHistory')}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Title and add button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          {t('title')}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            {t('count', { count: history.length })}
          </span>
        </h3>
        {showAddNoteButton && !showNoteInput && (
          <Button
            variant="link"
            size="small"
            onClick={() => setShowNoteInput(true)}
          >
            {t('addNote')}
          </Button>
        )}
      </div>

      {/* Add note input */}
      <AddNoteSection
        show={showNoteInput}
        noteText={noteText}
        saving={saving}
        onNoteChange={setNoteText}
        onSave={handleAddNote}
        onCancel={handleCancelNote}
      />

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        {/* History items */}
        <div className="space-y-4">
          {displayedHistory.map((merged, index) => {
            const isFirst = index === 0;
            const config = ACTION_CONFIG[merged.action] || ACTION_CONFIG.created;
            const actionLabel = getActionLabel(merged.action, t);
            const firstItem = merged.items[0];
            const relativeTime = formatRelativeTime(firstItem.created_at, t);
            const dateTime = formatDateTime(firstItem.created_at, i18n.language);

            if (merged.type === 'single') {
              return (
                <HistoryEntry
                  key={firstItem.id}
                  item={firstItem}
                  isFirst={isFirst}
                  config={config}
                  actionLabel={actionLabel}
                  description={getItemDescription(firstItem)}
                  relativeTime={relativeTime}
                  dateTime={dateTime}
                />
              );
            } else {
              const mergedId = `${merged.action}-${merged.date}`;
              return (
                <HistoryMergedGroup
                  key={mergedId}
                  merged={merged}
                  isFirst={isFirst}
                  isExpanded={expandedMerged.has(mergedId)}
                  onToggle={() => toggleMergedExpand(mergedId)}
                  config={config}
                  actionLabel={actionLabel}
                  relativeTime={relativeTime}
                  dateTime={dateTime}
                  getItemDescription={getItemDescription}
                  locale={i18n.language}
                />
              );
            }
          })}
        </div>

        {/* Show more */}
        {hasMore && !showAll && (
          <div className="mt-4 pl-10">
            <Button
              variant="link"
              size="small"
              onClick={() => setShowAll(true)}
            >
              {t('showMore', { count: mergedHistory.length - defaultLimit })}
            </Button>
          </div>
        )}

        {/* Collapse */}
        {showAll && hasMore && (
          <div className="mt-4 pl-10">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setShowAll(false)}
            >
              {t('collapse')}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {history.length === 0 && (
          <div className="text-center py-8 text-muted-foreground pl-10">
            <div className="text-sm">{t('noHistory')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
