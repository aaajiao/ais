import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Lightbulb } from 'lucide-react';

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
  const { user, signOut } = useAuthContext();
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ai-model') || '';
  });
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
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
      console.error('导出 JSON 失败:', err);
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setExporting(null);
    }
  };

  // 导出 CSV（作品列表）
  const handleExportArtworksCSV = async () => {
    setExporting('artworks-csv');
    try {
      const { data: artworks } = await supabase.from('artworks').select('*').returns<Artwork[]>();
      if (!artworks || artworks.length === 0) {
        alert('没有作品数据可导出');
        return;
      }

      const headers = ['ID', '标题(英)', '标题(中)', '年份', '类型', '材料', '尺寸', '时长', '版数', 'AP数', '独版', '来源链接', '创建时间'];
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
        a.is_unique ? '是' : '否',
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
      console.error('导出 CSV 失败:', err);
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setExporting(null);
    }
  };

  // 导出 CSV（版本列表）
  const handleExportEditionsCSV = async () => {
    setExporting('editions-csv');
    try {
      const { data: editions } = await supabase
        .from('editions')
        .select('*, artworks(title_en), locations(name)');

      if (!editions || editions.length === 0) {
        alert('没有版本数据可导出');
        return;
      }

      const headers = ['ID', '作品', '版号', '类型', '状态', '位置', '库存编号', '售价', '币种', '买家', '售出日期', '备注', '创建时间'];
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
      console.error('导出 CSV 失败:', err);
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
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

  // 渲染模型选择器
  const renderModelSelector = () => {
    if (loadingModels) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          加载可用模型中...
        </div>
      );
    }

    if (modelsError) {
      return (
        <div className="text-center py-8">
          <p className="text-destructive mb-2">加载模型失败</p>
          <p className="text-sm text-muted-foreground">{modelsError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            重试
          </button>
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
          没有可用的模型。请检查 API 密钥配置。
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
                <SelectValue placeholder="选择 Claude 模型" />
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
                <SelectValue placeholder="选择 GPT 模型" />
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
      <h1 className="text-page-title mb-6 xl:mb-8">设置</h1>

      {/* AI 模型设置 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">AI 模型</h2>

        {renderModelSelector()}

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
          <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>模型列表从 API 动态加载，显示当前可用的所有模型</span>
        </p>
      </div>

      {/* 数据导出 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">数据导出</h2>

        <div className="space-y-4">
          {/* JSON 完整备份 */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">JSON 完整备份</p>
              <p className="text-sm text-muted-foreground">导出所有数据（作品、版本、位置、历史记录）</p>
            </div>
            <button
              onClick={handleExportJSON}
              disabled={exporting !== null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {exporting === 'json' ? '导出中...' : '导出 JSON'}
            </button>
          </div>

          {/* 作品 CSV */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">作品列表 CSV</p>
              <p className="text-sm text-muted-foreground">导出作品基本信息，可用 Excel 打开</p>
            </div>
            <button
              onClick={handleExportArtworksCSV}
              disabled={exporting !== null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {exporting === 'artworks-csv' ? '导出中...' : '导出 CSV'}
            </button>
          </div>

          {/* 版本 CSV */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">版本列表 CSV</p>
              <p className="text-sm text-muted-foreground">导出所有版本及状态信息</p>
            </div>
            <button
              onClick={handleExportEditionsCSV}
              disabled={exporting !== null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {exporting === 'editions-csv' ? '导出中...' : '导出 CSV'}
            </button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
          <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>建议定期导出 JSON 备份，以防数据丢失</span>
        </p>
      </div>

      {/* 账户信息 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">账户</h2>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {user.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full"
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
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="px-4 py-2 rounded-lg bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSigningOut ? '登出中...' : '登出'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">未登录</p>
        )}
      </div>
    </div>
  );
}
