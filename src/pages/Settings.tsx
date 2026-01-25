import { useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];

type AIModel = 'claude-sonnet-4.5' | 'claude-opus-4.5' | 'claude-haiku-4.5' | 'gpt-5.2' | 'gpt-5.1' | 'gpt-4.1';

const modelOptions: { id: AIModel; name: string; description: string; category: 'anthropic' | 'openai' }[] = [
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '推荐，平衡性能和成本', category: 'anthropic' },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', description: '最强大，编码和代理任务最佳', category: 'anthropic' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', description: '快速低成本', category: 'anthropic' },
  { id: 'gpt-5.2', name: 'GPT-5.2', description: '最新旗舰，最精确', category: 'openai' },
  { id: 'gpt-5.1', name: 'GPT-5.1', description: '旗舰推理模型', category: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: '编码优化，1M token 上下文', category: 'openai' },
];

export default function Settings() {
  const { user, signOut } = useAuthContext();
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    const saved = localStorage.getItem('ai-model') as AIModel;
    return saved || 'claude-sonnet-4.5';
  });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
    localStorage.setItem('ai-model', model);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const anthropicModels = modelOptions.filter(m => m.category === 'anthropic');
  const openaiModels = modelOptions.filter(m => m.category === 'openai');

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">设置</h1>

      {/* AI 模型设置 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">AI 模型</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Anthropic Claude</h3>
            <div className="space-y-2">
              {anthropicModels.map(model => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedModel === model.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => handleModelChange(model.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div>
                    <span className="font-medium">{model.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">({model.description})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">OpenAI GPT</h3>
            <div className="space-y-2">
              {openaiModels.map(model => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedModel === model.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => handleModelChange(model.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div>
                    <span className="font-medium">{model.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">({model.description})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
          💡 对话时可说「用 Opus」或「用 GPT」临时切换模型
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

        <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
          💡 建议定期导出 JSON 备份，以防数据丢失
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
