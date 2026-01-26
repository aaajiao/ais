import { useRef, useEffect, useCallback } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * SearchInput - 带 IME composition 处理的搜索输入框
 *
 * 处理中文输入法的 composition 事件，确保在拼音输入阶段不会触发搜索，
 * 只有在选字完成后才更新外部状态。
 *
 * 注意：父组件应配合 useDeferredValue 使用以实现 debounce 效果。
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);

  // 同步外部 value 到 input（处理清空操作等）
  useEffect(() => {
    if (inputRef.current && !isComposing.current) {
      if (inputRef.current.value !== value) {
        inputRef.current.value = value;
      }
    }
  }, [value]);

  // 处理输入变化
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // 仅在非 composition 状态下触发 onChange
      if (!isComposing.current) {
        onChange(e.target.value);
      }
    },
    [onChange]
  );

  // IME composition 开始
  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  // IME composition 结束后更新值
  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      onChange(e.currentTarget.value);
    },
    [onChange]
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
