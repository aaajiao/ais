/**
 * API endpoint to fetch available models from Anthropic and OpenAI
 * GET /api/models
 *
 * 只列出 Claude 5 系列与 GPT-6 系列（规则见 api/lib/model-ids.ts，与 chat.ts 的
 * resolveModelId 同一来源：列表里看得到的模型，服务端一定接受）。
 */

import { DEFAULT_EXPANSION_MODEL, DEFAULT_MODEL, isAllowedModelId } from './lib/model-ids.js';

export const config = {
  runtime: 'edge',
};

interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  description?: { en: string; zh: string };
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

function isChatModel(modelId: string): boolean {
  return isAllowedModelId(modelId) && !isExcluded(modelId);
}

async function fetchAnthropicModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[models] ANTHROPIC_API_KEY not set');
    return [];
  }

  try {
    // 默认每页 20 个（新的在前，含已弃用模型），取大一点避免 5 系列被分页截掉
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
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
      .filter(model => isChatModel(model.id))
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
      .filter(model => isChatModel(model.id))
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
  // Format model ID to a readable name: gpt-6.1-sol → GPT-6.1 Sol
  return modelId
    .replace(/-/g, ' ')
    .replace(/gpt (\d)/gi, 'GPT-$1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getAnthropicDescription(modelId: string): { en: string; zh: string } | undefined {
  if (modelId.includes('fable') || modelId.includes('mythos')) return {
    en: 'Most capable, for the hardest tasks (highest cost)',
    zh: '最强，适合最难的任务（成本最高）'
  };
  if (modelId.includes('opus')) return {
    en: 'Powerful, for complex tasks',
    zh: '强大，适合复杂任务'
  };
  if (modelId.includes('sonnet')) return {
    en: 'Recommended, balanced performance and cost',
    zh: '推荐，平衡性能和成本'
  };
  if (modelId.includes('haiku')) return {
    en: 'Fast and low cost',
    zh: '快速低成本'
  };
  return undefined;
}

function getOpenAIDescription(modelId: string): { en: string; zh: string } | undefined {
  if (modelId.endsWith('-astra')) return {
    en: 'Flagship, most capable (highest cost)',
    zh: '旗舰，最强（成本最高）'
  };
  if (modelId.endsWith('-sol')) return {
    en: 'Balanced performance and cost',
    zh: '平衡性能和成本'
  };
  if (modelId.endsWith('-luna')) return {
    en: 'Fast and low cost',
    zh: '快速低成本'
  };
  return undefined;
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

    // 找回默认主模型 / 默认翻译模型；若 list 不含则 fallback 第一个 anthropic
    const defaultMainModel =
      anthropicModels.find((m) => m.id === DEFAULT_MODEL)?.id
      || anthropicModels.find((m) => m.id.includes('sonnet'))?.id
      || anthropicModels[0]?.id
      || openaiModels[0]?.id
      || null;
    const defaultExpansionModel =
      anthropicModels.find((m) => m.id === DEFAULT_EXPANSION_MODEL)?.id
      || anthropicModels.find((m) => m.id.includes('haiku'))?.id
      || null;

    const response = {
      anthropic: anthropicModels,
      openai: openaiModels,
      defaultModel: defaultMainModel,
      defaultExpansionModel,
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
