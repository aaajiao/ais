/**
 * 文件上传组件
 * 支持拖拽上传、多文件、自动压缩
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileUpload, type UploadingFile, type UploadedFile } from '@/hooks/useFileUpload';
import { formatFileSize, getFileTypeIcon, detectFileType } from '@/lib/imageCompressor';
import { X, Check } from 'lucide-react';

interface FileUploadProps {
  editionId: string;
  onUploadComplete?: (file: UploadedFile) => void;
  onError?: (error: string, file: File) => void;
  maxSizeMB?: number;
  acceptedTypes?: string;
  disabled?: boolean;
}

// 接受的文件类型
const DEFAULT_ACCEPT = 'image/*,application/pdf,video/*,.xlsx,.xls,.csv';
const MAX_SIZE_MB = 50;

export default function FileUpload({
  editionId,
  onUploadComplete,
  onError,
  maxSizeMB = MAX_SIZE_MB,
  acceptedTypes = DEFAULT_ACCEPT,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    uploadFiles,
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
      return `文件过大 (最大 ${maxSizeMB}MB)`;
    }
    return null;
  }, [maxSizeMB]);

  // 处理文件选择
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        onError?.(error, file);
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      await uploadFiles(validFiles);
    }
  }, [validateFile, uploadFiles, onError]);

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
      case 'pending': return '等待中';
      case 'compressing': return '压缩中';
      case 'uploading': return '上传中';
      case 'complete': return '完成';
      case 'error': return '失败';
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

  return (
    <div className="space-y-4">
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

        <div className="text-4xl mb-2">
          {isDragging ? '📥' : '📎'}
        </div>
        <div className="text-sm text-muted-foreground">
          {isDragging ? (
            <span className="text-primary font-medium">释放以上传文件</span>
          ) : (
            <>
              <span className="text-foreground font-medium">点击</span> 或 <span className="text-foreground font-medium">拖拽</span> 文件到此处
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          支持图片、PDF、视频 (最大 {maxSizeMB}MB)
        </div>
      </div>

      {/* 上传进度列表 */}
      {hasUploadingFiles && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              上传进度 ({uploadingFiles.filter(f => f.status === 'complete').length}/{uploadingFiles.length})
            </span>
            {hasCompletedOrFailed && (
              <button
                onClick={clearCompleted}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                清除已完成
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {uploadingFiles.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
              >
                {/* 文件类型图标 */}
                <span className="text-lg">
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
                  <button
                    onClick={() => cancelUpload(file.id)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="取消"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
