/**
 * SVG zoom + pan hook —— 触摸板 / 鼠标滚轮 / 移动端触控屏统一交互。
 *
 * 设计契约：
 * - **wheel**（鼠标 + Mac 触摸板）直接 zoom，不需要 modifier 快捷键（避免跟浏览器
 *   Cmd/Ctrl++ 缩放冲突）。Mac 触摸板 pinch 在 Chrome / Safari 会自动 emit
 *   `wheel` event with `ctrlKey=true`，走同一 handler 但用更小 step
 * - **touch pinch**（移动端两指）`touchstart` + `touchmove` 多指 → 两指距离比为
 *   zoom factor，两指中点为 anchor
 * - **drag pan**：mouse / 单指在**空白处** drag（节点上 mousedown 不 trigger pan，
 *   保留 click/pin 交互）
 * - 节点判定：`closest('[data-node], [role="button"]')` —— entity / ghost /
 *   anonymous 都被排除（它们都用 role=button 或 data-node）
 *
 * trade-off：SVG 区内 wheel 不再滚页面（必须 preventDefault），但 maxHeight: 70vh
 * 让 SVG 上下有滚条空间，且 viewport 内大量节点确实需要 zoom 才能看清。
 */

import { useState, useCallback, useRef, useMemo } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UseSvgZoomPanOptions {
  initialWidth: number;
  initialHeight: number;
  /** 最小 zoom factor，1 = 原尺寸；0.5 = 看到 2× 原 viewport 内容（zoom out）默认禁止过度 zoom out */
  minZoom?: number;
  /** 最大 zoom factor；4 = 看到原 1/4 viewport 内容（zoom in） */
  maxZoom?: number;
  /** 单次 wheel scroll 的 zoom factor（默认 1.1）。Mac trackpad pinch 自动用更小 step */
  wheelStep?: number;
}

export interface UseSvgZoomPanResult {
  /** attach 到 <svg ref={...}> */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** attach 到 <svg viewBox={...}>，已 toFixed 减少 React 重 render diff */
  viewBoxStr: string;
  /** 当前 zoom factor（initialWidth / current.w；1 = 原尺寸） */
  zoom: number;
  /** 当前 viewBox 是否偏离 initial（zoom != 1 或 pan != 0） */
  isZoomed: boolean;
  /** 重置回 initial viewBox + 关掉 active pan/pinch */
  reset: () => void;
  /** spread 到 <svg> 上 */
  handlers: {
    onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
    onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchEnd: (e: React.TouchEvent<SVGSVGElement>) => void;
  };
}

interface PanState {
  active: boolean;
  startClientX: number;
  startClientY: number;
  startVb: ViewBox;
}

interface PinchState {
  startDist: number;
  startVb: ViewBox;
  centerSvg: { x: number; y: number };
}

