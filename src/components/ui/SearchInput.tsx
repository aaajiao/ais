import { useRef, useEffect, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface SearchInputProps {
  /** 视觉显示值（受控） */
  value: string;
  /** 视觉即时回调（每次 keystroke，IME composition 中除外） */
  onChange: (value: string) => void;
  /**
   * 搜索触发回调：debounce + IME 感知
   * - 英文连续输入：trailing debounce
   * - IME compositionEnd：取消 pending debounce 后立即触发
   * - 外部 value 主动变化（如清空按钮）：立即触发
   */
  onDebouncedChange?: (value: string) => void;
  /** debounce 延迟，默认 300ms */
  delay?: number;
  placeholder?: string;
  className?: string;
}

/**
 * SearchInput - 中英文统一防抖的搜索输入框
 *
 * 把 IME composition 处理与 debounce 收口到组件内部：
 * - 父组件通过 `onChange` 拿即时值（用于显示状态、清空按钮判断等）
 * - 通过 `onDebouncedChange` 拿"应触发搜索"的值
 * - IME 提交后立即 flush，不再多等一个 debounce 周期
 */
export function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  delay = 300,
  placeholder,
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);

  const debouncedNotify = useDebouncedCallback((v: string) => {
    onDebouncedChange?.(v);
  }, delay);

  // 同步外部 value 到 input（清空、URL 反向写入等场景）
  // 当外部主动改写 value 时，立即触发 onDebouncedChange，避免 300ms 延迟
  useEffect(() => {
    if (!inputRef.current || isComposing.current) return;
    if (inputRef.current.value !== value) {
      inputRef.current.value = value;
      debouncedNotify.cancel();
      onDebouncedChange?.(value);
    }
  }, [value, debouncedNotify, onDebouncedChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // IME composition 期间不向外提交；compositionEnd 会一次性补发
      if (isComposing.current) return;
      const v = e.target.value;
      onChange(v);
      debouncedNotify(v);
    },
    [onChange, debouncedNotify]
  );

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      const v = e.currentTarget.value;
      onChange(v);
      // IME 提交即"用户停顿"信号 → 取消 pending debounce 立刻搜索
      debouncedNotify.cancel();
      onDebouncedChange?.(v);
    },
    [onChange, onDebouncedChange, debouncedNotify]
  );

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      placeholder={placeholder}
      className={className}
    />
  );
}
