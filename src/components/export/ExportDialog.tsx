import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, FileType } from 'lucide-react';
import type { ExportRequest, ExportOptions } from '@/lib/exporters';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import EditionSelector from './EditionSelector';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  artworkIds: string[];
  artworkCount: number;
  editionTotal?: number | null;  // 作品的版数（用于格式化版本编号）
}

type ExportFormat = 'pdf' | 'md';

export default function ExportDialog({
  isOpen,
  onClose,
  artworkIds,
  artworkCount,
  editionTotal,
}: ExportDialogProps) {
  const { t } = useTranslation('export');
  const { t: tCommon } = useTranslation('common');
  const { session } = useAuthContext();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [options, setOptions] = useState<ExportOptions>({
    includePrice: false,
    includeStatus: false,
    includeLocation: false,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 版本选择状态（仅单作品导出时使用）
  const [editionMode, setEditionMode] = useState<'all' | 'selected'>('all');
  const [selectedEditionIds, setSelectedEditionIds] = useState<string[]>([]);

  // 是否为单作品导出
  const isSingleArtwork = artworkCount === 1;

  // 对话框关闭时重置版本选择状态
  useEffect(() => {
    if (!isOpen) {
      setEditionMode('all');
      setSelectedEditionIds([]);
    }
  }, [isOpen]);

  // 导出按钮是否禁用
  const isExportDisabled =
    exporting || (isSingleArtwork && editionMode === 'selected' && selectedEditionIds.length === 0);

  if (!isOpen) return null;

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    // 检查认证状态
    if (!session?.access_token) {
      setError(t('loginRequired'));
      setExporting(false);
      return;
    }

    try {
      const request: ExportRequest = {
        scope: artworkCount === 1 ? 'single' : 'selected',
        artworkIds,
        // 仅在单作品且选择特定版本时传递 editionIds
        editionIds:
          isSingleArtwork && editionMode === 'selected' ? selectedEditionIds : undefined,
        format,
        options,
      };

      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorMessage = t('exportFailed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // 如果响应不是 JSON，使用默认错误信息
          errorMessage = `${t('exportFailed')} (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `export.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      // 下载文件
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-[--spacing-modal-bottom]">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl max-h-[85dvh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {t('title', { count: artworkCount })}
          </h2>
          <IconButton
            variant="ghost"
            size="sm"
            label={tCommon('close')}
            onClick={onClose}
          >
            <X />
          </IconButton>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-6">
          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium mb-3">{t('selectFormat')}</label>
            <div className="space-y-2">
              <label
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  format === 'pdf'
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-muted border border-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="w-4 h-4 accent-primary"
                />
                <FileType className="w-5 h-5 text-red-500" />
                <div>
                  <span className="font-medium">{t('pdf.name')}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {t('pdf.description')}
                  </span>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  format === 'md'
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-muted border border-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="md"
                  checked={format === 'md'}
                  onChange={() => setFormat('md')}
                  className="w-4 h-4 accent-primary"
                />
                <FileText className="w-5 h-5 text-blue-500" />
                <div>
                  <span className="font-medium">{t('markdown.name')}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {t('markdown.description')}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 版本选择（仅单作品导出时显示） */}
          {isSingleArtwork && (
            <div>
              <label className="block text-sm font-medium mb-3">{t('selectEditions')}</label>
              <EditionSelector
                artworkId={artworkIds[0]}
                editionTotal={editionTotal ?? null}
                mode={editionMode}
                onModeChange={setEditionMode}
                selectedIds={selectedEditionIds}
                onSelectionChange={setSelectedEditionIds}
              />
            </div>
          )}

          {/* 可选信息 */}
          <div>
            <label className="block text-sm font-medium mb-3">{t('includeInfo')}</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includePrice}
                  onChange={(e) =>
                    setOptions({ ...options, includePrice: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary"
                />
                <span>{t('priceInfo')}</span>
              </label>

              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeStatus}
                  onChange={(e) =>
                    setOptions({ ...options, includeStatus: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary"
                />
                <span>{t('statusDetails')}</span>
              </label>

              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.includeLocation}
                  onChange={(e) =>
                    setOptions({ ...options, includeLocation: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary"
                />
                <span>{t('locationInfo')}</span>
              </label>
            </div>
          </div>

          {/* 提示 */}
          <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
            {t('backupHint')}
          </p>

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={exporting}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExportDisabled}
          >
            {exporting ? t('exporting') : t('export')}
          </Button>
        </div>
      </div>
    </div>
  );
}
