/**
 * 位置对话框 - 支持创建和编辑两种模式
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useLocations, type CreateLocationData, type Location } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';
import { toast } from 'sonner';
import { Home, Image, Building2, MapPin, X, ChevronDown, ChevronRight } from 'lucide-react';

interface LocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (location: Location) => void;
  initialName?: string;
  // 编辑模式
  editingLocation?: Location | null;
  mode?: 'create' | 'edit';
}

// 位置类型图标
const LOCATION_TYPE_ICONS: Record<LocationType, ReactNode> = {
  studio: <Home className="w-4 h-4" />,
  gallery: <Image className="w-4 h-4" />,
  museum: <Building2 className="w-4 h-4" />,
  other: <MapPin className="w-4 h-4" />,
};

// 位置类型选项
const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: 'studio', label: '工作室' },
  { value: 'gallery', label: '画廊' },
  { value: 'museum', label: '美术馆' },
  { value: 'other', label: '其他' },
];

export default function LocationDialog({
  isOpen,
  onClose,
  onSaved,
  initialName = '',
  editingLocation = null,
  mode = 'create',
}: LocationDialogProps) {
  const [formData, setFormData] = useState<CreateLocationData>({
    name: initialName,
    type: 'other',
    aliases: [],
    city: '',
    country: '',
    address: '',
    contact: '',
    notes: '',
  });
  const [aliasInput, setAliasInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { createLocation, updateLocation } = useLocations();

  const isEditMode = mode === 'edit' && editingLocation;

  // 初始化表单
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && editingLocation) {
        // 编辑模式：填充现有数据
        setFormData({
          name: editingLocation.name,
          type: editingLocation.type,
          aliases: editingLocation.aliases || [],
          city: editingLocation.city || '',
          country: editingLocation.country || '',
          address: editingLocation.address || '',
          contact: editingLocation.contact || '',
          notes: editingLocation.notes || '',
        });
        // 如果有高级信息，自动展开
        if (editingLocation.city || editingLocation.country || editingLocation.address || editingLocation.contact || editingLocation.notes) {
          setShowAdvanced(true);
        }
      } else {
        // 创建模式：重置表单
        setFormData({
          name: initialName,
          type: 'other',
          aliases: [],
          city: '',
          country: '',
          address: '',
          contact: '',
          notes: '',
        });
        setShowAdvanced(false);
      }
      setAliasInput('');
      setError(null);
    }
  }, [isOpen, initialName, isEditMode, editingLocation]);

  // 添加别名
  const handleAddAlias = useCallback(() => {
    const alias = aliasInput.trim();
    if (alias && !formData.aliases?.includes(alias)) {
      setFormData(prev => ({
        ...prev,
        aliases: [...(prev.aliases || []), alias],
      }));
      setAliasInput('');
    }
  }, [aliasInput, formData.aliases]);

  // 删除别名
  const handleRemoveAlias = useCallback((alias: string) => {
    setFormData(prev => ({
      ...prev,
      aliases: (prev.aliases || []).filter(a => a !== alias),
    }));
  }, []);

  // 提交
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('请输入位置名称');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const locationData = {
        ...formData,
        name: formData.name.trim(),
        city: formData.city?.trim() || undefined,
        country: formData.country?.trim() || undefined,
        address: formData.address?.trim() || undefined,
        contact: formData.contact?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
      };

      let savedLocation: Location;

      if (isEditMode && editingLocation) {
        // 编辑模式
        savedLocation = await updateLocation(editingLocation.id, locationData);
        toast.success(`位置 "${savedLocation.name}" 已更新`);
      } else {
        // 创建模式
        savedLocation = await createLocation(locationData);
        toast.success(`位置 "${savedLocation.name}" 创建成功`);
      }

      onSaved?.(savedLocation);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作失败';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  }, [formData, isEditMode, editingLocation, createLocation, updateLocation, onSaved, onClose]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isEditMode ? '编辑位置' : '添加新位置'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              位置名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: Tabula Rasa Gallery"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>

          {/* 类型 */}
          <div>
            <label className="block text-sm font-medium mb-2">类型</label>
            <div className="grid grid-cols-2 gap-2">
              {LOCATION_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`
                    px-3 py-2 text-sm rounded-lg border flex items-center gap-2
                    transition-colors
                    ${formData.type === type.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:border-primary/50'
                    }
                  `}
                >
                  <span>{LOCATION_TYPE_ICONS[type.value]}</span>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 别名 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              别名（可选）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAlias();
                  }
                }}
                placeholder="输入别名后按回车添加"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="px-3 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80"
              >
                添加
              </button>
            </div>
            {formData.aliases && formData.aliases.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.aliases.map(alias => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-full text-sm"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(alias)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              别名用于搜索匹配，例如 "TR" 可匹配 "Tabula Rasa"
            </p>
          </div>

          {/* 高级选项折叠 */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>更多信息（可选）</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l-2 border-border">
              {/* 城市 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">城市</label>
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    placeholder="北京"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">国家</label>
                  <input
                    type="text"
                    value={formData.country || ''}
                    onChange={e => setFormData({ ...formData, country: e.target.value })}
                    placeholder="中国"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* 地址 */}
              <div>
                <label className="block text-sm font-medium mb-1">详细地址</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="街道地址..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* 联系方式 */}
              <div>
                <label className="block text-sm font-medium mb-1">联系方式</label>
                <input
                  type="text"
                  value={formData.contact || ''}
                  onChange={e => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="联系人或电话..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="其他说明..."
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-muted text-foreground rounded-lg hover:bg-muted/80"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (isEditMode ? '保存中...' : '创建中...') : (isEditMode ? '保存' : '创建位置')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 为了向后兼容，导出旧名称
export { LocationDialog as CreateLocationDialog };
