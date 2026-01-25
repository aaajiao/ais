import { useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import {
  useEditionDetail,
  useEditionHistory,
  useEditionFiles,
} from '@/hooks/queries/useEditions';
import type { Database, EditionStatus, CurrencyType } from '@/lib/database.types';

// 新增组件导入
import FileUpload from '@/components/files/FileUpload';
import FileList, { type EditionFile as FileListEditionFile } from '@/components/files/FileList';
import ExternalLinkDialog from '@/components/files/ExternalLinkDialog';
import HistoryTimeline, { type EditionHistory as TimelineEditionHistory } from '@/components/editions/HistoryTimeline';
import InventoryNumberInput from '@/components/editions/InventoryNumberInput';
import LocationPicker from '@/components/editions/LocationPicker';
import CreateLocationDialog from '@/components/editions/CreateLocationDialog';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Image, MessageSquare, Pencil } from 'lucide-react';

// 状态选项 - 使用 EditionStatus 类型
const STATUS_OPTIONS: EditionStatus[] = [
  'in_production',
  'in_studio',
  'at_gallery',
  'at_museum',
  'in_transit',
  'sold',
  'gifted',
  'lost',
  'damaged',
];

type Location = Database['public']['Tables']['locations']['Row'];
type EditionHistory = Database['public']['Tables']['edition_history']['Row'];
type EditionFile = Database['public']['Tables']['edition_files']['Row'];

// 编辑表单类型
interface EditionFormData {
  edition_type: 'numbered' | 'ap' | 'unique';
  edition_number: number | null;
  status: EditionStatus;
  inventory_number: string;
  location_id: string | null;
  sale_price: number | null;
  sale_currency: CurrencyType;
  sale_date: string;
  buyer_name: string;
  notes: string;
}

