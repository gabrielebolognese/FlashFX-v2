import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useShapeToolStore, isVectorTool } from '../../store/shapeTool';
import { usePathEditStore, type HandleSide } from '../../store/pathEdit';
import { resolveXform, localToComp, compToLocal } from '../../store/pathTransform';
import type { PathVertex, Vec2, Layer, ShapeLayer, PolygonShape } from '../../core/types';

interface PenToolOverlayProps {
  style?: React.CSSProperties;
  compW: number;
  compH: number;
}

const ANCHOR_HIT = 9;
const HANDLE_HIT = 8;
const CLOSE_HIT = 11;

function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// Snap a point to the nearest 45-degree increment around origin (Shift constraint).
function snap45(origin: Vec2, p: Vec2): Vec2 {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return p;
  const ang = Math.atan2(dy, dx);
  const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  return [origin[0] + Math.cos(snapped) * len, origin[1] + Math.sin(snapped) * len];
}

function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** A shape layer whose geometry is specifically a polygon (the only vertex-editable shape). */
type PolygonLayer = ShapeLayer & { shape: PolygonShape };

function isPolygonLayer(l: Layer | null | undefined): l is PolygonLayer {
  return !!l && l.type === 'shape' && l.shape.type === 'polygon';
}

type DragMode =
  | { kind: 'penHandle'; index: number }
  | { kind: 'anchor'; index: number; startLocal: Vec2 }
  | { kind: 'handle'; index: number; side: HandleSide };

