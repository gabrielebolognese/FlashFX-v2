import type { CSSProperties } from 'react';
import { useViewportNavStore } from '../../store/viewportNav';

// Broadcast-style guides: action-safe (outer) and title-safe (inner), as
// centered percentage insets of the frame. Purely a composition aid.
const ACTION_SAFE = 0.93; // 93% — keep important action inside this
const TITLE_SAFE = 0.9; //  90% — keep text/titles inside this

/**
 * Canvas "Show Safe Areas" toggle: draws action-safe and title-safe rectangles
 * plus center cross-hairs over the canvas. Positioned via `style` (the canvas
 * geometry passed from Viewport).
 */
export function SafeAreasOverlay({ style }: { style: CSSProperties }) {
  const show = useViewportNavStore((s) => s.showSafeAreas);
  if (!show) return null;

  const box = (inset: number, color: string): CSSProperties => ({
    position: 'absolute',
    left: `${(1 - inset) * 50}%`,
    top: `${(1 - inset) * 50}%`,
    width: `${inset * 100}%`,
    height: `${inset * 100}%`,
    border: `1px solid ${color}`,
    boxSizing: 'border-box',
  });

  return (
    <div style={{ ...style, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={box(ACTION_SAFE, 'rgba(255,255,255,0.35)')} />
      <div style={box(TITLE_SAFE, 'rgba(255,255,255,0.28)')} />
      {/* center cross-hair */}
      <div style={{ position: 'absolute', left: '50%', top: '35%', bottom: '35%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
      <div style={{ position: 'absolute', top: '50%', left: '35%', right: '35%', height: 1, background: 'rgba(255,255,255,0.25)' }} />
    </div>
  );
}
