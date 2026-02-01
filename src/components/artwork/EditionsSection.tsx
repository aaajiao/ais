import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import InventoryNumberInput from '@/components/editions/InventoryNumberInput';
import { useInventoryNumber } from '@/hooks/useInventoryNumber';
import type { EditionStatus } from '@/lib/database.types';
import {
  type EditionData,
  type NewEditionData,
  type EditionSlot,
  formatEditionNumber,
  getAvailableEditionSlots,
  createNewEditionFromSlot,
} from './types';

interface EditionsSectionProps {
  editions: EditionData[];
  editionTotal: number | null | undefined;
  apTotal: number | null | undefined;
  isUnique: boolean | null | undefined;
  showAddEdition: boolean;
  addingEdition: boolean;
  newEdition: NewEditionData;
  onShowAddEdition: (show: boolean) => void;
  onNewEditionChange: (data: NewEditionData) => void;
  onAddEdition: () => void;
}

export default function EditionsSection({
  editions,
  editionTotal,
  apTotal,
  isUnique,
  showAddEdition,
  addingEdition,
  newEdition,
  onShowAddEdition,
  onNewEditionChange,
  onAddEdition,
}: EditionsSectionProps) {
  const { t } = useTranslation('artworkDetail');
  const { t: tStatus } = useTranslation('status');

  const availableSlots = useMemo(
    () => getAvailableEditionSlots(editionTotal ?? null, apTotal ?? null, isUnique ?? null, editions),
    [editionTotal, apTotal, isUnique, editions]
  );

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {t('editionsList.title')} ({editions.length})
        </h2>
        <Button
          size="small"
          onClick={() => onShowAddEdition(true)}
          disabled={availableSlots.length === 0}
        >
          {t('editionsList.addEdition')}
        </Button>
      </div>

      {/* 添加版本表单 */}
      {showAddEdition && (
        <AddEditionForm
          newEdition={newEdition}
          addingEdition={addingEdition}
          availableSlots={availableSlots}
          onNewEditionChange={onNewEditionChange}
          onCancel={() => onShowAddEdition(false)}
          onAdd={onAddEdition}
        />
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
                      {formatEditionNumber(edition, editionTotal, t('info.unique'))}
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
  );
}

// 添加版本表单子组件
interface AddEditionFormProps {
  newEdition: NewEditionData;
  addingEdition: boolean;
  availableSlots: EditionSlot[];
  onNewEditionChange: (data: NewEditionData) => void;
  onCancel: () => void;
  onAdd: () => void;
}

function AddEditionForm({
  newEdition,
  addingEdition,
  availableSlots,
  onNewEditionChange,
  onCancel,
  onAdd,
}: AddEditionFormProps) {
  const { t } = useTranslation('artworkDetail');
  const { t: tStatus } = useTranslation('status');
  const { t: tCommon } = useTranslation('common');

  const { validation, isChecking, checkNumber } = useInventoryNumber();

  // 监听库存编号变化进行校验
  const inventoryNumber = newEdition.inventory_number;
  useEffect(() => {
    checkNumber(inventoryNumber);
  }, [inventoryNumber, checkNumber]);

  const isInventoryInvalid = !!newEdition.inventory_number && (!validation.isUnique || isChecking);

  // 当前选中的 slot value
  const selectedValue = `${newEdition.edition_type}:${newEdition.edition_number}`;

  const handleSlotChange = (value: string) => {
    const slot = availableSlots.find(s => s.value === value);
    if (slot) {
      onNewEditionChange({
        ...newEdition,
        ...createNewEditionFromSlot(slot),
        // 保留用户已填的 status / inventory_number / notes
        status: newEdition.status,
        inventory_number: newEdition.inventory_number,
        notes: newEdition.notes,
      });
    }
  };

  return (
    <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
      <h3 className="font-medium mb-3">{t('editionsList.addNew')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">{t('editionsList.editionNumber')}</label>
          {availableSlots.length > 0 ? (
            <select
              value={selectedValue}
              onChange={e => handleSlotChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
            >
              {availableSlots.map(slot => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {t('editionsList.allAdded')}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('editionsList.status')}</label>
          <select
            value={newEdition.status}
            onChange={e => onNewEditionChange({ ...newEdition, status: e.target.value as EditionStatus })}
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
          <InventoryNumberInput
            value={newEdition.inventory_number}
            onChange={(value) => onNewEditionChange({ ...newEdition, inventory_number: value })}
            showSuggestion={true}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">{t('editionsList.notes')}</label>
          <input
            type="text"
            value={newEdition.notes}
            onChange={e => onNewEditionChange({ ...newEdition, notes: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
          />
        </div>
      </div>
      <div className="flex gap-3 mt-4 justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={addingEdition}
        >
          {tCommon('cancel')}
        </Button>
        <Button
          onClick={onAdd}
          disabled={addingEdition || isInventoryInvalid || availableSlots.length === 0}
        >
          {addingEdition ? t('editionsList.adding') : tCommon('add')}
        </Button>
      </div>
    </div>
  );
}
