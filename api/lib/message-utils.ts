import { pruneMessages, convertToModelMessages, type UIMessage } from 'ai';

/**
 * 估算消息的 token 数量
 * Claude 模型平均约 4 个字符 = 1 个 token
 * 中文字符约 1.5-2 个字符 = 1 个 token
 */
export function estimateTokens(messages: UIMessage[]): number {
  return messages.reduce((total, msg) => {
    let contentLength = 0;

    // 遍历 parts 计算内容长度
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === 'text') {
          contentLength += part.text.length;
        } else {
          // 工具调用、推理等其他类型，估算 JSON 长度
          contentLength += JSON.stringify(part).length;
        }
      }
    }

    // 使用保守估算：3 字符 = 1 token（对中文更准确）
    return total + Math.ceil(contentLength / 3);
  }, 0);
}

export interface PrepareMessagesOptions {
  /**
   * 当前请求是否走 Anthropic 服务端 compaction（`compact_20260112`）。决定是否
   * 跳过客户端 token 截断兜底。
   * - true：跳过客户端截断 —— 由 streamText providerOptions 注入的 contextManagement
   *   在服务端按 token 数自动压缩历史。
   * - false：保留客户端 token 截断兜底（OpenAI、以及不支持 compaction beta 的 Claude
   *   模型如 Haiku 4.5 / Sonnet 4.5）。
   * - 缺省：false，保守保留兜底（与历史 OpenAI 路径行为一致）。
   *
   * **重要**：caller 必须用 model-provider 的 `supportsCompactBeta(modelId)` 判断，
   * **不能**用 `provider === 'anthropic'` —— compact_20260112 是 Anthropic 子集
   * 模型的 beta 特性，给 Haiku 4.5 / Sonnet 4.5 发会被服务端拒（v1.x 实证）。
   */
  useServerSideCompaction?: boolean;
}

/**
 * 准备发送给模型的消息
 * 使用 AI SDK 的 pruneMessages 修剪工具调用历史
 * 然后根据 token 限制截断旧消息（仅 OpenAI 路径）
 *
 * @param messages 完整的 UIMessage 数组
 * @param maxTokens 最大 token 数（默认 150000，为响应预留空间，仅 OpenAI 路径生效）
 * @param options provider 信息（决定是否走客户端截断兜底）
 * @returns 转换后的 ModelMessage 数组
 *
 * 设计说明（P1-1）：
 * - Anthropic 走官方 contextManagement.compact_20260112（服务端按 token 数自动压缩历史），
 *   客户端 `JSON.stringify().length / 3` 估算不准确，移除以避免误截断长上下文。
 * - OpenAI 没有等效官方机制，必须保留客户端兜底逻辑（即使估算粗糙也比硬超 token 上限好）。
 * - pruneMessages 对两个 provider 都有意义（去除冗余的工具调用结果），保留。
 */
export async function prepareMessagesForModel(
  messages: UIMessage[],
  maxTokens: number = 150000,
  options: PrepareMessagesOptions = {}
) {
  const useServerSideCompaction = options.useServerSideCompaction ?? false;

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

  // 3. 服务端 compaction 路径（Sonnet 4.6+ / Opus 4.6+/4.7）：跳过客户端截断
  if (useServerSideCompaction) {
    if (prunedMessages.length < messages.length) {
      console.log('[message-utils] Pruned messages (server-side compaction)', {
        originalCount: messages.length,
        prunedCount: prunedMessages.length,
      });
    }
    return prunedMessages;
  }

  // 4. 客户端截断兜底（OpenAI 全部 + 不支持 compact 的 Claude 模型）
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
