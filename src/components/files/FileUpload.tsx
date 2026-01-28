/**
 * 文件上传组件
 * 支持拖拽上传、多文件、自动压缩
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileUpload, type UploadingFile, type UploadedFile } from '@/hooks/useFileUpload';
import { formatFileSize, detectFileType } from '@/lib/imageCompressor';
import { getFileTypeIcon } from '@/lib/fileIcons';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { X, Check, Paperclip, Download } from 'lucide-react';
import FileUploadDialog from './FileUploadDialog';

interface FileUploadProps {
  editionId: string;
  onUploadComplete?: (file: UploadedFile) => void;
  onError?: (error: string, file: File) => void;
  maxSizeMB?: number;
  acceptedTypes?: string;
  disabled?: boolean;
}

// 接受的文件类型
const DEFAULT_ACCEPT = 'image/*,application/pdf,video/*,.xlsx,.xls,.csv,.md,.markdown,text/markdown';
const MAX_SIZE_MB = 50;

export default function FileUpload({
  editionId,
  onUploadComplete,
  onError,
  maxSizeMB = MAX_SIZE_MB,
  acceptedTypes = DEFAULT_ACCEPT,
  disabled = false,
}: FileUploadProps) {
  const { t } = useTranslation('common');
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    uploadingFiles,
    isUploading: _isUploading,
    cancelUpload,
    clearCompleted,
  } = useFileUpload({
    editionId,
    onUploadComplete,
    onError,
  });

  // Reserved for future use (e.g., showing loading indicator)
  void _isUploading;

  // 验证文件大小
  const validateFile = useCallback((file: File): string | null => {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return t('upload.fileTooLarge', { maxSize: maxSizeMB });
    }
    return null;
  }, [maxSizeMB, t]);

  // 处理文件选择 - 改为打开对话框而非直接上传
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];

    for (const file of Array.from(files)) {
      const error = validateFile(file);
      if (error) {
        onError?.(error, file);
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      setStagedFiles(validFiles);
      setShowUploadDialog(true);
    }
  }, [validateFile, onError]);

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!disabled) {
      handleFiles(e.dataTransfer.files);
    }
  }, [disabled, handleFiles]);

  // 点击选择文件
  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // 重置 input 以便可以再次选择相同文件
    e.target.value = '';
  }, [handleFiles]);

  // 获取状态显示文本
  const getStatusText = (status: UploadingFile['status']): string => {
    switch (status) {
      case 'pending': return t('upload.pending');
      case 'compressing': return t('upload.compressing');
      case 'uploading': return t('upload.uploading');
      case 'complete': return t('upload.complete');
      case 'error': return t('upload.failed');
      default: return '';
    }
  };

  // 获取状态颜色
  const getStatusColor = (status: UploadingFile['status']): string => {
    switch (status) {
      case 'pending': return 'text-muted-foreground';
      case 'compressing': return 'text-yellow-500';
      case 'uploading': return 'text-blue-500';
      case 'complete': return 'text-green-500';
      case 'error': return 'text-red-500';
      default: return '';
    }
  };

  const hasUploadingFiles = uploadingFiles.length > 0;
  const hasCompletedOrFailed = uploadingFiles.some(
    f => f.status === 'complete' || f.status === 'error'
  );

  // 上传完成后自动清除（延迟 1.5 秒让用户看到完成状态）
  useEffect(() => {
    // 检查是否所有文件都已完成（没有 pending/compressing/uploading）
    const allDone = uploadingFiles.length > 0 && uploadingFiles.every(
      f => f.status === 'complete' || f.status === 'error'
    );

    if (allDone) {
      const timer = setTimeout(() => {
        clearCompleted();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [uploadingFiles, clearCompleted]);

  // 处理对话框关闭
  const handleDialogClose = useCallback(() => {
    setShowUploadDialog(false);
    setStagedFiles([]);
  }, []);

  // 处理上传完成
  const handleUploadComplete = useCallback((files: UploadedFile[]) => {
    files.forEach(f => onUploadComplete?.(f));
    setShowUploadDialog(false);
    setStagedFiles([]);
  }, [onUploadComplete]);

  return (
    <div className="space-y-4">
      {/* 文件上传对话框 */}
      <FileUploadDialog
        isOpen={showUploadDialog}
        onClose={handleDialogClose}
        editionId={editionId}
        stagedFiles={stagedFiles}
        onUploadComplete={handleUploadComplete}
      />

      {/* 拖拽上传区域 */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="mb-2 text-muted-foreground">
          {isDragging ? (
            <Download className="w-10 h-10 mx-auto" />
          ) : (
            <Paperclip className="w-10 h-10 mx-auto" />
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {isDragging ? (
            <span className="text-primary font-medium">{t('upload.dropToUpload')}</span>
          ) : (
            <>
              <span className="text-foreground font-medium">{t('upload.click')}</span> {t('upload.or')} <span className="text-foreground font-medium">{t('upload.drag')}</span> {t('upload.clickOrDrag')}
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t('upload.supportedFormats', { maxSize: maxSizeMB })}
        </div>
      </div>

      {/* 上传进度列表 */}
      {hasUploadingFiles && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('upload.uploadProgress')} ({uploadingFiles.filter(f => f.status === 'complete').length}/{uploadingFiles.length})
            </span>
            {hasCompletedOrFailed && (
              <Button
                variant="ghost"
                size="mini"
                onClick={clearCompleted}
              >
                {t('upload.clearCompleted')}
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {uploadingFiles.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
              >
                {/* 文件类型图标 */}
                <span className="text-muted-foreground">
                  {getFileTypeIcon(detectFileType(file.file))}
                </span>

                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{file.file.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(file.originalSize)}</span>
                    {file.compressedSize && file.compressedSize < file.originalSize && (
                      <span className="text-green-500">
                        → {formatFileSize(file.compressedSize)}
                      </span>
                    )}
                    <span className={getStatusColor(file.status)}>
                      {getStatusText(file.status)}
                    </span>
                  </div>

                  {/* 进度条 */}
                  {(file.status === 'uploading' || file.status === 'compressing') && (
                    <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}

                  {/* 错误信息 */}
                  {file.status === 'error' && file.error && (
                    <div className="text-xs text-red-500 mt-1">{file.error}</div>
                  )}
                </div>

                {/* 操作按钮 */}
                {file.status === 'pending' && (
                  <IconButton
                    variant="ghost"
                    size="mini"
                    label={t('cancel')}
                    onClick={() => cancelUpload(file.id)}
                  >
                    <X />
                  </IconButton>
                )}

                {file.status === 'complete' && (
                  <Check className="w-4 h-4 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
