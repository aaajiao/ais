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
   * - false：保留客户端 token 截断兜底（OpenAI，以及不在 compaction 支持列表里的 Claude 模型）。
   * - 缺省：false，保守保留兜底（与历史 OpenAI 路径行为一致）。
   *
   * **重要**：caller 必须用 model-provider 的 `supportsCompactBeta(modelId)` 判断，
   * **不能**用 `provider === 'anthropic'` —— compact_20260112 是 Anthropic 子集
   * 模型的 beta 特性，给不支持的模型发会被服务端拒（v1.x 实证）。
   */
  useServerSideCompaction?: boolean;
  /**
   * 目标 provider，决定 reasoning 怎么回传（缺省 'anthropic'，与 DEFAULT_MODEL 一致）：
   * - 'anthropic'：所有轮次（包括最近一轮）都剥离 reasoning，见下方「Claude 5 preserved thinking」
   * - 'openai'：最近一轮原样回传（reasoning item 与 function_call / message item 配对），更早的轮次剥离
   */
  provider?: 'anthropic' | 'openai';
  /**
   * 本次请求的工具集。传入后历史里的工具结果走各工具的 toModelOutput——与流式调用时模型实际
   * 看到的摘要一致；不传则把原始数据库行（含 buyer_name / sale_price 等）整段发回，体积数倍。
   */
  tools?: ToolSet;
}

/**
 * 准备发送给模型的消息
 * 最近一个 assistant 轮次保留工具调用，更早的历史用 pruneMessages 修剪（工具调用 + reasoning 一起剥离）；
 * Anthropic 路径所有轮次都不带 reasoning。然后根据 token 限制截断旧消息（仅 OpenAI 路径）
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
 * - 因此（OpenAI 路径沿用）：最近一个 assistant 轮次（及其后的用户消息）原样转换，不修剪；更早的轮次修剪工具调用时
 *   必须连同 reasoning 一起剥离，不能留下孤立的 thinking 块。客户端截断兜底也只裁更早的轮次。
 *
 * Claude 5 preserved thinking（v1.10 起，Anthropic 路径不回传任何 thinking 块）：
 * - Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5 的 thinking 签名绑定生成它时的 system、tools 和
 *   之前的全部消息。回传时前面任何一处被改过（更早轮次剥离工具调用、客户端 30 条消息窗口、
 *   localStorage 头部截断、侧边栏与聊天页 system prompt 不同），该 thinking 块就失效：
 *   2026-08-31 起创建的账号直接 400 "bound to a different conversation"；更早的账号目前只记录不拦截，
 *   但官方要求不论账号新旧都按「不改动已发送历史」来写。
 * - 官方允许的编辑包括「移除全部 thinking 块」；adaptive 模式下 assistant 消息也不必以 thinking
 *   开头。所以 Anthropic 路径每一轮都剥离 reasoning（最近一轮保留工具调用和结果），没有 thinking
 *   块就没有前缀校验。同一请求内的多步工具循环由 streamText 追加，thinking 不受影响。
 *   见 https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-with-tool-use
 * - 更早轮次的文字部分在 Anthropic 路径保留 providerOptions：服务端 compaction 块以带
 *   anthropic.type === 'compaction' 的 text part 存在，去掉标记会把摘要当普通文字重发。
 */
