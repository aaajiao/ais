/**
 * History timeline utility functions
 */

import type { TFunction } from 'i18next';
import type { HistoryAction } from '@/lib/database.types';
import type { EditionHistory, MergedHistoryItem } from './historyTypes';
import { MERGABLE_ACTIONS } from './historyTypes';

/**
 * Format date/time for display
 */
export function formatDateTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  const localeStr = locale === 'zh' ? 'zh-CN' : 'en-US';
  return date.toLocaleString(localeStr, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time (e.g., "today", "yesterday", "3 days ago")
 */
export function formatRelativeTime(dateStr: string, t: TFunction): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('relativeTime.today');
  if (diffDays === 1) return t('relativeTime.yesterday');
  if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays });
  if (diffDays < 30) return t('relativeTime.weeksAgo', { count: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t('relativeTime.monthsAgo', { count: Math.floor(diffDays / 30) });
  return t('relativeTime.yearsAgo', { count: Math.floor(diffDays / 365) });
}

/**
 * Extract date key (YYYY-MM-DD) from date string
 */
export function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().split('T')[0];
}

/**
 * Merge consecutive same-type operations on the same day
 */
export function mergeHistory(history: EditionHistory[]): MergedHistoryItem[] {
  if (history.length === 0) return [];

  const result: MergedHistoryItem[] = [];
  let currentGroup: EditionHistory[] = [];
  let currentAction: HistoryAction | null = null;
  let currentDate: string | null = null;

  for (const item of history) {
    const itemDate = getDateKey(item.created_at);
    const canMerge = MERGABLE_ACTIONS.includes(item.action);

    if (canMerge && currentAction === item.action && currentDate === itemDate) {
      // Same day, same mergable action type
      currentGroup.push(item);
    } else {
      // Save previous group
      if (currentGroup.length > 0) {
        result.push({
          type: currentGroup.length === 1 ? 'single' : 'merged',
          items: currentGroup,
          action: currentAction!,
          date: currentDate!,
        });
      }

      // Start new group
      currentGroup = [item];
      currentAction = item.action;
      currentDate = itemDate;
    }
  }

  // Save last group
  if (currentGroup.length > 0) {
    result.push({
      type: currentGroup.length === 1 ? 'single' : 'merged',
      items: currentGroup,
      action: currentAction!,
      date: currentDate!,
    });
  }

  return result;
}

/**
 * Get description text for a history item
 */
export function getDescription(
  item: EditionHistory,
  t: TFunction,
  tStatus: TFunction
): string {
  switch (item.action) {
    case 'status_change': {
      const fromStatus = item.from_status ? tStatus(item.from_status) : t('descriptions.unknown');
      const toStatus = item.to_status ? tStatus(item.to_status) : t('descriptions.unknown');
      return t('descriptions.statusChange', { from: fromStatus, to: toStatus });
    }

    case 'location_change': {
      const fromLoc = item.from_location || t('descriptions.unknown');
      const toLoc = item.to_location || t('descriptions.unknown');
      return t('descriptions.locationChange', { from: fromLoc, to: toLoc });
    }

    case 'sold': {
      let soldDesc = t('descriptions.sold');
      if (item.price && item.currency) {
        soldDesc = t('descriptions.soldWithPrice', {
          currency: item.currency,
          price: item.price.toLocaleString(),
        });
      }
      if (item.related_party) {
        soldDesc += t('descriptions.soldBuyer', { buyer: item.related_party });
      }
      return soldDesc;
    }

    case 'consigned':
      return item.related_party
        ? t('descriptions.consignedTo', { party: item.related_party })
        : t('descriptions.consignedStart');

    case 'returned':
      return item.from_location
        ? t('descriptions.returnedFrom', { location: item.from_location })
        : t('descriptions.returned');

    case 'file_added':
      return item.notes || t('descriptions.fileAdded');

    case 'file_deleted':
      return item.notes || t('descriptions.fileDeleted');

    case 'number_assigned':
      return item.notes || t('descriptions.numberAssigned');

    case 'created':
      return t('descriptions.created');

    case 'condition_update':
      return item.notes || t('descriptions.conditionUpdate');

    default:
      return item.notes || item.action;
  }
}

/**
 * Get action label from i18n
 */
export function getActionLabel(action: HistoryAction, t: TFunction): string {
  return t(`actions.${action}`);
}
