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
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Image, MessageSquare, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

type EditionHistory = Database['public']['Tables']['edition_history']['Row'];
type EditionFile = Database['public']['Tables']['edition_files']['Row'];

export default function EditionDetail() {
  const { t, i18n } = useTranslation('editionDetail');
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
  const [locationExpanded, setLocationExpanded] = useState(false);

  // 格式化版本号
  const formatEditionNumber = (): string => {
    if (!edition) return '';
    if (edition.edition_type === 'unique') return t('unique');
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${edition.artwork?.edition_total || '?'}`;
  };

  // 格式化日期
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 格式化价格
  const formatPrice = (price: number | null, currency: string | null): string => {
    if (!price) return '-';
    const currencySymbol: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      CNY: '¥',
      JPY: '¥',
    };
    const symbol = currencySymbol[currency || 'USD'] || currency || '$';
    return `${symbol}${price.toLocaleString()}`;
  };

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
          editionNumber: formatEditionNumber(),
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
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-48 h-48 bg-muted rounded-lg animate-pulse" />
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
    <div className="p-6 pb-40 md:pb-6">
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
        message={t('deleteDialog.message', { title: edition?.artwork?.title_en, edition: formatEditionNumber() })}
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
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* 缩略图 */}
          <div className="w-full md:w-64 h-64 bg-muted rounded-lg overflow-hidden flex-shrink-0">
            {edition.artwork?.thumbnail_url ? (
              <img
                src={edition.artwork.thumbnail_url}
                alt={edition.artwork.title_en}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Image className="w-12 h-12" />
              </div>
            )}
          </div>

          {/* 版本信息 */}
          <div className="flex-1">
            {/* 作品标题 */}
            <Link
              to={`/artworks/${edition.artwork_id}`}
              className="text-primary hover:underline"
            >
              <h2 className="text-lg text-muted-foreground mb-1">
                {edition.artwork?.title_en}
                {edition.artwork?.title_cn && ` · ${edition.artwork.title_cn}`}
              </h2>
            </Link>

            {/* 版本号 */}
            <h1 className="text-page-title mb-4">
              {formatEditionNumber()}
              {edition.inventory_number && (
                <span className="text-muted-foreground font-normal ml-2">
                  #{edition.inventory_number}
                </span>
              )}
            </h1>

            {/* 状态标签 */}
            <div className="inline-flex items-center gap-2 mb-4">
              <StatusIndicator status={edition.status} showLabel size="lg" />
            </div>

            {/* 详细信息 */}
            <div className="space-y-2 text-sm">
              {edition.location && (() => {
                const hasLocationDetails = Boolean(
                  edition.location.address || edition.location.contact || edition.location.notes
                );
                return (
                  <div>
                    <p
                      className={hasLocationDetails ? 'cursor-pointer inline-flex items-center gap-1' : ''}
                      onClick={() => hasLocationDetails && setLocationExpanded(!locationExpanded)}
                    >
                      <span className="text-muted-foreground">{t('info.location')}</span>
                      <span className={hasLocationDetails ? 'underline decoration-dotted underline-offset-2' : ''}>
                        {edition.location.name}
                      </span>
                      {hasLocationDetails && (
                        locationExpanded
                          ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                          : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                    </p>
                    {locationExpanded && hasLocationDetails && (
                      <div className="mt-2 ml-4 p-2 bg-muted/50 rounded text-xs space-y-1">
                        {edition.location.address && (
                          <p><span className="text-muted-foreground">{t('info.locationAddress')}</span>{edition.location.address}</p>
                        )}
                        {edition.location.contact && (
                          <p><span className="text-muted-foreground">{t('info.locationContact')}</span>{edition.location.contact}</p>
                        )}
                        {edition.location.notes && (
                          <p><span className="text-muted-foreground">{t('info.locationNotes')}</span>{edition.location.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 价格信息 */}
              {edition.sale_price && (
                <p>
                  <span className="text-muted-foreground">
                    {edition.status === 'sold' ? t('info.soldPrice') : t('info.listPrice')}
                  </span>
                  {formatPrice(edition.sale_price, edition.sale_currency)}
                </p>
              )}

              {/* 销售详情（仅已售状态显示） */}
              {edition.status === 'sold' && (
                <>
                  {edition.sale_date && (
                    <p>
                      <span className="text-muted-foreground">{t('info.saleDate')}</span>
                      {formatDate(edition.sale_date)}
                    </p>
                  )}
                  {edition.buyer_name && (
                    <p>
                      <span className="text-muted-foreground">{t('info.buyer')}</span>
                      {edition.buyer_name}
                    </p>
                  )}
                </>
              )}

              {/* 借出信息（仅 at_gallery 状态显示） */}
              {edition.status === 'at_gallery' && (
                <>
                  {edition.consignment_start && (
                    <p>
                      <span className="text-muted-foreground">{t('info.loanStart')}</span>
                      {formatDate(edition.consignment_start)}
                    </p>
                  )}
                  {edition.consignment_end && (
                    <p>
                      <span className="text-muted-foreground">{t('info.loanExpectedReturn')}</span>
                      {formatDate(edition.consignment_end)}
                    </p>
                  )}
                </>
              )}

              {/* 展览信息（仅 at_museum 状态显示） */}
              {edition.status === 'at_museum' && (
                <>
                  {edition.loan_start && (
                    <p>
                      <span className="text-muted-foreground">{t('info.exhibitionStart')}</span>
                      {formatDate(edition.loan_start)}
                    </p>
                  )}
                  {edition.loan_end && (
                    <p>
                      <span className="text-muted-foreground">{t('info.exhibitionEnd')}</span>
                      {formatDate(edition.loan_end)}
                    </p>
                  )}
                </>
              )}

              {/* 证书编号 */}
              {edition.certificate_number && (
                <p>
                  <span className="text-muted-foreground">{t('info.certificate')}</span>
                  #{edition.certificate_number}
                </p>
              )}

              {/* 存储位置 */}
              {edition.storage_detail && (
                <p>
                  <span className="text-muted-foreground">{t('info.storageDetail')}</span>
                  {edition.storage_detail}
                </p>
              )}

              {/* 作品状态（非 excellent 时显示） */}
              {edition.condition && edition.condition !== 'excellent' && (
                <p>
                  <span className="text-muted-foreground">{t('info.condition')}</span>
                  {t(`info.conditionValues.${edition.condition}`)}
                </p>
              )}
            </div>

            {edition.notes && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground mb-1">{t('info.notes')}</p>
                <p>{edition.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

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
      <div className="fixed bottom-[72px] left-0 right-0 md:bottom-0 md:static md:mt-6 bg-card border-t md:border border-border p-4 md:rounded-xl flex gap-3 md:justify-end z-40">
        <Button
          onClick={handleChatAction}
          className="flex-1 md:flex-none"
        >
          <MessageSquare />
          <span>{t('actions.chat')}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowEditDialog(true)}
          className="flex-1 md:flex-none"
        >
          <Pencil />
          <span>{t('actions.edit')}</span>
        </Button>
      </div>
    </div>
  );
}