export function useSvgZoomPan({
  initialWidth,
  initialHeight,
  minZoom = 0.5,
  maxZoom = 4,
  wheelStep = 1.1,
}: UseSvgZoomPanOptions): UseSvgZoomPanResult {
  const initial: ViewBox = useMemo(
    () => ({ x: 0, y: 0, w: initialWidth, h: initialHeight }),
    [initialWidth, initialHeight]
  );
  const [viewBox, setViewBox] = useState<ViewBox>(initial);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);

  /**
   * Client (px) 坐标 → SVG viewBox 用户坐标空间。
   * SVG `preserveAspectRatio="xMidYMid meet"` 默认行为：等比缩放，缩短轴居中。
   */
  const clientToSvg = useCallback(
    (clientX: number, clientY: number, vb: ViewBox): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // 等比缩放：取 fit ratio 较小的（让 viewBox 完全可见）
      const scaleX = rect.width / vb.w;
      const scaleY = rect.height / vb.h;
      const scale = Math.min(scaleX, scaleY);
      // viewBox 居中 offset
      const offsetX = (rect.width - vb.w * scale) / 2;
      const offsetY = (rect.height - vb.h * scale) / 2;
      const localX = clientX - rect.left - offsetX;
      const localY = clientY - rect.top - offsetY;
      return {
        x: vb.x + localX / scale,
        y: vb.y + localY / scale,
      };
    },
    []
  );

  /** anchor 在 SVG 坐标里位置不变 → zoom factor 应用 + 新 viewBox 计算 */
  const zoomAtAnchor = useCallback(
    (factor: number, anchorSvg: { x: number; y: number }, fromVb?: ViewBox) => {
      setViewBox((prev) => {
        const base = fromVb ?? prev;
        const newW = base.w / factor;
        const newH = base.h / factor;
        const cumulativeZoom = initialWidth / newW;
        // 累计 zoom 越界则不动（避免 overshoot）
        if (cumulativeZoom < minZoom || cumulativeZoom > maxZoom) return prev;
        const newX = anchorSvg.x - (anchorSvg.x - base.x) / factor;
        const newY = anchorSvg.y - (anchorSvg.y - base.y) / factor;
        return { x: newX, y: newY, w: newW, h: newH };
      });
    },
    [initialWidth, minZoom, maxZoom]
  );

  // ─── Wheel（鼠标滚轮 + Mac trackpad pinch）─────────────────────────────────
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const anchor = clientToSvg(e.clientX, e.clientY, viewBox);
      if (!anchor) return;
      // Mac trackpad pinch → e.ctrlKey=true（浏览器自动设），用更小 step 避免跳变
      const step = e.ctrlKey ? 1.03 : wheelStep;
      // deltaY < 0 = 向上滚 = zoom in
      const factor = e.deltaY < 0 ? step : 1 / step;
      zoomAtAnchor(factor, anchor);
    },
    [clientToSvg, viewBox, wheelStep, zoomAtAnchor]
  );

  // ─── 节点判定：mousedown / touchstart 在节点上不触发 pan ────────────────────
  const isInteractiveTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('g[data-node], [role="button"]');
  }, []);

  // ─── Mouse drag pan ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return; // 左键 only
      if (isInteractiveTarget(e.target)) return; // 节点上不 pan
      panRef.current = {
        active: true,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startVb: viewBox,
      };
    },
    [viewBox, isInteractiveTarget]
  );

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const p = panRef.current;
    if (!p?.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / p.startVb.w, rect.height / p.startVb.h);
    if (scale === 0) return;
    const dx = (e.clientX - p.startClientX) / scale;
    const dy = (e.clientY - p.startClientY) / scale;
    setViewBox({
      x: p.startVb.x - dx,
      y: p.startVb.y - dy,
      w: p.startVb.w,
      h: p.startVb.h,
    });
  }, []);

  const onMouseUp = useCallback(() => {
    if (panRef.current) panRef.current.active = false;
  }, []);

  const onMouseLeave = useCallback(() => {
    if (panRef.current) panRef.current.active = false;
  }, []);

  // ─── Touch handlers ─────────────────────────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const centerSvg = clientToSvg(
          (t1.clientX + t2.clientX) / 2,
          (t1.clientY + t2.clientY) / 2,
          viewBox
        );
        if (!centerSvg) return;
        pinchRef.current = { startDist: dist, startVb: viewBox, centerSvg };
        panRef.current = null; // 两指模式优先，不 pan
      } else if (e.touches.length === 1) {
        if (isInteractiveTarget(e.target)) return; // 节点上不 pan
        const t = e.touches[0];
        panRef.current = {
          active: true,
          startClientX: t.clientX,
          startClientY: t.clientY,
          startVb: viewBox,
        };
      }
    },
    [viewBox, clientToSvg, isInteractiveTarget]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (pinchRef.current.startDist === 0) return;
        const factor = dist / pinchRef.current.startDist;
        zoomAtAnchor(factor, pinchRef.current.centerSvg, pinchRef.current.startVb);
      } else if (
        e.touches.length === 1 &&
        panRef.current?.active &&
        !pinchRef.current
      ) {
        e.preventDefault();
        const p = panRef.current;
        const svg = svgRef.current;
        if (!svg) return;
        const t = e.touches[0];
        const rect = svg.getBoundingClientRect();
        const scale = Math.min(rect.width / p.startVb.w, rect.height / p.startVb.h);
        if (scale === 0) return;
        const dx = (t.clientX - p.startClientX) / scale;
        const dy = (t.clientY - p.startClientY) / scale;
        setViewBox({
          x: p.startVb.x - dx,
          y: p.startVb.y - dy,
          w: p.startVb.w,
          h: p.startVb.h,
        });
      }
    },
    [zoomAtAnchor]
  );

  const onTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0 && panRef.current) panRef.current.active = false;
  }, []);

  // ─── Reset / 派生 state ─────────────────────────────────────────────────────
  const reset = useCallback(() => {
    panRef.current = null;
    pinchRef.current = null;
    setViewBox(initial);
  }, [initial]);

  const zoom = initialWidth / viewBox.w;
  const isZoomed =
    Math.abs(viewBox.w - initialWidth) > 0.5 ||
    Math.abs(viewBox.h - initialHeight) > 0.5 ||
    Math.abs(viewBox.x) > 0.5 ||
    Math.abs(viewBox.y) > 0.5;

  const viewBoxStr = `${viewBox.x.toFixed(2)} ${viewBox.y.toFixed(2)} ${viewBox.w.toFixed(2)} ${viewBox.h.toFixed(2)}`;

  return {
    svgRef,
    viewBoxStr,
    zoom,
    isZoomed,
    reset,
    handlers: {
      onWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
