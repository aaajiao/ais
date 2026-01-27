import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ConfirmCardData } from '@/components/chat/EditableConfirmCard';
import CollapsibleChatHistory from '@/components/chat/CollapsibleChatHistory';
import { saveChatHistory, loadChatHistory, clearChatHistory, getChatTimestamp } from '@/lib/chatStorage';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MessageSquare, Trash2, ArrowUp } from 'lucide-react';

export default function Chat() {
  const { t, i18n } = useTranslation('chat');
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const historyLoadedRef = useRef(false);
  const contextFromRoute = location.state?.context as { artworkTitle?: string; editionNumber?: number } | undefined;

  // 初始化输入值，如果有路由上下文则预填充
  const [inputValue, setInputValue] = useState(() => {
    if (contextFromRoute?.artworkTitle && contextFromRoute?.editionNumber) {
      return `${contextFromRoute.artworkTitle} ${contextFromRoute.editionNumber} `;
    }
    return '';
  });
  const { session, loading: authLoading } = useAuthContext();

  // 获取用户选择的模型（现在存储的是完整的模型 ID）
  const [selectedModel] = useState(() => {
    return localStorage.getItem('ai-model') || 'claude-sonnet-4-5';
  });

  // 获取提取模型（空字符串表示使用聊天模型）
  const [extractionModel] = useState(() => {
    return localStorage.getItem('extraction-model') || '';
  });

  // 获取搜索扩展模型（空字符串表示使用默认快速模型）
  const [searchExpansionModel] = useState(() => {
    return localStorage.getItem('search-expansion-model') || '';
  });

  // 获取模型显示名称（包含版本号）
  const getModelDisplayName = (modelId: string) => {
    // Claude 模型：提取版本号
    // claude-sonnet-4-5-20250929 → Claude Sonnet 4.5
    // claude-opus-4-5-20251101 → Claude Opus 4.5
    // claude-3-5-haiku-20241022 → Claude 3.5 Haiku
    // claude-3-5-sonnet-20241022 → Claude 3.5 Sonnet

    // 新格式：claude-{tier}-{major}-{minor}-{date}
    const newFormatMatch = modelId.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
    if (newFormatMatch) {
      const [, tier, major, minor] = newFormatMatch;
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      return `Claude ${tierName} ${major}.${minor}`;
    }

    // 旧格式：claude-{major}-{minor}-{tier}-{date}
    const oldFormatMatch = modelId.match(/^claude-(\d+)-(\d+)-(opus|sonnet|haiku)/i);
    if (oldFormatMatch) {
      const [, major, minor, tier] = oldFormatMatch;
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      return `Claude ${major}.${minor} ${tierName}`;
    }

    // OpenAI GPT 模型
    if (modelId.startsWith('gpt-')) {
      // gpt-4o-2024-08-06 → GPT-4o
      // gpt-4.1-2025-04-14 → GPT-4.1
      // gpt-4o-mini → GPT-4o-mini
      const match = modelId.match(/^gpt-(\d+\.?\d*[a-z]*(?:-mini)?)/i);
      if (match) return `GPT-${match[1]}`;
    }

    // O 系列推理模型（o1, o3, o4）
    if (/^o[134]/i.test(modelId)) {
      // o1-2024-12-17 → O1
      // o3-mini → O3-mini
      const match = modelId.match(/^(o[134](?:-mini|-pro)?)/i);
      if (match) return match[1].toUpperCase();
    }

    return modelId;
  };

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

  // 如果有上下文，自动聚焦输入框
  useEffect(() => {
    if (contextFromRoute && inputRef.current) {
      inputRef.current.focus();
    }
  }, [contextFromRoute]);

  // 快捷操作
  const quickActions = [
    { labelKey: 'quickActions.inventoryStats', promptKey: 'quickPrompts.inventoryStats' },
    { labelKey: 'quickActions.consignedWorks', promptKey: 'quickPrompts.consignedWorks' },
    { labelKey: 'quickActions.inStudioEditions', promptKey: 'quickPrompts.inStudioEditions' },
    { labelKey: 'quickActions.recentlySold', promptKey: 'quickPrompts.recentlySold' },
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
    <div className="absolute inset-0 flex flex-col pb-[var(--spacing-nav-bottom)] md:pb-0">
      {/* 顶部栏 - 显示历史信息和清除按钮 */}
      {hasHistory && (
        <div className="px-6 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('chatStartedAt')} {chatTimestamp.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <Button
            variant="ghost"
            size="mini"
            onClick={handleClearChat}
          >
            <Trash2 />
            <span>{t('clearChat')}</span>
          </Button>
        </div>
      )}

      {/* 消息列表 - 使用折叠式历史组件 */}
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">{t('startConversation')}</p>
            <p className="text-sm mt-2 mb-6">
              {t('tryAsking')}
            </p>

            {/* 快捷操作 */}
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <Button
                  key={action.labelKey}
                  variant="outline"
                  size="small"
                  onClick={() => handleQuickAction(t(action.promptKey))}
                  className="rounded-full"
                >
                  {t(action.labelKey)}
                </Button>
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
          {t('error', { message: error.message })}
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
            placeholder={authLoading ? t('placeholder.verifying') : (!session?.access_token ? t('placeholder.pleaseSignIn') : t('placeholder.typeMessage'))}
            disabled={isLoading || authLoading || !session?.access_token}
            className="flex-1 px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-transparent outline-none disabled:opacity-50"
          />
          <IconButton
            type="submit"
            size="lg"
            label={t('send')}
            disabled={isLoading || authLoading || !session?.access_token || !inputValue.trim()}
            className="rounded-xl"
          >
            <ArrowUp />
          </IconButton>
        </form>

        {/* 当前模型指示 */}
        <div className="mt-2 text-xs text-muted-foreground text-center" title={selectedModel}>
          {t('model')}: {getModelDisplayName(selectedModel)}
        </div>
      </div>
    </div>
  );
}
