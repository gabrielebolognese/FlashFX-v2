// Renders red measurement "dimension lines" with px label pills — shared by the
// Alt-hover distance measure and the equal-gap distribution snapping. World-space
// segment coords in; scaled to screen by (scaleX, scaleY). Figma-red #F24822,
// white label text, small end caps for the engineering-dimension look.

const RED = '#F24822';
const CAP = 3; // perpendicular end-cap half-length (screen px)

export interface LabeledSeg {
  x1: number; y1: number; x2: number; y2: number; // world space
  label: string;
}

interface MeasureOverlayProps {
  segments: LabeledSeg[];
  /** Free-floating labels (e.g. a hovered object's "W × H"), world-space anchor. */
  extras?: { x: number; y: number; label: string }[];
  scaleX: number;
  scaleY: number;
}

function Pill({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  const w = label.length * 6.5 + 8;
  return (
    <>
      <rect x={cx - w / 2} y={cy - 8} width={w} height={16} rx={3} fill={RED} />
      <text
        x={cx} y={cy + 3.5} textAnchor="middle" fill="#fff"
        style={{ fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </text>
    </>
  );
}

export function MeasureOverlay({ segments, extras = [], scaleX, scaleY }: MeasureOverlayProps) {
  if (segments.length === 0 && extras.length === 0) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-canvas-banner overflow-visible">
      {segments.map((s, i) => {
        const x1 = s.x1 * scaleX, y1 = s.y1 * scaleY, x2 = s.x2 * scaleX, y2 = s.y2 * scaleY;
        const horiz = Math.abs(y1 - y2) < 0.01; // horizontal segment → vertical caps
        const cap = horiz
          ? [{ x1, y1: y1 - CAP, x2: x1, y2: y1 + CAP }, { x1: x2, y1: y2 - CAP, x2: x2, y2: y2 + CAP }]
          : [{ x1: x1 - CAP, y1, x2: x1 + CAP, y2: y1 }, { x1: x2 - CAP, y1: y2, x2: x2 + CAP, y2 }];
        return (
          <g key={`s${i}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={RED} strokeWidth={1} shapeRendering="crispEdges" />
            {cap.map((c, j) => (
              <line key={j} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={RED} strokeWidth={1} shapeRendering="crispEdges" />
            ))}
            <Pill cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} label={s.label} />
          </g>
        );
      })}
      {extras.map((e, i) => (
        <Pill key={`e${i}`} cx={e.x * scaleX} cy={e.y * scaleY} label={e.label} />
      ))}
    </svg>
  );
}
