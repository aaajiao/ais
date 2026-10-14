import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_SEARCH_EXPANSION_MODEL,
  MODEL_STORAGE_KEYS,
  getModelDisplayName,
  readStoredModelId,
} from '@/lib/modelIds';

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  description?: { en: string; zh: string };
}

export interface ModelsResponse {
  anthropic: ModelInfo[];
  openai: ModelInfo[];
  /** 主聊天默认模型 ID（后端 DEFAULT_MODEL，当前 Sonnet 5.5） */
  defaultModel: string | null;
  /** 翻译 / 搜索扩展默认模型 ID（后端 DEFAULT_EXPANSION_MODEL，当前 Haiku 5.5） */
  defaultExpansionModel: string | null;
}

/**
 * 将完整模型 ID 转换为短别名显示
 * claude-sonnet-4-5-20250929 → claude-sonnet-4-5
 */
export function formatModelIdForDisplay(modelId: string): string {
  const claudeDatePattern = /^(claude-(?:sonnet|opus|haiku)-\d+-\d+)-\d{8}$/;
  const match = modelId.match(claudeDatePattern);
  if (match) {
    return match[1];
  }
  return modelId;
}

export function useModelSettings() {
  // 旧版本存下的 4 系列 / GPT-5 / o 系列 ID 读取时被清掉，主模型随后由 /api/models 的默认值补上
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return readStoredModelId(MODEL_STORAGE_KEYS.chat);
  });
  const [extractionModel, setExtractionModel] = useState<string>(() => {
    return readStoredModelId(MODEL_STORAGE_KEYS.extraction);
  });
  const [searchExpansionModel, setSearchExpansionModel] = useState<string>(() => {
    return readStoredModelId(MODEL_STORAGE_KEYS.searchExpansion);
  });
  // 深度推理开关：独立于模型选择，控制推理强度
  // 默认 false → 两家都走 low effort；开启 → high
  const [thinkingEnabled, setThinkingEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('thinking-enabled') === 'true';
  });
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasInitializedModels = useRef(false);

  // 从 API 加载可用模型列表
  useEffect(() => {
    if (hasInitializedModels.current) return;
    hasInitializedModels.current = true;

    async function fetchModels() {
      try {
        setLoadingModels(true);
        setModelsError(null);
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.status}`);
        }
        const data: ModelsResponse = await response.json();
        setModels(data);

        // 如果没有保存的模型选择，使用默认模型
        if (!selectedModel && data.defaultModel) {
          setSelectedModel(data.defaultModel);
          localStorage.setItem(MODEL_STORAGE_KEYS.chat, data.defaultModel);
        }
      } catch (err) {
        console.error('Failed to load models:', err);
        setModelsError(err instanceof Error ? err.message : 'Failed to load models');
      } finally {
        setLoadingModels(false);
      }
    }

    fetchModels();
  }, [selectedModel]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem(MODEL_STORAGE_KEYS.chat, modelId);
  };

  const handleExtractionModelChange = (modelId: string) => {
    setExtractionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem(MODEL_STORAGE_KEYS.extraction);
    } else {
      localStorage.setItem(MODEL_STORAGE_KEYS.extraction, modelId);
    }
  };

  const handleSearchExpansionModelChange = (modelId: string) => {
    setSearchExpansionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem(MODEL_STORAGE_KEYS.searchExpansion);
    } else {
      localStorage.setItem(MODEL_STORAGE_KEYS.searchExpansion, modelId);
    }
  };

  const setThinkingEnabled = (enabled: boolean) => {
    setThinkingEnabledState(enabled);
    localStorage.setItem('thinking-enabled', enabled ? 'true' : 'false');
  };

  // 获取选中模型的信息
  const selectedModelInfo = useMemo(() => {
    if (!models || !selectedModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === selectedModel);
  }, [models, selectedModel]);

  const extractionModelInfo = useMemo(() => {
    if (!models || !extractionModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === extractionModel);
  }, [models, extractionModel]);

  const searchExpansionModelInfo = useMemo(() => {
    if (!models || !searchExpansionModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === searchExpansionModel);
  }, [models, searchExpansionModel]);

  // 默认翻译模型的显示名（用于"默认：xxx（独立于主聊天）"文案，避免硬编码）
  const defaultExpansionModelName = useMemo(() => {
    const fallbackName = getModelDisplayName(DEFAULT_SEARCH_EXPANSION_MODEL);
    if (!models?.defaultExpansionModel) return fallbackName;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === models.defaultExpansionModel)?.name || fallbackName;
  }, [models]);

  return {
    // 状态
    models,
    loadingModels,
    modelsError,
    showAdvanced,
    setShowAdvanced,
    // 主模型
    selectedModel,
    selectedModelInfo,
    handleModelChange,
    // 提取模型
    extractionModel,
    extractionModelInfo,
    handleExtractionModelChange,
    // 搜索扩展模型
    searchExpansionModel,
    searchExpansionModelInfo,
    handleSearchExpansionModelChange,
    defaultExpansionModelName,
    // 深度推理开关
    thinkingEnabled,
    setThinkingEnabled,
  };
}
