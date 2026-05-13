import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimelineScrubber } from './useTimelineScrubber';

describe('useTimelineScrubber', () => {
  it('enabled=false when values.length <= 1（单点不渲染契约）', () => {
    const { result: r0 } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [],
        current: 0,
        onChange: () => {},
        playing: false,
      })
    );
    expect(r0.current.enabled).toBe(false);

    const { result: r1 } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [2024],
        current: 2024,
        onChange: () => {},
        playing: false,
      })
    );
    expect(r1.current.enabled).toBe(false);
  });

  it('enabled=true when values.length > 1', () => {
    const { result } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [2020, 2022, 2024],
        current: 2022,
        onChange: () => {},
        playing: false,
      })
    );
    expect(result.current.enabled).toBe(true);
  });

  it('currentIdx 反映 current 在 values 中的位置', () => {
    const { result } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [2020, 2022, 2024, 2026],
        current: 2024,
        onChange: () => {},
        playing: false,
      })
    );
    expect(result.current.currentIdx).toBe(2);
  });

  it('current 不在 values 中 → currentIdx=0（防御）', () => {
    const { result } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [2020, 2022, 2024],
        current: 9999,
        onChange: () => {},
        playing: false,
      })
    );
    expect(result.current.currentIdx).toBe(0);
  });

  it('setIdx(n) → 调 onChange(values[n])', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTimelineScrubber<string>({
        values: ['2020-01-01', '2022-06-01', '2024-12-01'],
        current: '2020-01-01',
        onChange,
        playing: false,
      })
    );
    act(() => {
      result.current.setIdx(1);
    });
    expect(onChange).toHaveBeenCalledWith('2022-06-01');
  });

  it('setIdx 越界 → 不触发 onChange（保护性）', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTimelineScrubber<number>({
        values: [1, 2, 3],
        current: 1,
        onChange,
        playing: false,
      })
    );
    act(() => {
      result.current.setIdx(-1);
      result.current.setIdx(99);
      result.current.setIdx(NaN);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('playing=true + values.length<=1 → 立即 onPlayComplete（短路）', () => {
    const onPlayComplete = vi.fn();
    renderHook(() =>
      useTimelineScrubber<number>({
        values: [2024],
        current: 2024,
        onChange: () => {},
        playing: true,
        onPlayComplete,
      })
    );
    expect(onPlayComplete).toHaveBeenCalled();
  });

  it('字符串类型 values 支持 ISO date scrub', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTimelineScrubber<string>({
        values: ['2020-03-15', '2022-06-01', '2024-01-01'],
        current: '2022-06-01',
        onChange,
        playing: false,
      })
    );
    expect(result.current.currentIdx).toBe(1);
    expect(result.current.enabled).toBe(true);
    act(() => result.current.setIdx(0));
    expect(onChange).toHaveBeenCalledWith('2020-03-15');
  });
});
