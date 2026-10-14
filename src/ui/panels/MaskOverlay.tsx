import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import { useMaskStore } from '../../store/mask';
import { commitMaskPen } from '../../store/maskPen';
import type { Mask, Vec2, AnimatableProperty, PathVertex } from '../../core/types';
import { evaluateNumber, evaluateVec2 } from '../../core/interpolation';
import {
  isPathMask, maskPathAt, maskPathToComp, maskPathEditableAt, maskCompToLocal, maskVecToLocal,
  writeMaskPathAt, insertMaskVertex, setMaskVertexType, type MaskFrame,
} from '../../core/maskPath';
import { closestOnSegment } from '../../core/bend';
import { computeOppositeHandle, defaultHandleMode } from '../../core/tangent';

type HandleType =
  | 'move'
  | 'tl' | 'tr' | 'bl' | 'br'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'rotate';

const HANDLE_SIZE = 8;
const ROTATION_OFFSET = 24;
const YELLOW = 'rgba(250, 204, 21, 1)';
const INACTIVE_COLOR = 'rgba(148, 163, 184, 0.5)';

interface MaskOverlayProps {
  style?: React.CSSProperties;
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface MaskState {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

function getMaskState(mask: Mask, frame: number): MaskState {
  const pos = evaluateVec2(mask.position, frame);
  const size = evaluateVec2(mask.size, frame);
  return {
    x: pos[0],
    y: pos[1],
    w: Math.max(1, size[0]),
    h: Math.max(1, size[1]),
    rotation: evaluateNumber(mask.rotation, frame),
  };
}

// ── Freeform path masks (B10d-mask) ──

const ANCHOR_SIZE = 8;
const CLOSE_HIT = 11;
const PEN_DRAG_MIN = 3; // screen px before a pen press pulls handles (a click stays a corner)
const PEN_COLOR = '#38bdf8';

/** The mask's placement at `frame` (raw evaluated size - path outlines map through it unclamped). */
function maskFrameAt(mask: Mask, frame: number): MaskFrame {
  const pos = evaluateVec2(mask.position, frame);
  const size = evaluateVec2(mask.size, frame);
  return { cx: pos[0], cy: pos[1], sx: size[0], sy: size[1], rotation: evaluateNumber(mask.rotation, frame) };
}

/** SVG path data for a closed (or, while drawing, open) comp-space outline in screen space. */
function outlineD(verts: PathVertex[], sX: number, sY: number, closed: boolean): string {
  if (verts.length === 0) return '';
  const p = (x: number, y: number) => `${x * sX} ${y * sY}`;
  let d = `M ${p(verts[0].position[0], verts[0].position[1])}`;
  const segs = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    d += ` C ${p(a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1])} ${p(b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1])} ${p(b.position[0], b.position[1])}`;
  }
  return closed ? `${d} Z` : d;
}

function snap45(origin: Vec2, p: Vec2): Vec2 {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return p;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [origin[0] + Math.cos(a) * len, origin[1] + Math.sin(a) * len];
}

/** The mask pen: click for corners, drag for smooth points, close on the first point or Enter. */
function MaskPenLayer({ sX, sY }: { sX: number; sY: number }) {
  const draft = useMaskStore((s) => s.penDraft);
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ index: number; sx: number; sy: number; pulled: boolean } | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [hoverClose, setHoverClose] = useState(false);

