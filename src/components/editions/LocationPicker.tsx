/**
 * 位置选择器组件
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocations, type Location, type LocationSearchResult } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';

interface LocationPickerProps {
  value: string | null;
  onChange: (locationId: string | null) => void;
  onCreateNew?: (initialName: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

// 位置类型图标
const TYPE_ICONS: Record<LocationType, string> = {
  studio: '🏠',
  gallery: '🖼',
  museum: '🏛',
  other: '📍',
};

export default function LocationPicker({
  value,
  onChange,
  onCreateNew,
  disabled = false,
  placeholder = '选择位置...',
  className = '',
}: LocationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    locations: _locations,
    isLoading,
    searchLocations,
    getLocationById,
    typeLabels,
  } = useLocations();

  // locations is used internally by searchLocations
  void _locations;

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
          placeholder={isLoading ? '加载中...' : placeholder}
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
              title="清除"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            {isOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* 当前选中位置的类型标签 */}
      {selectedLocation && !isOpen && (
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <span>{TYPE_ICONS[selectedLocation.type]}</span>
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
              暂无位置
            </div>
          )}

          {searchResults.length === 0 && searchQuery.trim() && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              未找到匹配的位置
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
              <span className="text-lg">{TYPE_ICONS[location.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {location.name}
                  {value === location.id && (
                    <span className="text-primary ml-2">✓</span>
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
                        别名: {(location as LocationSearchResult).matchedAlias}
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
              <span className="text-lg">➕</span>
              <div>
                <div className="font-medium">
                  添加新位置
                  {searchQuery.trim() && (
                    <span className="text-primary ml-1">"{searchQuery.trim()}"</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  创建一个新的位置记录
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
