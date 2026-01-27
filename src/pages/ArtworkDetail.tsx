import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateOnArtworkEdit, invalidateOnEditionCreate, invalidateOnArtworkDelete } from '@/lib/cacheInvalidation';
import { useArtworkDetail } from '@/hooks/queries/useArtworks';
import { useEditionsByArtwork } from '@/hooks/queries/useEditions';
import ExportDialog from '@/components/export/ExportDialog';
import { Button } from '@/components/ui/button';
import { Image, Download, Pencil } from 'lucide-react';
import {
  ArtworkEditForm,
  EditionsSection,
  DeleteConfirmDialog,
  type ArtworkFormData,
  type NewEditionData,
  initFormDataFromArtwork,
  createDefaultNewEdition,
} from '@/components/artwork';

export default function ArtworkDetail() {
  const { t } = useTranslation('artworkDetail');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query hooks - parallel queries
  const {
    data: artwork,
    isLoading: artworkLoading,
    error: artworkError,
  } = useArtworkDetail(id);

  const {
    data: editions = [],
    isLoading: editionsLoading,
  } = useEditionsByArtwork(id);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ArtworkFormData | null>(null);

  // 添加版本状态
  const [showAddEdition, setShowAddEdition] = useState(false);
  const [addingEdition, setAddingEdition] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [newEdition, setNewEdition] = useState<NewEditionData>(createDefaultNewEdition(0));

  const loading = artworkLoading || editionsLoading;

  // 开始编辑
  const startEditing = () => {
    if (!artwork) return;
    setFormData(initFormDataFromArtwork(artwork));
    setIsEditing(true);
  };

  // 取消编辑
  const cancelEditing = () => {
    setIsEditing(false);
    setFormData(null);
  };

  // 保存编辑
  const saveEditing = async () => {
    if (!id || !formData) return;

    try {
      setSaving(true);
      const updateData = {
        title_en: formData.title_en,
        title_cn: formData.title_cn || null,
        year: formData.year || null,
        type: formData.type || null,
        materials: formData.materials || null,
        dimensions: formData.dimensions || null,
        duration: formData.duration || null,
        edition_total: formData.edition_total || null,
        ap_total: formData.ap_total || null,
        is_unique: formData.is_unique,
        source_url: formData.source_url || null,
        thumbnail_url: formData.thumbnail_url || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('artworks')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;

      // Invalidate and refetch
      await invalidateOnArtworkEdit(queryClient, id);
      setIsEditing(false);
      setFormData(null);
    } catch (err) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // 添加版本
  const handleAddEdition = async () => {
    if (!id || !artwork) return;

    try {
      setAddingEdition(true);

      const insertData = {
        artwork_id: id,
        edition_type: newEdition.edition_type,
        edition_number: newEdition.edition_type === 'unique' ? null : newEdition.edition_number,
        status: newEdition.status,
        inventory_number: newEdition.inventory_number || null,
        notes: newEdition.notes || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('editions')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Invalidate and refetch editions
      await invalidateOnEditionCreate(queryClient, id);

      // 重置表单
      setNewEdition(createDefaultNewEdition(editions.length + 1));
      setShowAddEdition(false);
    } catch (err) {
      console.error('Add edition failed:', err);
      setError(err instanceof Error ? err.message : t('addFailed'));
    } finally {
      setAddingEdition(false);
    }
  };

  // 删除作品（软删除）
  const handleDelete = async () => {
    if (!id) return;

    try {
      setDeleting(true);

      // 软删除：设置 deleted_at 时间戳，保留所有数据
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from('artworks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Invalidate artworks cache
      await invalidateOnArtworkDelete(queryClient);

      // 删除成功，返回作品列表
      navigate('/artworks', { replace: true });
    } catch (err) {
      console.error('Delete artwork failed:', err);
      setError(err instanceof Error ? err.message : t('deleteFailed'));
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        {/* 骨架屏 */}
        <div className="h-8 w-24 bg-muted rounded mb-6 animate-pulse" />
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-64 h-64 bg-muted rounded-lg animate-pulse" />
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

  if (artworkError || !artwork) {
    return (
      <div className="p-6">
        <Link to="/artworks" className="text-primary hover:underline mb-6 inline-block">
          {t('backToList')}
        </Link>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {artworkError instanceof Error ? artworkError.message : t('notFound')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-[var(--spacing-page-bottom)] lg:pb-6">
      {/* 导出对话框 */}
      {id && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          artworkIds={[id]}
          artworkCount={1}
          editionTotal={artwork?.edition_total}
        />
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('close')}</button>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          artworkTitle={artwork.title_en}
          editionsCount={editions.length}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* 返回链接和删除按钮 */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/artworks" className="text-primary hover:underline">
          {t('backToList')}
        </Link>
        <Button
          variant="destructive-outline"
          size="small"
          onClick={() => setShowDeleteConfirm(true)}
        >
          {t('deleteArtwork')}
        </Button>
      </div>

      {/* 作品基本信息 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        {isEditing && formData ? (
          <ArtworkEditForm
            formData={formData}
            saving={saving}
            onFormChange={setFormData}
            onSave={saveEditing}
            onCancel={cancelEditing}
          />
        ) : (
          <ArtworkViewMode artwork={artwork} />
        )}
      </div>

      {/* 版本列表 */}
      <EditionsSection
        editions={editions}
        editionTotal={artwork.edition_total}
        showAddEdition={showAddEdition}
        addingEdition={addingEdition}
        newEdition={newEdition}
        onShowAddEdition={setShowAddEdition}
        onNewEditionChange={setNewEdition}
        onAddEdition={handleAddEdition}
      />

      {/* 底部操作栏 - 非编辑模式时显示 */}
      {!isEditing && (
        <div className="fixed bottom-[var(--spacing-nav-bottom)] left-0 right-0 lg:bottom-0 lg:static lg:mt-6 bg-card border-t lg:border border-border p-4 lg:rounded-xl flex gap-3 lg:justify-end z-40">
          <Button
            variant="secondary"
            onClick={() => setShowExportDialog(true)}
            className="flex-1 lg:flex-none"
          >
            <Download />
            <span>{t('export')}</span>
          </Button>
          <Button onClick={startEditing} className="flex-1 lg:flex-none">
            <Pencil />
            <span>{t('editArtwork')}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

// 查看模式子组件
interface ArtworkViewModeProps {
  artwork: {
    title_en: string;
    title_cn: string | null;
    year: string | null;
    type: string | null;
    materials: string | null;
    dimensions: string | null;
    duration: string | null;
    edition_total: number | null;
    ap_total: number | null;
    is_unique: boolean | null;
    source_url: string | null;
    thumbnail_url: string | null;
    notes: string | null;
  };
}

function ArtworkViewMode({ artwork }: ArtworkViewModeProps) {
  const { t } = useTranslation('artworkDetail');

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* 缩略图 */}
      <div className="w-full md:w-64 h-64 bg-muted rounded-lg overflow-hidden flex-shrink-0">
        {artwork.thumbnail_url ? (
          <img
            src={artwork.thumbnail_url}
            alt={artwork.title_en}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Image className="w-12 h-12" />
          </div>
        )}
      </div>

      {/* 作品信息 */}
      <div className="flex-1">
        <h1 className="text-page-title mb-2">
          {artwork.title_en}
          {artwork.title_cn && (
            <span className="text-muted-foreground font-normal ml-2">
              {artwork.title_cn}
            </span>
          )}
        </h1>

        <div className="space-y-2 text-sm">
          {artwork.year && (
            <p>
              <span className="text-muted-foreground">{t('info.year')}</span>
              {artwork.year}
            </p>
          )}
          {artwork.type && (
            <p>
              <span className="text-muted-foreground">{t('info.type')}</span>
              {artwork.type}
            </p>
          )}
          {artwork.materials && (
            <p>
              <span className="text-muted-foreground">{t('info.materials')}</span>
              {artwork.materials}
            </p>
          )}
          {artwork.dimensions && (
            <p>
              <span className="text-muted-foreground">{t('info.dimensions')}</span>
              {artwork.dimensions}
            </p>
          )}
          {artwork.duration && (
            <p>
              <span className="text-muted-foreground">{t('info.duration')}</span>
              {artwork.duration}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{t('info.editions')}</span>
            {artwork.is_unique
              ? t('info.unique')
              : artwork.ap_total
                ? t('info.editionsWithAp', { total: artwork.edition_total || 0, ap: artwork.ap_total })
                : t('info.editionsFormat', { total: artwork.edition_total || 0 })}
          </p>
        </div>

        {artwork.source_url && (
          <a
            href={artwork.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-primary hover:underline text-sm"
          >
            {t('info.viewSource')}
          </a>
        )}

        {artwork.notes && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
            <p className="text-muted-foreground mb-1">{t('info.notes')}</p>
            <p>{artwork.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
