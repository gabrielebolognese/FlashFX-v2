import { Diamond, Video } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import type { CameraLayer } from '../../core/types';

// 2.5D camera inspector (M1 baseline). Lens zoom, one/two-node mode, and depth-of-field
// settings. The full X/Y/Z transform rows, FOV/focal-length coupling and the Camera Settings
// dialog land in M3; the renderer consumes these matrices in M2.
export function CameraPanel({ layer }: { layer: CameraLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const cam = layer.camera;

  const zoom = cam.zoom.defaultValue as number;
  // fovY = 2·atan((compH/2)/zoom); compH isn't known here, so show the angle for a 1080 comp as a hint.
  const fovDeg = Math.round((2 * Math.atan(1080 / 2 / Math.max(1, zoom)) * 180) / Math.PI);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Video size={13} className="text-amber-400" />
        <span>2.5D Camera — layers with the 3D switch are viewed through this camera.</span>
      </div>

      <Row label="Mode">
        <select value={cam.mode} onChange={(e) => updateLayerProperty(layer.id, 'camera.mode', e.target.value)}
          className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none">
          <option value="two-node">Two-Node (aims at Point of Interest)</option>
          <option value="one-node">One-Node (free / orientation)</option>
        </select>
      </Row>

      <Slider label="Zoom" value={zoom} min={100} max={6000} step={10} unit="px"
        onChange={(v) => updateLayerProperty(layer.id, 'camera.zoom.defaultValue', v)}
        onKey={() => addKeyframe(layer.id, 'camera.zoom', currentFrame, zoom)} />
      <div className="text-[10px] text-slate-500 pl-[88px] -mt-1.5">≈ {fovDeg}° vertical FOV (1080p comp)</div>

      <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
        <input type="checkbox" checked={cam.dofEnabled}
          onChange={(e) => updateLayerProperty(layer.id, 'camera.dofEnabled', e.target.checked)} />
        Depth of Field
      </label>

      {cam.dofEnabled && (
        <>
          <Slider label="Focus Dist" value={cam.focusDistance.defaultValue as number} min={0} max={6000} step={10} unit="px"
            onChange={(v) => updateLayerProperty(layer.id, 'camera.focusDistance.defaultValue', v)}
            onKey={() => addKeyframe(layer.id, 'camera.focusDistance', currentFrame, cam.focusDistance.defaultValue as number)} />
          <Slider label="Aperture" value={cam.aperture.defaultValue as number} min={0} max={500} step={1}
            onChange={(v) => updateLayerProperty(layer.id, 'camera.aperture.defaultValue', v)}
            onKey={() => addKeyframe(layer.id, 'camera.aperture', currentFrame, cam.aperture.defaultValue as number)} />
          <Slider label="Blur Level" value={cam.blurLevel.defaultValue as number} min={0} max={3} step={0.05}
            onChange={(v) => updateLayerProperty(layer.id, 'camera.blurLevel.defaultValue', v)}
            onKey={() => addKeyframe(layer.id, 'camera.blurLevel', currentFrame, cam.blurLevel.defaultValue as number)} />
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit, onKey }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; onKey?: () => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        {onKey && (
          <button onClick={onKey} title="Add keyframe at playhead" className="flex-shrink-0 text-slate-600 hover:text-[#f7b500] transition-colors">
            <Diamond size={11} />
          </button>
        )}
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="flex-1 accent-[#f7b500]" />
        <span className="text-[10px] text-slate-500 font-mono w-12 text-right">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
    </Row>
  );
}
