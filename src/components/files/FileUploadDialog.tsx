/**
 * 文件上传预览对话框
 * 让用户在上传前编辑文件名称、描述和类型
 */

import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { detectFileType, formatFileSize } from '@/lib/imageCompressor';
import { queryKeys } from '@/lib/queryKeys';
import type { FileType } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import {
  Link2,
  Video,
  Image,
  FileText,
  FileType as FileTypeIcon,
  FileSpreadsheet,
  Paperclip,
  FileCode,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useFileUpload, type UploadedFile, type FileMetadata } from '@/hooks/useFileUpload';

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editionId: string;
  stagedFiles: File[];
  onUploadComplete?: (files: UploadedFile[]) => void;
}

interface StagedFile {
  id: string;
  file: File;
  displayName: string;
  description: string;
  fileType: FileType;
  previewUrl?: string;
}

// 文件类型图标
const FILE_TYPE_ICONS: Record<FileType, ReactNode> = {
  link: <Link2 className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  pdf: <FileTypeIcon className="w-4 h-4" />,
  document: <FileText className="w-4 h-4" />,
  markdown: <FileCode className="w-4 h-4" />,
  spreadsheet: <FileSpreadsheet className="w-4 h-4" />,
  other: <Paperclip className="w-4 h-4" />,
};

// 文件上传可用的类型（排除 link）
const FILE_TYPE_VALUES: FileType[] = [
  'image', 'video', 'pdf', 'document', 'markdown', 'spreadsheet', 'other',
];

export default function FileUploadDialog({
  isOpen,
  onClose,
  editionId,
  stagedFiles: initialFiles,
  onUploadComplete,
}: FileUploadDialogProps) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { uploadFilesWithMetadata } = useFileUpload({
    editionId,
  });

  // 初始化暂存文件
  useEffect(() => {
    if (isOpen && initialFiles.length > 0) {
      const files: StagedFile[] = initialFiles.map(file => {
        const id = crypto.randomUUID();
        const detectedType = detectFileType(file) as FileType;
        return {
          id,
          file,
          displayName: file.name,
          description: '',
          fileType: detectedType,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        };
      });
      setStagedFiles(files);
      // 单文件时自动展开
      if (files.length === 1) {
        setExpandedId(files[0].id);
      }
    }
  }, [isOpen, initialFiles]);

  // 清理预览 URL
  useEffect(() => {
    return () => {
      stagedFiles.forEach(f => {
        if (f.previewUrl) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, [stagedFiles]);

  // 更新单个文件
  const updateFile = useCallback((id: string, updates: Partial<StagedFile>) => {
    setStagedFiles(prev =>
      prev.map(f => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  // 移除单个文件
  const removeFile = useCallback((id: string) => {
    setStagedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);

  // 关闭对话框
  const handleClose = useCallback(() => {
    if (isUploading) return;
    stagedFiles.forEach(f => {
      if (f.previewUrl) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setStagedFiles([]);
    setExpandedId(null);
    onClose();
  }, [isUploading, stagedFiles, onClose]);

  // 提交上传
  const handleSubmit = useCallback(async () => {
    if (stagedFiles.length === 0 || isUploading) return;

    setIsUploading(true);

    try {
      // 构建元数据映射
      const metadataMap = new Map<File, FileMetadata>();
      stagedFiles.forEach(sf => {
        metadataMap.set(sf.file, {
          displayName: sf.displayName.trim() || sf.file.name,
          description: sf.description.trim() || undefined,
          fileType: sf.fileType,
        });
      });

      const files = stagedFiles.map(sf => sf.file);
      const results = await uploadFilesWithMetadata(files, metadataMap);

      // 刷新首页最近更新
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates });

      onUploadComplete?.(results);
      handleClose();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  }, [stagedFiles, isUploading, uploadFilesWithMetadata, queryClient, onUploadComplete, handleClose]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isUploading) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUploading, handleClose]);

  // 计算标题
  const dialogTitle = useMemo(() => {
    if (stagedFiles.length === 1) {
      return t('fileUpload.dialogTitle');
    }
    return t('fileUpload.dialogTitleMultiple', { count: stagedFiles.length });
  }, [stagedFiles.length, t]);

  // 单文件视图
  const isSingleFile = stagedFiles.length === 1;

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[--spacing-modal-bottom]"
      onClick={handleClose}
    >
      <div
        className="modal-content bg-card border border-border rounded-xl p-6 w-full max-w-md max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{dialogTitle}</h3>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('cancel')}
            onClick={handleClose}
            disabled={isUploading}
          >
            <X />
          </IconButton>
        </div>

        <div className="space-y-4">
          {stagedFiles.map(sf => (
            <div key={sf.id} className="border border-border rounded-lg overflow-hidden">
              {/* 文件头部 */}
              <div
                className={`flex items-center gap-3 p-3 ${
                  !isSingleFile ? 'cursor-pointer hover:bg-muted/50' : ''
                }`}
                onClick={() => {
                  if (!isSingleFile) {
                    setExpandedId(expandedId === sf.id ? null : sf.id);
                  }
                }}
              >
                {/* 缩略图或图标 */}
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                  {sf.previewUrl ? (
                    <img
                      src={sf.previewUrl}
                      alt={sf.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      {FILE_TYPE_ICONS[sf.fileType]}
                    </span>
                  )}
                </div>

                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{sf.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(sf.file.size)}
                  </div>
                </div>

                {/* 展开/收起按钮（多文件时显示） */}
                {!isSingleFile && (
                  <div className="flex items-center gap-2">
                    <IconButton
                      variant="ghost"
                      size="mini"
                      label={t('delete')}
                      onClick={e => {
                        e.stopPropagation();
                        removeFile(sf.id);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </IconButton>
                    {expandedId === sf.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>

              {/* 展开的编辑区域 */}
              {(isSingleFile || expandedId === sf.id) && (
                <div className="border-t border-border p-3 space-y-3">
                  {/* 文件名称 */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('fileUpload.fileName')}
                    </label>
                    <input
                      type="text"
                      value={sf.displayName}
                      onChange={e => updateFile(sf.id, { displayName: e.target.value })}
                      placeholder={sf.file.name}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    {sf.displayName !== sf.file.name && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('fileUpload.originalName', { name: sf.file.name })}
                      </div>
                    )}
                  </div>

                  {/* 文件类型 */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('fileUpload.fileType')}
                    </label>
                    <div className="flex flex-wrap gap-2" role="listbox" aria-label={t('fileUpload.fileType')}>
                      {FILE_TYPE_VALUES.map(type => (
                        <ToggleChip
                          key={type}
                          variant="primary"
                          size="small"
                          selected={sf.fileType === type}
                          onClick={() => updateFile(sf.id, { fileType: type })}
                        >
                          {FILE_TYPE_ICONS[type]}
                          {t(`externalLink.fileTypes.${type}`)}
                        </ToggleChip>
                      ))}
                    </div>
                  </div>

                  {/* 描述 */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('fileUpload.description')}
                    </label>
                    <input
                      type="text"
                      value={sf.description}
                      onChange={e => updateFile(sf.id, { description: e.target.value })}
                      placeholder={t('externalLink.addNotePlaceholder')}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 没有文件时 */}
          {stagedFiles.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              {t('files.noAttachments')}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isUploading}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isUploading || stagedFiles.length === 0}
            >
              {isUploading ? t('fileUpload.uploading') : t('fileUpload.upload')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
