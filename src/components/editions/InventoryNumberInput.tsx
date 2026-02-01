/**
 * 智能库存编号输入组件
 * 提供编号建议和唯一性校验
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventoryNumber } from '@/hooks/useInventoryNumber';
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react';

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
  const { t } = useTranslation('common');
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionPopup, setShowSuggestionPopup] = useState(false);

  const {
    suggestion,
    prefixSuggestion,
    isLoading,
    isChecking,
    validation,
    checkNumber,
    applySuggestion,
    applyPrefixSuggestion,
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

  // 应用前缀建议
  const handleApplyPrefixSuggestion = useCallback(() => {
    const suggested = applyPrefixSuggestion();
    if (suggested) {
      onChange(suggested);
    }
  }, [applyPrefixSuggestion, onChange]);

  // Ghost text: 前缀建议中超出当前输入的部分
  const ghostSuffix = prefixSuggestion && value && prefixSuggestion.startsWith(value)
    ? prefixSuggestion.slice(value.length)
    : null;

  // 获取状态图标类型
  type StatusIconType = 'loading' | 'error' | 'warning' | 'success' | null;

  const getStatusIconType = (): StatusIconType => {
    if (isChecking) return 'loading';
    if (!value) return null;
    if (!validation.isUnique) return 'error';
    if (validation.message) return 'warning';
    return 'success';
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
        {/* Ghost text overlay */}
        {ghostSuffix && isFocused && (
          <div
            className="absolute inset-0 px-3 py-2 pointer-events-none flex items-center"
            aria-hidden="true"
          >
            <span className="invisible font-mono">{value}</span>
            <span className="text-muted-foreground/40 font-mono">{ghostSuffix}</span>
          </div>
        )}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Tab' && ghostSuffix) {
              e.preventDefault();
              handleApplyPrefixSuggestion();
            }
          }}
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
          placeholder={isLoading ? t('inventoryNumber.loading') : t('inventoryNumber.placeholder')}
          className={`
            w-full px-3 py-2 pr-10 bg-background border rounded-lg
            focus:outline-none focus:ring-2
            disabled:opacity-50 disabled:cursor-not-allowed
            font-mono
            ${getStatusColor() || 'border-border focus:ring-primary/50'}
          `}
          style={{ background: 'transparent', position: 'relative' }}
        />

        {/* 状态图标 */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getStatusIconType() === 'loading' && (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          )}
          {getStatusIconType() === 'success' && (
            <Check className="w-4 h-4 text-green-500" />
          )}
          {getStatusIconType() === 'error' && (
            <X className="w-4 h-4 text-red-500" />
          )}
          {getStatusIconType() === 'warning' && (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          )}
        </div>
      </div>

      {/* 状态信息 */}
      {value && !validation.isUnique && (
        <div className="text-xs mt-1 text-red-500">
          {prefixSuggestion ? (
            <>
              {t('inventoryNumber.duplicateWithSuggestion')}{' '}
              <button
                type="button"
                onClick={handleApplyPrefixSuggestion}
                className="font-mono font-medium text-primary hover:underline"
              >
                {prefixSuggestion}
              </button>
            </>
          ) : (
            t('inventoryNumber.duplicate')
          )}
        </div>
      )}
      {value && validation.isUnique && validation.message && (
        <div className="text-xs mt-1 text-yellow-500">
          {validation.message}
        </div>
      )}

      {/* 建议弹出框 */}
      {showSuggestion && showSuggestionPopup && suggestion?.nextNumber && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10">
          <div className="bg-card border border-border rounded-lg shadow-lg p-3">
            <div className="text-xs text-muted-foreground mb-2">
              {t('inventoryNumber.suggestion')}
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
                  {t('inventoryNumber.pattern', { pattern: suggestion.pattern.pattern })}
                  {suggestion.existingCount > 0 && ` ${t('inventoryNumber.existingCount', { count: suggestion.existingCount })}`}
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 前缀建议链接（输入框下方，按 Tab 接受） */}
      {prefixSuggestion && isFocused && (
        <div className="text-xs text-muted-foreground mt-1">
          <button
            onClick={handleApplyPrefixSuggestion}
            className="text-primary hover:underline"
            type="button"
          >
            {prefixSuggestion}
          </button>
          <span className="ml-1 opacity-60">← Tab</span>
        </div>
      )}

      {/* 全局建议链接（输入框下方） */}
      {showSuggestion && suggestion?.nextNumber && value && isFocused && !prefixSuggestion && (
        <div className="text-xs text-muted-foreground mt-1">
          <button
            onClick={handleApplySuggestion}
            className="text-primary hover:underline"
            type="button"
          >
            {t('inventoryNumber.useSuggestion', { number: suggestion.nextNumber })}
          </button>
        </div>
      )}
    </div>
  );
}
