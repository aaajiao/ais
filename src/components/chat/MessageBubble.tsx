import { useState, useCallback } from 'react';
import type { UIMessage } from 'ai';
import EditableConfirmCard, { type ConfirmCardData } from './EditableConfirmCard';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmUpdate?: (data: ConfirmCardData) => Promise<void>;
}

// 工具调用部分类型
interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: 'input-streaming' | 'input' | 'output' | 'error';
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

export default function MessageBubble({ message, onConfirmUpdate }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // 从 parts 中提取文本内容
  const textContent = message.parts
    ?.filter(isTextPart)
    .map(part => part.text)
    .join('') || '';

  // 从 parts 中提取工具调用
  const toolParts: ToolPart[] = (message.parts?.filter(isToolPart) || []) as ToolPart[];

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
          <div className="mt-2 space-y-2">
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
}

// 工具调用结果组件
function ToolResult({
  toolPart,
  onConfirmUpdate
}: {
  toolPart: ToolPart;
  onConfirmUpdate?: (data: ConfirmCardData) => Promise<void>;
}) {
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
  if (state === 'input-streaming' || state === 'input') {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <span className="animate-spin">⏳</span>
        <span>正在{getToolLabel(toolName)}...</span>
      </div>
    );
  }

  // 错误
  if (state === 'error' || errorText) {
    return (
      <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm">
        ❌ {errorText || '工具执行失败'}
      </div>
    );
  }

  // 有输出结果
  if (state === 'output' && output) {
    // 确认卡片
    if (output.type === 'confirmation_card') {
      if (confirmed) {
        return (
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
            <span>✅</span>
            <span>已确认更新</span>
          </div>
        );
      }

      if (cancelled) {
        return (
          <div className="p-3 bg-muted rounded-lg text-muted-foreground text-sm flex items-center gap-2">
            <span>↩️</span>
            <span>已取消操作</span>
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

    if (output.locations) {
      return <LocationResults locations={output.locations as Record<string, unknown>[]} />;
    }

    // 统计结果
    if (output.total_artworks !== undefined) {
      return <StatisticsResult data={output} />;
    }

    // 更新成功
    if (output.success) {
      return (
        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-300 text-sm">
          ✅ {String(output.message)}
        </div>
      );
    }

    // 错误
    if (output.error) {
      return (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300 text-sm">
          ❌ {String(output.error)}
        </div>
      );
    }
  }

  return null;
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_artworks: '搜索作品',
    search_editions: '搜索版本',
    search_locations: '搜索位置',
    get_statistics: '获取统计',
    generate_update_confirmation: '生成确认',
    execute_edition_update: '执行更新',
  };
  return labels[toolName] || toolName;
}

// 作品搜索结果
function ArtworkResults({ artworks }: { artworks: Record<string, unknown>[] }) {
  if (artworks.length === 0) {
    return <div className="text-sm text-muted-foreground">未找到匹配的作品</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">找到 {artworks.length} 个作品：</div>
      {artworks.slice(0, 5).map((artwork) => (
        <div key={String(artwork.id)} className="p-2 bg-muted/50 rounded-lg text-sm">
          <p className="font-medium">{String(artwork.title_en)}</p>
          {artwork.title_cn != null && <p className="text-muted-foreground">{String(artwork.title_cn)}</p>}
          <p className="text-xs text-muted-foreground">
            {String(artwork.year)} · {String(artwork.type)}
          </p>
        </div>
      ))}
      {artworks.length > 5 && (
        <div className="text-xs text-muted-foreground">还有 {artworks.length - 5} 个...</div>
      )}
    </div>
  );
}

// 版本搜索结果
function EditionResults({ editions }: { editions: Record<string, unknown>[] }) {
  const statusConfig: Record<string, { emoji: string; label: string }> = {
    in_production: { emoji: '🔨', label: '制作中' },
    in_studio: { emoji: '🏠', label: '在库' },
    at_gallery: { emoji: '🖼️', label: '寄售' },
    at_museum: { emoji: '🏛️', label: '美术馆' },
    in_transit: { emoji: '🚚', label: '在途' },
    sold: { emoji: '✅', label: '已售' },
    gifted: { emoji: '🎁', label: '赠送' },
    lost: { emoji: '❌', label: '遗失' },
    damaged: { emoji: '⚠️', label: '损坏' },
  };

  if (editions.length === 0) {
    return <div className="text-sm text-muted-foreground">未找到匹配的版本</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">找到 {editions.length} 个版本：</div>
      {editions.slice(0, 5).map((edition) => {
        const artwork = edition.artworks as Record<string, unknown> | undefined;
        const location = edition.locations as Record<string, unknown> | undefined;
        const status = edition.status as string;
        const config = statusConfig[status] || { emoji: '❓', label: status };

        return (
          <div key={String(edition.id)} className="p-2 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium">
              {artwork?.title_en ? String(artwork.title_en) : '未知作品'}{' '}
              {String(edition.edition_number)}/{artwork?.edition_total ? String(artwork.edition_total) : '?'}
              <span className="ml-2">{config.emoji}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {config.label}
              {location && ` · 📍 ${String(location.name)}`}
            </p>
          </div>
        );
      })}
      {editions.length > 5 && (
        <div className="text-xs text-muted-foreground">还有 {editions.length - 5} 个...</div>
      )}
    </div>
  );
}

// 位置搜索结果
function LocationResults({ locations }: { locations: Record<string, unknown>[] }) {
  if (locations.length === 0) {
    return <div className="text-sm text-muted-foreground">未找到匹配的位置</div>;
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">找到 {locations.length} 个位置：</div>
      {locations.map((location) => (
        <div key={String(location.id)} className="text-sm">
          📍 {String(location.name)} {location.city != null ? `(${String(location.city)})` : ''}
        </div>
      ))}
    </div>
  );
}

// 统计结果
function StatisticsResult({ data }: { data: Record<string, unknown> }) {
  const statusLabels: Record<string, string> = {
    in_production: '制作中',
    in_studio: '在库',
    at_gallery: '寄售',
    at_museum: '美术馆',
    in_transit: '运输中',
    sold: '已售',
    gifted: '赠送',
    lost: '遗失',
    damaged: '损坏',
  };

  const breakdown = data.status_breakdown as Record<string, number> | undefined;

  return (
    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
      <div className="text-sm font-medium">📊 库存统计</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>作品总数：<span className="font-medium">{String(data.total_artworks)}</span></div>
        <div>版本总数：<span className="font-medium">{String(data.total_editions)}</span></div>
      </div>
      {breakdown && Object.keys(breakdown).length > 0 && (
        <div className="text-xs space-y-1 pt-2 border-t border-border">
          {Object.entries(breakdown).map(([status, count]) => (
            <div key={status} className="flex justify-between">
              <span>{statusLabels[status] || status}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
