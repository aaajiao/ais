import { useState, useCallback } from 'react';
import { parseAndValidateMDFile, type ParsedArtwork } from '@/lib/md-parser';
import { Loader2, FileText } from 'lucide-react';

interface PreviewResult {
  new: Array<{
    artwork: ParsedArtwork & { thumbnail_url: string | null };
    requiresThumbnail: boolean;
    availableImages: string[];
    _uid?: string; // 临时唯一标识符
  }>;
  updates: Array<{
    existingId: string;
    existingArtwork: Record<string, unknown>;
    newData: ParsedArtwork;
    changes: Array<{
      field: string;
      fieldLabel: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
    _uid?: string; // 临时唯一标识符
  }>;
  unchanged: Array<{
    existingId: string;
    title: string;
  }>;
}

// 生成作品的唯一标识符（优先使用 source_url，否则用 title_en + index）
function getArtworkUid(artwork: { title_en: string; source_url?: string | null }, index: number): string {
  return artwork.source_url || `${artwork.title_en}::${index}`;
}

interface ExecuteResult {
  created: string[];
  updated: string[];
  errors: string[];
}

type ImportStep = 'upload' | 'preview' | 'result';

export default function MDImport() {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedArtworks, setParsedArtworks] = useState<ParsedArtwork[]>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [selectedThumbnails, setSelectedThumbnails] = useState<Record<string, string>>({});
  const [selectedArtworks, setSelectedArtworks] = useState<Set<string>>(new Set()); // 选中要导入的作品 UID
  const [artworkUidMap, setArtworkUidMap] = useState<Map<string, ParsedArtwork>>(new Map()); // UID -> artwork 映射
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<Array<{ title: string; issues: string[] }>>([]);

  // 步骤 1: 文件上传和解析
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setParseWarnings([]);

      const content = await file.text();
      const { artworks, warnings } = parseAndValidateMDFile(content);

      if (artworks.length === 0) {
        setError('未能从文件中解析出任何作品。请确保 MD 文件格式正确（使用 ## 作为作品标题）');
        return;
      }

      setParsedArtworks(artworks);
      setParseWarnings(warnings);

      // 为每个作品设置默认缩略图（使用 source_url 或索引作为 key）
      const defaultThumbnails: Record<string, string> = {};
      artworks.forEach((artwork, index) => {
        const uid = getArtworkUid(artwork, index);
        if (artwork.images.length > 0) {
          defaultThumbnails[uid] = artwork.images[0];
        }
      });
      setSelectedThumbnails(defaultThumbnails);

