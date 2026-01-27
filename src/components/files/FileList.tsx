/**
 * 附件列表组件
 * 显示已上传的文件，支持预览和删除
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  supabase,
  getSignedUrl,
  deleteFile,
  insertIntoTableNoReturn,
  type EditionHistoryInsert,
} from '@/lib/supabase';
import { Inbox } from 'lucide-react';
import { FileListItem } from './FileListItem';
import { FileGridItem } from './FileGridItem';
import { FilePreviewModal } from './FilePreviewModal';
import { FileDeleteConfirmDialog } from './FileDeleteConfirmDialog';
import type { EditionFile, FileListProps } from './types';

// Re-export types for backward compatibility
export type { EditionFile } from './types';

// Static empty state JSX (hoisted per React best practices)
const emptyStateContent = (
  <div className="text-center py-8 text-muted-foreground">
    <Inbox className="w-10 h-10 mx-auto mb-2" />
  </div>
);

export default function FileList({
  files,
  editionId,
  onDelete,
  viewMode = 'list',
  isEditing = false,
}: FileListProps) {
  const { t, i18n } = useTranslation('common');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<EditionFile | null>(null);

  // 获取文件 URL（对于上传的文件需要签名 URL）
  const getFileUrl = useCallback(async (file: EditionFile): Promise<string> => {
    if (file.source_type === 'link') {
      return file.file_url;
    }
    const signedUrl = await getSignedUrl('edition-files', file.file_url);
    return signedUrl || file.file_url;
  }, []);

  // 打开文件
  const handleOpen = useCallback(
    async (file: EditionFile) => {
      const url = await getFileUrl(file);
      if (file.file_type === 'image') {
        setPreviewUrl(url);
        setPreviewFile(file);
      } else {
        window.open(url, '_blank');
      }
    },
    [getFileUrl]
  );

  // 下载文件
  const handleDownload = useCallback(
    async (file: EditionFile) => {
      const url = await getFileUrl(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [getFileUrl]
  );

  // 删除文件
  const handleDelete = useCallback(
    async (file: EditionFile) => {
      if (deletingId) return;

      setDeletingId(file.id);
      setConfirmDeleteId(null);

      try {
        if (file.source_type === 'upload') {
          await deleteFile('edition-files', [file.file_url]);
        }

        const { error } = await supabase
          .from('edition_files')
          .delete()
          .eq('id', file.id);

        if (error) throw error;

        const historyData: EditionHistoryInsert = {
          edition_id: editionId,
          action: 'file_deleted',
          notes: `Deleted file: ${file.file_name || 'Unnamed file'}`,
        };
        await insertIntoTableNoReturn('edition_history', historyData);

        // 更新版本的 updated_at
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('editions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', editionId);

        onDelete?.(file.id);
      } catch (err) {
        console.error('Failed to delete file:', err);
        alert(t('files.deleteFailed'));
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, editionId, onDelete, t]
  );

  // 关闭预览
  const closePreview = useCallback(() => {
    setPreviewUrl(null);
    setPreviewFile(null);
  }, []);

  // 格式化日期
  const formatDate = useCallback(
    (dateStr: string): string => {
      const date = new Date(dateStr);
      const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
      return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [i18n.language]
  );

  // 处理网格视图删除确认
  const handleGridDeleteConfirm = useCallback(() => {
    const file = files.find(f => f.id === confirmDeleteId);
    if (file) handleDelete(file);
  }, [files, confirmDeleteId, handleDelete]);

  if (files.length === 0) {
    return (
      <>
        {emptyStateContent}
        <div className="text-sm text-center text-muted-foreground">
          {t('files.noAttachments')}
        </div>
      </>
    );
  }

  return (
    <>
      {/* 列表视图 */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {files.map(file => (
            <FileListItem
              key={file.id}
              file={file}
              isEditing={isEditing}
              onOpen={handleOpen}
              onDownload={handleDownload}
              onDelete={handleDelete}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
              deletingId={deletingId}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {/* 网格视图 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {files.map(file => (
            <FileGridItem
              key={file.id}
              file={file}
              isEditing={isEditing}
              onOpen={handleOpen}
              onDelete={handleDelete}
              onRequestDelete={setConfirmDeleteId}
            />
          ))}
        </div>
      )}

      {/* 图片预览模态框 */}
      <FilePreviewModal
        file={previewFile}
        imageUrl={previewUrl}
        onClose={closePreview}
      />

      {/* 删除确认对话框（网格视图用） */}
      <FileDeleteConfirmDialog
        isOpen={!!confirmDeleteId && viewMode === 'grid'}
        isDeleting={deletingId === confirmDeleteId}
        onConfirm={handleGridDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </>
  );
}
