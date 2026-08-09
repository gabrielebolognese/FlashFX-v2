import { useRef, useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import type { CameraLayer, AnimatableProperty, Vec2 } from '../../core/types';
import { evaluateProperty } from '../../core/interpolation';
import { getWorldPosition } from '../../core/sceneGraph';
import { fovYForZoom } from '../../core/camera3d';

// AE-style 3D VIEW: an orthographic schematic of the scene where the camera lives in the world
// beside the 3D layers, and you drag it (and its Point of Interest) to place it — Top (X→Z) or
// Side (Z→Y), switchable. Pure SVG over the harness-verified camera math (no WebGPU). Dragging
// writes the camera transform, so the main canvas updates live. Shown in the inspector when a
// camera is selected.

type Axis = 'x' | 'y' | 'z';
interface Pt3 { x: number; y: number; z: number }
const AX = (p: Pt3, a: Axis): number => (a === 'x' ? p.x : a === 'y' ? p.y : p.z);

export function Camera3DView({ layer }: { layer: CameraLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const composition = useEditorStore((s) => s.composition);
  const frame = useTimelineStore((s) => s.currentFrame);
  const [view, setView] = useState<'top' | 'side'>('top');

  const W = composition.settings.width;
  const H = composition.settings.height;
  const cam = layer.camera;

  const n = (p: AnimatableProperty) => evaluateProperty(p, frame) as number;
  const v2 = (p: AnimatableProperty) => evaluateProperty(p, frame) as Vec2;

  const pos = v2(layer.transform.position);
  const eye: Pt3 = { x: pos[0], y: pos[1], z: layer.transform.positionZ ? n(layer.transform.positionZ) : -H };
  const poiXY = v2(cam.pointOfInterest);
  const poi: Pt3 = { x: poiXY[0], y: poiXY[1], z: n(cam.pointOfInterestZ) };
  const fov = fovYForZoom(n(cam.zoom), H);

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

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#1c2433]">
        <Video size={12} className="text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-medium text-slate-300">3D View</span>
        <div className="ml-auto flex rounded overflow-hidden border border-[#1a2a42]">
          {(['top', 'side'] as const).map((vw) => (
            <button key={vw} onClick={() => setView(vw)}
              className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${view === vw ? 'bg-[#f7b500] text-[#0a0f16]' : 'bg-[#0b1220] text-slate-400 hover:text-slate-200'}`}>
              {vw === 'top' ? 'Top' : 'Side'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-[400px] bg-[#0e1420]">
        {view === 'top'
          ? <OrthoView label="Top · X → Z (depth)" hAxis="x" vAxis="z" W={W} H={H} eye={eye} poi={poi} fov={fov} layers={layers}
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('x', h); set('z', v); }} />
          : <OrthoView label="Side · Z (depth) → Y" hAxis="z" vAxis="y" W={W} H={H} eye={eye} poi={poi} fov={fov} layers={layers}
              onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('z', h); set('y', v); }} />}
      </div>
    </div>
  );
}

function OrthoView({ label, hAxis, vAxis, W, H, eye, poi, fov, layers, onDrag }: {
  label: string; hAxis: Axis; vAxis: Axis; W: number; H: number;
  eye: Pt3; poi: Pt3; fov: number;
  layers: { id: string; name: string; x: number; y: number; z: number }[];
  onDrag: (who: 'cam' | 'poi', hVal: number, vVal: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<'cam' | 'poi' | null>(null);
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

  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top]; // element px === draw coords
  };
  const HIT = 30;
  const near = (mx: number, my: number, tx: number, ty: number) => Math.hypot(mx - tx, my - ty) < HIT;
  const overHandle = (mx: number, my: number) => near(mx, my, sx(poiH), sy(poiV)) || near(mx, my, sx(eyeH), sy(eyeV));

  const down = (e: React.PointerEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    if (near(mx, my, sx(poiH), sy(poiV))) drag.current = 'poi';
    else if (near(mx, my, sx(eyeH), sy(eyeV))) drag.current = 'cam';
    else return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setCursor('grabbing');
    useHistoryStore.getState().setBatching(true);
  };
  const move = (e: React.PointerEvent) => {
    const [mx, my] = toLocal(e.clientX, e.clientY);
    if (drag.current) {
      onDrag(drag.current, minH + (mx - oX) / scale, minV + (my - oY) / scale);
      return;
    }
    setCursor(overHandle(mx, my) ? 'grab' : 'default');
  };
  const up = () => { if (drag.current) { drag.current = null; useHistoryStore.getState().setBatching(false); } setCursor('default'); };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider z-10 pointer-events-none">{label}</span>
      <svg ref={svgRef} viewBox={`0 0 ${EW} ${EH}`} preserveAspectRatio="none" className="w-full h-full" style={{ cursor, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
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
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(eyeH) + f1x * fl} y2={sy(eyeV) + f1y * fl} stroke="#f7b500" strokeWidth={1.5} opacity={0.55} />
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(eyeH) + f2x * fl} y2={sy(eyeV) + f2y * fl} stroke="#f7b500" strokeWidth={1.5} opacity={0.55} />
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(poiH)} y2={sy(poiV)} stroke="#f7b500" strokeWidth={1} strokeDasharray="6 4" opacity={0.7} />
        {/* Point of Interest */}
        <g>
          <circle cx={sx(poiH)} cy={sy(poiV)} r={9} fill="#0e1420" stroke="#22d3ee" strokeWidth={2} />
          <line x1={sx(poiH) - 13} y1={sy(poiV)} x2={sx(poiH) + 13} y2={sy(poiV)} stroke="#22d3ee" strokeWidth={1.5} />
          <line x1={sx(poiH)} y1={sy(poiV) - 13} x2={sx(poiH)} y2={sy(poiV) + 13} stroke="#22d3ee" strokeWidth={1.5} />
        </g>
        {/* Camera — big + easy to grab */}
        <circle cx={sx(eyeH)} cy={sy(eyeV)} r={18} fill="#f7b500" stroke="#0a0f16" strokeWidth={3} />
        <circle cx={sx(eyeH)} cy={sy(eyeV)} r={7} fill="#0a0f16" />
      </svg>
    </div>
  );
}
