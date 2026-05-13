/**
 * SVG zoom + pan hook（v1.6.x 第十轮）。
 *
 * 设计选择：
 * - **Zoom 仅靠按钮**：+ / − / reset 离散 step（默认 1.25×）。不接 wheel 也不接
 *   pinch —— 第九轮实测 wheel 跟页面滚动冲突、pinch 灵敏度难调。
 * - **Pan 用 drag**：放大后用户需要看不同区域，mouse / 单指 drag 空白处平移
 *   viewBox。节点上 mousedown 不触发 pan（保留 click/pin/navigate）—— 用
 *   `closest('g[data-node], [role="button"]')` 判定。
 * - **Touch 单指 drag pan，忽略多指**：多指曾用于 pinch zoom，现在 zoom 走按钮
 *   所以多指无意义；不主动 preventDefault 让浏览器默认 pinch（页面缩放）通过。
 * - zoom 锚点固定在 viewBox 中心；pan 由 viewBox.x/y 偏移
 */

import { useState, useCallback, useRef } from 'react';

interface PanState {
  active: boolean;
  startClientX: number;
  startClientY: number;
  startVbX: number;
  startVbY: number;
}

export interface UseSvgZoomPanOptions {
  initialWidth: number;
  initialHeight: number;
  /** 最小 zoom factor（默认 0.5 = viewport 看 2× 原内容） */
  minZoom?: number;
  /** 最大 zoom factor（默认 4 = viewport 看 1/4 原内容） */
  maxZoom?: number;
  /** 单次 zoom in/out 乘数（默认 1.25） */
  step?: number;
}

export interface UseSvgZoomPanResult {
  /** attach 到 `<svg ref={...}>` */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** attach 到 `<svg viewBox={...}>`，已 toFixed 减少 React DOM diff */
  viewBoxStr: string;
  /** 当前 zoom factor；1 = 原尺寸 */
  zoom: number;
  /** zoom !== 1 或 pan != (0,0) */
  isZoomed: boolean;
  /** 还能继续 zoom in */
  canZoomIn: boolean;
  /** 还能继续 zoom out */
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** 回到 zoom=1 + pan=(0,0) */
  reset: () => void;
  /** spread 到 `<svg>` 上启用 drag pan */
  handlers: {
    onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchEnd: (e: React.TouchEvent<SVGSVGElement>) => void;
  };
}

export function useSvgZoomPan({
  initialWidth,
  initialHeight,
  minZoom = 0.5,
  maxZoom = 4,
  step = 1.25,
}: UseSvgZoomPanOptions): UseSvgZoomPanResult {
  const [zoom, setZoom] = useState(1);
  // pan 偏移：相对于 viewBox 中心。zoom=1 时 (0,0) = 不偏移
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);

  const zoomIn = useCallback(() => {
    setZoom((s) => Math.min(maxZoom, s * step));
  }, [maxZoom, step]);

  const zoomOut = useCallback(() => {
    setZoom((s) => {
      const next = Math.max(minZoom, s / step);
      // zoom out 到 1 时清空 pan（回到完整居中视图）
      if (next <= 1.001) setPan({ x: 0, y: 0 });
      return next;
    });
  }, [minZoom, step]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ─── pan handlers ──────────────────────────────────────────────────────────
  const isInteractiveTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('g[data-node], [role="button"]');
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return; // 左键 only
      if (isInteractiveTarget(e.target)) return; // 节点上不 pan
      panRef.current = {
        active: true,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startVbX: pan.x,
        startVbY: pan.y,
      };
    },
    [pan.x, pan.y, isInteractiveTarget]
  );

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const p = panRef.current;
    if (!p?.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    // client px → svg unit：viewBox 当前 width = initialWidth / zoom
    const scale = rect.width / (initialWidth / zoom);
    const dx = (e.clientX - p.startClientX) / scale;
    const dy = (e.clientY - p.startClientY) / scale;
    setPan({ x: p.startVbX - dx, y: p.startVbY - dy });
  }, [initialWidth, zoom]);

  const stopPan = useCallback(() => {
    if (panRef.current) panRef.current.active = false;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      // 多指忽略（让浏览器默认 pinch 缩页面，zoom 由按钮控）
      if (e.touches.length !== 1) {
        panRef.current = null;
        return;
      }
      if (isInteractiveTarget(e.target)) return;
      const t = e.touches[0];
      panRef.current = {
        active: true,
        startClientX: t.clientX,
        startClientY: t.clientY,
        startVbX: pan.x,
        startVbY: pan.y,
      };
    },
    [pan.x, pan.y, isInteractiveTarget]
  );

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 1) return;
    const p = panRef.current;
    if (!p?.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = rect.width / (initialWidth / zoom);
    const t = e.touches[0];
    const dx = (t.clientX - p.startClientX) / scale;
    const dy = (t.clientY - p.startClientY) / scale;
    setPan({ x: p.startVbX - dx, y: p.startVbY - dy });
  }, [initialWidth, zoom]);

  const onTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) stopPan();
  }, [stopPan]);

  // ─── 派生 viewBox ──────────────────────────────────────────────────────────
  // zoom 锚点是 viewBox 中心；再叠加 pan 偏移
  const cx = initialWidth / 2;
  const cy = initialHeight / 2;
  const w = initialWidth / zoom;
  const h = initialHeight / zoom;
  const x = cx - w / 2 + pan.x;
  const y = cy - h / 2 + pan.y;
  const viewBoxStr = `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;

  return {
    svgRef,
    viewBoxStr,
    zoom,
    isZoomed:
      Math.abs(zoom - 1) > 0.001 ||
      Math.abs(pan.x) > 0.5 ||
      Math.abs(pan.y) > 0.5,
    canZoomIn: zoom < maxZoom - 0.001,
    canZoomOut: zoom > minZoom + 0.001,
    zoomIn,
    zoomOut,
    reset,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp: stopPan,
      onMouseLeave: stopPan,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
