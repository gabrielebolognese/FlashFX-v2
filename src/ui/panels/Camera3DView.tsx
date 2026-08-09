import { useRef } from 'react';
import { Video } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import type { CameraLayer, AnimatableProperty, Vec2 } from '../../core/types';
import { evaluateProperty } from '../../core/interpolation';
import { getWorldPosition } from '../../core/sceneGraph';
import { fovYForZoom } from '../../core/camera3d';

// AE-style 3D VIEW: an orthographic schematic of the scene (Top + Side) where the camera lives
// in the world alongside the 3D layers, and you drag it (and its Point of Interest) to place it.
// Pure SVG projection using the harness-verified camera math — NO WebGPU, so it works regardless
// of the render path and gives a reliable way to author the camera in space. Shown in the viewport
// when a camera is selected.

type Axis = 'x' | 'y' | 'z';
interface Pt3 { x: number; y: number; z: number }
const AX = (p: Pt3, a: Axis): number => (a === 'x' ? p.x : a === 'y' ? p.y : p.z);

export function Camera3DView({ layer }: { layer: CameraLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const composition = useEditorStore((s) => s.composition);
  const frame = useTimelineStore((s) => s.currentFrame);

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
    <div className="absolute inset-0 bg-[#0b1017] flex flex-col z-20">
      <div className="h-8 flex-shrink-0 flex items-center gap-2 px-3 border-b border-[#1c2433] bg-[#0d1219]">
        <Video size={13} className="text-amber-400" />
        <span className="text-[12px] font-medium text-slate-200">3D View</span>
        <span className="text-[11px] text-slate-500 truncate">— {layer.name}. Drag the camera or its target to place it in the scene.</span>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-px bg-[#1c2433] min-h-0">
        <OrthoView label="Top · X→Z" hAxis="x" vAxis="z" W={W} H={H} eye={eye} poi={poi} fov={fov} layers={layers}
          onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('x', h); set('z', v); }} />
        <OrthoView label="Side · Z→Y" hAxis="z" vAxis="y" W={W} H={H} eye={eye} poi={poi} fov={fov} layers={layers}
          onDrag={(who, h, v) => { const set = who === 'cam' ? setEye : setPoi; set('z', h); set('y', v); }} />
      </div>
    </div>
  );
}

const VB = 1000;

