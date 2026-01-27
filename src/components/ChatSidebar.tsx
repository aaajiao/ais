import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import MessageBubble from '@/components/chat/MessageBubble';
import { saveChatHistory, loadChatHistory, clearChatHistory, getChatTimestamp } from '@/lib/chatStorage';
import { useAuthContext } from '@/contexts/AuthContext';
import { IconButton } from '@/components/ui/icon-button';
import { Trash2, X, MessageSquare, ArrowUp } from 'lucide-react';

const MAX_SIDEBAR_MESSAGES = 15;

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({ isOpen, onToggle }: ChatSidebarProps) {
  const { t, i18n } = useTranslation('common');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const { session } = useAuthContext();

  // 获取用户选择的模型
  const [selectedModel] = useState(() => {
    return localStorage.getItem('ai-model') || 'claude-sonnet-4.5';
  });

  // 获取提取模型（空字符串表示使用聊天模型）
  const [extractionModel] = useState(() => {
    return localStorage.getItem('extraction-model') || '';
  });

  // 获取搜索扩展模型（空字符串表示使用默认快速模型）
  const [searchExpansionModel] = useState(() => {
    return localStorage.getItem('search-expansion-model') || '';
  });

  // 创建带认证的 fetch 函数
  const authenticatedFetch = useCallback(async (url: RequestInfo | URL, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    });
  }, [session?.access_token]);

  // 创建 transport - model 或 fetch 函数变化时重新创建
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: authenticatedFetch,
        body: {
          model: selectedModel,
          // 传递提取模型：空字符串时使用聊天模型
          extractionModel: extractionModel || selectedModel,
          // 传递搜索扩展模型：空字符串表示使用默认快速模型
          searchExpansionModel: searchExpansionModel || '',
        },
      }),
    [selectedModel, extractionModel, searchExpansionModel, authenticatedFetch]
  );

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport,
    experimental_throttle: 50,  // 减少流式响应时的渲染次数
    onFinish: ({ messages: finalMessages }) => {
      // 只在完成时保存（官方推荐方式）
      if (finalMessages.length > 0) {
        saveChatHistory(finalMessages);
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // 截取最近消息用于显示（解决"越说话越长"问题）
  const recentMessages = useMemo(() => {
    return messages.slice(-MAX_SIDEBAR_MESSAGES);
  }, [messages]);

  const hasMoreMessages = messages.length > MAX_SIDEBAR_MESSAGES;

  // 组件挂载时加载历史对话（使用 ref 避免 lint 警告）
  useEffect(() => {
    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true;
      const savedMessages = loadChatHistory();
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
      }
    }
  }, [setMessages]);

  // 滚动到底部
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // 清除对话
  const handleClearChat = useCallback(() => {
    clearChatHistory();
    setMessages([]);
  }, [setMessages]);

  // 获取对话时间戳
  const chatTimestamp = getChatTimestamp();

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading || !session?.access_token) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage({ text: message });
  }, [inputValue, isLoading, session?.access_token, sendMessage]);

  return (
    <>
      {/* 侧边栏 */}
      <aside
        className={`hidden lg:flex flex-col h-full border-l border-border bg-card transition-all duration-300 ${
          isOpen ? 'w-80 xl:w-96' : 'w-0'
        } overflow-hidden`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{t('chatSidebar.title')}</h2>
            {messages.length > 0 && (
              <IconButton
                variant="ghost"
                size="mini"
                label={t('chatSidebar.clearChat')}
                onClick={handleClearChat}
              >
                <Trash2 />
              </IconButton>
            )}
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('chatSidebar.closePanel')}
            onClick={onToggle}
          >
            <X />
          </IconButton>
        </div>

        {/* 对话时间提示 + 查看完整对话链接 */}
        {(chatTimestamp || hasMoreMessages) && messages.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center justify-between">
            {chatTimestamp && (
              <span>
                {t('chatSidebar.startedAt')} {chatTimestamp.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            )}
            {hasMoreMessages && (
              <Link
                to="/chat"
                className="text-primary hover:underline"
              >
                {t('chatSidebar.viewAll', { count: messages.length })}
              </Link>
            )}
          </div>
        )}

        {/* 消息区域 */}
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {recentMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                {t('chatSidebar.emptyTitle')}
              </p>
              <p className="text-xs mt-2 text-muted-foreground/70">
                {t('chatSidebar.emptyExample')}
              </p>
            </div>
          ) : (
            recentMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {/* 加载指示器 */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-3 py-2">
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                  <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 输入区域 */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={!session?.access_token ? t('chatSidebar.pleaseSignIn') : t('chatSidebar.inputPlaceholder')}
              disabled={isLoading || !session?.access_token}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent outline-none text-sm disabled:opacity-50"
            />
            <IconButton
              type="submit"
              size="sm"
              label={t('chatSidebar.send')}
              disabled={isLoading || !inputValue.trim() || !session?.access_token}
            >
              <ArrowUp />
            </IconButton>
          </div>
        </form>
      </aside>

      {/* 展开按钮（当侧边栏关闭时显示） */}
      {!isOpen && (
        <IconButton
          size="lg"
          label={t('chatSidebar.openPanel')}
          onClick={onToggle}
          className="hidden lg:flex fixed right-4 bottom-4 rounded-full shadow-lg z-40"
        >
          <MessageSquare />
        </IconButton>
      )}
    </>
  );
}
