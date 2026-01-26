import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useArtworkDetail } from '@/hooks/queries/useArtworks';
import { useEditionsByArtwork } from '@/hooks/queries/useEditions';
import type { EditionStatus } from '@/lib/database.types';
import ExportDialog from '@/components/export/ExportDialog';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Button } from '@/components/ui/button';
import { Image } from 'lucide-react';

// 编辑表单数据类型
interface ArtworkFormData {
  title_en: string;
  title_cn: string;
  year: string;
  type: string;
  materials: string;
  dimensions: string;
  duration: string;
  edition_total: number;
  ap_total: number;
  is_unique: boolean;
  source_url: string;
  thumbnail_url: string;
  notes: string;
}

export default function ArtworkDetail() {
  const { t } = useTranslation('artworkDetail');
  const { t: tStatus } = useTranslation('status');
  const { t: tCommon } = useTranslation('common');
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
  const [newEdition, setNewEdition] = useState({
    edition_type: 'numbered' as 'numbered' | 'ap' | 'unique',
    edition_number: 1,
    status: 'in_studio' as EditionStatus,
    inventory_number: '',
    notes: '',
  });

  const loading = artworkLoading || editionsLoading;

  // 格式化版本号
  const formatEditionNumber = (edition: { edition_type: string; edition_number: number | null }): string => {
    if (edition.edition_type === 'unique') return t('info.unique');
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${artwork?.edition_total || '?'}`;
  };

  // 开始编辑
  const startEditing = () => {
    if (!artwork) return;
    setFormData({
      title_en: artwork.title_en || '',
      title_cn: artwork.title_cn || '',
      year: artwork.year || '',
      type: artwork.type || '',
      materials: artwork.materials || '',
      dimensions: artwork.dimensions || '',
      duration: artwork.duration || '',
      edition_total: artwork.edition_total || 0,
      ap_total: artwork.ap_total || 0,
      is_unique: artwork.is_unique || false,
      source_url: artwork.source_url || '',
      thumbnail_url: artwork.thumbnail_url || '',
      notes: artwork.notes || '',
    });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.artworks.detail(id) });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.editions.byArtwork(id) });

      // 重置表单
      setNewEdition({
        edition_type: 'numbered',
        edition_number: editions.length + 1,
        status: 'in_studio',
        inventory_number: '',
        notes: '',
      });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all });

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
    <div className="p-6">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('deleteDialog.title')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('deleteDialog.message', { title: artwork?.title_en })}
              {editions.length > 0 && (
                <span className="block text-muted-foreground mt-2">
                  {t('deleteDialog.editionsWarning', { count: editions.length })}
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground mb-4">{t('deleteDialog.trashHint')}</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1"
              >
                {deleting ? t('deleteDialog.deleting') : tCommon('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 返回链接和操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/artworks" className="text-primary hover:underline">
          {t('backToList')}
        </Link>
        <div className="flex gap-3">
          {!isEditing && (
            <>
              <Button
                variant="outline"
                size="small"
                onClick={() => setShowExportDialog(true)}
              >
                {t('export')}
              </Button>
              <Button
                variant="outline"
                size="small"
                onClick={startEditing}
              >
                {t('editArtwork')}
              </Button>
            </>
          )}
          <Button
            variant="destructive-outline"
            size="small"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t('deleteArtwork')}
          </Button>
        </div>
      </div>

      {/* 作品基本信息 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        {isEditing && formData ? (
          /* 编辑模式 */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.titleEn')} *</label>
                <input
                  type="text"
                  value={formData.title_en}
                  onChange={e => setFormData({ ...formData, title_en: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.titleCn')}</label>
                <input
                  type="text"
                  value={formData.title_cn}
                  onChange={e => setFormData({ ...formData, title_cn: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.year')}</label>
                <input
                  type="text"
                  value={formData.year}
                  onChange={e => setFormData({ ...formData, year: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.type')}</label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder={t('form.typePlaceholder')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">{t('form.materials')}</label>
                <input
                  type="text"
                  value={formData.materials}
                  onChange={e => setFormData({ ...formData, materials: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.dimensions')}</label>
                <input
                  type="text"
                  value={formData.dimensions}
                  onChange={e => setFormData({ ...formData, dimensions: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.duration')}</label>
                <input
                  type="text"
                  value={formData.duration}
                  onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder={t('form.durationPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.thumbnailUrl')}</label>
                <input
                  type="text"
                  value={formData.thumbnail_url}
                  onChange={e => setFormData({ ...formData, thumbnail_url: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('form.sourceUrl')}</label>
                <input
                  type="text"
                  value={formData.source_url}
                  onChange={e => setFormData({ ...formData, source_url: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={formData.is_unique}
                  onChange={e => setFormData({ ...formData, is_unique: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-medium">{t('form.isUnique')}</span>
              </label>

              {!formData.is_unique && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('form.editionTotal')}</label>
                    <input
                      type="number"
                      value={formData.edition_total}
                      onChange={e => setFormData({ ...formData, edition_total: parseInt(e.target.value) || 0 })}
                      min={0}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('form.apTotal')}</label>
                    <input
                      type="number"
                      value={formData.ap_total}
                      onChange={e => setFormData({ ...formData, ap_total: parseInt(e.target.value) || 0 })}
                      min={0}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('form.notes')}</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none resize-none"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-border justify-end">
              <Button
                variant="outline"
                onClick={cancelEditing}
                disabled={saving}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={saveEditing}
                disabled={saving || !formData.title_en.trim()}
              >
                {saving ? t('saving') : tCommon('save')}
              </Button>
            </div>
          </div>
        ) : (
          /* 查看模式 */
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
        )}
      </div>

      {/* 版本列表 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('editionsList.title')} ({editions.length})
          </h2>
          <Button
            size="small"
            onClick={() => setShowAddEdition(true)}
          >
            {t('editionsList.addEdition')}
          </Button>
        </div>

        {/* 添加版本表单 */}
        {showAddEdition && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
            <h3 className="font-medium mb-3">{t('editionsList.addNew')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('editionsList.editionType')}</label>
                <select
                  value={newEdition.edition_type}
                  onChange={e => setNewEdition({ ...newEdition, edition_type: e.target.value as 'numbered' | 'ap' | 'unique' })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="numbered">{t('editionsList.numbered')}</option>
                  <option value="ap">{t('editionsList.ap')}</option>
                  <option value="unique">{t('editionsList.unique')}</option>
                </select>
              </div>
              {newEdition.edition_type !== 'unique' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('editionsList.editionNumber')}</label>
                  <input
                    type="number"
                    value={newEdition.edition_number}
                    onChange={e => setNewEdition({ ...newEdition, edition_number: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editionsList.status')}</label>
                <select
                  value={newEdition.status}
                  onChange={e => setNewEdition({ ...newEdition, status: e.target.value as EditionStatus })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="in_production">{tStatus('in_production')}</option>
                  <option value="in_studio">{tStatus('in_studio')}</option>
                  <option value="at_gallery">{tStatus('at_gallery')}</option>
                  <option value="at_museum">{tStatus('at_museum')}</option>
                  <option value="in_transit">{tStatus('in_transit')}</option>
                  <option value="sold">{tStatus('sold')}</option>
                  <option value="gifted">{tStatus('gifted')}</option>
                  <option value="lost">{tStatus('lost')}</option>
                  <option value="damaged">{tStatus('damaged')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('editionsList.inventoryNumber')}</label>
                <input
                  type="text"
                  value={newEdition.inventory_number}
                  onChange={e => setNewEdition({ ...newEdition, inventory_number: e.target.value })}
                  placeholder={t('editionsList.inventoryPlaceholder')}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">{t('editionsList.notes')}</label>
                <input
                  type="text"
                  value={newEdition.notes}
                  onChange={e => setNewEdition({ ...newEdition, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddEdition(false)}
                disabled={addingEdition}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleAddEdition}
                disabled={addingEdition}
              >
                {addingEdition ? t('editionsList.adding') : tCommon('add')}
              </Button>
            </div>
          </div>
        )}

        {editions.length === 0 && !showAddEdition ? (
          <div className="text-center text-muted-foreground py-8">
            {t('editionsList.noEditions')}
          </div>
        ) : editions.length === 0 ? null : (
          <div className="space-y-3">
            {editions.map(edition => (
              <Link
                key={edition.id}
                to={`/editions/${edition.id}`}
                className="block p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIndicator status={edition.status} size="lg" />
                    <div>
                      <p className="font-medium">
                        {formatEditionNumber(edition)}
                        {edition.inventory_number && (
                          <span className="text-muted-foreground ml-2 text-sm">
                            #{edition.inventory_number}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {tStatus(edition.status)}
                        {edition.location && (
                          <span> · {edition.location.name}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