export default function EditionDetail() {
  const { t, i18n } = useTranslation('editionDetail');
  const { t: tStatus } = useTranslation('status');
  const { t: tCommon } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query hooks - parallel queries
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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<EditionFormData | null>(null);

  // 新增状态
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [createLocationInitialName, setCreateLocationInitialName] = useState('');

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
    // Invalidate files cache
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => [file as EditionFile, ...(old || [])]
      );
    }
  }, [id, queryClient]);

  // 处理文件删除
  const handleFileDeleted = useCallback((fileId: string) => {
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => old?.filter(f => f.id !== fileId) || []
      );
    }
  }, [id, queryClient]);

  // 处理外部链接添加
  const handleLinkAdded = useCallback((file: FileListEditionFile) => {
    if (id) {
      queryClient.setQueryData<EditionFile[]>(
        queryKeys.editions.files(id),
        (old) => [file as EditionFile, ...(old || [])]
      );
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

  // 处理位置创建
  const handleLocationCreated = useCallback((location: Location) => {
    if (formData) {
      setFormData({ ...formData, location_id: location.id });
    }
    setShowCreateLocation(false);
  }, [formData]);

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

  // 开始编辑
  const startEditing = () => {
    if (!edition) return;
    setFormData({
      edition_type: edition.edition_type as 'numbered' | 'ap' | 'unique',
      edition_number: edition.edition_number,
      status: edition.status,
      inventory_number: edition.inventory_number || '',
      location_id: edition.location_id,
      sale_price: edition.sale_price,
      sale_currency: edition.sale_currency || 'USD',
      sale_date: edition.sale_date || '',
      buyer_name: edition.buyer_name || '',
      notes: edition.notes || '',
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
    if (!id || !formData || !edition) return;

    try {
      setSaving(true);
      const updateData = {
        edition_type: formData.edition_type,
        edition_number: formData.edition_type === 'unique' ? null : formData.edition_number,
        status: formData.status,
        inventory_number: formData.inventory_number || null,
        location_id: formData.location_id,
        sale_price: formData.sale_price || null,
        sale_currency: formData.sale_currency || null,
        sale_date: formData.sale_date || null,
        buyer_name: formData.buyer_name || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('editions')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;

      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.editions.detail(id) });
      setIsEditing(false);
      setFormData(null);
    } catch (err) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.editions.all });

      navigate(`/artworks/${edition.artwork_id}`, { replace: true });
    } catch (err) {
      console.error('Delete edition failed:', err);
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
    <div className="p-6 pb-24 md:pb-6">
      {/* 编辑弹窗 */}
      {isEditing && formData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">{t('editDialog.title')}</h3>

            <div className="space-y-4">
              {/* 版本类型 */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.editionType')}</label>
                <select
                  value={formData.edition_type}
                  onChange={(e) => setFormData({ ...formData, edition_type: e.target.value as 'numbered' | 'ap' | 'unique' })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="numbered">{t('editDialog.numbered')}</option>
                  <option value="ap">{t('editDialog.ap')}</option>
                  <option value="unique">{t('editDialog.unique')}</option>
                </select>
              </div>

              {/* 版本号（非独版时显示） */}
              {formData.edition_type !== 'unique' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {formData.edition_type === 'ap' ? t('editDialog.apNumber') : t('editDialog.editionNumber')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.edition_number || ''}
                    onChange={(e) => setFormData({ ...formData, edition_number: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('editDialog.numberPlaceholder')}
                  />
                </div>
              )}

              {/* 状态 */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as EditionStatus })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {tStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 位置选择 - 新增 */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.location')}</label>
                <LocationPicker
                  value={formData.location_id}
                  onChange={(locationId) => setFormData({ ...formData, location_id: locationId })}
                  onCreateNew={(initialName) => {
                    setCreateLocationInitialName(initialName);
                    setShowCreateLocation(true);
                  }}
                />
              </div>

              {/* 库存编号 - 使用智能输入组件 */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.inventoryNumber')}</label>
                <InventoryNumberInput
                  value={formData.inventory_number}
                  onChange={(value) => setFormData({ ...formData, inventory_number: value })}
                  editionId={id}
                  showSuggestion={true}
                />
              </div>

              {/* 价格信息（所有状态都可编辑） */}
              <div className="border-t border-border pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {formData.status === 'sold' ? t('editDialog.priceSection.sold') : t('editDialog.priceSection.default')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {formData.status === 'sold' ? t('editDialog.price.sold') : t('editDialog.price.default')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.sale_price || ''}
                    onChange={(e) => setFormData({ ...formData, sale_price: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('editDialog.amount')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('editDialog.currency')}</label>
                  <select
                    value={formData.sale_currency}
                    onChange={(e) => setFormData({ ...formData, sale_currency: e.target.value as CurrencyType })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CNY">CNY (¥)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="CHF">CHF (Fr)</option>
                    <option value="HKD">HKD ($)</option>
                  </select>
                </div>
              </div>

              {/* 销售详情（仅已售状态显示） */}
              {formData.status === 'sold' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.saleDate')}</label>
                    <input
                      type="date"
                      value={formData.sale_date}
                      onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.buyer')}</label>
                    <input
                      type="text"
                      value={formData.buyer_name}
                      onChange={(e) => setFormData({ ...formData, buyer_name: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder={t('editDialog.buyerPlaceholder')}
                    />
                  </div>
                </>
              )}

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder={t('editDialog.notesPlaceholder')}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={saveEditing}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? t('saving') : tCommon('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('deleteDialog.title')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('deleteDialog.message', { title: edition?.artwork?.title_en, edition: formatEditionNumber() })}
              {history.length > 0 && (
                <span className="block text-yellow-600 mt-2">
                  {t('deleteDialog.historyWarning', { count: history.length })}
                </span>
              )}
            </p>
            <p className="text-sm text-destructive mb-4">{t('deleteDialog.warning')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? t('deleteDialog.deleting') : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 外部链接对话框 */}
      <ExternalLinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        editionId={id!}
        onLinkAdded={handleLinkAdded}
      />

      {/* 创建位置对话框 */}
      <CreateLocationDialog
        isOpen={showCreateLocation}
        onClose={() => setShowCreateLocation(false)}
        onSaved={handleLocationCreated}
        initialName={createLocationInitialName}
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
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors"
        >
          {t('deleteEdition')}
        </button>
      </div>

      {/* 版本基本信息 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* 缩略图 */}
          <div className="w-full md:w-48 h-48 bg-muted rounded-lg overflow-hidden flex-shrink-0">
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
              {edition.location && (
                <p>
                  <span className="text-muted-foreground">{t('info.location')}</span>
                  {edition.location.name}
                </p>
              )}
              {/* 价格信息（所有状态都显示） */}
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

      {/* 附件列表 - 重新设计 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('attachments.title')} ({files.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLinkDialog(true)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              {t('attachments.addLink')}
            </button>
          </div>
        </div>

        {/* 文件上传组件 */}
        <FileUpload
          editionId={id!}
          onUploadComplete={handleFileUploaded}
          onError={(uploadError) => console.error('Upload failed:', uploadError)}
        />

        {/* 文件列表 */}
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

      {/* 历史记录 - 使用新组件 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <HistoryTimeline
          history={history as TimelineEditionHistory[]}
          editionId={id!}
          showAddNoteButton={true}
          onHistoryAdded={handleHistoryAdded}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 md:static md:mt-6 bg-card border-t md:border border-border p-4 md:rounded-xl flex gap-3 z-40">
        <button
          onClick={handleChatAction}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{t('actions.chat')}</span>
        </button>
        <button
          onClick={startEditing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-muted text-muted-foreground rounded-lg hover:bg-accent transition-colors"
        >
          <Pencil className="w-4 h-4" />
          <span>{t('actions.edit')}</span>
        </button>
      </div>
    </div>
  );
}
