import { pruneMessages, convertToModelMessages, type UIMessage } from 'ai';

/**
 * 估算消息的 token 数量
 * Claude 模型平均约 4 个字符 = 1 个 token
 * 中文字符约 1.5-2 个字符 = 1 个 token
 */
export function estimateTokens(messages: UIMessage[]): number {
  return messages.reduce((total, msg) => {
    let contentLength = 0;

    // 处理不同类型的消息内容
    if (typeof msg.content === 'string') {
      contentLength = msg.content.length;
    } else if (Array.isArray(msg.content)) {
      // 处理包含多个部分的消息（如文本+工具调用）
      contentLength = msg.content.reduce((sum, part) => {
        if (typeof part === 'string') {
          return sum + part.length;
        }
        if ('text' in part && typeof part.text === 'string') {
          return sum + part.text.length;
        }
        // 工具调用等其他类型，估算 JSON 长度
        return sum + JSON.stringify(part).length;
      }, 0);
    } else if (msg.content) {
      contentLength = JSON.stringify(msg.content).length;
    }

    // 包含工具调用的消息需要额外计算
    if (msg.parts) {
      msg.parts.forEach((part) => {
        if (part.type === 'tool-invocation' || part.type === 'tool-result') {
          contentLength += JSON.stringify(part).length;
        }
      });
    }

    // 使用保守估算：3 字符 = 1 token（对中文更准确）
    return total + Math.ceil(contentLength / 3);
  }, 0);
}

/**
 * 准备发送给模型的消息
 * 使用 AI SDK 的 pruneMessages 修剪工具调用历史
 * 然后根据 token 限制截断旧消息
 *
 * @param messages 完整的 UIMessage 数组
 * @param maxTokens 最大 token 数（默认 150000，为响应预留空间）
 * @returns 转换后的 ModelMessage 数组
 */
export async function prepareMessagesForModel(
  messages: UIMessage[],
  maxTokens: number = 150000
) {
  // 1. 先转换为 ModelMessage 格式
  const modelMessages = await convertToModelMessages(messages);

  // 2. 使用 AI SDK 的 pruneMessages 清理工具调用
  // - 移除最后 2 条消息之前的所有工具调用结果（减少 token）
  // - 移除空消息
  const prunedMessages = pruneMessages({
    messages: modelMessages,
    toolCalls: 'before-last-2-messages',
    emptyMessages: 'remove',
  });

  // 3. 如果仍然超限，截断旧消息（保留第一条和最近的消息）
  const estimated = estimateTokensFromModel(prunedMessages);

  if (estimated > maxTokens && prunedMessages.length > 2) {
    const first = prunedMessages[0];
    let recent = prunedMessages.slice(1);

    while (estimateTokensFromModel([first, ...recent]) > maxTokens && recent.length > 1) {
      recent = recent.slice(1);
    }

    console.log('[message-utils] Truncated messages', {
      originalCount: messages.length,
      prunedCount: prunedMessages.length,
      truncatedCount: recent.length + 1,
      estimatedTokens: estimateTokensFromModel([first, ...recent]),
    });

    return [first, ...recent];
  }

  if (prunedMessages.length < messages.length) {
    console.log('[message-utils] Pruned messages', {
      originalCount: messages.length,
      prunedCount: prunedMessages.length,
    });
  }

  return prunedMessages;
}

/**
 * 估算 ModelMessage 数组的 token 数
 */
function estimateTokensFromModel(messages: unknown[]): number {
  const jsonStr = JSON.stringify(messages);
  return Math.ceil(jsonStr.length / 3);
}

/**
 * 截断 UIMessage 消息以适应 token 限制（向后兼容）
 * @deprecated 请使用 prepareMessagesForModel
 */
export function truncateMessages(
  messages: UIMessage[],
  maxTokens: number = 150000
): UIMessage[] {
  if (messages.length <= 2) return messages;

  const estimated = estimateTokens(messages);
  if (estimated <= maxTokens) return messages;

  const first = messages[0];
  let recent = messages.slice(1);

  while (estimateTokens([first, ...recent]) > maxTokens && recent.length > 1) {
    recent = recent.slice(1);
  }

  console.log('[message-utils] Truncated messages', {
    originalCount: messages.length,
    truncatedCount: recent.length + 1,
    originalTokens: estimated,
    truncatedTokens: estimateTokens([first, ...recent]),
  });

  return [first, ...recent];
}
