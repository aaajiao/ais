import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineProps<T> {
  values: T[];
  current: T;
  onChange: (next: T) => void;
  format: (t: T) => string;
  playing?: boolean;
  onPlayToggle?: () => void;
  onPlayComplete?: () => void;
  durationMs?: number;
  className?: string;
}

const DEFAULT_DURATION_MS = 6000;

export default function Timeline<T>({
  values,
  current,
  onChange,
  format,
  playing = false,
  onPlayToggle,
  onPlayComplete,
  durationMs = DEFAULT_DURATION_MS,
  className,
}: TimelineProps<T>) {
  const { t } = useTranslation('visualize');
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const startIdxRef = useRef<number>(0);

  const len = values.length;
  const currentIdx = Math.max(0, values.indexOf(current));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (len <= 1) return null;

  const minLabel = format(values[0]);
  const maxLabel = format(values[len - 1]);
  const currentLabel = format(current);

  return (
    <div
      className={cn(
        'flex items-center gap-3 border border-border px-3 py-2 text-xs font-mono',
        className
      )}
      data-testid="visualize-timeline"
    >
      <button
        type="button"
        onClick={onPlayToggle}
        aria-label={playing ? t('timeline.pause') : t('timeline.play')}
        aria-pressed={playing}
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 border border-border hover:bg-foreground hover:text-background transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-foreground"
      >
        {playing ? (
          <Pause className="w-3 h-3" />
        ) : (
          <Play className="w-3 h-3" />
        )}
      </button>

      <span className="shrink-0 text-muted-foreground select-none" aria-hidden="true">
        {minLabel}
      </span>

      <input
        type="range"
        min={0}
        max={len - 1}
        step={1}
        value={currentIdx}
        onChange={(e) => {
          const idx = Number(e.target.value);
          if (Number.isFinite(idx) && idx >= 0 && idx < len) {
            onChange(values[idx]);
          }
        }}
        aria-label={t('timeline.ariaSlider')}
        aria-valuemin={0}
        aria-valuemax={len - 1}
        aria-valuenow={currentIdx}
        aria-valuetext={currentLabel}
        className="flex-1 accent-foreground cursor-pointer"
      />

      <span className="shrink-0 text-muted-foreground select-none" aria-hidden="true">
        {maxLabel}
      </span>

      <span
        className="shrink-0 font-bold tabular-nums min-w-[6ch] text-right"
        data-testid="visualize-timeline-current"
      >
        {currentLabel}
      </span>
    </div>
  );
}
