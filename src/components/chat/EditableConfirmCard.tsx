import { useState, useCallback } from 'react';
import type { EditionStatus, Currency } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/types';

// 确认卡片数据类型
export interface ConfirmCardData {
  type: 'confirmation_card';
  edition_id: string;
  current: {
    artwork_title: string;
    edition_number: number;
    edition_total: number;
    status: EditionStatus;
    location?: string;
  };
  updates: {
    status?: EditionStatus;
    location_id?: string;
    location_name?: string;
    sale_price?: number;
    sale_currency?: Currency;
    buyer_name?: string;
    sold_at?: string;
    notes?: string;
  };
  reason: string;
  requires_confirmation: boolean;
}

// 编辑模式
type EditMode = 'view' | 'inline' | 'full';

interface EditableConfirmCardProps {
  data: ConfirmCardData;
  onConfirm: (data: ConfirmCardData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

// 货币选项
const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'USD', label: 'USD $' },
  { value: 'EUR', label: 'EUR €' },
  { value: 'CNY', label: 'CNY ¥' },
  { value: 'GBP', label: 'GBP £' },
  { value: 'CHF', label: 'CHF' },
  { value: 'HKD', label: 'HKD $' },
  { value: 'JPY', label: 'JPY ¥' },
];

// 状态选项
const STATUS_OPTIONS: { value: EditionStatus; label: string }[] = [
  { value: 'in_production', label: '制作中' },
  { value: 'in_studio', label: '在库' },
  { value: 'at_gallery', label: '寄售' },
  { value: 'at_museum', label: '美术馆' },
  { value: 'in_transit', label: '运输中' },
  { value: 'sold', label: '已售' },
  { value: 'gifted', label: '赠送' },
  { value: 'lost', label: '遗失' },
  { value: 'damaged', label: '损坏' },
];

