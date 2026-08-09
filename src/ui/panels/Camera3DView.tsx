import { useRef, useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import type { CameraLayer, AnimatableProperty, Vec2, InterpolationType } from '../../core/types';
import { evaluateProperty } from '../../core/interpolation';
import { getWorldPosition } from '../../core/sceneGraph';
import { fovYForZoom, compMeasureDim, fStopForAperture } from '../../core/camera3d';
import { CameraSettingsDialog } from './CameraSettingsDialog';

// AE-style 3D VIEW: an orthographic schematic of the scene where the camera lives in the world
// beside the 3D layers, and you drag it (and its Point of Interest) to place it — Top (X→Z) or
// Side (Z→Y), switchable. Pure SVG over the harness-verified camera math (no WebGPU). Dragging
// writes the camera transform, so the main canvas updates live. Shown in the inspector when a
// camera is selected.
//
// UX: full-width Top/Side tabs; DOUBLE-CLICK the camera opens Camera Settings (no button — more
// canvas); a precision drag mode (moves slower than the pointer) for fine placement; aperture
// (mm) drag handles that mirror each other; and a full CAMERA-PATH KEYFRAME editor — a rhombus
// that follows the camera to key its position, world-anchored keyframe markers, a dotted preview
// / solid path line, right-click a segment for Straight / Curved / Hold, and a bend handle on
// curved segments that inserts a mid keyframe to shape the parabola.

type Axis = 'x' | 'y' | 'z';
interface Pt3 { x: number; y: number; z: number }
const AX = (p: Pt3, a: Axis): number => (a === 'x' ? p.x : a === 'y' ? p.y : p.z);

interface CamKf { frame: number; x: number; y: number; z: number; interp: InterpolationType }

// Precision factor: world moves at 40% of the pointer's schematic speed so placement is fine,
// not twitchy (the "dragging mode" — slower while you drag).
const DRAG_PRECISION = 0.4;
const PATH_SAMPLES = 96;

export function Camera3DView({ layer }: { layer: CameraLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const deleteKeyframes = useEditorStore((s) => s.deleteKeyframes);
  const setKeyframeInterpolation = useEditorStore((s) => s.setKeyframeInterpolation);
  const composition = useEditorStore((s) => s.composition);
  const frame = useTimelineStore((s) => s.currentFrame);
  const seekTo = useTimelineStore((s) => s.seekTo);
  const [view, setView] = useState<'top' | 'side'>('top');
  const [showSettings, setShowSettings] = useState(false);

  const W = composition.settings.width;
  const H = composition.settings.height;
  const cam = layer.camera;
  const hasZ = !!layer.transform.positionZ;

  const n = (p: AnimatableProperty) => evaluateProperty(p, frame) as number;
  const v2 = (p: AnimatableProperty) => evaluateProperty(p, frame) as Vec2;

  const pos = v2(layer.transform.position);
  const zAt = (f: number) => (layer.transform.positionZ ? (evaluateProperty(layer.transform.positionZ, f) as number) : -H);
  const eye: Pt3 = { x: pos[0], y: pos[1], z: hasZ ? n(layer.transform.positionZ!) : -H };
  const poiXY = v2(cam.pointOfInterest);
  const poi: Pt3 = { x: poiXY[0], y: poiXY[1], z: n(cam.pointOfInterestZ) };
  const zoom = n(cam.zoom);
  const fov = fovYForZoom(zoom, H);

  // Aperture in mm: px → mm scales by filmSize / C (sensor mm per comp px). Mirrors the dialog.
  const C = compMeasureDim(cam.measureFilmSize ?? 'horizontal', W, H);
  const filmSize = cam.filmSize ?? 36;
  const aperturePx = n(cam.aperture);
  const apertureMm = (aperturePx * filmSize) / C;
  const fStop = fStopForAperture(zoom, aperturePx);

  // ── Camera-path keyframes (position x/y + z), sorted by frame ──
  const posKfs = layer.transform.position.keyframes;
  const kfFrames = Array.from(new Set(posKfs.map((k) => k.frame))).sort((a, b) => a - b);
  const camKfs: CamKf[] = kfFrames.map((f) => {
    const p = evaluateProperty(layer.transform.position, f) as Vec2;
    const kf = posKfs.find((k) => k.frame === f)!;
    return { frame: f, x: p[0], y: p[1], z: zAt(f), interp: kf.interpolation };
  });
  const hasKfAtCurrent = posKfs.some((k) => k.frame === frame);
  // The real, evaluated path (matches the render exactly — straight for linear, curved for bezier
  // across 3+ keys), sampled across the full keyframe span.
  const pathPts: Pt3[] = [];
  if (camKfs.length >= 2) {
    const f0 = camKfs[0].frame, f1 = camKfs[camKfs.length - 1].frame;
    for (let i = 0; i <= PATH_SAMPLES; i++) {
      const ff = f0 + ((f1 - f0) * i) / PATH_SAMPLES;
      const p = evaluateProperty(layer.transform.position, ff) as Vec2;
      pathPts.push({ x: p[0], y: p[1], z: zAt(ff) });
    }
  }

  const layers = composition.layers
    .filter((l) => l.is3D && l.type !== 'camera' && l.type !== 'group' && l.type !== 'audio' && frame >= l.inPoint && frame < l.outPoint)
    .map((l) => {
      const wp = getWorldPosition(l, composition.layers, frame);
      const z = l.transform.positionZ ? (evaluateProperty(l.transform.positionZ, frame) as number) : 0;
      return { id: l.id, name: l.name, x: wp[0], y: wp[1], z };
    });

  // Keyframe-aware write: update the keyframe at the playhead for an animated prop, else its base.
  const write = (prop: AnimatableProperty, path: string, value: number | Vec2) => {
    if (prop.keyframes.length > 0) addKeyframe(layer.id, path, frame, value);
    else updateLayerProperty(layer.id, `${path}.defaultValue`, value);
  };
  const setEye = (a: Axis, val: number) => {
    if (a === 'z') { if (layer.transform.positionZ) write(layer.transform.positionZ, 'transform.positionZ', val); }
    else write(layer.transform.position, 'transform.position', a === 'x' ? [val, eye.y] : [eye.x, val]);
  };
  const setPoi = (a: Axis, val: number) => {
    if (a === 'z') write(cam.pointOfInterestZ, 'camera.pointOfInterestZ', val);
    else write(cam.pointOfInterest, 'camera.pointOfInterest', a === 'x' ? [val, poi.y] : [poi.x, val]);
  };
  const setApertureMm = (mm: number) => write(cam.aperture, 'camera.aperture', (Math.max(0.1, mm) * C) / filmSize);

  // ── Keyframe actions ──
  const posZTargets = (f: number) => {
    const t: { propertyPath: string; frame: number }[] = [{ propertyPath: 'transform.position', frame: f }];
    if (layer.transform.positionZ) t.push({ propertyPath: 'transform.positionZ', frame: f });
    return t;
  };
  const toggleKeyframe = () => {
    if (hasKfAtCurrent) { deleteKeyframes(layer.id, posZTargets(frame)); return; }
    addKeyframe(layer.id, 'transform.position', frame, [eye.x, eye.y]);
    if (layer.transform.positionZ) addKeyframe(layer.id, 'transform.positionZ', frame, eye.z);
  };
  const deleteKeyframeAt = (f: number) => deleteKeyframes(layer.id, posZTargets(f));
  const setSegmentInterp = (fromFrame: number, type: InterpolationType) =>
    setKeyframeInterpolation(layer.id, posZTargets(fromFrame), type);
  // Write a single axis at an ARBITRARY frame (used by the bend handle to insert/shape a mid key).
  const writeAxisAtFrame = (targetFrame: number, a: Axis, val: number) => {
    if (a === 'z') { if (layer.transform.positionZ) addKeyframe(layer.id, 'transform.positionZ', targetFrame, val); return; }
    const p = evaluateProperty(layer.transform.position, targetFrame) as Vec2;
    addKeyframe(layer.id, 'transform.position', targetFrame, a === 'x' ? [val, p[1]] : [p[0], val]);
  };

  const common = { W, H, eye, poi, fov, apertureMm, fStop, layers, camKfs, pathPts, currentFrame: frame,
    hasKfAtCurrent, onAperture: setApertureMm, onOpenSettings: () => setShowSettings(true),
    onToggleKeyframe: toggleKeyframe, onDeleteKeyframe: deleteKeyframeAt, onSetSegmentInterp: setSegmentInterp,
    onSeek: seekTo };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#1c2433]">
        <Video size={12} className="text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-medium text-slate-300">3D View</span>
        <span className="ml-auto text-[10px] text-slate-500">Double-click camera for settings</span>
      </div>
      {/* Full-width Top / Side switcher — big + obvious. */}
      <div className="flex border-b border-[#1c2433]">
        {(['top', 'side'] as const).map((vw) => (
          <button key={vw} onClick={() => setView(vw)}
            className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${view === vw ? 'bg-[#f7b500] text-[#0a0f16]' : 'bg-[#0b1220] text-slate-400 hover:text-slate-200'}`}>
            {vw === 'top' ? 'Top' : 'Side'}
          </button>
        ))}
      </div>
      <div className="relative h-[400px] bg-[#0e1420]">
        {view === 'top'
          ? <OrthoView {...common} label="Top · X → Z (depth)" hAxis="x" vAxis="z"
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('x', h); set('z', v); }}
              onBend={(mf, h, v) => { writeAxisAtFrame(mf, 'x', h); writeAxisAtFrame(mf, 'z', v); }} />
          : <OrthoView {...common} label="Side · Z (depth) → Y" hAxis="z" vAxis="y"
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('z', h); set('y', v); }}
              onBend={(mf, h, v) => { writeAxisAtFrame(mf, 'z', h); writeAxisAtFrame(mf, 'y', v); }} />}
      </div>
      {showSettings && <CameraSettingsDialog layer={layer} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// Screen-radius mapping for the aperture iris handles.
const AP_MIN_R = 44, AP_MAX_R = 172, AP_PX_PER_MM = 5;
const apertureToR = (mm: number) => Math.min(AP_MAX_R, AP_MIN_R + Math.max(0, mm) * AP_PX_PER_MM);
const rToAperture = (r: number) => (Math.min(AP_MAX_R, Math.max(AP_MIN_R, r)) - AP_MIN_R) / AP_PX_PER_MM;

type DragKind = 'cam' | 'poi' | 'apA' | 'apB' | 'bend';
interface Menu { x: number; y: number; kind: 'segment' | 'keyframe'; frame: number }

// distance from point P to segment AB (screen px)
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function OrthoView({ label, hAxis, vAxis, W, H, eye, poi, fov, apertureMm, fStop, layers, camKfs, pathPts, currentFrame,
  hasKfAtCurrent, onDrag, onAperture, onOpenSettings, onToggleKeyframe, onDeleteKeyframe, onSetSegmentInterp, onSeek, onBend }: {
  label: string; hAxis: Axis; vAxis: Axis; W: number; H: number;
  eye: Pt3; poi: Pt3; fov: number; apertureMm: number; fStop: number;
  layers: { id: string; name: string; x: number; y: number; z: number }[];
  camKfs: CamKf[]; pathPts: Pt3[]; currentFrame: number; hasKfAtCurrent: boolean;
  onDrag: (who: 'cam' | 'poi', hVal: number, vVal: number) => void;
  onAperture: (mm: number) => void;
  onOpenSettings: () => void;
  onToggleKeyframe: () => void;
  onDeleteKeyframe: (frame: number) => void;
  onSetSegmentInterp: (fromFrame: number, type: InterpolationType) => void;
  onSeek: (frame: number) => void;
  onBend: (midFrame: number, hVal: number, vVal: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragKind | null>(null);
  const bendFrame = useRef<number>(0);
  const anchor = useRef<{ mx: number; my: number; h: number; v: number } | null>(null);
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
  const [menu, setMenu] = useState<Menu | null>(null);

  const [box, setBox] = useState({ w: 300, h: 400 });
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const update = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const EW = box.w, EH = box.h;
  const PAD = 46;

  const compExtent: Record<Axis, [number, number]> = { x: [0, W], y: [0, H], z: [0, 0] };
  const extra = [...layers, ...camKfs] as Pt3[];
  const hs = [...compExtent[hAxis], AX(eye, hAxis), AX(poi, hAxis), ...extra.map((l) => AX(l, hAxis))];
  const vs = [...compExtent[vAxis], AX(eye, vAxis), AX(poi, vAxis), ...extra.map((l) => AX(l, vAxis))];
  const minH = Math.min(...hs), maxH = Math.max(...hs), minV = Math.min(...vs), maxV = Math.max(...vs);
  const spanH = maxH - minH || 1, spanV = maxV - minV || 1;
  const scale = Math.min((EW - 2 * PAD) / spanH, (EH - 2 * PAD) / spanV);
  const oX = (EW - spanH * scale) / 2, oY = (EH - spanV * scale) / 2;
  const sx = (h: number) => oX + (h - minH) * scale;
  const sy = (v: number) => oY + (v - minV) * scale;
  const sxp = (p: Pt3) => sx(AX(p, hAxis));
  const syp = (p: Pt3) => sy(AX(p, vAxis));

  const eyeH = AX(eye, hAxis), eyeV = AX(eye, vAxis), poiH = AX(poi, hAxis), poiV = AX(poi, vAxis);
  const compPts = [{ x: 0, y: 0, z: 0 }, { x: W, y: 0, z: 0 }, { x: W, y: H, z: 0 }, { x: 0, y: H, z: 0 }]
    .map((c) => `${sx(AX(c, hAxis))},${sy(AX(c, vAxis))}`).join(' ');

  const dh = poiH - eyeH, dv = poiV - eyeV;
  const len = Math.hypot(dh, dv) || 1;
  const ux = dh / len, uy = dv / len;
  const rotv = (a: number): [number, number] => [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)];
  const [f1x, f1y] = rotv(fov / 2); const [f2x, f2y] = rotv(-fov / 2);
  const fl = len * 1.35 * scale;

  const perpOk = Math.hypot(dh, dv) > 1e-3;
  const px = perpOk ? -uy : 1, py = perpOk ? ux : 0;
  const camSx = sx(eyeH), camSy = sy(eyeV);
  const apR = apertureToR(apertureMm);
  const apAx = camSx + px * apR, apAy = camSy + py * apR;
  const apBx = camSx - px * apR, apBy = camSy - py * apR;

  // Keyframe screen points + bend handles (mid-frame of each curved segment).
  const kfScreen = camKfs.map((k) => ({ frame: k.frame, x: sxp(k), y: syp(k), current: k.frame === currentFrame }));
  const bends = camKfs.slice(0, -1).map((k, i) => {
    const b = camKfs[i + 1];
    const mid = Math.round((k.frame + b.frame) / 2);
    if (mid <= k.frame || mid >= b.frame || k.interp !== 'bezier') return null;
    // Screen position from the sampled path at the mid fraction (matches the rendered curve).
    const frac = (mid - camKfs[0].frame) / (camKfs[camKfs.length - 1].frame - camKfs[0].frame);
    const si = Math.max(0, Math.min(pathPts.length - 1, Math.round(frac * (pathPts.length - 1))));
    const sp = pathPts[si];
    return { frame: mid, x: sxp(sp), y: syp(sp) };
  }).filter(Boolean) as { frame: number; x: number; y: number }[];

  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const near = (mx: number, my: number, tx: number, ty: number, r: number) => Math.hypot(mx - tx, my - ty) < r;
  const HIT = 30, AP_HIT = 15, BEND_HIT = 14, KF_HIT = 13;

  const hitTest = (mx: number, my: number): { kind: DragKind; frame?: number } | null => {
    if (near(mx, my, sx(poiH), sy(poiV), HIT)) return { kind: 'poi' };
    if (near(mx, my, apAx, apAy, AP_HIT)) return { kind: 'apA' };
    if (near(mx, my, apBx, apBy, AP_HIT)) return { kind: 'apB' };
    for (const b of bends) if (near(mx, my, b.x, b.y, BEND_HIT)) return { kind: 'bend', frame: b.frame };
    if (near(mx, my, camSx, camSy, HIT)) return { kind: 'cam' };
    return null;
  };

  const down = (e: React.PointerEvent) => {
    if (menu) setMenu(null);
    const [mx, my] = toLocal(e.clientX, e.clientY);
    const hit = hitTest(mx, my);
    if (!hit) return;
    drag.current = hit.kind;
    if (hit.kind === 'cam') anchor.current = { mx, my, h: eyeH, v: eyeV };
    else if (hit.kind === 'poi') anchor.current = { mx, my, h: poiH, v: poiV };
    else if (hit.kind === 'bend') { bendFrame.current = hit.frame!; anchor.current = { mx, my, h: minH + (mx - oX) / scale, v: minV + (my - oY) / scale }; }
    else anchor.current = { mx, my, h: 0, v: 0 };
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setCursor('grabbing');
    useHistoryStore.getState().setBatching(true);
  };
  const move = (e: React.PointerEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    const k = drag.current;
    if (k === 'apA' || k === 'apB') {
      const sign = k === 'apA' ? 1 : -1;
      const r = (mx - camSx) * px * sign + (my - camSy) * py * sign;
      onAperture(rToAperture(r));
      return;
    }
    if ((k === 'cam' || k === 'poi') && anchor.current) {
      const a = anchor.current;
      onDrag(k, a.h + ((mx - a.mx) / scale) * DRAG_PRECISION, a.v + ((my - a.my) / scale) * DRAG_PRECISION);
      return;
    }
    if (k === 'bend' && anchor.current) {
      const a = anchor.current;
      onBend(bendFrame.current, a.h + ((mx - a.mx) / scale) * DRAG_PRECISION, a.v + ((my - a.my) / scale) * DRAG_PRECISION);
      return;
    }
    const h = hitTest(mx, my);
    setCursor(h ? 'grab' : 'default');
  };
  const up = () => { if (drag.current) { drag.current = null; anchor.current = null; useHistoryStore.getState().setBatching(false); } setCursor('default'); };
  const dblclick = (e: React.MouseEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    if (near(mx, my, camSx, camSy, HIT)) onOpenSettings();
  };
  const context = (e: React.MouseEvent) => {
    e.preventDefault();
    const [mx, my] = toLocal(e.clientX, e.clientY);
    // A keyframe marker first (delete), then a path segment (interp).
    for (const k of kfScreen) if (near(mx, my, k.x, k.y, KF_HIT)) { setMenu({ x: mx, y: my, kind: 'keyframe', frame: k.frame }); return; }
    for (let i = 0; i < camKfs.length - 1; i++) {
      const a = kfScreen[i], b = kfScreen[i + 1];
      if (segDist(mx, my, a.x, a.y, b.x, b.y) < 14) { setMenu({ x: mx, y: my, kind: 'segment', frame: camKfs[i].frame }); return; }
    }
    setMenu(null);
  };

  const pathD = pathPts.length ? pathPts.map((p, i) => `${i ? 'L' : 'M'}${sxp(p).toFixed(1)},${syp(p).toFixed(1)}`).join(' ') : '';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider z-10 pointer-events-none">{label}</span>
      <span className="absolute top-1.5 right-2 text-[10px] font-mono text-amber-400/80 z-10 pointer-events-none">
        {apertureMm.toFixed(1)}mm · f/{fStop.toFixed(1)}
      </span>
      <svg ref={svgRef} viewBox={`0 0 ${EW} ${EH}`} preserveAspectRatio="none" className="w-full h-full" style={{ cursor, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onDoubleClick={dblclick} onContextMenu={context}>
        {/* comp plane (z=0) */}
        <polygon points={compPts} fill="#1e3a5f" fillOpacity={0.3} stroke="#38bdf8" strokeWidth={2} />
        {/* 3D layers */}
        {layers.map((l) => (
          <g key={l.id}>
            <rect x={sx(AX(l, hAxis)) - 6} y={sy(AX(l, vAxis)) - 6} width={12} height={12} rx={2} fill="#3b82f6" fillOpacity={0.85} stroke="#93c5fd" strokeWidth={1} />
            <text x={sx(AX(l, hAxis))} y={sy(AX(l, vAxis)) - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">{l.name.slice(0, 10)}</text>
          </g>
        ))}

        {/* ── Camera path ── */}
        {/* Solid, evaluated path through 2+ keyframes. */}
        {pathD && <path d={pathD} fill="none" stroke="#f7b500" strokeWidth={2} opacity={0.9} />}
        {/* Dotted "possible path" preview from the live camera to the lone keyframe. */}
        {camKfs.length === 1 && (
          <line x1={camSx} y1={camSy} x2={sxp(camKfs[0])} y2={syp(camKfs[0])} stroke="#f7b500" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} />
        )}
        {/* Bend handles on curved segments (drag to shape the parabola — inserts a mid keyframe). */}
        {bends.map((b) => (
          <circle key={`b${b.frame}`} cx={b.x} cy={b.y} r={5} fill="#0e1420" stroke="#fbbf24" strokeWidth={2} strokeDasharray="2 2" />
        ))}
        {/* Keyframe markers — world-anchored; click to seek, right-click for options. */}
        {kfScreen.map((k) => (
          <g key={`k${k.frame}`} style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSeek(k.frame); }}>
            <rect x={k.x - 6} y={k.y - 6} width={12} height={12} transform={`rotate(45 ${k.x} ${k.y})`}
              fill={k.current ? '#f7b500' : '#0e1420'} stroke="#f7b500" strokeWidth={2} />
          </g>
        ))}

        {/* frustum + look line */}
        <line x1={camSx} y1={camSy} x2={camSx + f1x * fl} y2={camSy + f1y * fl} stroke="#f7b500" strokeWidth={1.5} opacity={0.55} />
        <line x1={camSx} y1={camSy} x2={camSx + f2x * fl} y2={camSy + f2y * fl} stroke="#f7b500" strokeWidth={1.5} opacity={0.55} />
        <line x1={camSx} y1={camSy} x2={sx(poiH)} y2={sy(poiV)} stroke="#f7b500" strokeWidth={1} strokeDasharray="6 4" opacity={0.7} />
        {/* Point of Interest */}
        <g>
          <circle cx={sx(poiH)} cy={sy(poiV)} r={9} fill="#0e1420" stroke="#22d3ee" strokeWidth={2} />
          <line x1={sx(poiH) - 13} y1={sy(poiV)} x2={sx(poiH) + 13} y2={sy(poiV)} stroke="#22d3ee" strokeWidth={1.5} />
          <line x1={sx(poiH)} y1={sy(poiV) - 13} x2={sx(poiH)} y2={sy(poiV) + 13} stroke="#22d3ee" strokeWidth={1.5} />
        </g>
        {/* Aperture iris — line through the camera + two draggable blades (opposite each other) */}
        <line x1={apAx} y1={apAy} x2={apBx} y2={apBy} stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        {[[apAx, apAy], [apBx, apBy]].map(([hx, hy], i) => (
          <rect key={i} x={hx - 5} y={hy - 5} width={10} height={10} rx={2} transform={`rotate(45 ${hx} ${hy})`} fill="#0e1420" stroke="#22d3ee" strokeWidth={2} />
        ))}
        {/* Camera — big + easy to grab (double-click for settings) */}
        <circle cx={camSx} cy={camSy} r={18} fill="#f7b500" stroke="#0a0f16" strokeWidth={3} />
        <circle cx={camSx} cy={camSy} r={7} fill="#0a0f16" />
        {/* Keyframe toggle rhombus — follows the camera; click to key/unkey position at the playhead. */}
        <g style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleKeyframe(); }}>
          <title>{hasKfAtCurrent ? 'Remove camera keyframe at playhead' : 'Add camera keyframe at playhead'}</title>
          <rect x={camSx + 24 - 6} y={camSy - 24 - 6} width={12} height={12} transform={`rotate(45 ${camSx + 24} ${camSy - 24})`}
            fill={hasKfAtCurrent ? '#f7b500' : '#0e1420'} stroke="#f7b500" strokeWidth={2} />
        </g>
      </svg>

      {/* Right-click menu (segment interp / keyframe delete). */}
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="absolute z-30 min-w-[130px] rounded-md border border-[#1a2a42] bg-[#0b1220] py-1 shadow-xl text-[11px] text-slate-200"
            style={{ left: Math.min(menu.x, EW - 140), top: Math.min(menu.y, EH - 100) }}>
            {menu.kind === 'segment' ? (
              <>
                <MenuItem label="Straight path" onClick={() => { onSetSegmentInterp(menu.frame, 'linear'); setMenu(null); }} />
                <MenuItem label="Curved path" onClick={() => { onSetSegmentInterp(menu.frame, 'bezier'); setMenu(null); }} />
                <MenuItem label="Hold" onClick={() => { onSetSegmentInterp(menu.frame, 'hold'); setMenu(null); }} />
              </>
            ) : (
              <>
                <MenuItem label="Seek to keyframe" onClick={() => { onSeek(menu.frame); setMenu(null); }} />
                <MenuItem label="Delete keyframe" danger onClick={() => { onDeleteKeyframe(menu.frame); setMenu(null); }} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`block w-full text-left px-3 py-1 hover:bg-[#122240] transition-colors ${danger ? 'text-red-400' : ''}`}>
      {label}
    </button>
  );
}
