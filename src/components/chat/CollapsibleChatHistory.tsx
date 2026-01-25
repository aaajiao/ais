import { useState, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { UIMessage } from 'ai';
import MessageBubble from './MessageBubble';
import { groupMessagesByDate, getTodayDateKey, type MessageGroup } from '@/lib/chatUtils';
import type { ConfirmCardData } from './EditableConfirmCard';

interface CollapsibleChatHistoryProps {
  messages: UIMessage[];
  onConfirmUpdate?: (data: ConfirmCardData) => Promise<void>;
  isLoading?: boolean;
}

type FlattenedItem =
  | { type: 'header'; group: MessageGroup }
  | { type: 'message'; message: UIMessage; groupDate: string };

export default function CollapsibleChatHistory({
  messages,
  onConfirmUpdate,
  isLoading = false,
}: CollapsibleChatHistoryProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // 按日期分组
  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  // 折叠状态：今天默认展开，其他折叠
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
    return new Set([getTodayDateKey()]);
  });

  // 切换折叠（参考 HistoryTimeline 的 toggleMergedExpand）
  const toggleDate = useCallback((date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  // 展开全部
  const expandAll = useCallback(() => {
    setExpandedDates(new Set(messageGroups.map(g => g.date)));
  }, [messageGroups]);

  // 折叠全部（只保留今天）
  const collapseAll = useCallback(() => {
    setExpandedDates(new Set([getTodayDateKey()]));
  }, []);

  // 计算展开的消息用于虚拟滚动
  const flattenedItems = useMemo<FlattenedItem[]>(() => {
    const items: FlattenedItem[] = [];

    messageGroups.forEach(group => {
      items.push({ type: 'header', group });
      if (expandedDates.has(group.date)) {
        group.messages.forEach(msg => {
          items.push({ type: 'message', message: msg, groupDate: group.date });
        });
      }
    });

    return items;
  }, [messageGroups, expandedDates]);

  // 虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flattenedItems[index];
      return item.type === 'header' ? 48 : 120; // header 较短，消息较长
    },
    overscan: 5,
  });

  // 空状态
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center py-8">
          <p className="text-4xl mb-4">💬</p>
          <p className="font-medium">开始对话</p>
          <p className="text-sm mt-2">
            试试说：「Guard 有几个版本？」或「哪些作品在寄售？」
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs flex-shrink-0">
        <span className="text-muted-foreground">
          {messageGroups.length} 个日期 · {messages.length} 条消息
        </span>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-primary hover:underline"
          >
            展开全部
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            onClick={collapseAll}
            className="text-primary hover:underline"
          >
            折叠全部
          </button>
        </div>
      </div>

      {/* 虚拟滚动容器 */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = flattenedItems[virtualItem.index];

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === 'header' ? (
                  <DateGroupHeader
                    group={item.group}
                    isExpanded={expandedDates.has(item.group.date)}
                    onToggle={() => toggleDate(item.group.date)}
                  />
                ) : (
                  <div className="px-4 py-2">
                    <MessageBubble
                      message={item.message}
                      onConfirmUpdate={onConfirmUpdate}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 加载指示器 */}
        {isLoading && (
          <div className="flex justify-start px-4 py-2">
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 日期分组头组件
 */
function DateGroupHeader({
  group,
  isExpanded,
  onToggle,
}: {
  group: MessageGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="font-medium text-sm">{group.displayDate}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {group.messages.length} 条消息
      </span>
    </button>
  );
}
