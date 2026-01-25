import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MessageBubble from '@/components/chat/MessageBubble';
import { saveChatHistory, loadChatHistory, clearChatHistory, getChatTimestamp } from '@/lib/chatStorage';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, X, MessageSquare, ArrowUp } from 'lucide-react';

const MAX_SIDEBAR_MESSAGES = 15;

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({ isOpen, onToggle }: ChatSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const { session } = useAuth();

  // 获取用户选择的模型
  const [selectedModel] = useState(() => {
    return localStorage.getItem('ai-model') || 'claude-sonnet-4.5';
  });

  // 创建 transport - 添加认证 header
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    headers: {
      'Authorization': `Bearer ${session?.access_token || ''}`,
    },
    body: {
      model: selectedModel,
    },
  }), [selectedModel, session?.access_token]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage({ text: message });
  }, [inputValue, isLoading, sendMessage]);

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
            <h2 className="font-semibold">AI 对话</h2>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="清除对话"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="关闭对话面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 对话时间提示 + 查看完整对话链接 */}
        {(chatTimestamp || hasMoreMessages) && messages.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center justify-between">
            {chatTimestamp && (
              <span>
                开始于 {chatTimestamp.toLocaleString('zh-CN', {
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
                查看全部 ({messages.length})
              </Link>
            )}
          </div>
        )}

        {/* 消息区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {recentMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                通过对话管理作品和版本
              </p>
              <p className="text-xs mt-2 text-muted-foreground/70">
                例如：「Guard 1/3 卖了，5万美金」
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

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="输入消息..."
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent outline-none text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </form>
      </aside>

      {/* 展开按钮（当侧边栏关闭时显示） */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="hidden lg:flex fixed right-4 bottom-4 w-12 h-12 bg-primary text-primary-foreground rounded-full items-center justify-center shadow-lg hover:opacity-90 transition-opacity z-40"
          title="打开对话面板"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
