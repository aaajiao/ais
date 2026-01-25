import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export type ModelId =
  | 'claude-sonnet-4.5'
  | 'claude-opus-4.5'
  | 'claude-haiku-4.5'
  | 'gpt-5.2'
  | 'gpt-5.1'
  | 'gpt-4.1';

export interface ModelConfig {
  id: ModelId;
  provider: ReturnType<typeof anthropic> | ReturnType<typeof openai>;
  name: string;
  description: string;
  category: 'anthropic' | 'openai';
}

// 模型配置 - 与 api/chat.ts 保持一致
export const modelConfigs: Record<ModelId, Omit<ModelConfig, 'id'>> = {
  // ========== Anthropic Claude 系列 ==========
  'claude-sonnet-4.5': {
    provider: anthropic('claude-sonnet-4-5-20250929'),
    name: 'Claude Sonnet 4.5',
    description: '推荐，平衡性能和成本',
    category: 'anthropic',
  },
  'claude-opus-4.5': {
    provider: anthropic('claude-opus-4-5-20251124'),
    name: 'Claude Opus 4.5',
    description: '最强大，编码和代理任务最佳',
    category: 'anthropic',
  },
  'claude-haiku-4.5': {
    provider: anthropic('claude-haiku-4-5-20251015'),
    name: 'Claude Haiku 4.5',
    description: '快速低成本',
    category: 'anthropic',
  },

  // ========== OpenAI GPT 系列 ==========
  'gpt-5.2': {
    provider: openai('gpt-5.2'),
    name: 'GPT-5.2',
    description: '最新旗舰，最精确',
    category: 'openai',
  },
  'gpt-5.1': {
    provider: openai('gpt-5.1'),
    name: 'GPT-5.1',
    description: '旗舰推理模型',
    category: 'openai',
  },
  'gpt-4.1': {
    provider: openai('gpt-4.1'),
    name: 'GPT-4.1',
    description: '编码优化，1M token 上下文',
    category: 'openai',
  },
};

// 默认模型
export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4.5';

// 获取模型配置
export function getModelConfig(modelId: ModelId): ModelConfig {
  const config = modelConfigs[modelId];
  if (!config) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  return { id: modelId, ...config };
}

// 获取模型 provider
export function getModelProvider(modelId: ModelId) {
  return modelConfigs[modelId]?.provider || modelConfigs[DEFAULT_MODEL].provider;
}
