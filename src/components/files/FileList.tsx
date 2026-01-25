/**
 * 附件列表组件
 * 显示已上传的文件，支持预览和删除
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase, getSignedUrl, deleteFile, insertIntoTableNoReturn, type EditionHistoryInsert } from '@/lib/supabase';
import { formatFileSize } from '@/lib/imageCompressor';
import { getFileTypeIcon } from '@/lib/fileIcons';
import type { FileType } from '@/lib/database.types';
import { Trash2, Eye, X, Image as ImageIcon, Download, Inbox } from 'lucide-react';

export interface EditionFile {
  id: string;
  edition_id: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_type: FileType;
  file_name: string | null;
  file_size: number | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

interface FileListProps {
  files: EditionFile[];
  editionId: string;
  onDelete?: (fileId: string) => void;
  viewMode?: 'grid' | 'list';
  isEditing?: boolean;
}

export default function FileList({
  files,
  editionId,
  onDelete,
  viewMode = 'list',
  isEditing = false,
}: FileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<EditionFile | null>(null);

  // 获取文件 URL（对于上传的文件需要签名 URL）
  const getFileUrl = useCallback(async (file: EditionFile): Promise<string> => {
    if (file.source_type === 'link') {
      return file.file_url;
    }
    // 上传的文件需要签名 URL
    const signedUrl = await getSignedUrl('edition-files', file.file_url);
    return signedUrl || file.file_url;
  }, []);

  // 打开文件
  const handleOpen = useCallback(async (file: EditionFile) => {
    const url = await getFileUrl(file);

    // 图片类型显示预览
    if (file.file_type === 'image') {
      setPreviewUrl(url);
      setPreviewFile(file);
    } else {
      // 其他类型直接打开
      window.open(url, '_blank');
    }
  }, [getFileUrl]);

  // 下载文件
  const handleDownload = useCallback(async (file: EditionFile) => {
    const url = await getFileUrl(file);

    const link = document.createElement('a');
    link.href = url;
    link.download = file.file_name || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [getFileUrl]);

  // 删除文件
  const handleDelete = useCallback(async (file: EditionFile) => {
    if (deletingId) return;

    setDeletingId(file.id);
    setConfirmDeleteId(null);

    try {
      // 如果是上传的文件，也需要从存储中删除
      if (file.source_type === 'upload') {
        await deleteFile('edition-files', [file.file_url]);
      }

      // 删除数据库记录
      const { error } = await supabase
        .from('edition_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      // 记录删除历史
      const historyData: EditionHistoryInsert = {
        edition_id: editionId,
        action: 'file_deleted',
        notes: `删除文件: ${file.file_name || '未命名文件'}`,
      };
      await insertIntoTableNoReturn('edition_history', historyData);

      onDelete?.(file.id);
    } catch (err) {
      console.error('删除文件失败:', err);
      alert('删除文件失败');
    } finally {
      setDeletingId(null);
    }
  }, [deletingId, editionId, onDelete]);

  // 关闭预览
  const closePreview = useCallback(() => {
    setPreviewUrl(null);
    setPreviewFile(null);
  }, []);

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Inbox className="w-10 h-10 mx-auto mb-2" />
        <div className="text-sm">暂无附件</div>
      </div>
    );
  }

  return (
    <>
      {/* 列表视图 */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              {/* 缩略图或图标 */}
              {file.file_type === 'image' ? (
                <ImageThumbnail file={file} size={48} />
              ) : (
                <span className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-muted-foreground">
                  {getFileTypeIcon(file.file_type, 'w-6 h-6')}
                </span>
              )}

              {/* 文件信息 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {file.file_name || '未命名文件'}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {file.file_size && (
                    <span>{formatFileSize(file.file_size)}</span>
                  )}
                  <span>·</span>
                  <span>{formatDate(file.created_at)}</span>
                  {file.source_type === 'link' && (
                    <>
                      <span>·</span>
                      <span className="text-blue-500">外部链接</span>
                    </>
                  )}
                </div>
                {file.description && (
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {file.description}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpen(file)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg transition-colors"
                  title="打开"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {file.source_type === 'upload' && (
                  <button
                    onClick={() => handleDownload(file)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg transition-colors"
                    title="下载"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}

                {isEditing && (
                  <>
                    {confirmDeleteId === file.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(file)}
                          disabled={deletingId === file.id}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                        >
                          {deletingId === file.id ? '删除中...' : '确认'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs bg-muted text-foreground rounded hover:bg-muted/80"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(file.id)}
                        className="p-2 text-muted-foreground hover:text-red-500 hover:bg-background rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 网格视图 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {files.map(file => (
            <div
              key={file.id}
              className="group relative bg-muted/50 rounded-lg overflow-hidden aspect-square hover:ring-2 hover:ring-primary/50 transition-all"
            >
              {/* 图片预览或图标 */}
              {file.file_type === 'image' && file.source_type === 'upload' ? (
                <ImagePreview file={file} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  {getFileTypeIcon(file.file_type, 'w-12 h-12')}
                </div>
              )}

              {/* 悬浮操作层 */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => handleOpen(file)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white"
                  title="打开"
                >
                  <Eye className="w-5 h-5" />
                </button>
                {isEditing && (
                  <button
                    onClick={() => setConfirmDeleteId(file.id)}
                    className="p-2 bg-white/20 hover:bg-red-500/50 rounded-full text-white"
                    title="删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* 文件名 */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 truncate">
                {file.file_name || '未命名'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 图片预览模态框 */}
      {previewUrl && previewFile && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={closePreview}
        >
          <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
            <img
              src={previewUrl}
              alt={previewFile.file_name || '预览'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <button
              onClick={closePreview}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-sm p-3 rounded-b-lg">
              {previewFile.file_name}
              {previewFile.file_size && (
                <span className="ml-2 text-white/70">
                  ({formatFileSize(previewFile.file_size)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框（网格视图用） */}
      {confirmDeleteId && viewMode === 'grid' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-muted-foreground mb-4">
              确定要删除这个文件吗？此操作无法撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm bg-muted text-foreground rounded-lg hover:bg-muted/80"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const file = files.find(f => f.id === confirmDeleteId);
                  if (file) handleDelete(file);
                }}
                disabled={deletingId === confirmDeleteId}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deletingId === confirmDeleteId ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 图片缩略图组件（用于列表视图）
function ImageThumbnail({ file, size = 48 }: { file: EditionFile; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadUrl = async () => {
      try {
        if (file.source_type === 'link') {
          if (mounted) {
            setUrl(file.file_url);
            setLoading(false);
          }
        } else {
          const signedUrl = await getSignedUrl('edition-files', file.file_url);
          if (mounted) {
            setUrl(signedUrl);
            setLoading(false);
          }
        }
      } catch {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      mounted = false;
    };
  }, [file.file_url, file.source_type]);

  if (loading) {
    return (
      <div
        className="flex-shrink-0 bg-muted animate-pulse rounded-lg flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className="flex-shrink-0 bg-muted rounded-lg flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={file.file_name || ''}
      className="flex-shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

// 图片预览组件（用于网格视图，异步加载签名 URL）
function ImagePreview({ file }: { file: EditionFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadUrl = async () => {
      try {
        if (file.source_type === 'link') {
          if (mounted) {
            setUrl(file.file_url);
            setLoading(false);
          }
        } else {
          const signedUrl = await getSignedUrl('edition-files', file.file_url);
          if (mounted) {
            setUrl(signedUrl);
            setLoading(false);
          }
        }
      } catch {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      mounted = false;
    };
  }, [file.file_url, file.source_type]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return url ? (
    <img
      src={url}
      alt={file.file_name || ''}
      className="absolute inset-0 w-full h-full object-cover"
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center">
      <ImageIcon className="w-12 h-12 text-muted-foreground" />
    </div>
  );
}
