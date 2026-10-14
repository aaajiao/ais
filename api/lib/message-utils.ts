import { pruneMessages, convertToModelMessages, type ModelMessage, type ToolSet, type UIMessage } from 'ai';

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
  /**
   * 本次请求的工具集。传入后历史里的工具结果走各工具的 toModelOutput——与流式调用时模型实际
   * 看到的摘要一致；不传则把原始数据库行（含 buyer_name / sale_price 等）整段发回，体积数倍。
   */
  tools?: ToolSet;
}

/**
 * 准备发送给模型的消息
 * 最近一个 assistant 轮次原样保留，更早的历史用 pruneMessages 修剪（工具调用 + reasoning 一起剥离）
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
 *
 * Thinking 块完整性（v1.9.1 修复 "thinking blocks in the latest assistant message cannot be modified"）：
 * - 一个 assistant UIMessage 含多个 step；convertToModelMessages 按 step-start 拆成
 *   assistant[reasoning, tool-call] → tool[result] → assistant[reasoning, text]。
 * - 旧实现对整段历史 pruneMessages({ toolCalls: 'before-last-2-messages' })：删掉前面 step 的
 *   tool-call / tool-result 却保留 reasoning，两个 assistant 消息变成相邻，@ai-sdk/anthropic 的
 *   groupIntoBlocks 把它们合并成 [thinking(step1), thinking(step2), text]——来自两次不同响应的
 *   thinking 块拼在一起，Anthropic 判定为篡改，返回 400。历史存进 localStorage 后每次提问都带着
 *   这条消息，所以只有清空对话才恢复。
 * - Anthropic 规则：最新 assistant 消息内的 thinking 序列必须与原始响应一致；tool-use 轮次内必须
 *   回传 thinking；工具调用之外可以省略更早轮次的 thinking。
 *   见 https://platform.claude.com/docs/en/build-with-claude/thinking#preserving-thinking-blocks
 * - 因此：最近一个 assistant 轮次（及其后的用户消息）原样转换，不修剪；更早的轮次修剪工具调用时
 *   必须连同 reasoning 一起剥离，不能留下孤立的 thinking 块。客户端截断兜底也只裁更早的轮次。
 */
export async function prepareMessagesForModel(
  messages: UIMessage[],
  maxTokens: number = 150000,
  options: PrepareMessagesOptions = {}
) {
  const useServerSideCompaction = options.useServerSideCompaction ?? false;

  // 1. 以最近一个 assistant 消息为界拆分：之前是可修剪的历史，之后（含它）原样保留
  const lastAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant');
  const splitIndex = Math.max(lastAssistantIndex, 0);
  const olderMessages = messages.slice(0, splitIndex);
  const latestTurnMessages = messages.slice(splitIndex);

  // 2. 转换为 ModelMessage 格式
  // - tools：工具结果走 toModelOutput，与模型流式调用时看到的内容一致
  // - ignoreIncompleteToolCalls：中途断开（网络 / PWA 切后台 / 离开页面）时 onFinish 仍会保存
  //   input-available 状态的工具调用，不忽略的话之后每次请求都报 AI_MissingToolResultsError
  const convertOptions = { tools: options.tools, ignoreIncompleteToolCalls: true };

  // 3. 更早的轮次：剥离全部工具调用和 reasoning（不能只删工具调用，否则孤立的 thinking 块会被合并），
  // 移除因此变空的消息，剩下的文字按纯文本发送
  const olderModelMessages = toPlainAssistantText(
    pruneMessages({
      messages: await convertToModelMessages(olderMessages, convertOptions),
      reasoning: 'all',
      toolCalls: 'all',
      emptyMessages: 'remove',
    })
  );

  // 4. 最近一个 assistant 轮次：每个 step 的 thinking / tool-call / tool-result 原样回传，
  // 只丢弃被中断、只剩 reasoning 的最后一个 step
  const latestTurnModelMessages = dropUnfinishedSteps(
    await convertToModelMessages(latestTurnMessages, convertOptions)
  );

  const preparedMessages = [...olderModelMessages, ...latestTurnModelMessages];
  const counts = {
    uiCount: messages.length,
    olderUiCount: olderMessages.length,
    olderModelCount: olderModelMessages.length,
    latestTurnModelCount: latestTurnModelMessages.length,
  };

  // 5. 服务端 compaction 路径（Sonnet 4.6+ / Opus 4.6+/4.7）：跳过客户端截断
  if (useServerSideCompaction) {
    console.log('[message-utils] Prepared messages (server-side compaction)', counts);
    return preparedMessages;
  }

  // 6. 客户端截断兜底（OpenAI 全部 + 不支持 compact 的 Claude 模型）：只裁更早的轮次
  if (estimateTokensFromModel(preparedMessages) > maxTokens && olderModelMessages.length > 0) {
    const truncatedMessages = truncateOlderMessages(olderModelMessages, latestTurnModelMessages, maxTokens);

    console.log('[message-utils] Truncated messages', {
      ...counts,
      truncatedCount: truncatedMessages.length,
      estimatedTokens: estimateTokensFromModel(truncatedMessages),
    });

    return truncatedMessages;
  }

  console.log('[message-utils] Prepared messages', counts);
  return preparedMessages;
}

/**
 * 更早轮次的 assistant 文字去掉 providerOptions，以纯文本内联发送。
 * OpenAI Responses（store=true）会把带 itemId 的文字发成 item_reference，而它对应的 reasoning
 * item 已被剥离——"message provided without its required reasoning item" 有被拒的风险。
 */
function toPlainAssistantText(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      return message;
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === 'text' ? { type: 'text' as const, text: part.text } : part
      ),
    };
  });
}

/**
 * 丢弃最近一轮里只剩 reasoning 的 assistant 消息（流被中断：tool-call 未完成被忽略，或正文还没开始）。
 * 这种 step 只可能是该轮最后一个；前面完整的 step 保持原样，成为新的「最新 assistant 消息」。
 * 有报告称 Anthropic 会拒绝以 thinking 结尾的 assistant 消息，OpenAI 会拒绝后面没有内容的 reasoning item。
 */
function dropUnfinishedSteps(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter(
    (message) =>
      message.role !== 'assistant' ||
      typeof message.content === 'string' ||
      message.content.some((part) => part.type !== 'reasoning' && part.type !== 'reasoning-file')
  );
}

/**
 * 客户端截断兜底：只从更早的轮次开头删，最近一轮整轮保留——从中间切开会留下没有 tool_use 的
 * tool_result。开头是 user 消息时保留它作为对话上下文；开头是 assistant（localStorage 截断后可能
 * 出现）则不保留，否则它可能紧贴最近一轮的 assistant 被 provider 合并。
 */
function truncateOlderMessages(
  olderMessages: ModelMessage[],
  latestTurnMessages: ModelMessage[],
  maxTokens: number
): ModelMessage[] {
  const first = olderMessages[0].role === 'user' ? [olderMessages[0]] : [];
  let rest = olderMessages.slice(first.length);

  while (rest.length > 0 && estimateTokensFromModel([...first, ...rest, ...latestTurnMessages]) > maxTokens) {
    rest = rest.slice(1);
  }

  return [...first, ...rest, ...latestTurnMessages];
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
