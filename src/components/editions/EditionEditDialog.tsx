/**
 * 版本编辑对话框组件
 * 完全独立的组件，内部管理表单状态和保存逻辑
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateOnEditionEdit } from '@/lib/cacheInvalidation';
import { useEditionsByArtwork } from '@/hooks/queries/useEditions';
import { getAvailableEditionSlots } from '@/components/artwork/types';
import type { EditionStatus, CurrencyType, ConditionType, Database } from '@/lib/database.types';

import { Button } from '@/components/ui/button';
import InventoryNumberInput from './InventoryNumberInput';
import LocationPicker from './LocationPicker';
import CreateLocationDialog from './CreateLocationDialog';

// 状态选项
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

// 编辑表单数据类型
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
  consignment_start: string;
  consignment_end: string;
  loan_start: string;
  loan_end: string;
  certificate_number: string;
  condition: ConditionType;
  condition_notes: string;
  storage_detail: string;
}

// 版本数据类型（包含关联数据）
type Edition = Database['public']['Tables']['editions']['Row'] & {
  artwork?: { title_en: string; edition_total: number | null; ap_total: number | null; is_unique: boolean | null } | null;
  location?: { name: string } | null;
};

type Location = Database['public']['Tables']['locations']['Row'];

interface EditionEditDialogProps {
  isOpen: boolean;
  edition: Edition | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditionEditDialog({
  isOpen,
  edition,
  onClose,
  onSaved,
}: EditionEditDialogProps) {
  const { t } = useTranslation('editionDetail');
  const { t: tStatus } = useTranslation('status');
  const { t: tCommon } = useTranslation('common');
  const queryClient = useQueryClient();

  // 表单状态
  const [formData, setFormData] = useState<EditionFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 创建位置对话框状态
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [createLocationInitialName, setCreateLocationInitialName] = useState('');

  // 获取同作品的兄弟版本，用于 slot 约束
  const { data: siblingEditions = [] } = useEditionsByArtwork(edition?.artwork_id);

  // 计算可选的版本槽位（排除当前版本自身，因为它正在被编辑）
  const availableSlots = useMemo(() => {
    if (!edition?.artwork) return [];
    const otherEditions = siblingEditions
      .filter(e => e.id !== edition.id)
      .map(e => ({ id: e.id, edition_type: e.edition_type, edition_number: e.edition_number, status: e.status, inventory_number: e.inventory_number }));
    return getAvailableEditionSlots(
      edition.artwork.edition_total,
      edition.artwork.ap_total,
      edition.artwork.is_unique,
      otherEditions
    );
  }, [edition, siblingEditions]);

  // slot 模式：有配额信息时用下拉
  const hasSlots = availableSlots.length > 0;

  // 初始化表单数据
  useEffect(() => {
    if (isOpen && edition) {
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
        consignment_start: edition.consignment_start || '',
        consignment_end: edition.consignment_end || '',
        loan_start: edition.loan_start || '',
        loan_end: edition.loan_end || '',
        certificate_number: edition.certificate_number || '',
        condition: edition.condition || 'excellent',
        condition_notes: edition.condition_notes || '',
        storage_detail: edition.storage_detail || '',
      });
      setError(null);
    }
  }, [isOpen, edition]);

  // 保存编辑
  const handleSave = useCallback(async () => {
    if (!edition || !formData) return;

    try {
      setSaving(true);
      setError(null);

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
        consignment_start: formData.consignment_start || null,
        consignment_end: formData.consignment_end || null,
        loan_start: formData.loan_start || null,
        loan_end: formData.loan_end || null,
        certificate_number: formData.certificate_number || null,
        condition: formData.condition,
        condition_notes: formData.condition_notes || null,
        storage_detail: formData.storage_detail || null,
        updated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('editions')
        .update(updateData)
        .eq('id', edition.id);

      if (updateError) throw updateError;

      // Invalidate and refetch
      await invalidateOnEditionEdit(queryClient, edition.id, edition.artwork_id);
      onSaved();
    } catch (err) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [edition, formData, queryClient, onSaved, t]);

  // 处理位置创建
  const handleLocationCreated = useCallback((location: Location) => {
    if (formData) {
      setFormData({ ...formData, location_id: location.id });
    }
    setShowCreateLocation(false);
  }, [formData]);

  // 不渲染条件
  if (!isOpen || !formData) return null;

  return (
    <>
      <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[--spacing-modal-bottom]">
        <div className="modal-content bg-card border border-border rounded-xl p-6 max-w-lg w-full max-h-[85dvh] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">{t('editDialog.title')}</h3>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* 版本号（slot 下拉或自由输入 fallback） */}
            {hasSlots ? (
              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.editionNumber')}</label>
                <select
                  value={`${formData.edition_type}:${formData.edition_number ?? 0}`}
                  onChange={(e) => {
                    const slot = availableSlots.find(s => s.value === e.target.value);
                    if (slot) {
                      setFormData({ ...formData, edition_type: slot.edition_type, edition_number: slot.edition_number });
                    }
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {availableSlots.map(slot => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
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
              </>
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

            {/* 位置选择 */}
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

            {/* 库存编号 */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('editDialog.inventoryNumber')}</label>
              <InventoryNumberInput
                value={formData.inventory_number}
                onChange={(value) => setFormData({ ...formData, inventory_number: value })}
                editionId={edition?.id}
                showSuggestion={true}
              />
            </div>

            {/* 价格信息 */}
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

            {/* 借出信息 - 仅当状态为 at_gallery 时显示 */}
            {formData.status === 'at_gallery' && (
              <div className="border-t border-border pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {t('editDialog.loanSection')}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.loanStart')}</label>
                    <input
                      type="date"
                      value={formData.consignment_start}
                      onChange={(e) => setFormData({ ...formData, consignment_start: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.loanExpectedReturn')}</label>
                    <input
                      type="date"
                      value={formData.consignment_end}
                      onChange={(e) => setFormData({ ...formData, consignment_end: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 展览信息 - 仅当状态为 at_museum 时显示 */}
            {formData.status === 'at_museum' && (
              <div className="border-t border-border pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {t('editDialog.exhibitionSection')}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.exhibitionStart')}</label>
                    <input
                      type="date"
                      value={formData.loan_start}
                      onChange={(e) => setFormData({ ...formData, loan_start: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('editDialog.exhibitionEnd')}</label>
                    <input
                      type="date"
                      value={formData.loan_end}
                      onChange={(e) => setFormData({ ...formData, loan_end: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 文档信息 */}
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                {t('editDialog.documentationSection')}
              </p>

              <div>
                <label className="block text-sm font-medium mb-1">{t('editDialog.certificateNumber')}</label>
                <input
                  type="text"
                  value={formData.certificate_number}
                  onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('editDialog.certificatePlaceholder')}
                />
              </div>
            </div>

            {/* 状态与存储 - 可折叠 */}
            <details className="border-t border-border pt-4 mt-4">
              <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                {t('editDialog.conditionSection')}
              </summary>
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('editDialog.condition')}</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as ConditionType })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="excellent">{t('editDialog.conditionOptions.excellent')}</option>
                    <option value="good">{t('editDialog.conditionOptions.good')}</option>
                    <option value="fair">{t('editDialog.conditionOptions.fair')}</option>
                    <option value="poor">{t('editDialog.conditionOptions.poor')}</option>
                    <option value="damaged">{t('editDialog.conditionOptions.damaged')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('editDialog.conditionNotes')}</label>
                  <textarea
                    value={formData.condition_notes}
                    onChange={(e) => setFormData({ ...formData, condition_notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder={t('editDialog.conditionNotesPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('editDialog.storageDetail')}</label>
                  <input
                    type="text"
                    value={formData.storage_detail}
                    onChange={(e) => setFormData({ ...formData, storage_detail: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('editDialog.storagePlaceholder')}
                  />
                </div>
              </div>
            </details>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 mt-6 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t('saving') : tCommon('save')}
            </Button>
          </div>
        </div>
      </div>

      {/* 创建位置对话框 */}
      <CreateLocationDialog
        isOpen={showCreateLocation}
        onClose={() => setShowCreateLocation(false)}
        onSaved={handleLocationCreated}
        initialName={createLocationInitialName}
      />
    </>
  );
}
