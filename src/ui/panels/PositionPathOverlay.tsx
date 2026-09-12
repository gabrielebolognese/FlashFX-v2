import { useRef, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useEditorStore } from '../../store/editor';
import { useHistoryStore } from '../../store/history';
import { useViewportNavStore } from '../../store/viewportNav';
import type { Layer, Vec2 } from '../../core/types';

function positionProp(layer: Layer) {
  if (!('transform' in layer) || !layer.transform) return null;
  const p = layer.transform.position;
  if (!p || !Array.isArray(p.keyframes) || p.keyframes.length < 2) return null;
  return p;
}

type DragState = {
  index: number;
  side: 'in' | 'out';
  anchor: Vec2;
  mirror: boolean;
  oldComp: ReturnType<typeof useEditorStore.getState>['composition'];
  oldSel: ReturnType<typeof useEditorStore.getState>['selection'];
};

/**
 * Interactive spatial tangent handles for the SELECTED layer's position motion path (B3b). Draws the
 * in/out handle arms + draggable dots at each position keyframe that carries spatial tangents (set
 * via the "Smooth Path" context action). Dragging reshapes the arc: plain drag keeps the handle
 * mirrored (smooth); Alt-drag breaks it (independent). One undo entry per drag (batched → commitDrag).
 * The read-only path + keyframe/spacing dots are drawn by AnimatedPathsOverlay; this layer is only
 * the editable handles, so it sits on top and only its dots receive pointer events.
 */
export function PositionPathOverlay({ compW, compH, style }: { compW: number; compH: number; style: CSSProperties }) {
  const show = useViewportNavStore((s) => s.showMotionPaths);
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);

  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const offset: Vec2 = [
      ((e.clientX - rect.left) * compW) / rect.width - d.anchor[0],
      ((e.clientY - rect.top) * compH) / rect.height - d.anchor[1],
    ];
    const layer = useEditorStore.getState().composition.layers.find((l) => l.id === d.oldSel.activeId || (d.oldSel.selectedIds.length === 1 && l.id === d.oldSel.selectedIds[0]));
    if (!layer || !('transform' in layer)) return;
    const kfs = layer.transform.position.keyframes;
    const mirrored: Vec2 = [-offset[0], -offset[1]];
    const newKfs = kfs.map((k, i) => {
      if (i !== d.index) return k;
      if (d.side === 'out') return { ...k, spatialOut: offset, spatialIn: d.mirror ? mirrored : k.spatialIn, spatialMode: 'bezier' as const };
      return { ...k, spatialIn: offset, spatialOut: d.mirror ? mirrored : k.spatialOut, spatialMode: 'bezier' as const };
    });
    updateLayerProperty(layer.id, 'transform.position.keyframes', newKfs);
  }, [compW, compH, updateLayerProperty]);

  const onUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (d) {
      useHistoryStore.getState().setBatching(false);
      useEditorStore.getState().commitDrag('Edit Motion Path', d.oldComp, d.oldSel);
    }
  }, [onMove]);

  const startDrag = useCallback((e: React.PointerEvent, index: number, side: 'in' | 'out', anchor: Vec2) => {
    e.preventDefault();
    e.stopPropagation();
    const st = useEditorStore.getState();
    drag.current = { index, side, anchor, mirror: !e.altKey, oldComp: st.composition, oldSel: st.selection };
    useHistoryStore.getState().setBatching(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  useEffect(() => () => {
    // Safety: drop listeners if the overlay unmounts mid-drag.
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  const activeId = selection.selectedIds.length === 1 ? selection.selectedIds[0] : selection.activeId;
  const layer = activeId ? composition.layers.find((l) => l.id === activeId) ?? null : null;
  const prop = layer ? positionProp(layer) : null;
  const sX = size.w > 0 ? size.w / compW : 0;
  const sY = size.h > 0 ? size.h / compH : 0;
  const showHandles = show && prop && compW > 0 && compH > 0 && sX > 0;

  return (
    <div ref={ref} style={{ ...style, pointerEvents: 'none' }}>
      {showHandles && prop && (
        <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {prop.keyframes.map((kf, i) => {
            if (!kf.spatialIn && !kf.spatialOut) return null;
            const anchor = kf.value as Vec2;
            const ax = anchor[0] * sX, ay = anchor[1] * sY;
            const arms: JSX.Element[] = [];
            if (kf.spatialOut) {
              const hx = (anchor[0] + kf.spatialOut[0]) * sX, hy = (anchor[1] + kf.spatialOut[1]) * sY;
              arms.push(
                <g key={`out-${i}`}>
                  <line x1={ax} y1={ay} x2={hx} y2={hy} stroke="#38bdf8" strokeWidth={1} opacity={0.8} />
                  <circle cx={hx} cy={hy} r={5} fill="#38bdf8" stroke="#04121f" strokeWidth={1}
                    style={{ pointerEvents: 'auto', cursor: 'grab' }}
                    onPointerDown={(e) => startDrag(e, i, 'out', anchor)} />
                </g>,
              );
            }
            if (kf.spatialIn) {
              const hx = (anchor[0] + kf.spatialIn[0]) * sX, hy = (anchor[1] + kf.spatialIn[1]) * sY;
              arms.push(
                <g key={`in-${i}`}>
                  <line x1={ax} y1={ay} x2={hx} y2={hy} stroke="#38bdf8" strokeWidth={1} opacity={0.8} />
                  <circle cx={hx} cy={hy} r={5} fill="#38bdf8" stroke="#04121f" strokeWidth={1}
                    style={{ pointerEvents: 'auto', cursor: 'grab' }}
                    onPointerDown={(e) => startDrag(e, i, 'in', anchor)} />
                </g>,
              );
            }
            return <g key={i}>{arms}</g>;
          })}
        </svg>
      )}
    </div>
  );
}
