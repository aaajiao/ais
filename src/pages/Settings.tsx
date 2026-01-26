import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';

type Artwork = Database['public']['Tables']['artworks']['Row'];

interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  description?: string;
}

interface ModelsResponse {
  anthropic: ModelInfo[];
  openai: ModelInfo[];
  defaultModel: string | null;
}

export default function Settings() {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuthContext();
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ai-model') || '';
  });
  // 导入提取模型：空字符串表示"使用聊天模型"
  const [extractionModel, setExtractionModel] = useState<string>(() => {
    return localStorage.getItem('extraction-model') || '';
  });
  // 搜索扩展模型：空字符串表示"使用默认快速模型"
  const [searchExpansionModel, setSearchExpansionModel] = useState<string>(() => {
    return localStorage.getItem('search-expansion-model') || '';
  });
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
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

  // 处理提取模型变更
  const handleExtractionModelChange = (modelId: string) => {
    setExtractionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem('extraction-model');
    } else {
      localStorage.setItem('extraction-model', modelId);
    }
  };

  // 处理搜索扩展模型变更
  const handleSearchExpansionModelChange = (modelId: string) => {
    setSearchExpansionModel(modelId);
    if (modelId === '') {
      localStorage.removeItem('search-expansion-model');
    } else {
      localStorage.setItem('search-expansion-model', modelId);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  // 导出 JSON（完整备份）
  const handleExportJSON = async () => {
    setExporting('json');
    try {
      // 获取所有数据
      const [artworksRes, editionsRes, locationsRes, historyRes] = await Promise.all([
        supabase.from('artworks').select('*'),
        supabase.from('editions').select('*'),
        supabase.from('locations').select('*'),
        supabase.from('edition_history').select('*'),
      ]);

      const data = {
        exportedAt: new Date().toISOString(),
        artworks: artworksRes.data || [],
        editions: editionsRes.data || [],
        locations: locationsRes.data || [],
        edition_history: historyRes.data || [],
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aaajiao-inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export JSON failed:', err);
      alert(t('export.exportError') + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(null);
    }
  };

  // 导出 CSV（作品列表）- CSV headers use English for data interoperability
  const handleExportArtworksCSV = async () => {
    setExporting('artworks-csv');
    try {
      const { data: artworks } = await supabase.from('artworks').select('*').returns<Artwork[]>();
      if (!artworks || artworks.length === 0) {
        alert(t('export.noArtworks'));
        return;
      }

      const headers = ['ID', 'Title (EN)', 'Title (CN)', 'Year', 'Type', 'Materials', 'Dimensions', 'Duration', 'Edition Total', 'AP Total', 'Unique', 'Source URL', 'Created At'];
      const rows = artworks.map((a: Artwork) => [
        a.id,
        a.title_en,
        a.title_cn || '',
        a.year || '',
        a.type || '',
        a.materials || '',
        a.dimensions || '',
        a.duration || '',
        a.edition_total || '',
        a.ap_total || '',
        a.is_unique ? 'Yes' : 'No',
        a.source_url || '',
        a.created_at,
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aaajiao-artworks-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV failed:', err);
      alert(t('export.exportError') + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(null);
    }
  };

  // 导出 CSV（版本列表）- CSV headers use English for data interoperability
  const handleExportEditionsCSV = async () => {
    setExporting('editions-csv');
    try {
      const { data: editions } = await supabase
        .from('editions')
        .select('*, artworks(title_en), locations(name)');

      if (!editions || editions.length === 0) {
        alert(t('export.noEditions'));
        return;
      }

      const headers = ['ID', 'Artwork', 'Edition #', 'Type', 'Status', 'Location', 'Inventory #', 'Sale Price', 'Currency', 'Buyer', 'Sale Date', 'Notes', 'Created At'];
      const rows = editions.map((e: Record<string, unknown>) => [
        e.id,
        (e.artworks as { title_en: string } | null)?.title_en || '',
        e.edition_number || '',
        e.edition_type || '',
        e.status || '',
        (e.locations as { name: string } | null)?.name || '',
        e.inventory_number || '',
        e.sale_price || '',
        e.sale_currency || '',
        e.buyer_name || '',
        e.sale_date || '',
        e.notes || '',
        e.created_at,
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aaajiao-editions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV failed:', err);
      alert(t('export.exportError') + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(null);
    }
  };

  // 获取选中模型的信息
  const selectedModelInfo = useMemo(() => {
    if (!models || !selectedModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === selectedModel);
  }, [models, selectedModel]);

  // 获取提取模型的信息
  const extractionModelInfo = useMemo(() => {
    if (!models || !extractionModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === extractionModel);
  }, [models, extractionModel]);

  // 获取搜索扩展模型的信息
  const searchExpansionModelInfo = useMemo(() => {
    if (!models || !searchExpansionModel) return null;
    const allModels = [...models.anthropic, ...models.openai];
    return allModels.find(m => m.id === searchExpansionModel);
  }, [models, searchExpansionModel]);

  // 渲染模型选择器
  const renderModelSelector = () => {
    if (loadingModels) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {t('ai.loadingModels')}
        </div>
      );
    }

    if (modelsError) {
      return (
        <div className="text-center py-8">
          <p className="text-destructive mb-2">{t('ai.loadError')}</p>
          <p className="text-sm text-muted-foreground">{modelsError}</p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            {t('ai.retry')}
          </Button>
        </div>
      );
    }

    if (!models) {
      return null;
    }

    const hasModels = models.anthropic.length > 0 || models.openai.length > 0;

    if (!hasModels) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {t('ai.noModels')}
        </div>
      );
    }

    // 判断当前选中的是哪个 provider
    const isAnthropicSelected = models.anthropic.some(m => m.id === selectedModel);
    const isOpenAISelected = models.openai.some(m => m.id === selectedModel);

    return (
      <div className="space-y-4">
        {/* Anthropic Claude */}
        {models.anthropic.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Anthropic Claude</label>
            <Select
              value={isAnthropicSelected ? selectedModel : ''}
              onValueChange={handleModelChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('ai.selectClaude')} />
              </SelectTrigger>
              <SelectContent>
                {models.anthropic.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* OpenAI GPT */}
        {models.openai.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">OpenAI GPT</label>
            <Select
              value={isOpenAISelected ? selectedModel : ''}
              onValueChange={handleModelChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('ai.selectGPT')} />
              </SelectTrigger>
              <SelectContent>
                {models.openai.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 显示选中模型的描述和 ID */}
        {selectedModelInfo && (
          <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
            {selectedModelInfo.description && (
              <p>{selectedModelInfo.description}</p>
            )}
            <p className="text-xs font-mono">{selectedModel}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>

      {/* AI 模型设置 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('ai.title')}</h2>

        {renderModelSelector()}

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
          <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('ai.modelHint')}</span>
        </p>

        {/* 高级选项 */}
        {models && (models.anthropic.length > 0 || models.openai.length > 0) && (
          <div className="mt-6 pt-6 border-t border-border">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>{t('ai.advancedOptions')}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('ai.advancedDescription')}
                </p>

                {/* 后台任务模型选择 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{t('ai.backgroundModel')}</label>
                    {extractionModel !== '' && (
                      <button
                        onClick={() => handleExtractionModelChange('')}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('ai.resetToDefault')}
                      </button>
                    )}
                  </div>

                  {extractionModel === '' ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                      {t('ai.usingMainModel', { modelName: selectedModelInfo?.name || selectedModel || 'Claude Sonnet 4.5' })}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Anthropic Claude */}
                      {models.anthropic.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Anthropic Claude</label>
                          <Select
                            value={models.anthropic.some(m => m.id === extractionModel) ? extractionModel : ''}
                            onValueChange={handleExtractionModelChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('ai.selectClaude')} />
                            </SelectTrigger>
                            <SelectContent>
                              {models.anthropic.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* OpenAI GPT */}
                      {models.openai.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">OpenAI GPT</label>
                          <Select
                            value={models.openai.some(m => m.id === extractionModel) ? extractionModel : ''}
                            onValueChange={handleExtractionModelChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('ai.selectGPT')} />
                            </SelectTrigger>
                            <SelectContent>
                              {models.openai.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* 显示选中模型的描述 */}
                      {extractionModelInfo && (
                        <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
                          {extractionModelInfo.description && (
                            <p>{extractionModelInfo.description}</p>
                          )}
                          <p className="text-xs font-mono">{extractionModel}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 选择其他模型按钮 */}
                  {extractionModel === '' && (
                    <Button
                      variant="outline"
                      size="small"
                      onClick={() => handleExtractionModelChange(selectedModel)}
                    >
                      {t('ai.selectDifferentModel')}
                    </Button>
                  )}
                </div>

                <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{t('ai.backgroundModelHint')}</span>
                </p>

                {/* 搜索扩展模型选择 */}
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{t('ai.searchExpansionModel')}</label>
                    {searchExpansionModel !== '' && (
                      <button
                        onClick={() => handleSearchExpansionModelChange('')}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('ai.resetToDefault')}
                      </button>
                    )}
                  </div>

                  {searchExpansionModel === '' ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                      {t('ai.usingDefaultFastModel')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Anthropic Claude */}
                      {models.anthropic.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Anthropic Claude</label>
                          <Select
                            value={models.anthropic.some(m => m.id === searchExpansionModel) ? searchExpansionModel : ''}
                            onValueChange={handleSearchExpansionModelChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('ai.selectClaude')} />
                            </SelectTrigger>
                            <SelectContent>
                              {models.anthropic.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* OpenAI GPT */}
                      {models.openai.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">OpenAI GPT</label>
                          <Select
                            value={models.openai.some(m => m.id === searchExpansionModel) ? searchExpansionModel : ''}
                            onValueChange={handleSearchExpansionModelChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('ai.selectGPT')} />
                            </SelectTrigger>
                            <SelectContent>
                              {models.openai.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* 显示选中模型的描述 */}
                      {searchExpansionModelInfo && (
                        <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
                          {searchExpansionModelInfo.description && (
                            <p>{searchExpansionModelInfo.description}</p>
                          )}
                          <p className="text-xs font-mono">{searchExpansionModel}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 选择其他模型按钮 */}
                  {searchExpansionModel === '' && (
                    <Button
                      variant="outline"
                      size="small"
                      onClick={() => handleSearchExpansionModelChange('claude-3-5-haiku-20241022')}
                    >
                      {t('ai.selectDifferentModel')}
                    </Button>
                  )}
                </div>

                <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{t('ai.searchExpansionModelHint')}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 数据导出 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('export.title')}</h2>

        <div className="space-y-4">
          {/* JSON 完整备份 */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">{t('export.jsonBackup')}</p>
              <p className="text-sm text-muted-foreground">{t('export.jsonDescription')}</p>
            </div>
            <Button
              onClick={handleExportJSON}
              disabled={exporting !== null}
            >
              {exporting === 'json' ? t('export.exporting') : t('export.exportJson')}
            </Button>
          </div>

          {/* 作品 CSV */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">{t('export.artworksCsv')}</p>
              <p className="text-sm text-muted-foreground">{t('export.artworksCsvDescription')}</p>
            </div>
            <Button
              onClick={handleExportArtworksCSV}
              disabled={exporting !== null}
            >
              {exporting === 'artworks-csv' ? t('export.exporting') : t('export.exportCsv')}
            </Button>
          </div>

          {/* 版本 CSV */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">{t('export.editionsCsv')}</p>
              <p className="text-sm text-muted-foreground">{t('export.editionsCsvDescription')}</p>
            </div>
            <Button
              onClick={handleExportEditionsCSV}
              disabled={exporting !== null}
            >
              {exporting === 'editions-csv' ? t('export.exporting') : t('export.exportCsv')}
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
          <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('export.exportHint')}</span>
        </p>
      </div>

      {/* 账户信息 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{t('account.title')}</h2>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {user.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <p className="font-medium">
                  {user.user_metadata?.full_name || user.email}
                </p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <Button
                variant="destructive"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? t('account.signingOut') : t('account.signOut')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">{t('account.notLoggedIn')}</p>
        )}
      </div>
    </div>
  );
}
