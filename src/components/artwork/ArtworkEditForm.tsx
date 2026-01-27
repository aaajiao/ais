import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ArtworkFormData } from './types';

interface ArtworkEditFormProps {
  formData: ArtworkFormData;
  saving: boolean;
  onFormChange: (data: ArtworkFormData) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function ArtworkEditForm({
  formData,
  saving,
  onFormChange,
  onSave,
  onCancel,
}: ArtworkEditFormProps) {
  const { t } = useTranslation('artworkDetail');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.titleEn')} *</label>
          <input
            type="text"
            value={formData.title_en}
            onChange={e => onFormChange({ ...formData, title_en: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.titleCn')}</label>
          <input
            type="text"
            value={formData.title_cn}
            onChange={e => onFormChange({ ...formData, title_cn: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.year')}</label>
          <input
            type="text"
            value={formData.year}
            onChange={e => onFormChange({ ...formData, year: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
            placeholder="2024"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.type')}</label>
          <input
            type="text"
            value={formData.type}
            onChange={e => onFormChange({ ...formData, type: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
            placeholder={t('form.typePlaceholder')}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">{t('form.materials')}</label>
          <input
            type="text"
            value={formData.materials}
            onChange={e => onFormChange({ ...formData, materials: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.dimensions')}</label>
          <input
            type="text"
            value={formData.dimensions}
            onChange={e => onFormChange({ ...formData, dimensions: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.duration')}</label>
          <input
            type="text"
            value={formData.duration}
            onChange={e => onFormChange({ ...formData, duration: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
            placeholder={t('form.durationPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.thumbnailUrl')}</label>
          <input
            type="text"
            value={formData.thumbnail_url}
            onChange={e => onFormChange({ ...formData, thumbnail_url: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('form.sourceUrl')}</label>
          <input
            type="text"
            value={formData.source_url}
            onChange={e => onFormChange({ ...formData, source_url: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={formData.is_unique}
            onChange={e => onFormChange({ ...formData, is_unique: e.target.checked })}
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
                onChange={e => onFormChange({ ...formData, edition_total: parseInt(e.target.value) || 0 })}
                min={0}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('form.apTotal')}</label>
              <input
                type="number"
                value={formData.ap_total}
                onChange={e => onFormChange({ ...formData, ap_total: parseInt(e.target.value) || 0 })}
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
          onChange={e => onFormChange({ ...formData, notes: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none resize-none"
        />
      </div>

      <div className="flex gap-3 pt-4 border-t border-border justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {tCommon('cancel')}
        </Button>
        <Button
          onClick={onSave}
          disabled={saving || !formData.title_en.trim()}
        >
          {saving ? t('saving') : tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
