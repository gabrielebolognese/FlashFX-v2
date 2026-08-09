import { useRef, useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import type { CameraLayer, AnimatableProperty, Vec2 } from '../../core/types';
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
// canvas); a precision drag mode (moves slower than the pointer) for fine placement; and two
// aperture handles flanking the camera (drag either to change Aperture in mm — the opposite one
// mirrors it, an iris you open/close).

type Axis = 'x' | 'y' | 'z';
interface Pt3 { x: number; y: number; z: number }
const AX = (p: Pt3, a: Axis): number => (a === 'x' ? p.x : a === 'y' ? p.y : p.z);

// Precision factor: world moves at 40% of the pointer's schematic speed so placement is fine,
// not twitchy (the "dragging mode" — slower while you drag).
const DRAG_PRECISION = 0.4;

export function Camera3DView({ layer }: { layer: CameraLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const composition = useEditorStore((s) => s.composition);
  const frame = useTimelineStore((s) => s.currentFrame);
  const [view, setView] = useState<'top' | 'side'>('top');
  const [showSettings, setShowSettings] = useState(false);

  const W = composition.settings.width;
  const H = composition.settings.height;
  const cam = layer.camera;

  const n = (p: AnimatableProperty) => evaluateProperty(p, frame) as number;
  const v2 = (p: AnimatableProperty) => evaluateProperty(p, frame) as Vec2;

  const pos = v2(layer.transform.position);
  const eye: Pt3 = { x: pos[0], y: pos[1], z: layer.transform.positionZ ? n(layer.transform.positionZ) : -H };
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

  const layers = composition.layers
    .filter((l) => l.is3D && l.type !== 'camera' && l.type !== 'group' && l.type !== 'audio' && frame >= l.inPoint && frame < l.outPoint)
    .map((l) => {
      const wp = getWorldPosition(l, composition.layers, frame);
      const z = l.transform.positionZ ? (evaluateProperty(l.transform.positionZ, frame) as number) : 0;
      return { id: l.id, name: l.name, x: wp[0], y: wp[1], z };
    });

  // Keyframe-aware write: update the keyframe at the playhead for an animated prop, else its base.
  // Either way it mutates the composition store → the main canvas re-renders through the camera.
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
          ? <OrthoView label="Top · X → Z (depth)" hAxis="x" vAxis="z" W={W} H={H} eye={eye} poi={poi} fov={fov}
              apertureMm={apertureMm} fStop={fStop} layers={layers}
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('x', h); set('z', v); }}
              onAperture={setApertureMm} onOpenSettings={() => setShowSettings(true)} />
          : <OrthoView label="Side · Z (depth) → Y" hAxis="z" vAxis="y" W={W} H={H} eye={eye} poi={poi} fov={fov}
              apertureMm={apertureMm} fStop={fStop} layers={layers}
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('z', h); set('y', v); }}
              onAperture={setApertureMm} onOpenSettings={() => setShowSettings(true)} />}
      </div>
      {showSettings && <CameraSettingsDialog layer={layer} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// Screen-radius mapping for the aperture iris handles: base gap keeps them clear of the camera
// dot, then each mm of aperture pushes them PX_PER_MM further apart (clamped).
const AP_MIN_R = 44;
const AP_MAX_R = 172;
const AP_PX_PER_MM = 5;
const apertureToR = (mm: number) => Math.min(AP_MAX_R, AP_MIN_R + Math.max(0, mm) * AP_PX_PER_MM);
const rToAperture = (r: number) => (Math.min(AP_MAX_R, Math.max(AP_MIN_R, r)) - AP_MIN_R) / AP_PX_PER_MM;

type DragKind = 'cam' | 'poi' | 'apA' | 'apB';

function OrthoView({ label, hAxis, vAxis, W, H, eye, poi, fov, apertureMm, fStop, layers, onDrag, onAperture, onOpenSettings }: {
  label: string; hAxis: Axis; vAxis: Axis; W: number; H: number;
  eye: Pt3; poi: Pt3; fov: number; apertureMm: number; fStop: number;
  layers: { id: string; name: string; x: number; y: number; z: number }[];
  onDrag: (who: 'cam' | 'poi', hVal: number, vVal: number) => void;
  onAperture: (mm: number) => void;
  onOpenSettings: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragKind | null>(null);
  // Precision drag anchor: pointer + world value at grab time (relative, slowed mapping).
  const anchor = useRef<{ mx: number; my: number; h: number; v: number } | null>(null);
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default');

  // Track the SVG's real pixel size and use it AS the coordinate system (viewBox = element px),
  // so pointer coords map 1:1 to draw coords — no preserveAspectRatio letterbox skew (the bug
  // that broke dragging on the letterboxed axis, e.g. the Side view).
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
  const hs = [...compExtent[hAxis], AX(eye, hAxis), AX(poi, hAxis), ...layers.map((l) => AX(l, hAxis))];
  const vs = [...compExtent[vAxis], AX(eye, vAxis), AX(poi, vAxis), ...layers.map((l) => AX(l, vAxis))];
  const minH = Math.min(...hs), maxH = Math.max(...hs), minV = Math.min(...vs), maxV = Math.max(...vs);
  const spanH = maxH - minH || 1, spanV = maxV - minV || 1;
  const scale = Math.min((EW - 2 * PAD) / spanH, (EH - 2 * PAD) / spanV);
  const oX = (EW - spanH * scale) / 2, oY = (EH - spanV * scale) / 2;
  const sx = (h: number) => oX + (h - minH) * scale;
  const sy = (v: number) => oY + (v - minV) * scale;

  const eyeH = AX(eye, hAxis), eyeV = AX(eye, vAxis), poiH = AX(poi, hAxis), poiV = AX(poi, vAxis);
  const compPts = [{ x: 0, y: 0, z: 0 }, { x: W, y: 0, z: 0 }, { x: W, y: H, z: 0 }, { x: 0, y: H, z: 0 }]
    .map((c) => `${sx(AX(c, hAxis))},${sy(AX(c, vAxis))}`).join(' ');

  const dh = poiH - eyeH, dv = poiV - eyeV;
  const len = Math.hypot(dh, dv) || 1;
  const ux = dh / len, uy = dv / len;
  const rot = (a: number): [number, number] => [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)];
  const [f1x, f1y] = rot(fov / 2); const [f2x, f2y] = rot(-fov / 2);
  const fl = len * 1.35 * scale;

  // Aperture iris: two handles perpendicular to the look direction, ±r from the camera. Dragging
  // one opens/closes the iris; the opposite one mirrors it (moves the other way).
  const perpOk = Math.hypot(dh, dv) > 1e-3;
  const px = perpOk ? -uy : 1, py = perpOk ? ux : 0; // perpendicular unit (fallback horizontal)
  const camSx = sx(eyeH), camSy = sy(eyeV);
  const apR = apertureToR(apertureMm);
  const apAx = camSx + px * apR, apAy = camSy + py * apR;
  const apBx = camSx - px * apR, apBy = camSy - py * apR;

  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top]; // element px === draw coords
  };
  const near = (mx: number, my: number, tx: number, ty: number, r: number) => Math.hypot(mx - tx, my - ty) < r;
  const HIT = 30, AP_HIT = 15;
  const hitTest = (mx: number, my: number): DragKind | null => {
    if (near(mx, my, sx(poiH), sy(poiV), HIT)) return 'poi';
    if (near(mx, my, apAx, apAy, AP_HIT)) return 'apA';
    if (near(mx, my, apBx, apBy, AP_HIT)) return 'apB';
    if (near(mx, my, camSx, camSy, HIT)) return 'cam';
    return null;
  };

  const down = (e: React.PointerEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    const hit = hitTest(mx, my);
    if (!hit) return;
    drag.current = hit;
    if (hit === 'cam') anchor.current = { mx, my, h: eyeH, v: eyeV };
    else if (hit === 'poi') anchor.current = { mx, my, h: poiH, v: poiV };
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
      // Project the pointer offset from the camera onto the (signed) iris axis for this handle.
      const sign = k === 'apA' ? 1 : -1;
      const r = (mx - camSx) * px * sign + (my - camSy) * py * sign;
      onAperture(rToAperture(r));
      return;
    }
    if ((k === 'cam' || k === 'poi') && anchor.current) {
      // Precision (slowed) relative mapping — world moves at DRAG_PRECISION × pointer speed.
      const a = anchor.current;
      const newH = a.h + ((mx - a.mx) / scale) * DRAG_PRECISION;
      const newV = a.v + ((my - a.my) / scale) * DRAG_PRECISION;
      onDrag(k, newH, newV);
      return;
    }
    setCursor(hitTest(mx, my) ? 'grab' : 'default');
  };
  const up = () => { if (drag.current) { drag.current = null; anchor.current = null; useHistoryStore.getState().setBatching(false); } setCursor('default'); };
  const dblclick = (e: React.MouseEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    if (near(mx, my, camSx, camSy, HIT)) onOpenSettings();
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider z-10 pointer-events-none">{label}</span>
      <span className="absolute top-1.5 right-2 text-[10px] font-mono text-amber-400/80 z-10 pointer-events-none">
        {apertureMm.toFixed(1)}mm · f/{fStop.toFixed(1)}
      </span>
      <svg ref={svgRef} viewBox={`0 0 ${EW} ${EH}`} preserveAspectRatio="none" className="w-full h-full" style={{ cursor, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onDoubleClick={dblclick}>
        {/* comp plane (z=0) */}
        <polygon points={compPts} fill="#1e3a5f" fillOpacity={0.3} stroke="#38bdf8" strokeWidth={2} />
        {/* 3D layers */}
        {layers.map((l) => (
          <g key={l.id}>
            <rect x={sx(AX(l, hAxis)) - 6} y={sy(AX(l, vAxis)) - 6} width={12} height={12} rx={2} fill="#3b82f6" fillOpacity={0.85} stroke="#93c5fd" strokeWidth={1} />
            <text x={sx(AX(l, hAxis))} y={sy(AX(l, vAxis)) - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">{l.name.slice(0, 10)}</text>
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
          <rect key={i} x={hx - 5} y={hy - 5} width={10} height={10} rx={2}
            transform={`rotate(45 ${hx} ${hy})`} fill="#0e1420" stroke="#22d3ee" strokeWidth={2} />
        ))}
        {/* Camera — big + easy to grab (double-click for settings) */}
        <circle cx={camSx} cy={camSy} r={18} fill="#f7b500" stroke="#0a0f16" strokeWidth={3} />
        <circle cx={camSx} cy={camSy} r={7} fill="#0a0f16" />
      </svg>
    </div>
  );
}
