/**
 * 附件列表组件
 * 显示已上传的文件，支持预览和删除
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  supabase,
  getSignedUrl,
  deleteFile,
  insertIntoTableNoReturn,
  type EditionHistoryInsert,
} from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
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
  const queryClient = useQueryClient();
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

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // 打开文件
  const handleOpen = useCallback(
    async (file: EditionFile) => {
      if (file.file_type === 'image') {
        // 图片：overlay 弹窗预览，全平台一致
        const url = await getFileUrl(file);
        setPreviewUrl(url);
        setPreviewFile(file);
        return;
      }
      // 外部链接：URL 已知，无需 async，同步打开不受 popup blocker 影响
      if (file.source_type === 'link') {
        const a = document.createElement('a');
        a.href = file.file_url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      // 上传文件：需要 async 获取签名 URL
      // 同步预开窗口保留用户手势上下文（Safari popup blocker 要求）
      const newWindow = window.open('', '_blank');
      try {
        const url = await getFileUrl(file);
        if (newWindow && !newWindow.closed) {
          newWindow.location.href = url;
        } else {
          // fallback：窗口被拦截，使用当前页面导航
          window.location.href = url;
        }
      } catch {
        newWindow?.close();
      }
    },
    [getFileUrl]
  );

  // 下载文件
  const handleDownload = useCallback(
    async (file: EditionFile) => {
      setDownloadingId(file.id);
      try {
        // fetch 文件转 blob，生成同源 blob URL
        // 跨域 URL 的 download 属性会被所有浏览器忽略，blob URL 是同源的所以生效
        const url = await getFileUrl(file);
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.file_name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch {
        // CORS 失败时 fallback：Supabase ?download 参数强制 Content-Disposition: attachment
        const url = await getFileUrl(file);
        const downloadUrl = url + (url.includes('?') ? '&' : '?')
          + 'download=' + encodeURIComponent(file.file_name || 'download');
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        setDownloadingId(null);
      }
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

        // 刷新首页最近更新
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates });

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
              downloadingId={downloadingId}
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