export function PenToolOverlay({ style, compW, compH }: PenToolOverlayProps) {
  const activeTool = useShapeToolStore((s) => s.activeTool);
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  const createPenPath = useEditorStore((s) => s.createPenPath);
  const setPathVerticesLive = useEditorStore((s) => s.setPathVerticesLive);
  const addPathPoint = useEditorStore((s) => s.addPathPoint);
  const deletePathPoint = useEditorStore((s) => s.deletePathPoint);
  const setPathVertexType = useEditorStore((s) => s.setPathVertexType);
  const selectLayer = useEditorStore((s) => s.selectLayer);

  const selectedVertices = usePathEditStore((s) => s.selectedVertices);
  const selectVertices = usePathEditStore((s) => s.selectVertices);
  const toggleVertex = usePathEditStore((s) => s.toggleVertex);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Pen draft (in-progress path), positions + handle offsets in composition space.
  const [draft, setDraft] = useState<PathVertex[]>([]);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [hoverClose, setHoverClose] = useState(false);

  const dragRef = useRef<DragMode | null>(null);
  const dragSnapshotRef = useRef<{ comp: typeof composition; sel: typeof selection } | null>(null);

  const active = isVectorTool(activeTool);
  const overlayW = Number(style?.width) || 0;
  const overlayH = Number(style?.height) || 0;
  const sX = overlayW > 0 ? overlayW / compW : 0;
  const sY = overlayH > 0 ? overlayH / compH : 0;

  // The layer currently editable by point tools (active polygon).
  const activeLayer = composition.layers.find((l) => l.id === selection.activeId);
  const editLayer = isPolygonLayer(activeLayer) ? activeLayer : null;
  const xform = editLayer ? resolveXform(editLayer, currentFrame) : null;

  const toComp = useCallback((clientX: number, clientY: number): Vec2 => {
    const el = overlayRef.current;
    if (!el || sX === 0 || sY === 0) return [0, 0];
    const r = el.getBoundingClientRect();
    return [(clientX - r.left) / sX, (clientY - r.top) / sY];
  }, [sX, sY]);

  const toScreen = useCallback((p: Vec2): Vec2 => [p[0] * sX, p[1] * sY], [sX, sY]);

  // ── Keyboard: Enter finishes open path, Esc cancels ──
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && draft.length >= 2) {
        const id = createPenPath(draft, false);
        setDraft([]);
        setCursor(null);
        useShapeToolStore.getState().setActiveTool('directSelect');
        selectLayer(id, false, 'canvas');
      } else if (e.key === 'Escape') {
        if (draft.length > 0) {
          setDraft([]);
          setCursor(null);
        } else {
          useShapeToolStore.getState().clearTool();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, draft, createPenPath, selectLayer]);

  // Reset draft if tool changes away from pen.
  useEffect(() => {
    if (activeTool !== 'pen' && draft.length > 0) {
      setDraft([]);
      setCursor(null);
    }
  }, [activeTool]);

  if (!active || !style || sX === 0) {
    return null;
  }

  const finalizeClosed = () => {
    if (draft.length >= 2) {
      const id = createPenPath(draft, true);
      setDraft([]);
      setCursor(null);
      useShapeToolStore.getState().setActiveTool('directSelect');
      selectLayer(id, false, 'canvas');
    }
  };

  // ─────────── PEN TOOL ───────────
  const onPenPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let p = toComp(e.clientX, e.clientY);

    // Close path when clicking near the first point.
    if (draft.length >= 2) {
      const first = draft[0].position;
      if (dist2(toScreen(first), toScreen(p)) <= CLOSE_HIT * CLOSE_HIT) {
        finalizeClosed();
        return;
      }
    }

    // Shift constrains the new segment angle relative to the previous point.
    if (e.shiftKey && draft.length > 0) {
      p = snap45(draft[draft.length - 1].position, p);
    }

    const newVertex: PathVertex = {
      position: [p[0], p[1]],
      handleIn: [0, 0],
      handleOut: [0, 0],
      vertexType: 'corner',
    };
    const next = [...draft, newVertex];
    setDraft(next);
    dragRef.current = { kind: 'penHandle', index: next.length - 1 };
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onPenPointerMove = (e: React.PointerEvent) => {
    const p = toComp(e.clientX, e.clientY);
    setCursor(p);

    const drag = dragRef.current;
    if (drag && drag.kind === 'penHandle') {
      setDraft((cur) => {
        if (drag.index >= cur.length) return cur;
        const v = cur[drag.index];
        let hp = p;
        if (e.shiftKey) hp = snap45(v.position, p);
        const out: Vec2 = [hp[0] - v.position[0], hp[1] - v.position[1]];
        const copy = cur.slice();
        copy[drag.index] = {
          ...v,
          handleOut: out,
          handleIn: [-out[0], -out[1]],
          vertexType: 'bezier',
        };
        return copy;
      });
      return;
    }

    // Close-hover affordance.
    if (draft.length >= 2) {
      const first = draft[0].position;
      setHoverClose(dist2(toScreen(first), toScreen(p)) <= CLOSE_HIT * CLOSE_HIT);
    }
  };

  const onPenPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.kind === 'penHandle') {
      dragRef.current = null;
      try { overlayRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
  };

  // ─────────── POINT EDITING TOOLS ───────────
  const beginEditDrag = (mode: DragMode) => {
    dragSnapshotRef.current = { comp: composition, sel: selection };
    dragRef.current = mode;
  };

  const onEditAnchorDown = (e: React.PointerEvent, index: number) => {
    if (!editLayer || !xform) return;
    e.preventDefault();
    e.stopPropagation();

    if (activeTool === 'deletePoint') {
      deletePathPoint(editLayer.id, index);
      return;
    }
    if (activeTool === 'convertPoint') {
      const v = editLayer.shape.vertices[index];
      setPathVertexType(editLayer.id, index, v.vertexType === 'corner' ? 'bezier' : 'corner');
      return;
    }

    // directSelect / addPoint fall through to selection + move.
    if (e.shiftKey) toggleVertex(index);
    else if (!selectedVertices.includes(index)) selectVertices([index]);

    beginEditDrag({ kind: 'anchor', index, startLocal: editLayer.shape.vertices[index].position });
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onEditHandleDown = (e: React.PointerEvent, index: number, side: HandleSide) => {
    if (!editLayer || !xform) return;
    e.preventDefault();
    e.stopPropagation();
    beginEditDrag({ kind: 'handle', index, side });
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onEditPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !editLayer || !xform) return;
    if (drag.kind === 'penHandle') return;

    const compPt = toComp(e.clientX, e.clientY);
    const verts = editLayer.shape.vertices;

    if (drag.kind === 'anchor') {
      let local = compToLocal(xform, compPt);
      if (e.shiftKey) {
        const origin = localToComp(xform, drag.startLocal);
        const snapped = snap45(origin, compPt);
        local = compToLocal(xform, snapped);
      }
      const delta: Vec2 = [local[0] - verts[drag.index].position[0], local[1] - verts[drag.index].position[1]];
      const moveSet = selectedVertices.includes(drag.index) ? selectedVertices : [drag.index];
      const next = verts.map((v, i) =>
        moveSet.includes(i)
          ? { ...v, position: [v.position[0] + delta[0], v.position[1] + delta[1]] as Vec2 }
          : v
      );
      setPathVerticesLive(editLayer.id, next);
      return;
    }

    if (drag.kind === 'handle') {
      const v = verts[drag.index];
      let endpointLocal = compToLocal(xform, compPt);
      if (e.shiftKey) {
        const origin = localToComp(xform, v.position);
        endpointLocal = compToLocal(xform, snap45(origin, compPt));
      }
      const newHandle: Vec2 = [endpointLocal[0] - v.position[0], endpointLocal[1] - v.position[1]];
      const mirror: Vec2 = [-newHandle[0], -newHandle[1]];
      const mirrored = v.vertexType !== 'corner';
      const next = verts.map((vv, i) => {
        if (i !== drag.index) return vv;
        if (drag.side === 'out') {
          return { ...vv, handleOut: newHandle, ...(mirrored ? { handleIn: mirror } : {}) };
        }
        return { ...vv, handleIn: newHandle, ...(mirrored ? { handleOut: mirror } : {}) };
      });
      setPathVerticesLive(editLayer.id, next);
    }
  };

  const onEditPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && (drag.kind === 'anchor' || drag.kind === 'handle')) {
      const snap = dragSnapshotRef.current;
      if (snap) {
        useEditorStore.getState().commitDrag('Edit Path', snap.comp, snap.sel);
        dragSnapshotRef.current = null;
      }
      dragRef.current = null;
      try { overlayRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
  };

  // Add a point on the nearest segment (Add Point tool).
  const onAddPointDown = (e: React.PointerEvent) => {
    if (!editLayer || !xform) return;
    if (e.target !== overlayRef.current) return;
    const compPt = toComp(e.clientX, e.clientY);
    const verts = editLayer.shape.vertices;
    const n = verts.length;
    const segCount = editLayer.shape.closed ? n : n - 1;

    let best = { seg: -1, t: 0, d2: Infinity };
    for (let i = 0; i < segCount; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const p0 = localToComp(xform, a.position);
      const p1 = localToComp(xform, [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]]);
      const p2 = localToComp(xform, [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]]);
      const p3 = localToComp(xform, b.position);
      for (let s = 1; s < 16; s++) {
        const t = s / 16;
        const pt = cubicAt(p0, p1, p2, p3, t);
        const d = dist2(pt, compPt);
        if (d < best.d2) best = { seg: i, t, d2: d };
      }
    }
    const threshComp = 12 / sX;
    if (best.seg >= 0 && best.d2 <= threshComp * threshComp) {
      addPathPoint(editLayer.id, best.seg, best.t);
    }
  };

  // Empty-space click in directSelect clears the point selection.
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.target !== overlayRef.current) return;
    if (activeTool === 'addPoint') { onAddPointDown(e); return; }
    if (activeTool === 'directSelect') {
      if (!e.shiftKey) selectVertices([]);
    }
  };

  const isPen = activeTool === 'pen';

  return (
    <div
      ref={overlayRef}
      style={{ ...style, cursor: 'crosshair', zIndex: 55, touchAction: 'none', userSelect: 'none' }}
      onPointerDown={isPen ? onPenPointerDown : onBackgroundDown}
      onPointerMove={isPen ? onPenPointerMove : onEditPointerMove}
      onPointerUp={isPen ? onPenPointerUp : onEditPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        width={overlayW}
        height={overlayH}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {isPen && <PenDraft draft={draft} cursor={cursor} toScreen={toScreen} hoverClose={hoverClose} />}
        {!isPen && editLayer && xform && (
          <PathAnchors
            layer={editLayer}
            toScreen={(p) => toScreen(localToComp(xform, p))}
            selectedVertices={selectedVertices}
            tool={activeTool}
            onAnchorDown={onEditAnchorDown}
            onHandleDown={onEditHandleDown}
          />
        )}
      </svg>
    </div>
  );
}

