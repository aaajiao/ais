import type { UIMessage } from 'ai';

const STORAGE_KEY = 'chat-history';
const MAX_MESSAGES = 100; // 限制存储的最大消息数量
const STORAGE_WARNING_THRESHOLD = 0.8; // 80% 时警告

interface StoredChat {
  messages: UIMessage[];
  createdAt: number; // 会话创建时间
  updatedAt: number; // 最后更新时间
}

export interface StorageStatus {
  isNearLimit: boolean;
  usedPercentage: number;
  error: string | null;
}

/**
 * 检查 localStorage 使用情况
 */
export function getStorageStatus(): StorageStatus {
  try {
    let totalSize = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        totalSize += localStorage.getItem(key)?.length || 0;
      }
    }
    // localStorage 通常限制 5MB = 5 * 1024 * 1024 字节
    const maxSize = 5 * 1024 * 1024;
    // UTF-16 编码，每个字符 2 字节
    const usedPercentage = (totalSize * 2) / maxSize;

    return {
      isNearLimit: usedPercentage > STORAGE_WARNING_THRESHOLD,
      usedPercentage: Math.min(usedPercentage, 1),
      error: null,
    };
  } catch (error) {
    return {
      isNearLimit: true,
      usedPercentage: 1,
      error: (error as Error).message,
    };
  }
}

/**
 * 保存对话到 localStorage
 * 自动截断超过 MAX_MESSAGES 的消息
 */
export function saveChatHistory(messages: UIMessage[]): StorageStatus {
  if (messages.length === 0) {
    return { isNearLimit: false, usedPercentage: 0, error: null };
  }

  // 截断消息以防止无限增长
  const truncatedMessages =
    messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;

  // 获取现有创建时间或使用当前时间
  const existing = loadStoredChat();
  const data: StoredChat = {
    messages: truncatedMessages,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return getStorageStatus();
  } catch (error) {
    console.warn('Failed to save chat history:', error);

    // 尝试保留更少的消息
    if (truncatedMessages.length > 20) {
      const minimalMessages = truncatedMessages.slice(-20);
      const minimalData: StoredChat = {
        messages: minimalMessages,
        createdAt: data.createdAt,
        updatedAt: Date.now(),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalData));
        return {
          isNearLimit: true,
          usedPercentage: 0.9,
          error: 'storage_nearly_full',
        };
      } catch {
        // 完全失败 - 清空存储
        localStorage.removeItem(STORAGE_KEY);
        return {
          isNearLimit: true,
          usedPercentage: 1,
          error: 'storage_full',
        };
      }
    }

    return {
      isNearLimit: true,
      usedPercentage: 1,
      error: (error as Error).message,
    };
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
