import type { UIMessage } from 'ai';

const STORAGE_KEY = 'chat-history';

interface StoredChat {
  messages: UIMessage[];
  createdAt: number;      // 会话创建时间
  updatedAt: number;      // 最后更新时间
}

/**
 * 保存对话到 localStorage
 * 保留所有消息直到用户手动删除
 */
export function saveChatHistory(messages: UIMessage[]): void {
  if (messages.length === 0) return;

  // 获取现有创建时间或使用当前时间
  const existing = loadStoredChat();
  const data: StoredChat = {
    messages,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
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
 */
export function loadChatHistory(): UIMessage[] {
  const stored = loadStoredChat();
  return stored?.messages || [];
}

/**
 * 内部函数：加载完整的存储数据
 */
function loadStoredChat(): StoredChat | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredChat;
  } catch (error) {
    console.warn('Failed to load chat history:', error);
    return null;
  }
}

/**
 * 清除对话历史
 */
export function clearChatHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 获取对话历史的创建时间
 */
export function getChatTimestamp(): Date | null {
  const stored = loadStoredChat();
  return stored ? new Date(stored.createdAt) : null;
}

/**
 * 获取对话历史的最后更新时间
 */
export function getChatUpdatedAt(): Date | null {
  const stored = loadStoredChat();
  return stored ? new Date(stored.updatedAt) : null;
}