// ── Pen draft rendering ──
function PenDraft({
  draft, cursor, toScreen, hoverClose,
}: {
  draft: PathVertex[];
  cursor: Vec2 | null;
  toScreen: (p: Vec2) => Vec2;
  hoverClose: boolean;
}) {
  if (draft.length === 0 && !cursor) return null;

  const segPath = (a: PathVertex, b: PathVertex): string => {
    const p0 = toScreen(a.position);
    const p1 = toScreen([a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]]);
    const p2 = toScreen([b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]]);
    const p3 = toScreen(b.position);
    return `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`;
  };

  const last = draft[draft.length - 1];
  const previewEnd = cursor;

  return (
    <g>
      {draft.slice(0, -1).map((v, i) => (
        <path key={i} d={segPath(v, draft[i + 1])} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
      ))}

      {last && previewEnd && (
        <line
          x1={toScreen(last.position)[0]} y1={toScreen(last.position)[1]}
          x2={toScreen(previewEnd)[0]} y2={toScreen(previewEnd)[1]}
          stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
        />
      )}

      {draft.map((v, i) => {
        const sp = toScreen(v.position);
        const hOut = toScreen([v.position[0] + v.handleOut[0], v.position[1] + v.handleOut[1]]);
        const hIn = toScreen([v.position[0] + v.handleIn[0], v.position[1] + v.handleIn[1]]);
        const hasHandles = v.vertexType !== 'corner';
        const isFirst = i === 0;
        return (
          <g key={i}>
            {hasHandles && (
              <>
                <line x1={sp[0]} y1={sp[1]} x2={hOut[0]} y2={hOut[1]} stroke="#fbbf24" strokeWidth={1} />
                <line x1={sp[0]} y1={sp[1]} x2={hIn[0]} y2={hIn[1]} stroke="#fbbf24" strokeWidth={1} />
                <circle cx={hOut[0]} cy={hOut[1]} r={3} fill="#fbbf24" />
                <circle cx={hIn[0]} cy={hIn[1]} r={3} fill="#fbbf24" />
              </>
            )}
            <rect
              x={sp[0] - 4} y={sp[1] - 4} width={8} height={8}
              fill={isFirst && hoverClose ? '#22c55e' : '#fff'}
              stroke="#38bdf8" strokeWidth={1.5}
            />
          </g>
        );
      })}
    </g>
  );
}

