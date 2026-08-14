import { useState } from 'react';
import { Video, X, Play } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import type { CameraLayer, FilmSizeAxis, CameraUnits } from '../../core/types';
import {
  compMeasureDim, zoomForFocalLength, focalLengthForZoom, aovForZoom, zoomForAov,
  fStopForAperture, apertureForFStop, CAMERA_PRESETS, presetForFocalLength,
} from '../../core/camera3d';

// After Effects "Camera Settings" dialog. The lens fields (Zoom / Angle of View / Focal Length /
// Film Size) are interlocked — editing any one recomputes the others — but only ZOOM is stored
// (the render-affecting field); Focal Length / AOV / F-Stop are derived on the fly, so they can't
// desync. See camera3d.ts for the algebra. Units are display-only.
export function CameraSettingsDialog({ layer, onClose }: { layer: CameraLayer; onClose: () => void }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const settings = useEditorStore((s) => s.composition.settings);
  const W = settings.width;
  const H = settings.height;

  const cam = layer.camera;
  const set = (path: string, v: unknown) => updateLayerProperty(layer.id, path, v);

  // ── Canonical + derived state (recomputed from the live layer each render) ──
  const zoom = cam.zoom.defaultValue as number;
  const filmSize = cam.filmSize ?? 36;
  const measure: FilmSizeAxis = cam.measureFilmSize ?? 'horizontal';
  const units: CameraUnits = cam.units ?? 'pixels';
  const C = compMeasureDim(measure, W, H);
  const focalLength = focalLengthForZoom(zoom, filmSize, C);
  const aovDeg = (aovForZoom(zoom, C) * 180) / Math.PI;
  const preset = presetForFocalLength(focalLength);

  const dofOn = cam.dofEnabled;
  const lockToZoom = cam.lockToZoom ?? true;
  const focusDistance = lockToZoom ? zoom : (cam.focusDistance.defaultValue as number);
  const aperture = cam.aperture.defaultValue as number;
  const fStop = fStopForAperture(zoom, aperture);
  const blurPercent = (cam.blurLevel.defaultValue as number) * 100;

  // Units convert only the pixel-denominated fields (Zoom / Focus / Aperture). Focal length + film
  // size stay in mm; F-Stop is unitless. px→mm scales by filmSize/C (sensor mm per comp px).
  const pxPerUnit = units === 'pixels' ? 1 : units === 'millimeters' ? C / filmSize : (C / filmSize) * 25.4;
  const unitLabel = units === 'pixels' ? 'px' : units === 'millimeters' ? 'mm' : 'in';
  const toDisp = (px: number) => px / pxPerUnit;
  const fromDisp = (v: number) => v * pxPerUnit;

  // ── Writers (write back ONLY canonical fields) ──
  const writeZoom = (z: number) => {
    const zz = Math.max(1, z);
    set('camera.zoom.defaultValue', zz);
    if (lockToZoom) set('camera.focusDistance.defaultValue', zz); // keep stored focus coherent
  };
  const applyPreset = (label: string) => {
    const p = CAMERA_PRESETS.find((x) => x.label === label);
    if (!p) return; // "Custom" has no focal length of its own
    set('camera.filmSize', 36);
    writeZoom(zoomForFocalLength(p.focalLengthMm, 36, C));
  };
  const setFocalLength = (f: number) => writeZoom(zoomForFocalLength(Math.max(1, f), filmSize, C));
  const setAov = (deg: number) => writeZoom(zoomForAov((Math.min(179, Math.max(1, deg)) * Math.PI) / 180, C));
  const setFilmSize = (F: number) => {
    const FF = Math.max(1, F);
    set('camera.filmSize', FF);
    writeZoom(zoomForFocalLength(focalLength, FF, C)); // hold focal length, reframe
  };
  const setMeasure = (m: FilmSizeAxis) => {
    const C2 = compMeasureDim(m, W, H);
    set('camera.measureFilmSize', m);
    writeZoom(zoomForFocalLength(focalLength, filmSize, C2));
  };
  const setFocus = (d: number) => { set('camera.lockToZoom', false); set('camera.focusDistance.defaultValue', Math.max(0, d)); };
  const setLock = (on: boolean) => { set('camera.lockToZoom', on); if (on) set('camera.focusDistance.defaultValue', zoom); };
  const setAperture = (a: number) => set('camera.aperture.defaultValue', Math.max(0.1, a));
  const setFStop = (n: number) => setAperture(apertureForFStop(zoom, Math.max(0.1, n)));

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[880px] max-w-[94vw] max-h-[92vh] overflow-y-auto bg-[#111821] border border-[#2a3a50] rounded-lg shadow-overlay shadow-black/50" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-hairline flex items-center gap-2">
          <Video size={15} className="text-amber-400" />
          <h2 className="text-[13px] font-semibold text-slate-100 flex-1">Camera Settings</h2>
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-[#1a2233]"><X size={14} /></button>
        </div>

        <div className="flex items-stretch">
          {/* Left: tutorial video placeholder (no video yet — just the placeholder). */}
          <div className="w-1/2 p-4 border-r border-hairline flex flex-col gap-3">
            <p className="text-[12px] text-slate-300 font-medium leading-snug">Confused on how to use the camera? Watch this quick tutorial</p>
            <div className="flex-1 min-h-[240px] rounded-lg border border-hairline relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-surface-3 to-[#0a0f16]" />
              <div className="relative flex flex-col items-center gap-2 text-slate-500">
                <div className="w-16 h-16 rounded-full bg-black/40 border border-[#2a3a50] flex items-center justify-center">
                  <Play size={24} className="text-slate-300 ml-1" fill="currentColor" />
                </div>
                <span className="text-[10px] uppercase tracking-wider">Video coming soon</span>
              </div>
            </div>
          </div>
          {/* Right: the camera settings. */}
          <div className="w-1/2 p-4 space-y-2.5">
          <Row label="Preset">
            <Select value={preset} onChange={applyPreset} options={[...CAMERA_PRESETS.map((p) => p.label), 'Custom']} />
          </Row>
          <Row label="Type">
            <Select value={cam.mode} onChange={(v) => set('camera.mode', v)} options={['two-node', 'one-node']} labels={{ 'two-node': 'Two-Node Camera', 'one-node': 'One-Node Camera' }} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Units" compact>
              <Select value={units} onChange={(v) => set('camera.units', v)} options={['pixels', 'inches', 'millimeters']} />
            </Row>
            <Row label="Measure" compact>
              <Select value={measure} onChange={(v) => setMeasure(v as FilmSizeAxis)} options={['horizontal', 'vertical', 'diagonal']} />
            </Row>
          </div>

          <div className="h-px bg-surface-2 my-1" />

          <Row label="Zoom"><Num value={toDisp(zoom)} onChange={(v) => writeZoom(fromDisp(v))} suffix={unitLabel} /></Row>
          <Row label="Angle of View"><Num value={aovDeg} onChange={setAov} suffix="°" step={0.5} /></Row>
          <Row label="Focal Length"><Num value={focalLength} onChange={setFocalLength} suffix="mm" /></Row>
          <Row label="Film Size"><Num value={filmSize} onChange={setFilmSize} suffix="mm" /></Row>
          <Row label="Comp Size"><span className="text-[11px] text-slate-500 font-mono">{Math.round(C)} px ({measure})</span></Row>

          <div className="h-px bg-surface-2 my-1" />

          <label className="flex items-center gap-2 text-[12px] text-slate-200 font-medium">
            <input type="checkbox" checked={dofOn} onChange={(e) => set('camera.dofEnabled', e.target.checked)} />
            Enable Depth of Field
          </label>

          <div className={dofOn ? 'space-y-2.5 pl-1' : 'space-y-2.5 pl-1 opacity-40 pointer-events-none'}>
            <Row label="Focus Distance">
              <div className="flex items-center gap-1.5">
                <Num value={toDisp(focusDistance)} onChange={(v) => setFocus(fromDisp(v))} suffix={unitLabel} disabled={lockToZoom} />
                <button onClick={() => setLock(!lockToZoom)} title="Lock focus distance to zoom" className={`px-1.5 py-1 rounded text-[9px] font-medium border ${lockToZoom ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-surface-3 border-hairline text-slate-400'}`}>Lock</button>
              </div>
            </Row>
            <Row label="Aperture"><Num value={toDisp(aperture)} onChange={(v) => setAperture(fromDisp(v))} suffix={unitLabel} /></Row>
            <Row label="F-Stop"><Num value={fStop} onChange={setFStop} prefix="f/" step={0.1} /></Row>
            <Row label="Blur Level"><Num value={blurPercent} onChange={(v) => set('camera.blurLevel.defaultValue', Math.max(0, v) / 100)} suffix="%" /></Row>
          </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-hairline flex items-center justify-between">
          <span className="text-[10px] text-slate-600">Lens fields are coupled; only Zoom is stored.</span>
          <button onClick={onClose} className="px-3 py-[6px] text-[11px] font-semibold rounded-md bg-accent hover:bg-accent-hover text-on-accent transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] text-slate-400 flex-shrink-0 ${compact ? 'w-14' : 'w-24'}`}>{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Select({ value, onChange, options, labels }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-6 px-1.5 rounded bg-surface-sunken border border-hairline text-[11px] text-slate-200 focus:outline-none capitalize">
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  );
}

function Num({ value, onChange, suffix, prefix, step = 1, disabled }: { value: number; onChange: (v: number) => void; suffix?: string; prefix?: string; step?: number; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Math.abs(value) >= 100 ? value.toFixed(step < 1 ? 2 : 0) : value.toFixed(step < 1 ? 2 : 1));
  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text);
    if (!Number.isNaN(n)) onChange(n);
    setText(null);
  };
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-[10px] text-slate-600">{prefix}</span>}
      <input
        type="text" inputMode="decimal" data-scrubby="true" disabled={disabled}
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        className="w-full h-6 px-1.5 rounded bg-surface-sunken border border-hairline text-[11px] text-slate-200 focus:outline-none focus:border-accent-dim disabled:opacity-50"
      />
      {suffix && <span className="text-[10px] text-slate-600 w-5">{suffix}</span>}
    </div>
  );
}
