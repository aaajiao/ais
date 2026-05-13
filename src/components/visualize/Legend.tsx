import type { ReactNode } from 'react';

export interface LegendItem {
  key: string;
  glyph: ReactNode;
  label: string;
}

export interface LegendProps {
  items: LegendItem[];
  /** 可选：在某个 item 之前插入 │ 分隔符。值是 item 的 key */
  separatorBefore?: string;
}

export function Legend({ items, separatorBefore }: LegendProps) {
  return (
    <div
      className="border-t border-border pt-3 pb-2 text-xs font-mono flex flex-wrap items-center gap-x-3 gap-y-1.5"
      data-testid="visualize-legend"
    >
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {separatorBefore === item.key && (
            <span aria-hidden="true" className="opacity-30 pr-1">
              │
            </span>
          )}
          <span
            className="inline-flex items-center justify-center"
            aria-hidden="true"
            data-testid={`legend-glyph-${item.key}`}
          >
            {item.glyph}
          </span>
          <span className="text-muted-foreground">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
