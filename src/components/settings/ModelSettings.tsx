import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import { useModelSettings, formatModelIdForDisplay } from './useModelSettings';

export default function ModelSettings() {
  const { t, i18n } = useTranslation('settings');
  const descLang = i18n.language.startsWith('zh') ? 'zh' : 'en';

  const {
    models,
    loadingModels,
    modelsError,
    showAdvanced,
    setShowAdvanced,
    selectedModel,
    selectedModelInfo,
    handleModelChange,
    extractionModel,
    extractionModelInfo,
    handleExtractionModelChange,
    searchExpansionModel,
    searchExpansionModelInfo,
    handleSearchExpansionModelChange,
  } = useModelSettings();

  // 渲染加载/错误状态
  if (loadingModels) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('ai.title')}</h2>
        <div className="text-center py-8 text-muted-foreground">
          {t('ai.loadingModels')}
        </div>
      </div>
    );
  }

  if (modelsError) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('ai.title')}</h2>
        <div className="text-center py-8">
          <p className="text-destructive mb-2">{t('ai.loadError')}</p>
          <p className="text-sm text-muted-foreground">{modelsError}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            {t('ai.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!models) {
    return null;
  }

  const hasModels = models.anthropic.length > 0 || models.openai.length > 0;

  if (!hasModels) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('ai.title')}</h2>
        <div className="text-center py-8 text-muted-foreground">
          {t('ai.noModels')}
        </div>
      </div>
    );
  }

  const isAnthropicSelected = models.anthropic.some(m => m.id === selectedModel);
  const isOpenAISelected = models.openai.some(m => m.id === selectedModel);

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">{t('ai.title')}</h2>

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
              <p>{selectedModelInfo.description[descLang]}</p>
            )}
            <p className="text-xs font-mono">{formatModelIdForDisplay(selectedModel)}</p>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{t('ai.modelHint')}</span>
      </p>

      {/* 高级选项 */}
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
            <AdvancedModelSelector
              label={t('ai.backgroundModel')}
              hint={t('ai.backgroundModelHint')}
              selectedModel={extractionModel}
              selectedModelInfo={extractionModelInfo}
              mainModelName={selectedModelInfo?.name || selectedModel || 'Claude Sonnet 4.5'}
              defaultLabel={t('ai.usingMainModel', { modelName: selectedModelInfo?.name || selectedModel || 'Claude Sonnet 4.5' })}
              models={models}
              descLang={descLang}
              onModelChange={handleExtractionModelChange}
              onReset={() => handleExtractionModelChange('')}
              onSelectDifferent={() => handleExtractionModelChange(selectedModel)}
              t={t}
            />

            {/* 搜索扩展模型选择 */}
            <div className="pt-4 border-t border-border/50">
              <AdvancedModelSelector
                label={t('ai.searchExpansionModel')}
                hint={t('ai.searchExpansionModelHint')}
                selectedModel={searchExpansionModel}
                selectedModelInfo={searchExpansionModelInfo}
                mainModelName=""
                defaultLabel={t('ai.usingDefaultFastModel')}
                models={models}
                descLang={descLang}
                onModelChange={handleSearchExpansionModelChange}
                onReset={() => handleSearchExpansionModelChange('')}
                onSelectDifferent={() => handleSearchExpansionModelChange('claude-haiku-4-5')}
                t={t}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 高级模型选择器子组件
interface AdvancedModelSelectorProps {
  label: string;
  hint: string;
  selectedModel: string;
  selectedModelInfo: { name: string; description?: { en: string; zh: string } } | null | undefined;
  mainModelName: string;
  defaultLabel: string;
  models: { anthropic: { id: string; name: string }[]; openai: { id: string; name: string }[] };
  descLang: 'en' | 'zh';
  onModelChange: (modelId: string) => void;
  onReset: () => void;
  onSelectDifferent: () => void;
  t: (key: string) => string;
}

function AdvancedModelSelector({
  label,
  hint,
  selectedModel,
  selectedModelInfo,
  defaultLabel,
  models,
  descLang,
  onModelChange,
  onReset,
  onSelectDifferent,
  t,
}: AdvancedModelSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {selectedModel !== '' && (
          <button
            onClick={onReset}
            className="text-xs text-primary hover:underline"
          >
            {t('ai.resetToDefault')}
          </button>
        )}
      </div>

      {selectedModel === '' ? (
        <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
          {defaultLabel}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Anthropic Claude */}
          {models.anthropic.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Anthropic Claude</label>
              <Select
                value={models.anthropic.some(m => m.id === selectedModel) ? selectedModel : ''}
                onValueChange={onModelChange}
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
                value={models.openai.some(m => m.id === selectedModel) ? selectedModel : ''}
                onValueChange={onModelChange}
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
          {selectedModelInfo && (
            <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
              {selectedModelInfo.description && (
                <p>{selectedModelInfo.description[descLang]}</p>
              )}
              <p className="text-xs font-mono">{formatModelIdForDisplay(selectedModel)}</p>
            </div>
          )}
        </div>
      )}

      {/* 选择其他模型按钮 */}
      {selectedModel === '' && (
        <Button variant="outline" size="small" onClick={onSelectDifferent}>
          {t('ai.selectDifferentModel')}
        </Button>
      )}

      <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg flex items-start gap-2">
        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{hint}</span>
      </p>
    </div>
  );
}
