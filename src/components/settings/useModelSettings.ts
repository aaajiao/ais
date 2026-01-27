import { useState, useEffect, useMemo, useRef } from 'react';

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  description?: { en: string; zh: string };
}

export interface ModelsResponse {
  anthropic: ModelInfo[];
  openai: ModelInfo[];
  defaultModel: string | null;
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
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ai-model') || '';
  });
  const [extractionModel, setExtractionModel] = useState<string>(() => {
    return localStorage.getItem('extraction-model') || '';
  });
  const [searchExpansionModel, setSearchExpansionModel] = useState<string>(() => {
    return localStorage.getItem('search-expansion-model') || '';
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
          localStorage.setItem('ai-model', data.defaultModel);
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
    localStorage.setItem('ai-model', modelId);
  };

  const handleExtractionModelChange = (modelId: string) => {
    setExtractionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem('extraction-model');
    } else {
      localStorage.setItem('extraction-model', modelId);
    }
  };

  const handleSearchExpansionModelChange = (modelId: string) => {
    setSearchExpansionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem('search-expansion-model');
    } else {
      localStorage.setItem('search-expansion-model', modelId);
    }
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
  };
}
