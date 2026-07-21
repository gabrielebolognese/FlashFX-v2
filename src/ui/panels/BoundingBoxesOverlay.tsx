import type { CSSProperties } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useViewportNavStore } from '../../store/viewportNav';
import { getLayerRect, type Rect } from '../../core/snap';

/**
 * Debug view (canvas "Show Bounding Boxes" menu toggle): outlines every visible
 * layer's bounding box. Positioned over the canvas via `style` (the canvas
 * geometry), with each box placed in composition-percentage coordinates.
 */
export function BoundingBoxesOverlay({ compW, compH, style }: { compW: number; compH: number; style: CSSProperties }) {
  const show = useViewportNavStore((s) => s.showBoundingBoxes);
  const composition = useEditorStore((s) => s.composition);
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  if (!show || compW <= 0 || compH <= 0) return null;

  const rects: Rect[] = [];
  for (const l of composition.layers) {
    if (!l.visible || l.type === 'group') continue;
    const r = getLayerRect(l, composition.layers, currentFrame);
    if (r) rects.push(r);
  }

  return (
    <div style={{ ...style, pointerEvents: 'none', overflow: 'hidden' }}>
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${(r.x / compW) * 100}%`,
            top: `${(r.y / compH) * 100}%`,
            width: `${(r.w / compW) * 100}%`,
            height: `${(r.h / compH) * 100}%`,
            border: '1px solid rgba(56, 189, 248, 0.55)',
            boxSizing: 'border-box',
          }}
        />
      ))}
    </div>
  );
}
