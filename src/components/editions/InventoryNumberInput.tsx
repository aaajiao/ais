/**
 * 智能库存编号输入组件
 * 提供编号建议和唯一性校验
 */

import { useState, useEffect, useCallback } from 'react';
import { useInventoryNumber } from '@/hooks/useInventoryNumber';

interface InventoryNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  editionId?: string;
  showSuggestion?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function InventoryNumberInput({
  value,
  onChange,
  editionId,
  showSuggestion = true,
  disabled = false,
  className = '',
}: InventoryNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionPopup, setShowSuggestionPopup] = useState(false);

  const {
    suggestion,
    isLoading,
    isChecking,
    validation,
    checkNumber,
    applySuggestion,
  } = useInventoryNumber({
    excludeEditionId: editionId,
  });

  // 监听值变化进行校验
  useEffect(() => {
    if (value) {
      checkNumber(value);
    }
  }, [value, checkNumber]);

  // 应用建议的编号
  const handleApplySuggestion = useCallback(() => {
    const suggested = applySuggestion();
    if (suggested) {
      onChange(suggested);
      setShowSuggestionPopup(false);
    }
  }, [applySuggestion, onChange]);

  // 获取状态图标
  const getStatusIcon = (): string | null => {
    if (isChecking) return '⏳';
    if (!value) return null;
    if (!validation.isUnique) return '❌';
    if (validation.message) return '⚠️';
    return '✓';
  };

  // 获取状态颜色
  const getStatusColor = (): string => {
    if (!value) return '';
    if (!validation.isUnique) return 'border-red-500 focus:ring-red-500/50';
    if (validation.message) return 'border-yellow-500 focus:ring-yellow-500/50';
    return 'border-green-500 focus:ring-green-500/50';
  };

  return (
    <div className={`relative ${className}`}>
      {/* 输入框 */}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            if (showSuggestion && !value && suggestion?.nextNumber) {
              setShowSuggestionPopup(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            // 延迟关闭以便可以点击建议
            setTimeout(() => setShowSuggestionPopup(false), 200);
          }}
          disabled={disabled || isLoading}
          placeholder={isLoading ? '加载中...' : '输入库存编号...'}
          className={`
            w-full px-3 py-2 pr-10 bg-background border rounded-lg
            focus:outline-none focus:ring-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${getStatusColor() || 'border-border focus:ring-primary/50'}
          `}
        />

        {/* 状态图标 */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getStatusIcon() && (
            <span
              className={`text-sm ${
                getStatusIcon() === '✓' ? 'text-green-500' :
                getStatusIcon() === '❌' ? 'text-red-500' :
                getStatusIcon() === '⚠️' ? 'text-yellow-500' :
                'text-muted-foreground'
              }`}
            >
              {getStatusIcon()}
            </span>
          )}
        </div>
      </div>

      {/* 状态信息 */}
      {value && (validation.message || !validation.isUnique) && (
        <div
          className={`text-xs mt-1 ${
            !validation.isUnique ? 'text-red-500' : 'text-yellow-500'
          }`}
        >
          {validation.message || (!validation.isUnique ? '此编号已存在' : '')}
        </div>
      )}

      {/* 建议弹出框 */}
      {showSuggestion && showSuggestionPopup && suggestion?.nextNumber && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10">
          <div className="bg-card border border-border rounded-lg shadow-lg p-3">
            <div className="text-xs text-muted-foreground mb-2">
              建议的下一个编号:
            </div>
            <button
              onClick={handleApplySuggestion}
              className="w-full text-left px-3 py-2 bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
            >
              <div className="font-mono font-medium text-primary">
                {suggestion.nextNumber}
              </div>
              {suggestion.pattern && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  格式: {suggestion.pattern.pattern}
                  {suggestion.existingCount > 0 && ` (已有 ${suggestion.existingCount} 个)`}
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 建议链接（输入框下方） */}
      {showSuggestion && suggestion?.nextNumber && value && isFocused && (
        <div className="text-xs text-muted-foreground mt-1">
          <button
            onClick={handleApplySuggestion}
            className="text-primary hover:underline"
            type="button"
          >
            使用建议编号: {suggestion.nextNumber}
          </button>
        </div>
      )}
    </div>
  );
}
