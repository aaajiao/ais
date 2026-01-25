import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { ConfirmCardData } from '@/components/chat/EditableConfirmCard';
import CollapsibleChatHistory from '@/components/chat/CollapsibleChatHistory';
import { saveChatHistory, loadChatHistory, clearChatHistory, getChatTimestamp } from '@/lib/chatStorage';
import { useAuth } from '@/hooks/useAuth';

export default function Chat() {
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const historyLoadedRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const { session, loading: authLoading } = useAuth();

  // 获取用户选择的模型
  const [selectedModel] = useState(() => {
    return localStorage.getItem('ai-model') || 'claude-sonnet-4.5';
  });

  // 从路由状态获取上下文（如从版本详情页跳转过来）
  const contextFromRoute = location.state?.context;

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
    error,
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

  // 如果有上下文，自动填充输入
  useEffect(() => {
    if (contextFromRoute && inputRef.current) {
      const { artworkTitle, editionNumber } = contextFromRoute;
      if (artworkTitle && editionNumber) {
        setInputValue(`${artworkTitle} ${editionNumber} `);
        inputRef.current.focus();
      }
    }
  }, [contextFromRoute]);

  // 快捷操作
  const quickActions = [
    { label: '库存统计', prompt: '显示当前库存统计' },
    { label: '寄售作品', prompt: '哪些作品在寄售中？' },
    { label: '在库作品', prompt: '显示所有在库的版本' },
    { label: '已售作品', prompt: '最近售出了哪些作品？' },
  ];

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading || authLoading || !session?.access_token) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage({ text: message });
  }, [inputValue, isLoading, authLoading, session?.access_token, sendMessage]);

  const handleQuickAction = useCallback((prompt: string) => {
    if (authLoading || !session?.access_token) return;
    setInputValue(prompt);
    // 稍后提交让 state 更新
    setTimeout(() => {
      sendMessage({ text: prompt });
      setInputValue('');
    }, 0);
  }, [authLoading, session?.access_token, sendMessage]);

  // 处理确认更新
  const handleConfirmUpdate = useCallback(async (data: ConfirmCardData) => {
    // 发送确认消息给 AI，让它执行实际更新
    const confirmMessage = `请执行更新：将 ${data.current.artwork_title} ${data.current.edition_number}/${data.current.edition_total} 的状态更新为 ${data.updates.status || '保持不变'}${data.updates.sale_price ? `，售价 ${data.updates.sale_currency || 'USD'} ${data.updates.sale_price}` : ''}${data.updates.buyer_name ? `，买家 ${data.updates.buyer_name}` : ''}。版本ID: ${data.edition_id}，已确认。`;

    await sendMessage({ text: confirmMessage });
  }, [sendMessage]);

  // 清除对话
  const handleClearChat = useCallback(() => {
    clearChatHistory();
    setMessages([]);
  }, [setMessages]);

  // 获取对话时间
  const chatTimestamp = getChatTimestamp();
  const hasHistory = messages.length > 0 && chatTimestamp;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 - 显示历史信息和清除按钮 */}
      {hasHistory && (
        <div className="px-6 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            对话开始于 {chatTimestamp.toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span>🗑️</span>
            <span>清除对话</span>
          </button>
        </div>
      )}

      {/* 消息列表 - 使用折叠式历史组件 */}
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-8">
            <div className="text-4xl mb-4">💬</div>
            <p className="font-medium">开始对话</p>
            <p className="text-sm mt-2 mb-6">
              试试说：「Guard 有几个版本？」或「哪些作品在寄售？」
            </p>

            {/* 快捷操作 */}
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="px-3 py-1.5 bg-card border border-border rounded-full text-sm hover:bg-accent transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <CollapsibleChatHistory
          messages={messages}
          onConfirmUpdate={handleConfirmUpdate}
          isLoading={isLoading}
        />
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          出错了：{error.message}
        </div>
      )}

      {/* 输入框 */}
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入消息..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoading ? '...' : '发送'}
          </button>
        </form>

        {/* 当前模型指示 */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          使用模型：{selectedModel}
        </div>
      </div>
    </div>
  );
}
