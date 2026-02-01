/**
 * 位置选择器组件
 */

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocations, type Location, type LocationSearchResult } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';
import { Home, Image, Building2, MapPin, X, ChevronUp, ChevronDown, Plus, Check } from 'lucide-react';

interface LocationPickerProps {
  value: string | null;
  onChange: (locationId: string | null) => void;
  onCreateNew?: (initialName: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  refreshKey?: number;
}

// 位置类型图标
const TYPE_ICONS: Record<LocationType, ReactNode> = {
  studio: <Home className="w-4 h-4" />,
  gallery: <Image className="w-4 h-4" />,
  museum: <Building2 className="w-4 h-4" />,
  other: <MapPin className="w-4 h-4" />,
};

export default function LocationPicker({
  value,
  onChange,
  onCreateNew,
  disabled = false,
  placeholder,
  className = '',
  refreshKey,
}: LocationPickerProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const finalPlaceholder = placeholder ?? t('location.select');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    locations: _locations,
    isLoading,
    searchLocations,
    getLocationById,
    typeLabels,
    refetch,
  } = useLocations();

  // locations is used internally by searchLocations
  void _locations;

  // 当 refreshKey 变化时重新加载位置列表（新建位置后触发）
  useEffect(() => {
    if (refreshKey) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // 当前选中的位置
  const selectedLocation = value ? getLocationById(value) : null;

  // 搜索结果
  const searchResults = searchLocations(searchQuery);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlightedIndex(prev =>
          Math.min(prev + 1, searchResults.length)
        );
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (highlightedIndex < searchResults.length) {
          onChange(searchResults[highlightedIndex].id);
          setIsOpen(false);
          setSearchQuery('');
        } else if (highlightedIndex === searchResults.length && searchQuery.trim()) {
          // 创建新位置
          onCreateNew?.(searchQuery.trim());
        }
        e.preventDefault();
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        e.preventDefault();
        break;
    }
  }, [isOpen, searchResults, highlightedIndex, searchQuery, onChange, onCreateNew]);

  // 选择位置
  const handleSelect = useCallback((location: Location) => {
    onChange(location.id);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  // 清除选择
  const handleClear = useCallback(() => {
    onChange(null);
    setSearchQuery('');
    inputRef.current?.focus();
  }, [onChange]);

  // 打开下拉
  const handleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  }, [disabled]);

  return (
    <div className={`relative ${className}`}>
      {/* 输入框 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : (selectedLocation?.name || '')}
          onChange={e => {
            setSearchQuery(e.target.value);
            setHighlightedIndex(0);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={handleOpen}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder={isLoading ? t('loading') : finalPlaceholder}
          className={`
            w-full px-3 py-2 pr-16 bg-background border border-border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-primary/50
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        />

        {/* 右侧按钮 */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selectedLocation && !isOpen && (
            <button
              onClick={handleClear}
              className="p-1 text-muted-foreground hover:text-foreground"
              title={t('location.clear')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 当前选中位置的类型标签 */}
      {selectedLocation && !isOpen && (
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <span className="text-muted-foreground">{TYPE_ICONS[selectedLocation.type]}</span>
          <span>{typeLabels[selectedLocation.type]}</span>
          {selectedLocation.city && (
            <>
              <span>·</span>
              <span>{selectedLocation.city}</span>
            </>
          )}
        </div>
      )}

      {/* 下拉列表 */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          {searchResults.length === 0 && !searchQuery.trim() && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              {t('location.noLocations')}
            </div>
          )}

          {searchResults.length === 0 && searchQuery.trim() && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              {t('location.notFound')}
            </div>
          )}

          {/* 搜索结果 */}
          {searchResults.map((location, index) => (
            <button
              key={location.id}
              onClick={() => handleSelect(location)}
              className={`
                w-full text-left px-3 py-2 flex items-center gap-2
                transition-colors
                ${highlightedIndex === index
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
                }
                ${value === location.id ? 'bg-primary/5' : ''}
              `}
            >
              <span className="text-muted-foreground">{TYPE_ICONS[location.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center">
                  {location.name}
                  {value === location.id && (
                    <Check className="w-4 h-4 text-primary ml-2" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>{typeLabels[location.type]}</span>
                  {location.city && (
                    <>
                      <span>·</span>
                      <span>{location.city}</span>
                    </>
                  )}
                  {(location as LocationSearchResult).matchedAlias && (
                    <>
                      <span>·</span>
                      <span className="text-primary">
                        {t('location.alias')}: {(location as LocationSearchResult).matchedAlias}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* 创建新位置选项 */}
          {onCreateNew && (
            <button
              onClick={() => onCreateNew(searchQuery.trim())}
              className={`
                w-full text-left px-3 py-2 flex items-center gap-2
                border-t border-border
                transition-colors
                ${highlightedIndex === searchResults.length
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
                }
              `}
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {t('location.addNew')}
                  {searchQuery.trim() && (
                    <span className="text-primary ml-1">"{searchQuery.trim()}"</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('location.createNew')}
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