  const toComp = (clientX: number, clientY: number): Vec2 => {
    const r = ref.current?.getBoundingClientRect();
    return r ? [(clientX - r.left) / sX, (clientY - r.top) / sY] : [0, 0];
  };
  const nearFirst = (p: Vec2, d: PathVertex[]) =>
    d.length >= 3 && Math.hypot((d[0].position[0] - p[0]) * sX, (d[0].position[1] - p[1]) * sY) <= CLOSE_HIT;

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = useMaskStore.getState().penDraft;
    let p = toComp(e.clientX, e.clientY);
    if (nearFirst(p, cur)) {
      commitMaskPen();
      return;
    }
    if (e.shiftKey && cur.length > 0) p = snap45(cur[cur.length - 1].position, p);
    useMaskStore.getState().setPenDraft([...cur, { position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }]);
    press.current = { index: cur.length, sx: e.clientX, sy: e.clientY, pulled: false };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toComp(e.clientX, e.clientY);
    setCursor(p);
    const pr = press.current;
    const cur = useMaskStore.getState().penDraft;
    if (pr && pr.index < cur.length) {
      if (!pr.pulled && Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) < PEN_DRAG_MIN) return;
      pr.pulled = true;
      const v = cur[pr.index];
      const hp = e.shiftKey ? snap45(v.position, p) : p;
      const out: Vec2 = [hp[0] - v.position[0], hp[1] - v.position[1]];
      const next = cur.slice();
      next[pr.index] = { ...v, handleOut: out, handleIn: [-out[0], -out[1]], vertexType: 'bezier' };
      useMaskStore.getState().setPenDraft(next);
      return;
    }
    setHoverClose(nearFirst(p, cur));
  };

  const onUp = (e: React.PointerEvent) => {
    if (!press.current) return;
    press.current = null;
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  const last = draft[draft.length - 1];
  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ pointerEvents: 'auto', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
        {draft.length > 1 && <path d={outlineD(draft, sX, sY, false)} fill="none" stroke={PEN_COLOR} strokeWidth={1.5} />}
        {last && cursor && (
          <line
            x1={last.position[0] * sX} y1={last.position[1] * sY}
            x2={(hoverClose ? draft[0].position[0] : cursor[0]) * sX} y2={(hoverClose ? draft[0].position[1] : cursor[1]) * sY}
            stroke={PEN_COLOR} strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
          />
        )}
        {draft.map((v, i) => {
          const x = v.position[0] * sX, y = v.position[1] * sY;
          const smooth = v.vertexType !== 'corner';
          return (
            <g key={i}>
              {smooth && (
                <>
                  <line x1={x} y1={y} x2={x + v.handleOut[0] * sX} y2={y + v.handleOut[1] * sY} stroke={YELLOW} strokeWidth={1} />
                  <line x1={x} y1={y} x2={x + v.handleIn[0] * sX} y2={y + v.handleIn[1] * sY} stroke={YELLOW} strokeWidth={1} />
                  <circle cx={x + v.handleOut[0] * sX} cy={y + v.handleOut[1] * sY} r={3} fill={YELLOW} />
                  <circle cx={x + v.handleIn[0] * sX} cy={y + v.handleIn[1] * sY} r={3} fill={YELLOW} />
                </>
              )}
              <rect
                x={x - ANCHOR_SIZE / 2} y={y - ANCHOR_SIZE / 2} width={ANCHOR_SIZE} height={ANCHOR_SIZE}
                fill={i === 0 && hoverClose ? '#22c55e' : '#fff'} stroke={PEN_COLOR} strokeWidth={1.5}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/70 px-2 py-1 text-[10px] text-slate-200 pointer-events-none whitespace-nowrap">
        Mask pen: click to add points, drag for curves. Click the first point or press Enter to close, Esc to cancel.
      </div>
    </div>
  );
}

type PathDrag =
  | { kind: 'anchor'; index: number; grab: Vec2 }
  | { kind: 'handle'; index: number; side: 'in' | 'out' };

/** Outline + anchors + tangent handles of the selected path mask, editable at the current frame. */
function PathMaskEditor({
  layerId, mask, frame, sX, sY, toComp, onOutlineDown,
}: {
  layerId: string;
  mask: Mask;
  frame: number;
  sX: number;
  sY: number;
  toComp: (clientX: number, clientY: number) => Vec2;
  onOutlineDown: (e: React.PointerEvent) => void;
}) {
  const selectedVertex = useMaskStore((s) => s.selectedVertex);
  const setSelectedVertex = useMaskStore((s) => s.setSelectedVertex);
  const patchMask = useEditorStore((s) => s.patchMask);
  const [drag, setDrag] = useState<PathDrag | null>(null);
  const snapshot = useRef<{ comp: ReturnType<typeof useEditorStore.getState>['composition']; sel: ReturnType<typeof useEditorStore.getState>['selection'] } | null>(null);

  const mf = maskFrameAt(mask, frame);
  const local = maskPathAt(mask, frame);
  const comp = maskPathToComp(local, mf);
  const editable = maskPathEditableAt(mask, frame);

  useEffect(() => {
    if (!drag) return;
    // Re-read the mask each move: the drag patches it, so a render-time closure would be stale.
    const freshMask = (): Mask | null => {
      const l = useEditorStore.getState().composition.layers.find((x) => x.id === layerId);
      return l && 'masks' in l && Array.isArray(l.masks) ? l.masks.find((m) => m.id === mask.id) ?? null : null;
    };
    const onMove = (e: PointerEvent) => {
      const m = freshMask();
      if (!m) return;
      const f = maskFrameAt(m, frame);
      const verts = maskPathAt(m, frame).map((v) => ({ ...v }));
      const v = verts[drag.index];
      if (!v) return;
      const p = toComp(e.clientX, e.clientY);
      if (drag.kind === 'anchor') {
        verts[drag.index] = { ...v, position: maskCompToLocal([p[0] - drag.grab[0], p[1] - drag.grab[1]], f) };
      } else {
        const anchorComp = maskPathToComp([v], f)[0].position;
        let tip = p;
        if (e.shiftKey) tip = snap45(anchorComp, p);
        const dragged = maskVecToLocal([tip[0] - anchorComp[0], tip[1] - anchorComp[1]], f);
        const mode = e.altKey ? 'independent' : v.handleMode ?? defaultHandleMode(v.vertexType);
        const opposite = computeOppositeHandle(mode, dragged, drag.side === 'out' ? v.handleIn : v.handleOut);
        verts[drag.index] = drag.side === 'out'
          ? { ...v, handleOut: dragged, ...(opposite ? { handleIn: opposite } : {}), vertexType: v.vertexType === 'corner' ? 'bezier' : v.vertexType }
          : { ...v, handleIn: dragged, ...(opposite ? { handleOut: opposite } : {}), vertexType: v.vertexType === 'corner' ? 'bezier' : v.vertexType };
      }
      patchMask(layerId, m.id, writeMaskPathAt(m, verts, frame));
    };
    const onUp = () => {
      useHistoryStore.getState().setBatching(false);
      if (snapshot.current) {
        useEditorStore.getState().commitDrag('Mask Path', snapshot.current.comp, snapshot.current.sel);
        snapshot.current = null;
      }
      setDrag(null);
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [drag, layerId, mask.id, frame, toComp, patchMask]);

  const begin = (e: React.PointerEvent, d: PathDrag) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useEditorStore.getState();
    snapshot.current = { comp: st.composition, sel: st.selection };
    useHistoryStore.getState().setBatching(true);
    document.body.style.userSelect = 'none';
    setDrag(d);
  };

  const onAnchorDown = (e: React.PointerEvent, i: number) => {
    setSelectedVertex(i);
    const p = toComp(e.clientX, e.clientY);
    begin(e, { kind: 'anchor', index: i, grab: [p[0] - comp[i].position[0], p[1] - comp[i].position[1]] });
  };

  const onAnchorDouble = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    const patch = setMaskVertexType(mask, i, local[i].vertexType === 'corner' ? 'smooth' : 'corner', frame);
    if (patch) patchMask(layerId, mask.id, patch, 'Convert Mask Vertex');
  };

  // Double-click the outline: split the nearest segment there (the shape is unchanged).
  const onOutlineDouble = (e: React.MouseEvent) => {
    e.stopPropagation();
    const p = toComp(e.clientX, e.clientY);
    let best = { seg: -1, t: 0, dist: Infinity };
    for (let s = 0; s < comp.length; s++) {
      const hit = closestOnSegment(p, comp[s], comp[(s + 1) % comp.length]);
      if (hit.dist < best.dist) best = { seg: s, t: hit.t, dist: hit.dist };
    }
    if (best.seg < 0) return;
    const patch = insertMaskVertex(mask, best.seg, best.t);
    if (!patch) return;
    patchMask(layerId, mask.id, patch, 'Add Mask Vertex');
    setSelectedVertex(best.seg + 1);
  };

  const d = outlineD(comp, sX, sY, true);
  const sel = selectedVertex !== null && selectedVertex < comp.length ? selectedVertex : null;
  return (
    <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke={YELLOW} strokeWidth={1.5} />
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: 'stroke', cursor: editable ? 'copy' : 'move' }}
        onPointerDown={onOutlineDown}
        onDoubleClick={editable ? onOutlineDouble : undefined}
      >
        <title>{editable ? 'Drag to move the mask, double-click to add a vertex' : 'Between path keyframes with different vertex counts: move to a keyframe to edit vertices'}</title>
      </path>
      {editable && sel !== null && (() => {
        const v = comp[sel];
        const x = v.position[0] * sX, y = v.position[1] * sY;
        const hasHandles = v.handleIn[0] !== 0 || v.handleIn[1] !== 0 || v.handleOut[0] !== 0 || v.handleOut[1] !== 0;
        if (!hasHandles) return null;
        const hx = (h: Vec2) => x + h[0] * sX;
        const hy = (h: Vec2) => y + h[1] * sY;
        return (
          <g>
            <line x1={x} y1={y} x2={hx(v.handleIn)} y2={hy(v.handleIn)} stroke={YELLOW} strokeWidth={1} />
            <line x1={x} y1={y} x2={hx(v.handleOut)} y2={hy(v.handleOut)} stroke={YELLOW} strokeWidth={1} />
            <circle cx={hx(v.handleIn)} cy={hy(v.handleIn)} r={4} fill={YELLOW} style={{ pointerEvents: 'auto', cursor: 'move' }} onPointerDown={(e) => begin(e, { kind: 'handle', index: sel, side: 'in' })} />
            <circle cx={hx(v.handleOut)} cy={hy(v.handleOut)} r={4} fill={YELLOW} style={{ pointerEvents: 'auto', cursor: 'move' }} onPointerDown={(e) => begin(e, { kind: 'handle', index: sel, side: 'out' })} />
          </g>
        );
      })()}
      {editable && comp.map((v, i) => {
        const x = v.position[0] * sX, y = v.position[1] * sY;
        return (
          <rect
            key={i}
            x={x - ANCHOR_SIZE / 2} y={y - ANCHOR_SIZE / 2} width={ANCHOR_SIZE} height={ANCHOR_SIZE}
            rx={local[i].vertexType === 'corner' ? 0 : ANCHOR_SIZE / 2}
            fill={i === sel ? YELLOW : '#fff'} stroke={YELLOW} strokeWidth={1.5}
            style={{ pointerEvents: 'auto', cursor: drag?.kind === 'anchor' && drag.index === i ? 'grabbing' : 'pointer' }}
            onPointerDown={(e) => onAnchorDown(e, i)}
            onDoubleClick={(e) => onAnchorDouble(e, i)}
          >
            <title>Drag to move, double-click for corner / smooth, Delete to remove</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function MaskOverlay({ style }: MaskOverlayProps) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const updateMaskProperty = useEditorStore((s) => s.updateMaskProperty);
  const addMaskKeyframe = useEditorStore((s) => s.addMaskKeyframe);
  const selectedMaskId = useMaskStore((s) => s.selectedMaskId);
  const setSelectedMaskId = useMaskStore((s) => s.setSelectedMaskId);
  const penLayerId = useMaskStore((s) => s.penLayerId);

  const overlayRef = useRef<HTMLDivElement>(null);
  const overlaySize = useElementSize(overlayRef);
  const [dragging, setDragging] = useState<HandleType | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleType | null>(null);

  const dragStart = useRef({ mx: 0, my: 0, state: null as MaskState | null });
  const dragSnapshot = useRef<{ comp: typeof composition; sel: typeof selection } | null>(null);

  const activeLayer = composition.layers.find((l) => l.id === selection.activeId) || null;
  const masks: Mask[] =
    activeLayer && 'masks' in activeLayer && Array.isArray(activeLayer.masks) ? activeLayer.masks : [];
  const mask = masks.find((m) => m.id === selectedMaskId) ?? null;

  const compW = composition.settings.width;
  const compH = composition.settings.height;
  const sX = overlaySize.width > 0 ? overlaySize.width / compW : 0;
  const sY = overlaySize.height > 0 ? overlaySize.height / compH : 0;

  const getState = useCallback((): MaskState | null => {
    if (!mask) return null;
    return getMaskState(mask, currentFrame);
  }, [mask, currentFrame]);

  const setMaskAnimatable = useCallback(
    (prop: AnimatableProperty, propPath: string, value: number | Vec2) => {
      if (!activeLayer || !mask) return;
      if (prop.keyframes.length > 0) {
        addMaskKeyframe(activeLayer.id, mask.id, propPath, currentFrame, value as number | [number, number]);
      } else {
        updateMaskProperty(activeLayer.id, mask.id, `${propPath}.defaultValue`, value);
      }
    },
    [activeLayer, mask, currentFrame, addMaskKeyframe, updateMaskProperty]
  );

  const toScreen = useCallback((cx: number, cy: number): [number, number] => [cx * sX, cy * sY], [sX, sY]);

  const toComp = useCallback((clientX: number, clientY: number): Vec2 => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (!r || sX === 0 || sY === 0) return [0, 0];
    return [(clientX - r.left) / sX, (clientY - r.top) / sY];
  }, [sX, sY]);

  // The mask pen belongs to one layer: selecting another layer (or deleting it) ends the draft.
  const penActive = !!penLayerId && penLayerId === activeLayer?.id;
  useEffect(() => {
    if (penLayerId && penLayerId !== selection.activeId) useMaskStore.getState().stopMaskPen();
  }, [penLayerId, selection.activeId]);

  const startDrag = useCallback(
    (e: React.PointerEvent, handle: HandleType) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const state = getState();
      if (!state) return;
      useMaskStore.getState().setSelectedVertex(null);
      dragStart.current = { mx: e.clientX, my: e.clientY, state };
      dragSnapshot.current = { comp: composition, sel: selection };
      useHistoryStore.getState().setBatching(true);
      setDragging(handle);
      document.body.style.userSelect = 'none';
    },
    [getState, composition, selection]
  );

  useEffect(() => {
    if (!dragging || !mask) return;

    const handleMove = (e: PointerEvent) => {
      const { state, mx: startMx, my: startMy } = dragStart.current;
      if (!state || !activeLayer || sX === 0 || sY === 0) return;

      const dx = (e.clientX - startMx) / sX;
      const dy = (e.clientY - startMy) / sY;
      const shiftHeld = e.shiftKey;

      if (dragging === 'move') {
        setMaskAnimatable(mask.position, 'position', [state.x + dx, state.y + dy] as Vec2);
      } else if (dragging === 'rotate') {
        const [scx, scy] = toScreen(state.x, state.y);
        const el = overlayRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const absPivotX = rect.left + scx;
        const absPivotY = rect.top + scy;
        const startAngle = Math.atan2(startMy - absPivotY, startMx - absPivotX);
        const currentAngle = Math.atan2(e.clientY - absPivotY, e.clientX - absPivotX);
        let angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
        if (shiftHeld) angleDelta = Math.round(angleDelta / 15) * 15;
        setMaskAnimatable(mask.rotation, 'rotation', state.rotation + angleDelta);
      } else {
        let newW = state.w;
        let newH = state.h;
        let newX = state.x;
        let newY = state.y;

        switch (dragging) {
          case 'tr':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'tl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'br':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'bl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'top':
            newH = Math.max(1, state.h - dy);
            newY = state.y + dy / 2;
            break;
          case 'bottom':
            newH = Math.max(1, state.h + dy);
            newY = state.y + dy / 2;
            break;
          case 'left':
            newW = Math.max(1, state.w - dx);
            newX = state.x + dx / 2;
            break;
          case 'right':
            newW = Math.max(1, state.w + dx);
            newX = state.x + dx / 2;
            break;
        }

        if (shiftHeld && ['tl', 'tr', 'bl', 'br'].includes(dragging)) {
          const aspect = state.w / state.h;
          if (newW / newH > aspect) newW = newH * aspect;
          else newH = newW / aspect;
        }

        setMaskAnimatable(mask.size, 'size', [newW, newH] as Vec2);
        setMaskAnimatable(mask.position, 'position', [newX, newY] as Vec2);
      }
    };

    const handleUp = () => {
      useHistoryStore.getState().setBatching(false);
      if (dragSnapshot.current) {
        useEditorStore.getState().commitDrag('Mask', dragSnapshot.current.comp, dragSnapshot.current.sel);
        dragSnapshot.current = null;
      }
      setDragging(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, mask, activeLayer, sX, sY, toScreen, setMaskAnimatable]);

  const getCursor = (handle: HandleType): string => {
    switch (handle) {
      case 'tl':
      case 'br':
        return 'nwse-resize';
      case 'tr':
      case 'bl':
        return 'nesw-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
      case 'rotate':
        return 'crosshair';
      case 'move':
        return 'move';
      default:
        return 'default';
    }
  };

  if ((masks.length === 0 && !penActive) || sX === 0 || sY === 0) {
    return <div ref={overlayRef} style={{ ...style, pointerEvents: 'none' }} />;
  }

  const selectedState = mask ? getMaskState(mask, currentFrame) : null;
  const selectedIsPath = !!mask && isPathMask(mask);

  return (
    <div ref={overlayRef} style={{ ...style, pointerEvents: 'none', ...(penActive ? { zIndex: 56 } : {}) }}>
      {/* Render inactive mask outlines */}
      {masks.map((m) => {
        if (m.id === selectedMaskId) return null;
        if (m.enabled === false) return null;
        if (isPathMask(m)) {
          const d = outlineD(maskPathToComp(maskPathAt(m, currentFrame), maskFrameAt(m, currentFrame)), sX, sY, true);
          return (
            <svg key={m.id} className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
              <path d={d} fill="none" stroke={INACTIVE_COLOR} strokeWidth={1} strokeDasharray="4 3" />
              <path
                d={d} fill="none" stroke="transparent" strokeWidth={10}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={(e) => { e.stopPropagation(); setSelectedMaskId(m.id); }}
              />
            </svg>
          );
        }
        const s = getMaskState(m, currentFrame);
        const [cx, cy] = toScreen(s.x, s.y);
        const sw = s.w * sX;
        const sh = s.h * sY;
        return (
          <div key={m.id} className="absolute" style={{ left: cx, top: cy, width: 0, height: 0 }}>
            <div
              className="absolute pointer-events-auto"
              style={{
                left: -sw / 2,
                top: -sh / 2,
                width: sw,
                height: sh,
                transform: `rotate(${s.rotation}deg)`,
                transformOrigin: `${sw / 2}px ${sh / 2}px`,
                border: `1px dashed ${INACTIVE_COLOR}`,
                cursor: 'pointer',
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedMaskId(m.id);
              }}
            />
          </div>
        );
      })}

      {/* Render active mask with handles */}
      {mask && selectedState && (() => {
        const { x, y, w, h, rotation } = selectedState;
        const [centerSX, centerSY] = toScreen(x, y);
        const sw = w * sX;
        const sh = h * sY;

        const handles: { id: HandleType; cx: number; cy: number }[] = [
          { id: 'tl', cx: -sw / 2, cy: -sh / 2 },
          { id: 'tr', cx: sw / 2, cy: -sh / 2 },
          { id: 'bl', cx: -sw / 2, cy: sh / 2 },
          { id: 'br', cx: sw / 2, cy: sh / 2 },
          { id: 'top', cx: 0, cy: -sh / 2 },
          { id: 'bottom', cx: 0, cy: sh / 2 },
          { id: 'left', cx: -sw / 2, cy: 0 },
          { id: 'right', cx: sw / 2, cy: 0 },
        ];

        return (
          <div className="absolute" style={{ left: centerSX, top: centerSY, width: 0, height: 0 }}>
            <div
              className="absolute"
              style={{
                left: -sw / 2,
                top: -sh / 2,
                width: sw,
                height: sh,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: `${sw / 2}px ${sh / 2}px`,
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ border: selectedIsPath ? `1px dashed ${INACTIVE_COLOR}` : `1.5px dashed ${YELLOW}` }}
              />

              <div
                className="absolute inset-0 pointer-events-auto"
                style={{ cursor: dragging === 'move' ? 'grabbing' : 'move' }}
                onPointerDown={(e) => startDrag(e, 'move')}
              />

              {handles.map(({ id, cx, cy }) => {
                const isCorner = ['tl', 'tr', 'bl', 'br'].includes(id);
                const size = isCorner ? HANDLE_SIZE : HANDLE_SIZE - 2;
                const hitSize = size + 8;
                const isHovered = hoverHandle === id;
                return (
                  <div
                    key={id}
                    className="absolute pointer-events-auto flex items-center justify-center"
                    style={{
                      left: sw / 2 + cx - hitSize / 2,
                      top: sh / 2 + cy - hitSize / 2,
                      width: hitSize,
                      height: hitSize,
                      cursor: getCursor(id),
                    }}
                    onPointerDown={(e) => startDrag(e, id)}
                    onPointerEnter={() => setHoverHandle(id)}
                    onPointerLeave={() => setHoverHandle(null)}
                  >
                    <div
                      style={{
                        width: size,
                        height: size,
                        backgroundColor: '#fff',
                        borderColor: YELLOW,
                        boxShadow: '0 0 4px rgba(250, 204, 21, 0.5)',
                      }}
                      className={`rounded-sm border-2 transition-transform duration-75 ${isHovered ? 'scale-[1.4]' : ''}`}
                    />
                  </div>
                );
              })}

              <div
                className="absolute pointer-events-none"
                style={{
                  left: sw / 2 - 0.5,
                  top: -ROTATION_OFFSET,
                  width: 1,
                  height: ROTATION_OFFSET,
                  background: 'rgba(250, 204, 21, 0.6)',
                }}
              />
              <div
                className="absolute pointer-events-auto"
                style={{ left: sw / 2 - 6, top: -ROTATION_OFFSET - 6, width: 12, height: 12, cursor: 'crosshair' }}
                onPointerDown={(e) => startDrag(e, 'rotate')}
                onPointerEnter={() => setHoverHandle('rotate')}
                onPointerLeave={() => setHoverHandle(null)}
              >
                <div
                  style={{ borderColor: YELLOW }}
                  className={`w-full h-full rounded-full border-2 transition-transform duration-75 ${
                    hoverHandle === 'rotate' ? 'bg-yellow-400/60 scale-[1.3]' : 'bg-yellow-400/30'
                  }`}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Selected path mask (B10d-mask): outline, anchors and tangent handles above the box. */}
      {mask && selectedIsPath && activeLayer && mask.enabled !== false && (
        <PathMaskEditor
          layerId={activeLayer.id}
          mask={mask}
          frame={currentFrame}
          sX={sX}
          sY={sY}
          toComp={toComp}
          onOutlineDown={(e) => startDrag(e, 'move')}
        />
      )}

      {penActive && <MaskPenLayer sX={sX} sY={sY} />}
    </div>
  );
}
