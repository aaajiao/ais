import { useState, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { UIMessage } from 'ai';
import EditableConfirmCard, { type ConfirmCardData } from './EditableConfirmCard';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { EditionStatus } from '@/lib/database.types';
import { Loader2, CheckCircle, XCircle, Undo2, ChevronRight } from 'lucide-react';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmUpdate?: (data: ConfirmCardData) => Promise<void>;
}

// 工具调用部分类型
interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'input' | 'output' | 'error';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
}

// 文本部分类型
interface TextPart {
  type: 'text';
  text: string;
}

// 判断是否为文本部分
function isTextPart(part: unknown): part is TextPart {
  return typeof part === 'object' && part !== null &&
    'type' in part && (part as { type: string }).type === 'text';
}

// 判断是否为工具调用部分
function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== 'object' || part === null) return false;
  const p = part as { type?: string };
  return typeof p.type === 'string' && (
    p.type.startsWith('tool-') ||
    p.type === 'dynamic-tool'
  );
}

// 获取工具名称
function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith('tool-')) {
    return part.type.replace('tool-', '');
  }
  return 'unknown';
}

// 使用 memo 包装组件，添加自定义比较函数
const MessageBubble = memo(function MessageBubble({ message, onConfirmUpdate }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // 缓存文本内容计算
  const textContent = useMemo(() => {
    return message.parts
      ?.filter(isTextPart)
      .map(part => part.text)
      .join('') || '';
  }, [message.parts]);

  // 缓存工具调用计算
  const toolParts = useMemo(() => {
    return (message.parts?.filter(isToolPart) || []) as ToolPart[];
  }, [message.parts]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border border-border'
        }`}
      >
        {/* 消息内容 */}
        {textContent && (
          <div className="whitespace-pre-wrap break-words">
            {textContent}
          </div>
        )}

        {/* 工具调用结果 */}
        {toolParts.length > 0 && (
          <div className="mt-3 space-y-3">
            {toolParts.map((tool, index) => (
              <ToolResult
                key={tool.toolCallId || String(index)}
                toolPart={tool}
                onConfirmUpdate={onConfirmUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 只在消息内容变化时重新渲染
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.parts === nextProps.message.parts;
});

export default MessageBubble;

// 工具调用结果组件
function ToolResult({
  toolPart,
  onConfirmUpdate
}: {
  toolPart: ToolPart;
  onConfirmUpdate?: (data: ConfirmCardData) => Promise<void>;
}) {
  const { t } = useTranslation('chat');
  const toolName = getToolName(toolPart);
  const { state, output, errorText } = toolPart;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // 处理确认
  const handleConfirm = useCallback(async (data: ConfirmCardData) => {
    if (onConfirmUpdate) {
      setIsSubmitting(true);
      try {
        await onConfirmUpdate(data);
        setConfirmed(true);
      } catch (error) {
        console.error('Update failed:', error);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // 如果没有提供回调，标记为已确认
      setConfirmed(true);
    }
  }, [onConfirmUpdate]);

  // 处理取消
  const handleCancel = useCallback(() => {
    setCancelled(true);
  }, []);

  // 正在执行中
  if (state === 'input-streaming' || state === 'input' || state === 'input-available') {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('toolExecution', { action: t(`tools.${toolName}`, { defaultValue: toolName }) })}</span>
      </div>
    );
  }

  // 错误
  if (state === 'error' || state === 'output-error' || errorText) {
    return (
      <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>{errorText || t('toolError')}</span>
      </div>
    );
  }

  // 有输出结果
  if ((state === 'output' || state === 'output-available') && output) {
    // 确认卡片
    if (output.type === 'confirmation_card') {
      if (confirmed) {
        return (
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{t('confirmed')}</span>
          </div>
        );
      }

      if (cancelled) {
        return (
          <div className="p-3 bg-muted rounded-lg text-muted-foreground text-sm flex items-center gap-2">
            <Undo2 className="w-4 h-4 flex-shrink-0" />
            <span>{t('cancelled')}</span>
          </div>
        );
      }

      return (
        <EditableConfirmCard
          data={output as unknown as ConfirmCardData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      );
    }

    // 搜索结果
    if (output.artworks) {
      return <ArtworkResults artworks={output.artworks as Record<string, unknown>[]} />;
    }

    if (output.editions) {
      return <EditionResults editions={output.editions as Record<string, unknown>[]} />;
    }

    // 位置搜索结果 - 由 AI 文字描述即可（无详情页）
    // 统计结果 - 由 AI 文字描述即可（纯信息展示）

    // 导入作品成功 - 显示查看链接
    if (output.success && output.artwork_id && output.action) {
      return (
        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{String(output.message)}</span>
          </div>
          <Link
            to={`/artworks/${String(output.artwork_id)}`}
            className="mt-2 inline-flex items-center gap-1 text-green-800 dark:text-green-200 hover:underline"
          >
            {t('results.viewArtwork')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      );
    }

    // 一般成功消息
    if (output.success) {
      return (
        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{String(output.message)}</span>
        </div>
      );
    }

    // 错误
    if (output.error) {
      return (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{String(output.error)}</span>
        </div>
      );
    }
  }

  return null;
}

// 作品搜索结果
function ArtworkResults({ artworks }: { artworks: Record<string, unknown>[] }) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  if (artworks.length === 0) {
    return <div className="text-sm text-muted-foreground">{t('results.noArtworks')}</div>;
  }

  const displayCount = expanded ? artworks.length : Math.min(5, artworks.length);
  const hasMore = artworks.length > 5;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{t('results.foundArtworks', { count: artworks.length })}</div>
      {artworks.slice(0, displayCount).map((artwork) => (
        <Link
          key={String(artwork.id)}
          to={`/artworks/${String(artwork.id)}`}
          className="block p-2 bg-muted/50 rounded-lg text-sm hover:bg-muted transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{String(artwork.title_en)}</p>
              {artwork.title_cn != null && <p className="text-muted-foreground">{String(artwork.title_cn)}</p>}
              <p className="text-xs text-muted-foreground">
                {String(artwork.year)} · {String(artwork.type)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </Link>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? t('results.collapse') : t('results.showMore', { count: artworks.length - 5 })}
        </button>
      )}
    </div>
  );
}

// 版本搜索结果
function EditionResults({ editions }: { editions: Record<string, unknown>[] }) {
  const { t } = useTranslation('chat');
  const { t: tStatus } = useTranslation('status');
  const [expanded, setExpanded] = useState(false);

  if (editions.length === 0) {
    return <div className="text-sm text-muted-foreground">{t('results.noEditions')}</div>;
  }

  const displayCount = expanded ? editions.length : Math.min(5, editions.length);
  const hasMore = editions.length > 5;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{t('results.foundEditions', { count: editions.length })}</div>
      {editions.slice(0, displayCount).map((edition) => {
        const artwork = edition.artworks as Record<string, unknown> | undefined;
        const location = edition.locations as Record<string, unknown> | undefined;
        const status = edition.status as EditionStatus;

        return (
          <Link
            key={String(edition.id)}
            to={`/editions/${String(edition.id)}`}
            className="block p-2 bg-muted/50 rounded-lg text-sm hover:bg-muted transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <span>
                    {artwork?.title_en ? String(artwork.title_en) : t('results.unknownArtwork')}{' '}
                    {String(edition.edition_number)}/{artwork?.edition_total ? String(artwork.edition_total) : '?'}
                  </span>
                  <StatusIndicator status={status} size="sm" />
                </p>
                <p className="text-xs text-muted-foreground">
                  {tStatus(status)}
                  {location && ` · ${String(location.name)}`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? t('results.collapse') : t('results.showMore', { count: editions.length - 5 })}
        </button>
      )}
    </div>
  );
}

