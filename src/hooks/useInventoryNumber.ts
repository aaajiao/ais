/**
 * 库存编号管理 Hook
 * 提供编号建议和唯一性校验
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  suggestNextNumber,
  suggestNextNumberForPrefix,
  suggestNextAvailable,
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
  const { excludeEditionId, debounceMs = 300 } = options;

  const [existingNumbers, setExistingNumbers] = useState<string[]>([]);
  // 存储 edition ID 到编号的映射，用于编辑时排除当前版本
  const [editionNumberMap, setEditionNumberMap] = useState<Map<string, string>>(new Map());
  const [suggestion, setSuggestion] = useState<NumberSuggestion | null>(null);
  const [prefixSuggestion, setPrefixSuggestion] = useState<string | null>(null);
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
      // 同时获取 id 和 inventory_number，用于排除当前编辑的版本
      const { data, error } = await supabase
        .from('editions')
        .select('id, inventory_number')
        .not('inventory_number', 'is', null);

      if (error) throw error;

      const typedData = data as { id: string; inventory_number: string | null }[];

      const numbers = typedData
        .map(d => d.inventory_number)
        .filter((n): n is string => n !== null);

      // 构建 edition ID 到编号的映射
      const numberMap = new Map<string, string>();
      for (const d of typedData) {
        if (d.inventory_number) {
          numberMap.set(d.id, d.inventory_number);
        }
      }
      setEditionNumberMap(numberMap);
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
      setPrefixSuggestion(null);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    // 防抖处理
    debounceTimer.current = setTimeout(() => {
      // 获取当前版本的编号并排除
      const excludeNumber = excludeEditionId
        ? editionNumberMap.get(excludeEditionId)
        : undefined;

      // 检查唯一性
      const isUnique = isNumberUnique(number, existingNumbers, excludeNumber);

      // 检查格式
      const formatResult = validateNumberFormat(number, pattern || undefined);

      // 前缀建议 or 重复建议
      let nextAvailable: string | null = null;
      if (!isUnique) {
        // 编号重复：找下一个可用编号
        nextAvailable = suggestNextAvailable(number, existingNumbers, excludeNumber);
        setPrefixSuggestion(nextAvailable);
      } else if (number.endsWith('-') || number.endsWith('/')) {
        // 前缀输入：建议下一个序号
        const suggested = suggestNextNumberForPrefix(number, existingNumbers);
        setPrefixSuggestion(suggested);
      } else {
        setPrefixSuggestion(null);
      }

      setValidation({
        isUnique,
        isValidFormat: formatResult.valid,
        message: !isUnique
          ? (nextAvailable || undefined)  // 把推荐编号作为 message 传给 UI
          : formatResult.message,
      });

      setIsChecking(false);
    }, debounceMs);
  }, [debounceMs, existingNumbers, pattern, editionNumberMap, excludeEditionId]);

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

    // 获取当前版本的编号并排除
    const excludeNumber = excludeEditionId
      ? editionNumberMap.get(excludeEditionId)
      : undefined;

    const isUnique = isNumberUnique(number, existingNumbers, excludeNumber);
    const formatResult = validateNumberFormat(number, pattern || undefined);

    return {
      isUnique,
      isValidFormat: formatResult.valid,
      message: !isUnique ? '此编号已存在' : formatResult.message,
    };
  }, [existingNumbers, pattern, editionNumberMap, excludeEditionId]);

  // 应用建议的编号
  const applySuggestion = useCallback((): string | null => {
    return suggestion?.nextNumber || null;
  }, [suggestion]);

  // 应用前缀建议的编号
  const applyPrefixSuggestion = useCallback((): string | null => {
    return prefixSuggestion;
  }, [prefixSuggestion]);

  // 刷新数据
  const refresh = useCallback(() => {
    fetchExistingNumbers();
  }, [fetchExistingNumbers]);

  return {
    // 状态
    existingNumbers,
    suggestion,
    prefixSuggestion,
    pattern,
    isLoading,
    isChecking,
    validation,

    // 方法
    checkNumber,
    checkNumberSync,
    applySuggestion,
    applyPrefixSuggestion,
    refresh,
  };
}
