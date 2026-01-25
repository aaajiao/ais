/**
 * 版本历史时间线组件
 * 支持折叠、合并同类操作、限制显示数量
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { insertIntoTable, type EditionHistoryInsert } from '@/lib/supabase';
import type { HistoryAction } from '@/lib/database.types';
import {
  PartyPopper,
  RefreshCw,
  MapPin,
  DollarSign,
  Building2,
  Undo2,
  FileText,
  Paperclip,
  Tag,
  ChevronRight,
  ChevronDown,
  ScrollText,
  Trash2,
} from 'lucide-react';

export interface EditionHistory {
  id: string;
  edition_id: string;
  action: HistoryAction;
  from_status: string | null;
  to_status: string | null;
  from_location: string | null;
  to_location: string | null;
  related_party: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

interface HistoryTimelineProps {
  history: EditionHistory[];
  editionId: string;
  onAddNote?: (note: string) => void;
  showAddNoteButton?: boolean;
  onHistoryAdded?: (history: EditionHistory) => void;
  defaultLimit?: number; // 默认显示数量
}

// 操作类型配置（不包含 label，label 在组件中用 i18n 获取）
const ACTION_CONFIG: Record<HistoryAction, {
  icon: ReactNode;
  color: string;
  bgColor: string;
  importance: 'high' | 'medium' | 'low';
}> = {
  created: { icon: <PartyPopper className="w-4 h-4" />, color: 'text-status-available', bgColor: 'bg-status-available/20', importance: 'high' },
  status_change: { icon: <RefreshCw className="w-4 h-4" />, color: 'text-status-transit', bgColor: 'bg-status-transit/20', importance: 'high' },
  location_change: { icon: <MapPin className="w-4 h-4" />, color: 'text-status-production', bgColor: 'bg-status-production/20', importance: 'high' },
  sold: { icon: <DollarSign className="w-4 h-4" />, color: 'text-status-sold', bgColor: 'bg-status-sold/20', importance: 'high' },
  consigned: { icon: <Building2 className="w-4 h-4" />, color: 'text-status-consigned', bgColor: 'bg-status-consigned/20', importance: 'high' },
  returned: { icon: <Undo2 className="w-4 h-4" />, color: 'text-status-inactive', bgColor: 'bg-status-inactive/20', importance: 'medium' },
  condition_update: { icon: <FileText className="w-4 h-4" />, color: 'text-status-consigned', bgColor: 'bg-status-consigned/20', importance: 'medium' },
  file_added: { icon: <Paperclip className="w-4 h-4" />, color: 'text-accent-blue', bgColor: 'bg-accent-blue/20', importance: 'low' },
  file_deleted: { icon: <Trash2 className="w-4 h-4" />, color: 'text-status-sold', bgColor: 'bg-status-sold/20', importance: 'low' },
  number_assigned: { icon: <Tag className="w-4 h-4" />, color: 'text-status-production', bgColor: 'bg-status-production/20', importance: 'medium' },
};


// 合并后的历史项
interface MergedHistoryItem {
  type: 'single' | 'merged';
  items: EditionHistory[];
  action: HistoryAction;
  date: string; // YYYY-MM-DD
}

export default function HistoryTimeline({
  history,
  editionId,
  showAddNoteButton = false,
  onHistoryAdded,
  defaultLimit = 10,
}: HistoryTimelineProps) {
  const { t, i18n } = useTranslation('history');
  const { t: tStatus } = useTranslation('status');
  const { t: tCommon } = useTranslation('common');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedMerged, setExpandedMerged] = useState<Set<string>>(new Set());

  // 获取操作类型的本地化标签
  const getActionLabel = (action: HistoryAction): string => {
    return t(`actions.${action}`);
  };

  // 格式化日期时间
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化相对时间
  const formatRelativeTime = (dateStr: string): string => {
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
  };

  // 获取日期字符串 (YYYY-MM-DD)
  const getDateKey = (dateStr: string): string => {
    return new Date(dateStr).toISOString().split('T')[0];
  };

  // 合并同类连续操作
  const mergedHistory = useMemo((): MergedHistoryItem[] => {
    if (history.length === 0) return [];

    const result: MergedHistoryItem[] = [];
    let currentGroup: EditionHistory[] = [];
    let currentAction: HistoryAction | null = null;
    let currentDate: string | null = null;

    // 可以合并的低重要性操作
    const mergableActions: HistoryAction[] = ['file_added', 'file_deleted', 'condition_update'];

    for (const item of history) {
      const itemDate = getDateKey(item.created_at);
      const canMerge = mergableActions.includes(item.action);

      if (
        canMerge &&
        currentAction === item.action &&
        currentDate === itemDate
      ) {
        // 同一天、同类型的可合并操作
        currentGroup.push(item);
      } else {
        // 保存之前的组
        if (currentGroup.length > 0) {
          if (currentGroup.length === 1) {
            result.push({
              type: 'single',
              items: currentGroup,
              action: currentAction!,
              date: currentDate!,
            });
          } else {
            result.push({
              type: 'merged',
              items: currentGroup,
              action: currentAction!,
              date: currentDate!,
            });
          }
        }

        // 开始新的组
        currentGroup = [item];
        currentAction = item.action;
        currentDate = itemDate;
      }
    }

    // 保存最后的组
    if (currentGroup.length > 0) {
      if (currentGroup.length === 1) {
        result.push({
          type: 'single',
          items: currentGroup,
          action: currentAction!,
          date: currentDate!,
        });
      } else {
        result.push({
          type: 'merged',
          items: currentGroup,
          action: currentAction!,
          date: currentDate!,
        });
      }
    }

    return result;
  }, [history]);

  // 限制显示数量
  const displayedHistory = useMemo(() => {
    if (showAll) return mergedHistory;
    return mergedHistory.slice(0, defaultLimit);
  }, [mergedHistory, showAll, defaultLimit]);

  const hasMore = mergedHistory.length > defaultLimit;

  // 获取历史项的描述
  const getDescription = (item: EditionHistory): string => {
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
          soldDesc = t('descriptions.soldWithPrice', { currency: item.currency, price: item.price.toLocaleString() });
        }
        if (item.related_party) {
          soldDesc += t('descriptions.soldBuyer', { buyer: item.related_party });
        }
        return soldDesc;
      }

      case 'consigned':
        return item.related_party ? t('descriptions.consignedTo', { party: item.related_party }) : t('descriptions.consignedStart');

      case 'returned':
        return item.from_location ? t('descriptions.returnedFrom', { location: item.from_location }) : t('descriptions.returned');

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
  };

  // 添加备注
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

      setNoteText('');
      setShowNoteInput(false);
      onHistoryAdded?.(data as EditionHistory);
    } catch (err) {
      console.error('Failed to add note:', err);
      alert(t('addNoteFailed'));
    } finally {
      setSaving(false);
    }
  }, [noteText, editionId, onHistoryAdded]);

  // 切换合并组的展开状态
  const toggleMergedExpand = (mergedId: string) => {
    setExpandedMerged(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mergedId)) {
        newSet.delete(mergedId);
      } else {
        newSet.add(mergedId);
      }
      return newSet;
    });
  };

  // 渲染单个历史项
  const renderSingleItem = (item: EditionHistory, isFirst: boolean) => {
    const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.created;

    return (
      <div key={item.id} className="relative pl-10">
        {/* 节点图标 */}
        <div
          className={`
            absolute left-0 w-8 h-8 rounded-full flex items-center justify-center
            ${config.bgColor} ${config.color}
            ${isFirst ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
          `}
        >
          {config.icon}
        </div>

        {/* 内容卡片 */}
        <div
          className={`
            p-3 rounded-lg border
            ${isFirst
              ? 'bg-card border-primary/30'
              : 'bg-muted/30 border-border'
            }
          `}
        >
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-medium ${config.color}`}>
              {getActionLabel(item.action)}
            </span>
            <span className="text-xs text-muted-foreground" title={formatDateTime(item.created_at)}>
              {formatRelativeTime(item.created_at)}
            </span>
          </div>

          {/* 描述 */}
          <p className="text-sm text-foreground">
            {getDescription(item)}
          </p>

          {/* 备注（如果有且不是主要内容） */}
          {item.notes && item.action !== 'file_added' && item.action !== 'condition_update' && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {t('details.notes')}: {item.notes}
            </p>
          )}

          {/* 操作者 */}
          {item.created_by && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('details.operator')}: {item.created_by}
            </p>
          )}
        </div>
      </div>
    );
  };

  // 渲染合并的历史项
  const renderMergedItem = (merged: MergedHistoryItem, isFirst: boolean) => {
    const config = ACTION_CONFIG[merged.action] || ACTION_CONFIG.created;
    const mergedId = `${merged.action}-${merged.date}`;
    const isExpanded = expandedMerged.has(mergedId);

    return (
      <div key={mergedId} className="relative pl-10">
        {/* 节点图标 */}
        <div
          className={`
            absolute left-0 w-8 h-8 rounded-full flex items-center justify-center
            ${config.bgColor} ${config.color}
            ${isFirst ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
          `}
        >
          {config.icon}
        </div>

        {/* 内容卡片 */}
        <div
          className={`
            p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors
            ${isFirst
              ? 'bg-card border-primary/30'
              : 'bg-muted/30 border-border'
            }
          `}
          onClick={() => toggleMergedExpand(mergedId)}
        >
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${config.color}`}>
                {getActionLabel(merged.action)}
              </span>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {t('times', { count: merged.items.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground" title={formatDateTime(merged.items[0].created_at)}>
                {formatRelativeTime(merged.items[0].created_at)}
              </span>
              <span className="text-muted-foreground">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
            </div>
          </div>

          {/* 折叠的摘要 */}
          {!isExpanded && (
            <p className="text-sm text-muted-foreground">
              {merged.action === 'file_added'
                ? t('merged.filesAdded', { count: merged.items.length })
                : merged.action === 'file_deleted'
                ? t('merged.filesDeleted', { count: merged.items.length })
                : merged.action === 'condition_update'
                ? t('merged.notes', { count: merged.items.length })
                : t('merged.records', { count: merged.items.length })
              }
            </p>
          )}

          {/* 展开的详情 */}
          {isExpanded && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {merged.items.map(item => (
                <div key={item.id} className="text-sm">
                  <span className="text-muted-foreground text-xs">
                    {new Date(item.created_at).toLocaleTimeString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="ml-2">{getDescription(item)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (history.length === 0 && !showAddNoteButton) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <div className="text-sm">{t('noHistory')}</div>
      </div>
    );
  }

  return (
    <div>
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          {t('title')}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            {t('count', { count: history.length })}
          </span>
        </h3>
        {showAddNoteButton && !showNoteInput && (
          <button
            onClick={() => setShowNoteInput(true)}
            className="text-sm text-primary hover:underline"
          >
            {t('addNote')}
          </button>
        )}
      </div>

      {/* 添加备注输入框 */}
      {showNoteInput && (
        <div className="mb-4 p-4 bg-muted/50 rounded-lg">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={() => {
                setShowNoteInput(false);
                setNoteText('');
              }}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleAddNote}
              disabled={saving || !noteText.trim()}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}

      {/* 时间线 */}
      <div className="relative">
        {/* 竖线 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        {/* 历史项目 */}
        <div className="space-y-4">
          {displayedHistory.map((merged, index) => {
            const isFirst = index === 0;

            if (merged.type === 'single') {
              return renderSingleItem(merged.items[0], isFirst);
            } else {
              return renderMergedItem(merged, isFirst);
            }
          })}
        </div>

        {/* 查看更多 */}
        {hasMore && !showAll && (
          <div className="mt-4 pl-10">
            <button
              onClick={() => setShowAll(true)}
              className="text-sm text-primary hover:underline"
            >
              {t('showMore', { count: mergedHistory.length - defaultLimit })}
            </button>
          </div>
        )}

        {/* 收起 */}
        {showAll && hasMore && (
          <div className="mt-4 pl-10">
            <button
              onClick={() => setShowAll(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t('collapse')}
            </button>
          </div>
        )}

        {/* 空状态 */}
        {history.length === 0 && (
          <div className="text-center py-8 text-muted-foreground pl-10">
            <div className="text-sm">{t('noHistory')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
