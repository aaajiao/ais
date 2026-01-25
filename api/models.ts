/**
 * API endpoint to fetch available models from Anthropic and OpenAI
 * GET /api/models
 */

export const config = {
  runtime: 'edge',
};

interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  description?: string;
}

// Anthropic API response type
interface AnthropicModel {
  id: string;
  display_name: string;
  created_at: string;
  type: string;
}

interface AnthropicModelsResponse {
  data: AnthropicModel[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

// OpenAI API response type
interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

// Filter for chat-capable models
const ANTHROPIC_CHAT_PREFIXES = ['claude-'];
const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4'];

// Models to exclude (embeddings, deprecated, images, audio, etc.)
const EXCLUDED_PATTERNS = [
  'embed',
  'whisper',
  'tts',
  'dall-e',
  'davinci',
  'babbage',
  'ada',
  'curie',
  'instruct',
  'search',
  'similarity',
  'edit',
  'insert',
  'code-',
  'text-',
  'audio',
  'realtime',
  'moderation',
  'image',
  'transcribe',
  'diarize',
];

function isExcluded(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return EXCLUDED_PATTERNS.some(pattern => lower.includes(pattern));
}

function isChatModel(modelId: string, prefixes: string[]): boolean {
  const lower = modelId.toLowerCase();
  return prefixes.some(prefix => lower.startsWith(prefix)) && !isExcluded(modelId);
}

async function fetchAnthropicModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[models] ANTHROPIC_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      console.error('[models] Anthropic API error:', response.status);
      return [];
    }

    const data: AnthropicModelsResponse = await response.json();

    return data.data
      .filter(model => isChatModel(model.id, ANTHROPIC_CHAT_PREFIXES))
      .map(model => ({
        id: model.id,
        name: model.display_name || model.id,
        provider: 'anthropic' as const,
        description: getAnthropicDescription(model.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('[models] Failed to fetch Anthropic models:', error);
    return [];
  }
}

// 过滤掉带日期后缀的重复模型和不常用变体，只保留主要版本
function isMainModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();

  // 排除带日期后缀的版本（如 gpt-4o-2024-08-06）
  const datePattern = /-\d{4}-\d{2}-\d{2}$/;
  const previewPattern = /-preview$/;
  const latestPattern = /-latest$/;

  if (datePattern.test(modelId)) return false;
  if (previewPattern.test(modelId)) return false;
  if (latestPattern.test(modelId)) return false;

  // 排除 codex 变体（用于代码补全，非对话）
  if (lower.includes('-codex')) return false;

  // 排除 GPT-3.5 老版本号
  if (lower.includes('3.5-turbo-0125')) return false;
  if (lower.includes('3.5-turbo-1106')) return false;

  // 排除 GPT-4 老版本号
  if (lower.includes('4-0613')) return false;

  return true;
}

async function fetchOpenAIModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[models] OPENAI_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error('[models] OpenAI API error:', response.status);
      return [];
    }

    const data: OpenAIModelsResponse = await response.json();

    return data.data
      .filter(model => isChatModel(model.id, OPENAI_CHAT_PREFIXES) && isMainModel(model.id))
      .map(model => ({
        id: model.id,
        name: formatOpenAIModelName(model.id),
        provider: 'openai' as const,
        description: getOpenAIDescription(model.id),
      }))
      .sort((a, b) => {
        // Sort by version number (higher first), then by name
        const aVersion = extractVersion(a.id);
        const bVersion = extractVersion(b.id);
        if (aVersion !== bVersion) return bVersion - aVersion;
        return a.name.localeCompare(b.name);
      });
  } catch (error) {
    console.error('[models] Failed to fetch OpenAI models:', error);
    return [];
  }
}

function extractVersion(modelId: string): number {
  const match = modelId.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

function formatOpenAIModelName(modelId: string): string {
  // Format model ID to a readable name
  return modelId
    .replace(/-/g, ' ')
    .replace(/gpt (\d)/gi, 'GPT-$1')
    .replace(/\bo(\d)/gi, 'O$1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getAnthropicDescription(modelId: string): string {
  if (modelId.includes('opus')) return '最强大，适合复杂任务';
  if (modelId.includes('sonnet')) return '推荐，平衡性能和成本';
  if (modelId.includes('haiku')) return '快速低成本';
  return '';
}

function getOpenAIDescription(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('5.2')) return '最新旗舰，最精确';
  if (lower.includes('5.1')) return '旗舰推理模型';
  if (lower.includes('4.1')) return '编码优化，长上下文';
  if (lower.includes('4o-mini')) return '快速低成本';
  if (lower.includes('4o')) return '多模态，高性能';
  if (lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return '推理模型';
  return '';
}

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Fetch models from both providers in parallel
    const [anthropicModels, openaiModels] = await Promise.all([
      fetchAnthropicModels(),
      fetchOpenAIModels(),
    ]);

    const response = {
      anthropic: anthropicModels,
      openai: openaiModels,
      // Provide a default model if available
      defaultModel: anthropicModels.find(m => m.id.includes('sonnet'))?.id
        || anthropicModels[0]?.id
        || openaiModels[0]?.id
        || null,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('[models] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch models' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
