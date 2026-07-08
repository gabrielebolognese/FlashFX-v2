import type { SnapLine } from '../../core/snap';

const COLORS: Record<SnapLine['kind'], string> = {
  'canvas-edge': '#ff3366',
  'canvas-center': '#ff3366',
  'edge': '#ff3366',
  'center': '#ff3366',
  'grid': '#38bdf8',
  'guideline': '#ffd700',
};

interface CanvasSnapGuidesProps {
  lines: SnapLine[];
  scaleX: number;
  scaleY: number;
}

export function CanvasSnapGuides({ lines, scaleX, scaleY }: CanvasSnapGuidesProps) {
  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-40 overflow-visible">
      {lines.map((line, i) => {
        const color = COLORS[line.kind];
        if (line.axis === 'x') {
          const x = line.pos * scaleX;
          return (
            <line key={i}
              x1={x} y1={line.from * scaleY}
              x2={x} y2={line.to * scaleY}
              stroke={color} strokeWidth={1.25} opacity={0.9}
              shapeRendering="crispEdges"
            />
          );
        } else {
          const y = line.pos * scaleY;
          return (
            <line key={i}
              x1={line.from * scaleX} y1={y}
              x2={line.to * scaleX} y2={y}
              stroke={color} strokeWidth={1.25} opacity={0.9}
              shapeRendering="crispEdges"
            />
          );
        }
      })}
    </svg>
  );
}

// Timeline snap lines (unrelated to canvas snapping)
interface TimelineSnapLinesProps {
  snapLines: { frame: number; type: string }[];
  frameToPixelFn: (frame: number) => number;
  containerHeight: number;
}

export function TimelineSnapLines({ snapLines, frameToPixelFn, containerHeight }: TimelineSnapLinesProps) {
  if (snapLines.length === 0) return null;
  return (
    <>
      {snapLines.map((line, i) => {
        const x = frameToPixelFn(line.frame);
        const color = line.type === 'playhead' ? '#ffcc00' : '#ef4444';
        return (
          <div key={i}
            className="absolute top-0 z-30 pointer-events-none"
            style={{
              left: x, width: 2, height: containerHeight,
              backgroundColor: color,
              boxShadow: `0 0 6px ${color}99`,
              transform: 'translateX(-1px)',
            }}
          />
        );
      })}
    </>
  );
}
