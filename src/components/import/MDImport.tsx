import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { parseAndValidateMDFile, type ParsedArtwork } from '@/lib/md-parser';
import { useAuthContext } from '@/contexts/AuthContext';
import UploadStep from './UploadStep';
import PreviewStep from './PreviewStep';
import ResultStep from './ResultStep';
import {
  type PreviewResult,
  type ExecuteResult,
  type BatchProgress,
  type ImportStep,
  getArtworkUid,
} from './types';

export default function MDImport() {
  const { t } = useTranslation('import');
  const { session } = useAuthContext();
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedArtworks, setParsedArtworks] = useState<ParsedArtwork[]>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [selectedThumbnails, setSelectedThumbnails] = useState<Record<string, string>>({});
  const [selectedArtworks, setSelectedArtworks] = useState<Set<string>>(new Set());
  const [artworkUidMap, setArtworkUidMap] = useState<Map<string, ParsedArtwork>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<Array<{ title: string; issues: string[] }>>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

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
        setError(t('mdImport.errors.noArtworks'));
        return;
      }

      setParsedArtworks(artworks);
      setParseWarnings(warnings);

      // 为每个作品设置默认缩略图
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          artworks: artworks.map((a, index) => ({
            ...a,
            thumbnail_url: defaultThumbnails[getArtworkUid(a, index)] || null,
          })),
          mode: 'preview',
        }),
      });

      if (!response.ok) {
        throw new Error(t('mdImport.errors.previewFailed'));
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
      setError(err instanceof Error ? err.message : t('mdImport.errors.parseFailed'));
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, t]);

  // 处理缩略图选择
  const handleThumbnailSelect = (uid: string, imageUrl: string) => {
    setSelectedThumbnails(prev => ({ ...prev, [uid]: imageUrl }));
  };

  // 处理作品选择/取消选择
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

  // 步骤 3: 执行导入（分批处理）
  const handleExecuteImport = async () => {
    try {
      setLoading(true);
      setError(null);

      // 只导入选中的作品
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
        setError(t('mdImport.errors.selectAtLeastOne'));
        setLoading(false);
        return;
      }

      // 分批处理，每批 30 个
      const BATCH_SIZE = 30;
      const totalBatches = Math.ceil(artworksToImport.length / BATCH_SIZE);
      const totalArtworks = artworksToImport.length;

      const accumulatedResults: ExecuteResult = {
        created: [],
        updated: [],
        errors: [],
        imageProcessing: { processed: 0, failed: 0 },
      };

      setBatchProgress({ current: 1, total: totalBatches, processed: 0, totalArtworks });
      await new Promise(resolve => setTimeout(resolve, 50));

      for (let i = 0; i < totalBatches; i++) {
        const startIdx = i * BATCH_SIZE;
        const batch = artworksToImport.slice(startIdx, startIdx + BATCH_SIZE);

        setBatchProgress({ current: i + 1, total: totalBatches, processed: startIdx, totalArtworks });

        try {
          const response = await fetch('/api/import/md', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || ''}`,
            },
            body: JSON.stringify({ artworks: batch, mode: 'execute' }),
          });

          if (!response.ok) {
            accumulatedResults.errors.push(t('mdImport.errors.batchFailed', { batch: i + 1 }));
            break;
          }

          const result: ExecuteResult = await response.json();
          accumulatedResults.created.push(...result.created);
          accumulatedResults.updated.push(...result.updated);
          accumulatedResults.errors.push(...result.errors);
          if (result.imageProcessing) {
            accumulatedResults.imageProcessing!.processed += result.imageProcessing.processed;
            accumulatedResults.imageProcessing!.failed += result.imageProcessing.failed;
          }

          const completedCount = startIdx + batch.length;
          setBatchProgress({ current: i + 1, total: totalBatches, processed: completedCount, totalArtworks });

          if (i < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch {
          accumulatedResults.errors.push(t('mdImport.errors.batchFailed', { batch: i + 1 }));
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      setBatchProgress(null);
      setExecuteResult(accumulatedResults);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mdImport.errors.importFailed'));
    } finally {
      setLoading(false);
      setBatchProgress(null);
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
    setBatchProgress(null);
  };

  return (
    <div className="space-y-6">
      {/* 步骤指示器 */}
      <StepIndicator currentStep={step} />

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
        </div>
      )}

      {/* 解析警告 */}
      {parseWarnings.length > 0 && step === 'preview' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <p className="font-medium text-yellow-700 mb-2">{t('mdImport.parseWarning')}</p>
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
        <UploadStep loading={loading} onFileUpload={handleFileUpload} />
      )}

      {step === 'preview' && previewResult && (
        <PreviewStep
          previewResult={previewResult}
          parsedArtworks={parsedArtworks}
          selectedArtworks={selectedArtworks}
          selectedThumbnails={selectedThumbnails}
          loading={loading}
          batchProgress={batchProgress}
          onArtworkToggle={handleArtworkToggle}
          onSelectAll={handleSelectAll}
          onThumbnailSelect={handleThumbnailSelect}
          onExecuteImport={handleExecuteImport}
          onReset={handleReset}
        />
      )}

      {step === 'result' && executeResult && (
        <ResultStep executeResult={executeResult} onReset={handleReset} />
      )}
    </div>
  );
}

// 步骤指示器子组件
function StepIndicator({ currentStep }: { currentStep: ImportStep }) {
  const { t } = useTranslation('import');

  const steps: { key: ImportStep; label: string }[] = [
    { key: 'upload', label: t('mdImport.steps.upload') },
    { key: 'preview', label: t('mdImport.steps.preview') },
    { key: 'result', label: t('mdImport.steps.complete') },
  ];

  return (
    <div className="flex items-center gap-4 text-sm">
      {steps.map((s, index) => (
        <div key={s.key} className="contents">
          <div className={`flex items-center gap-2 ${currentStep === s.key ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              currentStep === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {index + 1}
            </span>
            {s.label}
          </div>
          {index < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}
