import { useEffect, useRef } from 'react';

/**
 * useTimelineScrubber — generic scrubber controller for visualize ribbons.
 *
 * 单一职责：把"播放/暂停/index 推进"封装成一个跟视图无关的 hook，
 * 不接 URL / view state（这些留在 view 自己）。
 *
 * Strata / Markets 各自的 ribbon 调它，rAF 播放期间会持续调 onChange(values[idx])
 * 推动 cutoff 改变。播完最后一帧 / unmount 自动清 RAF。
 *
 * `enabled = values.length > 1` —— 单点数据 ribbon 不渲染（沿用 v1.5 Timeline 行为）。
 */

export interface UseTimelineScrubberOptions<T> {
  values: T[];
  current: T;
  onChange: (next: T) => void;
  /** play 时把整段 values 走完所用毫秒数；默认 6000ms */
  durationMs?: number;
  /** 外部 toggle play 信号，由 view 控制（让 view 决定 URL pollution 时机） */
  playing: boolean;
  /** play 自然结束 / 强制中止时回调；view 用来回写最后一帧到 URL + 翻 playing=false */
  onPlayComplete?: () => void;
}

export interface UseTimelineScrubberResult {
  /** value 在 values 中的 index；当前不在 values 时为 0 */
  currentIdx: number;
  /** values.length > 1 才"启用" —— 单点时 ribbon 不渲染 */
  enabled: boolean;
  /** 给 input.onChange 用：根据 string 索引取出对应 value 并触发 onChange */
  setIdx: (idx: number) => void;
}

const DEFAULT_DURATION_MS = 6000;

export function useTimelineScrubber<T>(
  opts: UseTimelineScrubberOptions<T>
): UseTimelineScrubberResult {
  const {
    values,
    current,
    onChange,
    durationMs = DEFAULT_DURATION_MS,
    playing,
    onPlayComplete,
  } = opts;

  const len = values.length;
  const currentIdx = Math.max(0, values.indexOf(current));

  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const startIdxRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startTsRef.current = null;
      return;
    }
    if (len <= 1) {
      onPlayComplete?.();
      return;
    }

    startTsRef.current = null;
    startIdxRef.current = currentIdx >= len - 1 ? 0 : currentIdx;

    const tick = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const elapsed = ts - startTsRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const fromIdx = startIdxRef.current;
      const span = len - 1 - fromIdx;
      const nextIdx =
        span <= 0 ? len - 1 : Math.min(len - 1, fromIdx + Math.floor(progress * span));
      if (nextIdx !== values.indexOf(current)) {
        onChange(values[nextIdx]);
      }
      if (progress >= 1) {
        onPlayComplete?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // 仅当 playing 翻转时启动/停止；rAF 内部读 ref / props 拿最新值，
    // 把 values/current/onChange 加进依赖会让 play 每帧重启。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const setIdx = (idx: number) => {
    if (Number.isFinite(idx) && idx >= 0 && idx < len) {
      onChange(values[idx]);
    }
  };

  return {
    currentIdx,
    enabled: len > 1,
    setIdx,
  };
}
