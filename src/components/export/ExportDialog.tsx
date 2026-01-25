import { useState } from 'react';
import { X, FileText, FileType } from 'lucide-react';
import type { ExportRequest, ExportOptions } from '@/lib/exporters';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  artworkIds: string[];
  artworkCount: number;
}

type ExportFormat = 'pdf' | 'md';

export default function ExportDialog({
  isOpen,
  onClose,
  artworkIds,
  artworkCount,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [options, setOptions] = useState<ExportOptions>({
    includePrice: false,
    includeStatus: false,
    includeLocation: false,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const request: ExportRequest = {
        scope: artworkCount === 1 ? 'single' : 'selected',
        artworkIds,
        format,
        options,
      };

      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorMessage = '导出失败';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // 如果响应不是 JSON，使用默认错误信息
          errorMessage = `导出失败 (${response.status})`;
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
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            导出 {artworkCount} 件作品
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-6">
          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium mb-3">选择格式</label>
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
                  <span className="font-medium">PDF</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    带图，可打印
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
                  <span className="font-medium">Markdown</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    带图链接，可编辑
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 可选信息 */}
          <div>
            <label className="block text-sm font-medium mb-3">包含信息</label>
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
                <span>价格信息</span>
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
                <span>版本状态详情（在库/寄售/已售）</span>
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
                <span>位置信息</span>
              </label>
            </div>
          </div>

          {/* 提示 */}
          <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
            完整数据备份请前往「设置」页面
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
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {exporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
