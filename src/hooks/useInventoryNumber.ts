/**
 * 库存编号管理 Hook
 * 提供编号建议和唯一性校验
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  suggestNextNumber,
  isNumberUnique,
  validateNumberFormat,
  analyzeNumberPattern,
  type NumberSuggestion,
  type NumberPattern,
} from '@/lib/inventoryNumber';

interface UseInventoryNumberOptions {
  excludeEditionId?: string;  // 排除当前版本（编辑时）
  debounceMs?: number;        // 防抖时间
}

interface ValidationResult {
  isUnique: boolean;
  isValidFormat: boolean;
  message?: string;
}

export function useInventoryNumber(options: UseInventoryNumberOptions = {}) {
  // excludeEditionId 目前未实现，保留接口以备将来使用
  const { debounceMs = 300 } = options;

  const [existingNumbers, setExistingNumbers] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<NumberSuggestion | null>(null);
  const [pattern, setPattern] = useState<NumberPattern | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({
    isUnique: true,
    isValidFormat: true,
  });

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载所有现有编号
  const fetchExistingNumbers = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('editions')
        .select('inventory_number')
        .not('inventory_number', 'is', null);

      if (error) throw error;

      const numbers = (data as { inventory_number: string | null }[])
        .map(d => d.inventory_number)
        .filter((n): n is string => n !== null);

      setExistingNumbers(numbers);

      // 分析模式并生成建议
      const analyzedPattern = analyzeNumberPattern(numbers);
      setPattern(analyzedPattern);

      const nextSuggestion = suggestNextNumber(numbers);
      setSuggestion(nextSuggestion);
    } catch (err) {
      console.error('加载编号失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchExistingNumbers();
  }, [fetchExistingNumbers]);

  // 校验编号（带防抖）
  const checkNumber = useCallback((number: string) => {
    // 清除之前的定时器
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // 空编号不需要校验
    if (!number || !number.trim()) {
      setValidation({ isUnique: true, isValidFormat: true });
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    // 防抖处理
    debounceTimer.current = setTimeout(() => {
      // 找到要排除的编号（当前版本的编号）
      // 注意：由于我们只有编号列表，无法通过 editionId 排除
      // 在编辑模式下，应该由调用方传入当前编号进行排除
      const excludeNumber: string | undefined = undefined;

      // 检查唯一性
      const isUnique = isNumberUnique(number, existingNumbers, excludeNumber);

      // 检查格式
      const formatResult = validateNumberFormat(number, pattern || undefined);

      setValidation({
        isUnique,
        isValidFormat: formatResult.valid,
        message: !isUnique
          ? '此编号已存在'
          : formatResult.message,
      });

      setIsChecking(false);
    }, debounceMs);
  }, [debounceMs, existingNumbers, pattern]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // 直接检查（不防抖）
  const checkNumberSync = useCallback((number: string): ValidationResult => {
    if (!number || !number.trim()) {
      return { isUnique: true, isValidFormat: true };
    }

    const isUnique = isNumberUnique(number, existingNumbers);
    const formatResult = validateNumberFormat(number, pattern || undefined);

    return {
      isUnique,
      isValidFormat: formatResult.valid,
      message: !isUnique ? '此编号已存在' : formatResult.message,
    };
  }, [existingNumbers, pattern]);

  // 应用建议的编号
  const applySuggestion = useCallback((): string | null => {
    return suggestion?.nextNumber || null;
  }, [suggestion]);

  // 刷新数据
  const refresh = useCallback(() => {
    fetchExistingNumbers();
  }, [fetchExistingNumbers]);

  return {
    // 状态
    existingNumbers,
    suggestion,
    pattern,
    isLoading,
    isChecking,
    validation,

    // 方法
    checkNumber,
    checkNumberSync,
    applySuggestion,
    refresh,
  };
}
