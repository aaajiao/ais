import { streamText, stepCountIs, type UIMessage } from 'ai';
import { verifyAuth, unauthorizedResponse } from './lib/auth.js';
import { getModel, getSupabase } from './lib/model-provider.js';
import { systemPrompt } from './lib/system-prompt.js';
import { createTools } from './tools/index.js';
import { prepareMessagesForModel } from './lib/message-utils.js';

// Vercel Edge Function
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 1. 验证身份认证
    const auth = await verifyAuth(req);
    if (!auth.success) {
      return unauthorizedResponse(auth.error || 'Unauthorized');
    }

    const body = await req.json();
    const { messages: uiMessages, model = 'claude-sonnet-4-5', extractionModel, searchExpansionModel } = body;

    // 2. 安全日志（不记录敏感消息内容）
    const requestSize = JSON.stringify(uiMessages || []).length;
    console.log('[chat] Request', {
      userId: auth.userId,
      model,
      extractionModel: extractionModel || 'default',
      searchExpansionModel: searchExpansionModel || 'default',
      messageCount: uiMessages?.length,
      requestSizeKB: Math.round(requestSize / 1024),
    });

    // 3. 获取模型和工具（延迟初始化）
    const selectedModel = getModel(model);
    const supabase = getSupabase();

    const tools = createTools({
      supabase,
      extractionModel,
      searchExpansionModel,
    });

    // 4. 准备消息：使用 pruneMessages 清理工具调用 + 截断超限消息
    const modelMessages = await prepareMessagesForModel(uiMessages as UIMessage[], 150000);

    // 5. 流式对话
    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      onError({ error }) {
        // 记录流式错误（不中断流）
        console.error('[chat] Stream error:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError(error) {
        // 提取错误信息发送给客户端
        console.error('[chat] Response error:', error);
        return error instanceof Error ? error.message : 'Unknown error';
      },
    });
  } catch (error) {
    const err = error as Error & { cause?: Error; status?: number; statusText?: string };
    console.error('[chat] Error:', {
      message: err.message,
      name: err.name,
      cause: err.cause?.message,
      status: err.status,
      statusText: err.statusText,
      stack: err.stack?.slice(0, 500),
    });

    // 返回更具体的错误信息
    const errorMessage = err.message || 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
