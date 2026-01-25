import type { UIMessage } from 'ai';

/**
 * 消息分组结构
 */
export interface MessageGroup {
  date: string;           // 'YYYY-MM-DD'
  displayDate: string;    // '今天' | '昨天' | '1月20日'
  messages: UIMessage[];
}

/**
 * 按日期分组消息
 * 参考 HistoryTimeline 的 getDateKey 逻辑
 */
export function groupMessagesByDate(messages: UIMessage[]): MessageGroup[] {
  if (messages.length === 0) return [];

  const groups = new Map<string, UIMessage[]>();
  const now = new Date();

  messages.forEach((msg, index) => {
    // 使用消息元数据中的时间戳，或根据索引估算
    const metadata = msg.metadata as { createdAt?: number } | undefined;
    const timestamp = metadata?.createdAt
      || Date.now() - (messages.length - index) * 60000;
    const date = new Date(timestamp);
    const dateKey = date.toISOString().split('T')[0];

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(msg);
  });

  // 转换为数组并排序（最新日期在前）
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, msgs]) => ({
      date,
      displayDate: formatDateLabel(new Date(date), now),
      messages: msgs,
    }));
}

/**
 * 格式化日期显示
 * 参考 HistoryTimeline 的 formatRelativeTime
 */
export function formatDateLabel(date: Date, now: Date = new Date()): string {
  // 使用本地日期比较，避免时区问题
  const dateStr = date.toLocaleDateString('zh-CN');
  const nowStr = now.toLocaleDateString('zh-CN');

  if (dateStr === nowStr) return '今天';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toLocaleDateString('zh-CN') === yesterday.toLocaleDateString('zh-CN')) {
    return '昨天';
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${diffDays}天前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 判断两个日期是否是同一天
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return d1.toLocaleDateString('zh-CN') === d2.toLocaleDateString('zh-CN');
}

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
export function getTodayDateKey(): string {
  return new Date().toISOString().split('T')[0];
}
