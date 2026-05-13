/**
 * useSvgZoomPan 单元测试（v1.6.x 第十轮：按钮 zoom + drag pan，无 wheel/pinch）。
 *
 * 覆盖：初始 state / zoomIn / zoomOut / reset / can* boundary / 累计上下限 /
 * handlers shape。drag pan 的 DOM-level 行为靠浏览器 spot-check（happy-dom 不
 * layout SVG，getBoundingClientRect 返 0×0 让 pan 计算 no-op）。
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSvgZoomPan } from './useSvgZoomPan';

describe('useSvgZoomPan', () => {
  it('初始 state：zoom=1, viewBox=0 0 W H, !isZoomed', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    expect(result.current.zoom).toBe(1);
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.canZoomIn).toBe(true);
    expect(result.current.canZoomOut).toBe(true);
  });

  it('zoomIn 一档：zoom = step (默认 1.25)，viewBox 收缩并居中', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBeCloseTo(1.25, 4);
    expect(result.current.isZoomed).toBe(true);
    // 1200/1.25=960, 居中 x=(1200-960)/2=120；680/1.25=544, 居中 y=(680-544)/2=68
    expect(result.current.viewBoxStr).toBe('120.00 68.00 960.00 544.00');
  });

  it('zoomOut 一档：zoom = 1/step = 0.8', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBeCloseTo(0.8, 4);
    expect(result.current.isZoomed).toBe(true);
  });

  it('累计 zoomIn 不超过 maxZoom (4)', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680, maxZoom: 4 })
    );
    // 1 → 1.25 → 1.5625 → 1.953 → 2.44 → 3.05 → 3.81 → 4 (capped)
    for (let i = 0; i < 20; i++) act(() => result.current.zoomIn());
    expect(result.current.zoom).toBeLessThanOrEqual(4);
    expect(result.current.canZoomIn).toBe(false);
  });

  it('累计 zoomOut 不低于 minZoom (0.5)', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680, minZoom: 0.5 })
    );
    for (let i = 0; i < 20; i++) act(() => result.current.zoomOut());
    expect(result.current.zoom).toBeGreaterThanOrEqual(0.5);
    expect(result.current.canZoomOut).toBe(false);
  });

  it('reset 把 zoom 拉回 1', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.isZoomed).toBe(true);
    act(() => result.current.reset());
    expect(result.current.zoom).toBe(1);
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.viewBoxStr).toBe('0.00 0.00 1200.00 680.00');
  });

  it('custom step：1.5 让 zoomIn 一档到 1.5', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 800, initialHeight: 600, step: 1.5 })
    );
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBeCloseTo(1.5, 4);
  });

  it('zoomIn 触顶后再点是 no-op（不抛、zoom 不变）', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680, maxZoom: 2, step: 2 })
    );
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(2);
    expect(result.current.canZoomIn).toBe(false);
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(2);
  });

  it('handlers 暴露所有 pan event handler（drag pan 在 zoom > 1 时使用）', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680 })
    );
    const h = result.current.handlers;
    expect(typeof h.onMouseDown).toBe('function');
    expect(typeof h.onMouseMove).toBe('function');
    expect(typeof h.onMouseUp).toBe('function');
    expect(typeof h.onMouseLeave).toBe('function');
    expect(typeof h.onTouchStart).toBe('function');
    expect(typeof h.onTouchMove).toBe('function');
    expect(typeof h.onTouchEnd).toBe('function');
  });

  it('svgRef 是 ref 对象，current 初始 null', () => {
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 800, initialHeight: 600 })
    );
    expect(result.current.svgRef).toBeDefined();
    expect(result.current.svgRef.current).toBeNull();
  });

  it('zoomOut 到 zoom=1 时清空 pan（防止 reset 后视图偏移残留）', () => {
    // 这个测试不能直接模拟 pan（没 DOM layout），但能确保 zoomOut → 1 不 throw
    // 且 isZoomed 回 false
    const { result } = renderHook(() =>
      useSvgZoomPan({ initialWidth: 1200, initialHeight: 680, step: 1.25 })
    );
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBeCloseTo(1, 4);
    expect(result.current.isZoomed).toBe(false);
  });
});
