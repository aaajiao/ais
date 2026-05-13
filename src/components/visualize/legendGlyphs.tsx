// View-specific mini-glyph SVG，14x14。
// 每个 glyph 是它所代表元素的精确视觉复刻——pattern/stroke/fill/X 跟实际 chart 元素同语言。
// 颜色用 currentColor / fill-foreground / stroke-foreground，dark mode 自动适配。

const SIZE = 14;
const STROKE_W = 1.5;

function patternDef(id: string) {
  return (
    <defs>
      <pattern id={id} x={0} y={0} width={4} height={4} patternUnits="userSpaceOnUse">
        <circle cx={2} cy={2} r={0.8} fill="currentColor" opacity={0.85} />
      </pattern>
    </defs>
  );
}

// ─── Strata glyphs ──────────────────────────────────────────────────────────

export function HeldGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <rect
        x={STROKE_W / 2 + 0.5}
        y={STROKE_W / 2 + 0.5}
        width={SIZE - STROKE_W - 1}
        height={SIZE - STROKE_W - 1}
        fill="none"
        className="stroke-foreground"
        strokeWidth={STROKE_W}
      />
    </svg>
  );
}

export function ExternalGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="text-foreground">
      {patternDef('legend-external-dots')}
      <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} fill="url(#legend-external-dots)" />
    </svg>
  );
}

export function DepartedGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} className="fill-foreground" />
    </svg>
  );
}

export function DegenerateGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} className="fill-foreground" />
      <g className="stroke-foreground" strokeWidth={1.3} opacity={0.6}>
        <line x1={3} y1={3} x2={SIZE - 3} y2={SIZE - 3} />
        <line x1={SIZE - 3} y1={3} x2={3} y2={SIZE - 3} />
      </g>
    </svg>
  );
}

export function UnknownYearGlyph() {
  return (
    <svg width={SIZE + 6} height={SIZE} viewBox={`0 0 ${SIZE + 6} ${SIZE}`}>
      <rect
        x={STROKE_W / 2 + 0.5}
        y={STROKE_W / 2 + 0.5}
        width={SIZE - STROKE_W - 1}
        height={SIZE - STROKE_W - 1}
        fill="none"
        className="stroke-foreground"
        strokeWidth={STROKE_W}
      />
      <text
        x={SIZE + 1}
        y={SIZE - 3}
        className="fill-muted-foreground"
        fontSize={10}
        fontFamily="monospace"
      >
        ?
      </text>
    </svg>
  );
}

// ─── Markets glyphs ─────────────────────────────────────────────────────────

export function PricedDotGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1.5} className="fill-foreground" />
    </svg>
  );
}

export function NoPriceDotGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={SIZE / 2 - 2}
        fill="none"
        className="stroke-foreground"
        strokeWidth={STROKE_W}
      />
    </svg>
  );
}

// ─── Diaspora glyphs ────────────────────────────────────────────────────────

export function KnownLocationGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1.5} className="fill-foreground" />
    </svg>
  );
}

export function GhostNodeGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={SIZE / 2 - 3}
        fill="none"
        className="stroke-foreground"
        strokeWidth={1.2}
        opacity={0.6}
      />
    </svg>
  );
}