export default function EditableConfirmCard({
  data,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: EditableConfirmCardProps) {
  const [editMode, setEditMode] = useState<EditMode>('view');
  const [editedData, setEditedData] = useState<ConfirmCardData>(data);

  // 进入内联编辑模式
  const handleInlineEdit = useCallback(() => {
    setEditMode('inline');
  }, []);

  // 进入完整编辑模式
  const handleFullEdit = useCallback(() => {
    setEditMode('full');
  }, []);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditedData(data);
    setEditMode('view');
  }, [data]);

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    setEditMode('view');
  }, []);

  // 更新字段
  const updateField = useCallback((field: keyof ConfirmCardData['updates'], value: unknown) => {
    setEditedData(prev => ({
      ...prev,
      updates: {
        ...prev.updates,
        [field]: value,
      },
    }));
  }, []);

  // 确认提交
  const handleConfirm = useCallback(() => {
    onConfirm(editedData);
  }, [editedData, onConfirm]);

  const { current, updates } = editedData;
  const currentStatusConfig = STATUS_CONFIG[current.status];
  const newStatusConfig = updates.status ? STATUS_CONFIG[updates.status] : null;

  // 查看模式
  if (editMode === 'view') {
    return (
      <div className="p-4 bg-card border-2 border-primary/30 rounded-xl space-y-3">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="font-medium flex items-center gap-2">
            <span>📋</span>
            <span>确认更新</span>
          </div>
          <button
            onClick={handleInlineEdit}
            className="text-xs text-primary hover:underline"
            disabled={isSubmitting}
          >
            编辑
          </button>
        </div>

        {/* 作品信息 */}
        <div className="text-sm space-y-2">
          <p>
            <span className="text-muted-foreground">作品：</span>
            <span className="font-medium">{current.artwork_title}</span>
            <span className="text-muted-foreground ml-1">
              ({current.edition_number}/{current.edition_total})
            </span>
          </p>

          {/* 状态变更 */}
          {updates.status && (
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">状态：</span>
              <span className={currentStatusConfig?.color}>
                {currentStatusConfig?.emoji} {currentStatusConfig?.label}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={`font-medium ${newStatusConfig?.color}`}>
                {newStatusConfig?.emoji} {newStatusConfig?.label}
              </span>
            </p>
          )}

          {/* 销售价格 */}
          {updates.sale_price !== undefined && (
            <p>
              <span className="text-muted-foreground">售价：</span>
              <span className="font-medium">
                {updates.sale_currency || 'USD'} {updates.sale_price.toLocaleString()}
              </span>
            </p>
          )}

          {/* 买家 */}
          {updates.buyer_name && (
            <p>
              <span className="text-muted-foreground">买家：</span>
              <span className="font-medium">{updates.buyer_name}</span>
            </p>
          )}

          {/* 日期 */}
          {updates.sold_at && (
            <p>
              <span className="text-muted-foreground">日期：</span>
              <span>{updates.sold_at}</span>
            </p>
          )}

          {/* 位置 */}
          {updates.location_name && (
            <p>
              <span className="text-muted-foreground">位置：</span>
              <span>{updates.location_name}</span>
            </p>
          )}

          {/* 备注 */}
          {updates.notes && (
            <p>
              <span className="text-muted-foreground">备注：</span>
              <span className="text-sm">{updates.notes}</span>
            </p>
          )}
        </div>

        {/* 原因 */}
        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          {editedData.reason}
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? '处理中...' : '✓ 确认'}
          </button>
          <button
            onClick={handleFullEdit}
            disabled={isSubmitting}
            className="px-3 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-accent disabled:opacity-50"
          >
            详细编辑
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-2 text-muted-foreground rounded-lg text-sm hover:bg-muted disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  // 内联编辑模式
  if (editMode === 'inline') {
    return (
      <div className="p-4 bg-card border-2 border-yellow-500/50 rounded-xl space-y-3">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="font-medium flex items-center gap-2">
            <span>✏️</span>
            <span>编辑更新内容</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="text-xs text-primary hover:underline"
            >
              完成
            </button>
            <button
              onClick={handleCancelEdit}
              className="text-xs text-muted-foreground hover:underline"
            >
              取消
            </button>
          </div>
        </div>

        {/* 作品信息（只读） */}
        <div className="text-sm p-2 bg-muted/30 rounded">
          <span className="font-medium">{current.artwork_title}</span>
          <span className="text-muted-foreground ml-1">
            ({current.edition_number}/{current.edition_total})
          </span>
        </div>

        {/* 可编辑字段 */}
        <div className="space-y-3">
          {/* 状态 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">状态</label>
            <select
              value={updates.status || current.status}
              onChange={(e) => updateField('status', e.target.value as EditionStatus)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 销售价格（如果状态是 sold） */}
          {(updates.status === 'sold' || current.status === 'sold') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">售价</label>
                <input
                  type="number"
                  value={updates.sale_price || ''}
                  onChange={(e) => updateField('sale_price', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="输入金额"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">货币</label>
                <select
                  value={updates.sale_currency || 'USD'}
                  onChange={(e) => updateField('sale_currency', e.target.value as Currency)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  {CURRENCY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 买家 */}
          {(updates.status === 'sold' || current.status === 'sold') && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">买家</label>
              <input
                type="text"
                value={updates.buyer_name || ''}
                onChange={(e) => updateField('buyer_name', e.target.value || undefined)}
                placeholder="买家名称（可选）"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSaveEdit}
            className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
          >
            完成编辑
          </button>
        </div>
      </div>
    );
  }

  // 完整编辑模式
  return (
    <div className="p-4 bg-card border-2 border-blue-500/50 rounded-xl space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="font-medium flex items-center gap-2">
          <span>📝</span>
          <span>详细编辑</span>
        </div>
        <button
          onClick={handleCancelEdit}
          className="text-xs text-muted-foreground hover:underline"
        >
          取消
        </button>
      </div>

      {/* 作品信息（只读） */}
      <div className="text-sm p-3 bg-muted/30 rounded-lg">
        <p className="font-medium">{current.artwork_title}</p>
        <p className="text-muted-foreground">
          版本 {current.edition_number}/{current.edition_total} · 当前状态: {currentStatusConfig?.label}
        </p>
      </div>

      {/* 完整编辑表单 */}
      <div className="space-y-4">
        {/* 状态 */}
        <div>
          <label className="text-sm font-medium block mb-2">新状态</label>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map(opt => {
              const config = STATUS_CONFIG[opt.value];
              const isSelected = (updates.status || current.status) === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateField('status', opt.value)}
                  className={`p-2 rounded-lg text-sm border transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <span className="mr-1">{config?.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 销售信息 */}
        {(updates.status === 'sold' || (!updates.status && current.status === 'sold')) && (
          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <p className="text-sm font-medium">销售信息</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">售价</label>
                <input
                  type="number"
                  value={updates.sale_price || ''}
                  onChange={(e) => updateField('sale_price', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="输入金额"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">货币</label>
                <select
                  value={updates.sale_currency || 'USD'}
                  onChange={(e) => updateField('sale_currency', e.target.value as Currency)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  {CURRENCY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">买家</label>
              <input
                type="text"
                value={updates.buyer_name || ''}
                onChange={(e) => updateField('buyer_name', e.target.value || undefined)}
                placeholder="买家名称"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">销售日期</label>
              <input
                type="date"
                value={updates.sold_at || ''}
                onChange={(e) => updateField('sold_at', e.target.value || undefined)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
          </div>
        )}

        {/* 备注 */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">备注</label>
          <textarea
            value={updates.notes || ''}
            onChange={(e) => updateField('notes', e.target.value || undefined)}
            placeholder="添加备注..."
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none"
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={() => {
            setEditMode('view');
          }}
          className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
        >
          保存并返回
        </button>
        <button
          onClick={handleCancelEdit}
          className="px-3 py-2 text-muted-foreground rounded-lg text-sm hover:bg-muted"
        >
          放弃修改
        </button>
      </div>
    </div>
  );
}