      // 调用预览 API
      const response = await fetch('/api/import/md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworks: artworks.map((a, index) => ({
            ...a,
            thumbnail_url: defaultThumbnails[getArtworkUid(a, index)] || null,
          })),
          mode: 'preview',
        }),
      });

      if (!response.ok) {
        throw new Error('预览请求失败');
      }

      const result = await response.json() as PreviewResult;

      // 为每个作品生成唯一 UID 并建立映射
      const uidMap = new Map<string, ParsedArtwork>();
      const defaultSelected = new Set<string>();

      result.new.forEach((item, index) => {
        const uid = getArtworkUid(item.artwork, index);
        item._uid = uid;
        uidMap.set(uid, item.artwork);
        defaultSelected.add(uid);
      });

      result.updates.forEach((item, index) => {
        const uid = getArtworkUid(item.newData, result.new.length + index);
        item._uid = uid;
        uidMap.set(uid, item.newData);
        defaultSelected.add(uid);
      });

      setArtworkUidMap(uidMap);
      setPreviewResult(result);
      setSelectedArtworks(defaultSelected);

      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 处理缩略图选择（使用 UID 作为 key）
  const handleThumbnailSelect = (uid: string, imageUrl: string) => {
    setSelectedThumbnails(prev => ({
      ...prev,
      [uid]: imageUrl,
    }));
  };

  // 处理作品选择/取消选择（使用 UID）
  const handleArtworkToggle = (uid: string) => {
    setSelectedArtworks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        newSet.add(uid);
      }
      return newSet;
    });
  };

  // 全选/全不选
  const handleSelectAll = (select: boolean) => {
    if (!previewResult) return;
    if (select) {
      const allUids = new Set<string>();
      previewResult.new.forEach(item => item._uid && allUids.add(item._uid));
      previewResult.updates.forEach(item => item._uid && allUids.add(item._uid));
      setSelectedArtworks(allUids);
    } else {
      setSelectedArtworks(new Set());
    }
  };

  // 步骤 3: 执行导入
  const handleExecuteImport = async () => {
    try {
      setLoading(true);
      setError(null);

      // 只导入选中的作品（通过 UID 映射获取）
      const artworksToImport: Array<ParsedArtwork & { thumbnail_url: string | null }> = [];
      for (const uid of selectedArtworks) {
        const artwork = artworkUidMap.get(uid);
        if (artwork) {
          artworksToImport.push({
            ...artwork,
            thumbnail_url: selectedThumbnails[uid] || artwork.images[0] || null,
          });
        }
      }

      if (artworksToImport.length === 0) {
        setError('请至少选择一个作品进行导入');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/import/md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworks: artworksToImport,
          mode: 'execute',
        }),
      });

      if (!response.ok) {
        throw new Error('导入请求失败');
      }

      const result: ExecuteResult = await response.json();
      setExecuteResult(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  // 重置状态
  const handleReset = () => {
    setStep('upload');
    setParsedArtworks([]);
    setPreviewResult(null);
    setExecuteResult(null);
    setSelectedThumbnails({});
    setSelectedArtworks(new Set());
    setArtworkUidMap(new Map());
    setError(null);
    setParseWarnings([]);
  };

  // 渲染预览结果
  const renderPreview = () => {
    if (!previewResult) return null;

    const hasChanges = previewResult.new.length > 0 || previewResult.updates.length > 0;
    const totalSelectable = previewResult.new.length + previewResult.updates.length;
    const allSelected = selectedArtworks.size === totalSelectable && totalSelectable > 0;

    return (
      <div className="space-y-6">
        {/* 全选控制栏 */}
        {hasChanges && (
          <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
            <span className="text-sm text-muted-foreground">
              已选择 {selectedArtworks.size} / {totalSelectable} 个作品
              {previewResult.unchanged.length > 0 && (
                <span className="ml-2 text-xs">（另有 {previewResult.unchanged.length} 个已存在）</span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleSelectAll(true)}
                disabled={allSelected}
                className="text-sm px-3 py-1 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
              >
                全选
              </button>
              <button
                onClick={() => handleSelectAll(false)}
                disabled={selectedArtworks.size === 0}
                className="text-sm px-3 py-1 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
              >
                全不选
              </button>
            </div>
          </div>
        )}

        {/* 新作品 */}
        {previewResult.new.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              新增作品 ({previewResult.new.length})
            </h3>
            <div className="space-y-3">
              {previewResult.new.map((item, i) => {
                // 通过 source_url 或 title_en+source_url 组合来匹配正确的作品
                const artwork = parsedArtworks.find(a =>
                  a.source_url && item.artwork.source_url
                    ? a.source_url === item.artwork.source_url
                    : a.title_en === item.artwork.title_en && a.source_url === item.artwork.source_url
                );
                const images = artwork?.images || item.artwork.images || [];
                const uid = item._uid || `new-${i}`;
                const isSelected = selectedArtworks.has(uid);

                return (
                  <div
                    key={uid}
                    className={`rounded-xl p-4 transition-all ${
                      isSelected
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-muted/30 border border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 勾选框 */}
                      <label className="flex items-center cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleArtworkToggle(uid)}
                          className="w-5 h-5 rounded border-2 border-green-500 text-green-500 focus:ring-green-500/30"
                        />
                      </label>
                      <div className="flex-1">
                        <p className="font-medium text-lg">
                          {item.artwork.title_cn
                            ? `${item.artwork.title_en} / ${item.artwork.title_cn}`
                            : item.artwork.title_en}
                        </p>
                    <div className="mt-2 text-sm text-muted-foreground space-y-1">
                      {item.artwork.year && <p>年份: {item.artwork.year}</p>}
                      {item.artwork.type && <p>类型: {item.artwork.type}</p>}
                      {item.artwork.dimensions && <p>尺寸: {item.artwork.dimensions}</p>}
                      {item.artwork.materials && <p>材料: {item.artwork.materials}</p>}
                      {item.artwork.duration && <p>时长: {item.artwork.duration}</p>}
                    </div>

                    {/* 缩略图选择 */}
                    {images.length > 0 && isSelected && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">选择缩略图：</p>
                        <div className="flex gap-2 flex-wrap">
                          {images.map((img, imgIndex) => (
                            <button
                              key={imgIndex}
                              onClick={() => handleThumbnailSelect(uid, img)}
                              className={`w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                                selectedThumbnails[uid] === img
                                  ? 'border-primary ring-2 ring-primary/30'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <img
                                src={img}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23374151" width="64" height="64"/><text x="50%" y="50%" fill="%239CA3AF" font-size="10" text-anchor="middle" dy=".3em">Error</text></svg>';
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 更新作品 */}
        {previewResult.updates.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              需要更新 ({previewResult.updates.length})
            </h3>
            <div className="space-y-3">
              {previewResult.updates.map((item, i) => {
                const uid = item._uid || `update-${i}`;
                const isSelected = selectedArtworks.has(uid);

                return (
                  <div
                    key={uid}
                    className={`rounded-xl p-4 transition-all ${
                      isSelected
                        ? 'bg-yellow-500/10 border border-yellow-500/20'
                        : 'bg-muted/30 border border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 勾选框 */}
                      <label className="flex items-center cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleArtworkToggle(uid)}
                          className="w-5 h-5 rounded border-2 border-yellow-500 text-yellow-500 focus:ring-yellow-500/30"
                        />
                      </label>
                      <div className="flex-1">
                        <p className="font-medium">
                          {item.newData.title_cn
                            ? `${item.newData.title_en} / ${item.newData.title_cn}`
                            : item.newData.title_en}
                        </p>
                        {isSelected && (
                          <div className="mt-3 space-y-2">
                            {item.changes.map((change, ci) => (
                              <div key={ci} className="text-sm flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[60px]">{change.fieldLabel}:</span>
                                <span className="line-through text-red-500">{change.oldValue || '(空)'}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-green-600">{change.newValue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 无变更 */}
        {previewResult.unchanged.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400"></span>
              无变更 ({previewResult.unchanged.length})
            </h3>
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                {previewResult.unchanged.map(u => u.title).join('、')}
              </p>
            </div>
          </div>
        )}

        {/* 无任何变更的提示 */}
        {!hasChanges && (
          <div className="bg-muted/50 rounded-xl p-8 text-center">
            <p className="text-muted-foreground">所有作品已是最新，无需导入</p>
          </div>
        )}
      </div>
    );
  };

  // 渲染执行结果
  const renderResult = () => {
    if (!executeResult) return null;

    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <span className="text-6xl mb-4 block">✅</span>
          <h2 className="text-xl font-semibold mb-2">导入完成</h2>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-green-600">{executeResult.created.length}</p>
            <p className="text-sm text-muted-foreground">新增</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-yellow-600">{executeResult.updated.length}</p>
            <p className="text-sm text-muted-foreground">更新</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-red-600">{executeResult.errors.length}</p>
            <p className="text-sm text-muted-foreground">失败</p>
          </div>
        </div>

        {executeResult.errors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <p className="font-medium text-destructive mb-2">错误详情：</p>
            <ul className="text-sm space-y-1">
              {executeResult.errors.map((err, i) => (
                <li key={i} className="text-destructive">{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 步骤指示器 */}
      <div className="flex items-center gap-4 text-sm">
        <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
            step === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>1</span>
          上传文件
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
            step === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>2</span>
          预览变更
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className={`flex items-center gap-2 ${step === 'result' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
            step === 'result' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>3</span>
          完成
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      )}

      {/* 解析警告 */}
      {parseWarnings.length > 0 && step === 'preview' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <p className="font-medium text-yellow-700 mb-2">解析警告：</p>
          <ul className="text-sm space-y-1">
            {parseWarnings.map((w, i) => (
              <li key={i} className="text-yellow-700">
                {w.title}: {w.issues.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 步骤内容 */}
      {step === 'upload' && (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept=".md,.markdown,.txt"
            onChange={handleFileUpload}
            className="hidden"
            id="md-upload"
            disabled={loading}
          />
          <label htmlFor="md-upload" className="cursor-pointer block">
            {loading ? (
              <>
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="font-medium">解析中...</p>
              </>
            ) : (
              <>
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium">点击上传 Markdown 文件</p>
                <p className="text-sm text-muted-foreground mt-2">
                  支持 .md / .markdown / .txt 格式
                </p>
              </>
            )}
          </label>
        </div>
      )}

      {step === 'preview' && (
        <>
          {renderPreview()}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              重新上传
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={loading || selectedArtworks.size === 0}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? '导入中...' : `确认导入 (${selectedArtworks.size})`}
            </button>
          </div>
        </>
      )}

      {step === 'result' && (
        <>
          {renderResult()}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              继续导入
            </button>
          </div>
        </>
      )}
    </div>
  );
}
