import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import MessageBubble from '@/components/chat/MessageBubble';
import { saveChatHistory, loadChatHistory, clearChatHistory, getChatTimestamp } from '@/lib/chatStorage';

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({ isOpen, onToggle }: ChatSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 获取用户选择的模型
  const [selectedModel] = useState(() => {
    return localStorage.getItem('ai-model') || 'claude-sonnet-4.5';
  });

  // 创建 transport - 使用 useMemo 避免每次渲染都创建新实例
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: {
      model: selectedModel,
    },
  }), [selectedModel]);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // 组件挂载时加载历史对话
  useEffect(() => {
    if (!historyLoaded) {
      const savedMessages = loadChatHistory();
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
      }
      setHistoryLoaded(true);
    }
  }, [historyLoaded, setMessages]);

  // 保存对话历史（当消息变化且不在加载中时）
  useEffect(() => {
    if (historyLoaded && messages.length > 0 && !isLoading) {
      saveChatHistory(messages);
    }
  }, [messages, isLoading, historyLoaded]);

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
        className={`hidden lg:flex flex-col border-l border-border bg-card transition-all duration-300 ${
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
                🗑️
              </button>
            )}
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="关闭对话面板"
          >
            ✕
          </button>
        </div>
        {/* 对话时间提示 */}
        {chatTimestamp && messages.length > 0 && (
          <div className="px-4 py-1 text-xs text-muted-foreground border-b border-border">
            对话开始于 {chatTimestamp.toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        )}

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-4xl mb-4">💬</p>
              <p className="text-sm">
                通过对话管理作品和版本
              </p>
              <p className="text-xs mt-2 text-muted-foreground/70">
                例如：「Guard 1/3 卖了，5万美金」
              </p>
            </div>
          ) : (
            messages.map((message) => (
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
              ↑
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
          💬
        </button>
      )}
    </>
  );
}