// ── Anchor + handle rendering for point editing ──
function PathAnchors({
  layer, toScreen, selectedVertices, tool, onAnchorDown, onHandleDown,
}: {
  layer: PolygonLayer;
  toScreen: (p: Vec2) => Vec2;
  selectedVertices: number[];
  tool: string;
  onAnchorDown: (e: React.PointerEvent, index: number) => void;
  onHandleDown: (e: React.PointerEvent, index: number, side: HandleSide) => void;
}) {
  const verts = layer.shape.vertices;

  return (
    <g style={{ pointerEvents: 'auto' }}>
      {verts.map((v, i) => {
        const sp = toScreen(v.position);
        const selected = selectedVertices.includes(i);
        const showHandles = selected && v.vertexType !== 'corner' && tool === 'directSelect';
        const hOut = toScreen([v.position[0] + v.handleOut[0], v.position[1] + v.handleOut[1]]);
        const hIn = toScreen([v.position[0] + v.handleIn[0], v.position[1] + v.handleIn[1]]);

        let fill = '#fff';
        if (tool === 'deletePoint') fill = '#f87171';
        else if (tool === 'convertPoint') fill = '#fbbf24';
        else if (selected) fill = '#38bdf8';

        return (
          <g key={i}>
            {showHandles && (
              <>
                <line x1={sp[0]} y1={sp[1]} x2={hOut[0]} y2={hOut[1]} stroke="#fbbf24" strokeWidth={1} />
                <line x1={sp[0]} y1={sp[1]} x2={hIn[0]} y2={hIn[1]} stroke="#fbbf24" strokeWidth={1} />
                <circle
                  cx={hOut[0]} cy={hOut[1]} r={HANDLE_HIT / 2} fill="#fbbf24"
                  style={{ cursor: 'move', pointerEvents: 'auto' }}
                  onPointerDown={(e) => onHandleDown(e, i, 'out')}
                />
                <circle
                  cx={hIn[0]} cy={hIn[1]} r={HANDLE_HIT / 2} fill="#fbbf24"
                  style={{ cursor: 'move', pointerEvents: 'auto' }}
                  onPointerDown={(e) => onHandleDown(e, i, 'in')}
                />
              </>
            )}
            <rect
              x={sp[0] - ANCHOR_HIT / 2} y={sp[1] - ANCHOR_HIT / 2}
              width={ANCHOR_HIT} height={ANCHOR_HIT}
              fill={fill} stroke="#0ea5e9" strokeWidth={1.5}
              rx={v.vertexType === 'corner' ? 0 : ANCHOR_HIT / 2}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onPointerDown={(e) => onAnchorDown(e, i)}
            />
          </g>
        );
      })}
    </g>
  );
}
