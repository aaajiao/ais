import type { UIMessage } from 'ai';

const STORAGE_KEY = 'chat-history';
const EXPIRY_HOURS = 24;

interface StoredChat {
  messages: UIMessage[];
  timestamp: number;
}

/**
 * 保存对话到 localStorage
 */
export function saveChatHistory(messages: UIMessage[]): void {
  if (messages.length === 0) return;

  const data: StoredChat = {
    messages,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // localStorage 可能满了，清理旧数据
    console.warn('Failed to save chat history:', error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * 从 localStorage 加载对话历史
 * 如果超过 24 小时则返回空数组
 */
export function loadChatHistory(): UIMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const data: StoredChat = JSON.parse(stored);
    const now = Date.now();
    const expiryMs = EXPIRY_HOURS * 60 * 60 * 1000;

    // 检查是否过期
    if (now - data.timestamp > expiryMs) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return data.messages || [];
  } catch (error) {
    console.warn('Failed to load chat history:', error);
    return [];
  }
}

/**
 * 清除对话历史
 */
export function clearChatHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 获取对话历史的时间戳
 */
export function getChatTimestamp(): Date | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredChat = JSON.parse(stored);
    return new Date(data.timestamp);
  } catch {
    return null;
  }
}
