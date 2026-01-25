import { useState, useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Loader2, ImageIcon, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface MigrateResult {
  artworkId: string;
  title: string;
  originalUrl: string;
  status: 'success' | 'failed' | 'skipped';
  newUrl?: string;
  error?: string;
}

interface MigrateResponse {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  results: MigrateResult[];
}

type MigrationStep = 'idle' | 'previewing' | 'preview' | 'migrating' | 'complete';

export default function ThumbnailMigration() {
  const { session } = useAuthContext();
  const [step, setStep] = useState<MigrationStep>('idle');
  const [previewData, setPreviewData] = useState<MigrateResponse | null>(null);
  const [migrateResult, setMigrateResult] = useState<MigrateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 预览需要迁移的作品
  const handlePreview = useCallback(async () => {
    setStep('previewing');
    setError(null);

    try {
      const response = await fetch('/api/import/migrate-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ dryRun: true }),
      });

      if (!response.ok) {
        throw new Error('预览请求失败');
      }

      const data: MigrateResponse = await response.json();
      setPreviewData(data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败');
      setStep('idle');
    }
  }, []);

  // 执行迁移
  const handleMigrate = useCallback(async () => {
    setStep('migrating');
    setError(null);

    try {
      const response = await fetch('/api/import/migrate-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ dryRun: false }),
      });

      if (!response.ok) {
        throw new Error('迁移请求失败');
      }

      const data: MigrateResponse = await response.json();
      setMigrateResult(data);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : '迁移失败');
      setStep('preview');
    }
  }, []);

  // 重置状态
  const handleReset = useCallback(() => {
    setStep('idle');
    setPreviewData(null);
    setMigrateResult(null);
    setError(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 初始状态 */}
      {step === 'idle' && (
        <div className="text-center py-8">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            检查并迁移使用外部链接的作品缩略图到本地存储
          </p>
          <button
            onClick={handlePreview}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            检查需要迁移的作品
          </button>
        </div>
      )}

      {/* 预览中 */}
      {step === 'previewing' && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-muted-foreground">正在检查作品...</p>
        </div>
      )}

      {/* 预览结果 */}
      {step === 'preview' && previewData && (
        <div className="space-y-4">
          {previewData.total === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="text-muted-foreground">所有作品缩略图已经是本地存储，无需迁移</p>
              <button
                onClick={handleReset}
                className="mt-4 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                关闭
              </button>
            </div>
          ) : (
            <>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  发现 {previewData.total} 个作品使用外部图片链接
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  迁移后将下载、压缩图片并上传到本地存储，提高加载速度和稳定性
                </p>
              </div>

              {/* 作品列表 */}
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">作品名称</th>
                      <th className="text-left p-3 font-medium">当前图片来源</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.results.map((item) => (
                      <tr key={item.artworkId} className="hover:bg-muted/30">
                        <td className="p-3">{item.title}</td>
                        <td className="p-3 text-muted-foreground text-xs truncate max-w-xs">
                          {new URL(item.originalUrl).hostname}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleMigrate}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  开始迁移 ({previewData.total} 个作品)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 迁移中 */}
      {step === 'migrating' && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-muted-foreground">正在迁移图片，请稍候...</p>
          <p className="text-xs text-muted-foreground mt-2">
            这可能需要一些时间，取决于图片数量和大小
          </p>
        </div>
      )}

      {/* 迁移完成 */}
      {step === 'complete' && migrateResult && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold mb-2">迁移完成</h3>
          </div>

          {/* 统计 */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-600">{migrateResult.processed}</p>
              <p className="text-xs text-muted-foreground">成功</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-600">{migrateResult.failed}</p>
              <p className="text-xs text-muted-foreground">失败</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-2xl font-bold text-muted-foreground">{migrateResult.total}</p>
              <p className="text-xs text-muted-foreground">总计</p>
            </div>
          </div>

          {/* 失败列表 */}
          {migrateResult.failed > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="font-medium text-red-700 dark:text-red-400 mb-2">
                以下作品迁移失败（保留原链接）：
              </p>
              <ul className="text-sm space-y-1">
                {migrateResult.results
                  .filter((r) => r.status === 'failed')
                  .map((item) => (
                    <li key={item.artworkId} className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>
                        {item.title}: {item.error}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            完成
          </button>
        </div>
      )}
    </div>
  );
}