export async function prepareMessagesForModel(
  messages: UIMessage[],
  maxTokens: number = 150000,
  options: PrepareMessagesOptions = {}
) {
  const useServerSideCompaction = options.useServerSideCompaction ?? false;
  const provider = options.provider ?? 'anthropic';

  // 1. 以最近一个 assistant 消息为界拆分：之前是可修剪的历史，之后（含它）保留工具调用
  const lastAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant');
  const splitIndex = Math.max(lastAssistantIndex, 0);
  const olderMessages = messages.slice(0, splitIndex);
  const latestTurnMessages = messages.slice(splitIndex);

  // 2. 转换为 ModelMessage 格式
  // - tools：工具结果走 toModelOutput，与模型流式调用时看到的内容一致
  // - ignoreIncompleteToolCalls：中途断开（网络 / PWA 切后台 / 离开页面）时 onFinish 仍会保存
  //   input-available 状态的工具调用，不忽略的话之后每次请求都报 AI_MissingToolResultsError
  // - dropStepMetadata：去掉每个 step 开头的 anthropic.message_start 元数据，否则只剩它的 step 不算空
  const convertOptions = { tools: options.tools, ignoreIncompleteToolCalls: true };

  // 3. 更早的轮次：剥离全部工具调用和 reasoning（不能只删工具调用，否则孤立的 thinking 块会被合并），
  // 移除因此变空的消息。OpenAI 路径的文字按纯文本发送（Anthropic 路径保留 compaction 标记）
  const prunedOlderMessages = pruneMessages({
    messages: dropStepMetadata(await convertToModelMessages(olderMessages, convertOptions)),
    reasoning: 'all',
    toolCalls: 'all',
    emptyMessages: 'remove',
  });
  const olderModelMessages =
    provider === 'openai' ? toPlainAssistantText(prunedOlderMessages) : prunedOlderMessages;

  // 4. 最近一个 assistant 轮次：保留每个 step 的 tool-call / tool-result。
  // - Anthropic：剥离全部 reasoning，移除因此变空的 step（被中断、只剩 reasoning 的 step）
  // - OpenAI：reasoning 原样回传，只丢弃被中断、只剩 reasoning 的最后一个 step
  const convertedLatestTurn = dropStepMetadata(await convertToModelMessages(latestTurnMessages, convertOptions));
  const latestTurnModelMessages =
    provider === 'openai'
      ? dropUnfinishedSteps(convertedLatestTurn)
      : pruneMessages({ messages: convertedLatestTurn, reasoning: 'all', emptyMessages: 'remove' });

  const preparedMessages = [...olderModelMessages, ...latestTurnModelMessages];
  const counts = {
    provider,
    uiCount: messages.length,
    olderUiCount: olderMessages.length,
    olderModelCount: olderModelMessages.length,
    latestTurnModelCount: latestTurnModelMessages.length,
  };

  // 5. 服务端 compaction 路径（Claude 5 系列）：跳过客户端截断
  if (useServerSideCompaction) {
    console.log('[message-utils] Prepared messages (server-side compaction)', counts);
    return preparedMessages;
  }

  // 6. 客户端截断兜底（OpenAI + 不支持 compact 的 Claude 模型）：只裁更早的轮次
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
 * 去掉 assistant 消息里的 `anthropic.message_start` custom part。@ai-sdk/anthropic 4.0.79 起每个 step
 * 开头都带这个元数据（message id / model / usage），经 toUIMessageStream 存进前端历史。两个 provider 的
 * 请求体转换都忽略它，但留在 ModelMessage 里会让只剩它的 step 不算空：pruneMessages / dropUnfinishedSteps
 * 不再移除被中断或只有工具调用的 step，@ai-sdk/anthropic 转换时丢掉这条空 assistant，前后两条 user
 * 消息就不再合并。
 */
function dropStepMetadata(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      return message;
    }
    return {
      ...message,
      content: message.content.filter(
        (part) => !(part.type === 'custom' && part.kind === 'anthropic.message_start')
      ),
    };
  });
}

/**
 * 更早轮次的 assistant 文字去掉 providerOptions，以纯文本内联发送（仅 OpenAI 路径）。
 * OpenAI Responses（store=true）会把带 itemId 的文字发成 item_reference，而它对应的 reasoning
 * item 已被剥离——"message provided without its required reasoning item" 会被拒。
 * @ai-sdk/openai 4.0.93 起 SDK 自己也会在 reasoning 被剥离时内联文字，这里保留作为双保险。
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
 * 这种 step 只可能是该轮最后一个；前面完整的 step 保持原样（仅 OpenAI 路径：OpenAI 会拒绝
 * 后面没有内容的 reasoning item；Anthropic 路径已剥离全部 reasoning，空消息由 pruneMessages 移除）。
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
