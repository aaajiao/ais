import { useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateOnEditionDelete } from '@/lib/cacheInvalidation';
import {
  useEditionDetail,
  useEditionHistory,
  useEditionFiles,
} from '@/hooks/queries/useEditions';
import type { Database } from '@/lib/database.types';

// 组件导入
import FileUpload from '@/components/files/FileUpload';
import FileList, { type EditionFile as FileListEditionFile } from '@/components/files/FileList';
import ExternalLinkDialog from '@/components/files/ExternalLinkDialog';
import HistoryTimeline, { type EditionHistory as TimelineEditionHistory } from '@/components/editions/HistoryTimeline';
import EditionEditDialog from '@/components/editions/EditionEditDialog';
import { EditionInfoCard } from '@/components/editions/EditionInfoCard';
import {
  formatEditionNumber as formatEditionNumberUtil,
  type EditionWithDetails,
} from '@/components/editions/editionDetailUtils';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Pencil } from 'lucide-react';

type EditionHistory = Database['public']['Tables']['edition_history']['Row'];
type EditionFile = Database['public']['Tables']['edition_files']['Row'];

export default function EditionDetail() {
  const { t } = useTranslation('editionDetail');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query hooks
  const {
    data: edition,
    isLoading: editionLoading,
    error: editionError,
  } = useEditionDetail(id);

  const {
    data: history = [],
    isLoading: historyLoading,
  } = useEditionHistory(id);

  const {
    data: files = [],
    isLoading: filesLoading,
  } = useEditionFiles(id);

  const loading = editionLoading || historyLoading || filesLoading;

  // 对话框状态
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 格式化版本号（用于删除确认对话框等）
  const editionNumber = formatEditionNumberUtil(edition as EditionWithDetails, t);

  // 处理文件上传完成
  const handleFileUploaded = useCallback((file: FileListEditionFile) => {
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => [file as EditionFile, ...(old || [])]
      );
      // 失效历史记录缓存（文件上传会创建历史记录）
      queryClient.invalidateQueries({ queryKey: queryKeys.editions.history(id) });
    }
  }, [id, queryClient]);

  // 处理文件删除
  const handleFileDeleted = useCallback((fileId: string) => {
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => old?.filter(f => f.id !== fileId) || []
      );
      // 失效历史记录缓存（文件删除会创建历史记录）
      queryClient.invalidateQueries({ queryKey: queryKeys.editions.history(id) });
    }
  }, [id, queryClient]);

  // 处理外部链接添加
  const handleLinkAdded = useCallback((file: FileListEditionFile) => {
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => [file as EditionFile, ...(old || [])]
      );
      // 失效历史记录缓存（添加链接会创建历史记录）
      queryClient.invalidateQueries({ queryKey: queryKeys.editions.history(id) });
    }
    setShowLinkDialog(false);
  }, [id, queryClient]);

  // 处理历史记录添加
  const handleHistoryAdded = useCallback((newHistory: TimelineEditionHistory) => {
    if (id) {
      queryClient.setQueryData<EditionHistory[]>(
        queryKeys.editions.history(id),
        (old) => [newHistory as EditionHistory, ...(old || [])]
      );
    }
  }, [id, queryClient]);

  // 处理对话操作
  const handleChatAction = () => {
    navigate('/chat', {
      state: {
        context: {
          editionId: edition?.id,
          artworkTitle: edition?.artwork?.title_en,
          editionNumber,
        }
      }
    });
  };

  // 删除版本
  const handleDelete = async () => {
    if (!id || !edition) return;

    try {
      setDeleting(true);

      // 先删除历史记录
      await supabase
        .from('edition_history')
        .delete()
        .eq('edition_id', id);

      // 删除附件记录
      await supabase
        .from('edition_files')
        .delete()
        .eq('edition_id', id);

      // 删除版本
      const { error: deleteError } = await supabase
        .from('editions')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Invalidate editions cache
      await invalidateOnEditionDelete(queryClient, edition.artwork_id);

      navigate(`/artworks/${edition.artwork_id}`, { replace: true });
    } catch (err) {
      console.error('Delete edition failed:', err);
      setError(err instanceof Error ? err.message : t('deleteFailed'));
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-24 bg-muted rounded mb-6 animate-pulse" />
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex flex-col min-[720px]:flex-row gap-6">
            <div className="w-full min-[720px]:w-48 h-48 bg-muted rounded-lg animate-pulse" />
            <div className="flex-1 space-y-4">
              <div className="h-8 bg-muted rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (editionError || !edition) {
    return (
      <div className="p-6">
        <Link to="/editions" className="text-primary hover:underline mb-6 inline-block">
          {t('backToList')}
        </Link>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {editionError instanceof Error ? editionError.message : t('notFound')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-[var(--spacing-page-bottom)] lg:pb-6">
      {/* 编辑对话框 */}
      <EditionEditDialog
        isOpen={showEditDialog}
        edition={edition}
        onClose={() => setShowEditDialog(false)}
        onSaved={() => setShowEditDialog(false)}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { title: edition?.artwork?.title_en, edition: editionNumber })}
        warning={t('deleteDialog.warning')}
        warningItems={history.length > 0 ? [t('deleteDialog.historyWarning', { count: history.length })] : undefined}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isDeleting={deleting}
      />

      {/* 外部链接对话框 */}
      <ExternalLinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        editionId={id!}
        onLinkAdded={handleLinkAdded}
      />

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('close')}</button>
        </div>
      )}

      {/* 返回链接 */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/editions" className="text-primary hover:underline">
          {t('backToList')}
        </Link>
        <Button
          variant="destructive-outline"
          size="small"
          onClick={() => setShowDeleteConfirm(true)}
        >
          {t('deleteEdition')}
        </Button>
      </div>

      {/* 版本基本信息 */}
      <EditionInfoCard edition={edition as EditionWithDetails} />

      {/* 附件列表 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('attachments.title')} ({files.length})
          </h2>
          <Button
            variant="outline"
            size="small"
            onClick={() => setShowLinkDialog(true)}
          >
            {t('attachments.addLink')}
          </Button>
        </div>

        <FileUpload
          editionId={id!}
          onUploadComplete={handleFileUploaded}
          onError={(uploadError) => console.error('Upload failed:', uploadError)}
        />

        {files.length > 0 && (
          <div className="mt-4">
            <FileList
              files={files as FileListEditionFile[]}
              editionId={id!}
              onDelete={handleFileDeleted}
              isEditing={true}
              viewMode="list"
            />
          </div>
        )}
      </div>

      {/* 历史记录 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <HistoryTimeline
          history={history as TimelineEditionHistory[]}
          editionId={id!}
          showAddNoteButton={true}
          onHistoryAdded={handleHistoryAdded}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-[var(--spacing-nav-bottom)] left-0 right-0 lg:bottom-0 lg:static lg:mt-6 bg-card border-t lg:border border-border p-4 lg:rounded-xl flex gap-3 lg:justify-end z-40">
        <Button
          onClick={handleChatAction}
          className="flex-1 lg:flex-none"
        >
          <MessageSquare />
          <span>{t('actions.chat')}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowEditDialog(true)}
          className="flex-1 lg:flex-none"
        >
          <Pencil />
          <span>{t('actions.edit')}</span>
        </Button>
      </div>
    </div>
  );
}
