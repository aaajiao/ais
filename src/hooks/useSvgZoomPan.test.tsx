/**
 * useSvgZoomPan 单元测试 —— 覆盖核心 zoom/pan 状态转换。
 *
 * 注意：完整 DOM-level 集成测试（真实 wheel/touch event 触发 SVG 更新）受
 * happy-dom 对 SVG geometry API 支持限制（getBoundingClientRect 等需要 layout
 * 但 happy-dom 不 layout）。这里测试聚焦于：
 * - 初始 state 正确
 * - reset 行为可触发
 * - zoom factor / isZoomed 计算
 * - handlers 存在且不抛
 *
 * 真实交互回归靠 spot-check（用户手测 wheel / pinch / drag）。
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSvgZoomPan } from './useSvgZoomPan';

describe('useSvgZoomPan', () => {
  it('初始 state：viewBox = 0 0 W H，zoom=1，isZoomed=false', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
    expect(result.current.zoom).toBe(1);
    expect(result.current.isZoomed).toBe(false);
  });

  it('handlers 暴露所有必要的 event handler 函数', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 800, initialHeight: 600 })
    );
    const h = result.current.handlers;
    expect(typeof h.onWheel).toBe('function');
    expect(typeof h.onMouseDown).toBe('function');
    expect(typeof h.onMouseMove).toBe('function');
    expect(typeof h.onMouseUp).toBe('function');
    expect(typeof h.onMouseLeave).toBe('function');
    expect(typeof h.onTouchStart).toBe('function');
    expect(typeof h.onTouchMove).toBe('function');
    expect(typeof h.onTouchEnd).toBe('function');
  });

  it('reset 在 initial state 时调用是 no-op（不抛）', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    act(() => result.current.reset());
    // viewBox 仍是 initial
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
    expect(result.current.isZoomed).toBe(false);
  });

  it('svgRef 是 ref 对象（current 初始 null）', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 800, initialHeight: 600 })
    );
    expect(result.current.svgRef).toBeDefined();
    expect(result.current.svgRef.current).toBeNull();
  });

  it('不同 initialWidth/Height → viewBoxStr 同步', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 500, initialHeight: 300 })
    );
    expect(result.current.viewBoxStr).toBe('0.00 0.00 500.00 300.00');
  });

  it('onWheel 在 svgRef.current 未 attach 时不抛错（提前 fire 边界）', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    // 构造一个 minimal WheelEvent-like 对象（svgRef.current=null → clientToSvg 返 null → 早 return）
    const fakeEvent = {
      preventDefault: () => {},
      clientX: 600,
      clientY: 340,
      deltaY: -100,
      ctrlKey: false,
    } as unknown as React.WheelEvent<SVGSVGElement>;
    act(() => result.current.handlers.onWheel(fakeEvent));
    // viewBox 不变（svgRef null 时早 return）
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
  });

  it('onTouchEnd 清空 pan/pinch state 不抛错', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    const fakeEvent = {
      touches: { length: 0 } as unknown as TouchList,
    } as unknown as React.TouchEvent<SVGSVGElement>;
    act(() => result.current.handlers.onTouchEnd(fakeEvent));
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
  });

  it('onMouseUp / onMouseLeave 在未 pan 时是 no-op 不抛错', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    act(() => {
      result.current.handlers.onMouseUp();
      result.current.handlers.onMouseLeave();
    });
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
  });
});