function OrthoView({ label, hAxis, vAxis, W, H, eye, poi, fov, layers, onDrag }: {
  label: string; hAxis: Axis; vAxis: Axis; W: number; H: number;
  eye: Pt3; poi: Pt3; fov: number;
  layers: { id: string; name: string; x: number; y: number; z: number }[];
  onDrag: (who: 'cam' | 'poi', hVal: number, vVal: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<'cam' | 'poi' | null>(null);

  const compExtent: Record<Axis, [number, number]> = { x: [0, W], y: [0, H], z: [0, 0] };
  const hs = [...compExtent[hAxis], AX(eye, hAxis), AX(poi, hAxis), ...layers.map((l) => AX(l, hAxis))];
  const vs = [...compExtent[vAxis], AX(eye, vAxis), AX(poi, vAxis), ...layers.map((l) => AX(l, vAxis))];
  let minH = Math.min(...hs), maxH = Math.max(...hs), minV = Math.min(...vs), maxV = Math.max(...vs);
  const pH = (maxH - minH) * 0.14 + 60, pV = (maxV - minV) * 0.14 + 60;
  minH -= pH; maxH += pH; minV -= pV; maxV += pV;
  const spanH = maxH - minH || 1, spanV = maxV - minV || 1;
  const scale = Math.min(VB / spanH, VB / spanV);
  const oX = (VB - spanH * scale) / 2, oY = (VB - spanV * scale) / 2;
  const sx = (h: number) => oX + (h - minH) * scale;
  const sy = (v: number) => oY + (v - minV) * scale;

  const eyeH = AX(eye, hAxis), eyeV = AX(eye, vAxis), poiH = AX(poi, hAxis), poiV = AX(poi, vAxis);
  const compPts = [{ x: 0, y: 0, z: 0 }, { x: W, y: 0, z: 0 }, { x: W, y: H, z: 0 }, { x: 0, y: H, z: 0 }]
    .map((c) => `${sx(AX(c, hAxis))},${sy(AX(c, vAxis))}`).join(' ');

  // Frustum: FOV cone around the eye→POI direction (drawn in this view's plane).
  const dh = poiH - eyeH, dv = poiV - eyeV;
  const len = Math.hypot(dh, dv) || 1;
  const ux = dh / len, uy = dv / len;
  const rot = (a: number): [number, number] => [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)];
  const [f1x, f1y] = rot(fov / 2); const [f2x, f2y] = rot(-fov / 2);
  const fl = len * 1.35 * scale;

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    const mx = ((clientX - r.left) / r.width) * VB;
    const my = ((clientY - r.top) / r.height) * VB;
    return [minH + (mx - oX) / scale, minV + (my - oY) / scale];
  };
  const clientToScreen = (clientX: number, clientY: number): [number, number] => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * VB, ((clientY - r.top) / r.height) * VB];
  };
  const hit = (mx: number, my: number, tx: number, ty: number) => Math.hypot(mx - tx, my - ty) < 34;

  const down = (e: React.PointerEvent) => {
    const [mx, my] = clientToScreen(e.clientX, e.clientY);
    if (hit(mx, my, sx(poiH), sy(poiV))) drag.current = 'poi';
    else if (hit(mx, my, sx(eyeH), sy(eyeV))) drag.current = 'cam';
    else return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    useHistoryStore.getState().setBatching(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [wh, wv] = toWorld(e.clientX, e.clientY);
    onDrag(drag.current, wh, wv);
  };
  const up = () => { if (drag.current) { drag.current = null; useHistoryStore.getState().setBatching(false); } };

  return (
    <div className="relative bg-[#0e1420] overflow-hidden">
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider z-10 pointer-events-none">{label}</span>
      <svg ref={svgRef} viewBox={`0 0 ${VB} ${VB}`} className="w-full h-full cursor-crosshair" style={{ touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        {/* comp plane (z=0) */}
        <polygon points={compPts} fill="#1e3a5f" fillOpacity={0.3} stroke="#38bdf8" strokeWidth={2.5} />
        {/* 3D layers */}
        {layers.map((l) => (
          <g key={l.id}>
            <rect x={sx(AX(l, hAxis)) - 9} y={sy(AX(l, vAxis)) - 9} width={18} height={18} rx={3} fill="#3b82f6" fillOpacity={0.85} stroke="#93c5fd" strokeWidth={1} />
            <text x={sx(AX(l, hAxis))} y={sy(AX(l, vAxis)) - 14} textAnchor="middle" fontSize={16} fill="#94a3b8">{l.name.slice(0, 10)}</text>
          </g>
        ))}
        {/* frustum + look line */}
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(eyeH) + f1x * fl} y2={sy(eyeV) + f1y * fl} stroke="#f7b500" strokeWidth={2} opacity={0.55} />
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(eyeH) + f2x * fl} y2={sy(eyeV) + f2y * fl} stroke="#f7b500" strokeWidth={2} opacity={0.55} />
        <line x1={sx(eyeH)} y1={sy(eyeV)} x2={sx(poiH)} y2={sy(poiV)} stroke="#f7b500" strokeWidth={1.5} strokeDasharray="8 5" opacity={0.7} />
        {/* Point of Interest */}
        <g>
          <circle cx={sx(poiH)} cy={sy(poiV)} r={11} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
          <line x1={sx(poiH) - 16} y1={sy(poiV)} x2={sx(poiH) + 16} y2={sy(poiV)} stroke="#22d3ee" strokeWidth={2} />
          <line x1={sx(poiH)} y1={sy(poiV) - 16} x2={sx(poiH)} y2={sy(poiV) + 16} stroke="#22d3ee" strokeWidth={2} />
        </g>
        {/* Camera */}
        <circle cx={sx(eyeH)} cy={sy(eyeV)} r={15} fill="#f7b500" stroke="#0a0f16" strokeWidth={2.5} />
        <circle cx={sx(eyeH)} cy={sy(eyeV)} r={5} fill="#0a0f16" />
      </svg>
    </div>
  );
}
