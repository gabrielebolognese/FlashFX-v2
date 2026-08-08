import { Diamond } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import type { GenerativePatternLayer } from '../../core/types';
import { parsePatternConfig, serializePatternConfig } from '../../patterns/config';
import type { PatternConfig, PatternType } from '../../patterns/types';
import { PATTERN_TYPES } from '../../patterns/types';
import { PATTERN_PRESETS, PALETTES } from '../../patterns/presets';

type Knob = 'scale' | 'rotation' | 'warp' | 'contrast';

const TYPE_LABEL: Record<PatternType, string> = {
  waves: 'Waves', plasma: 'Plasma', kaleidoscope: 'Kaleidoscope', mosaic: 'Mosaic',
  clouds: 'Clouds', voronoi: 'Voronoi', rings: 'Rings', spiral: 'Spiral',
  interference: 'Interference', gradient: 'Gradient Sweep', warp: 'Warp',
};

const rgbToHex = (c: [number, number, number]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const hexToRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function GenerativePatternPanel({ layer }: { layer: GenerativePatternLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const cfg = parsePatternConfig(layer.generativePattern.configJSON);

  const write = (next: PatternConfig) => updateLayerProperty(layer.id, 'generativePattern.configJSON', serializePatternConfig(next));
  const set = <K extends keyof PatternConfig>(k: K, v: PatternConfig[K]) => write({ ...cfg, [k]: v });

  // Keyframeable knobs live on layer.patternAnim (not the config). Applying a preset seeds both.
  const setKnob = (k: Knob, v: number) => updateLayerProperty(layer.id, `patternAnim.${k}.defaultValue`, v);
  const keyKnob = (k: Knob) => addKeyframe(layer.id, `patternAnim.${k}`, currentFrame, layer.patternAnim[k].defaultValue as number);
  const applyPreset = (config: PatternConfig) => {
    write(config);
    setKnob('scale', config.scale); setKnob('rotation', config.rotationDeg); setKnob('warp', config.warp); setKnob('contrast', config.contrast);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Presets */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {PATTERN_PRESETS.map((p) => (
            <button key={p.name} onClick={() => applyPreset(p.config)}
              className="px-2 py-1 rounded text-[11px] bg-[#122240] text-slate-300 hover:bg-[#1a2f52] hover:text-slate-100 transition-colors text-left truncate">
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Size (the pattern is generated only inside these bounds; move/resize on the canvas too) */}
      <Row label="Size">
        <div className="flex items-center gap-1.5">
          <input type="number" value={Math.round(layer.width.defaultValue as number)} min={2}
            onChange={(e) => updateLayerProperty(layer.id, 'width.defaultValue', Math.max(2, parseInt(e.target.value) || 2))}
            className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none" />
          <span className="text-slate-600 text-[11px]">×</span>
          <input type="number" value={Math.round(layer.height.defaultValue as number)} min={2}
            onChange={(e) => updateLayerProperty(layer.id, 'height.defaultValue', Math.max(2, parseInt(e.target.value) || 2))}
            className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none" />
        </div>
      </Row>

      {/* Type */}
      <Row label="Type">
        <select value={cfg.type} onChange={(e) => set('type', e.target.value as PatternType)}
          className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none">
          {PATTERN_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </Row>

      {/* Blend with the layers below (GPU: normal/add/multiply/screen) */}
      <Row label="Blend">
        <select value={layer.blendMode} onChange={(e) => updateLayerProperty(layer.id, 'blendMode', e.target.value)}
          className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none">
          <option value="normal">Normal</option>
          <option value="add">Add (Linear Dodge)</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
        </select>
      </Row>

      {/* Keyframeable knobs (◆ sets a keyframe at the playhead) */}
      <Slider label="Scale" value={layer.patternAnim.scale.defaultValue as number} min={0.1} max={4} step={0.05} onChange={(v) => setKnob('scale', v)} onKey={() => keyKnob('scale')} />
      <Slider label="Rotation" value={layer.patternAnim.rotation.defaultValue as number} min={0} max={360} step={1} onChange={(v) => setKnob('rotation', v)} onKey={() => keyKnob('rotation')} unit="°" />
      <Slider label="Warp" value={layer.patternAnim.warp.defaultValue as number} min={0} max={1.5} step={0.02} onChange={(v) => setKnob('warp', v)} onKey={() => keyKnob('warp')} />
      <Slider label="Contrast" value={layer.patternAnim.contrast.defaultValue as number} min={0} max={1.5} step={0.02} onChange={(v) => setKnob('contrast', v)} onKey={() => keyKnob('contrast')} />
      <Slider label="Speed" value={cfg.speed} min={0} max={3} step={0.05} onChange={(v) => set('speed', v)} />
      <Slider label="Complexity" value={cfg.complexity} min={1} max={8} step={1} onChange={(v) => set('complexity', v)} />

      {/* Palette */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Palette</span>
          <button onClick={() => set('palette', [...cfg.palette, { color: cfg.palette[cfg.palette.length - 1]?.color ?? [1, 1, 1], pos: 1 }])}
            className="text-[10px] text-slate-400 hover:text-slate-200">+ stop</button>
        </div>
        {/* live gradient bar */}
        <div className="h-5 rounded border border-[#1a2a42] mb-2"
          style={{ background: `linear-gradient(90deg, ${[...cfg.palette].sort((a, b) => a.pos - b.pos).map((s) => `rgb(${s.color.map((c) => Math.round(c * 255)).join(',')}) ${Math.round(s.pos * 100)}%`).join(', ')})` }} />
        {/* preset swatches */}
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(PALETTES).map(([name, stops]) => (
            <button key={name} onClick={() => set('palette', stops)} title={name}
              className="w-8 h-5 rounded border border-[#1a2a42] overflow-hidden"
              style={{ background: `linear-gradient(90deg, ${stops.map((s) => `rgb(${s.color.map((c) => Math.round(c * 255)).join(',')}) ${Math.round(s.pos * 100)}%`).join(', ')})` }} />
          ))}
        </div>
        {/* per-stop editor */}
        <div className="space-y-1">
          {cfg.palette.map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" value={rgbToHex(stop.color)}
                onChange={(e) => set('palette', cfg.palette.map((s, j) => j === i ? { ...s, color: hexToRgb(e.target.value) } : s))}
                className="w-6 h-6 rounded bg-transparent border border-[#1a2a42] p-0 cursor-pointer" />
              <input type="range" min={0} max={1} step={0.01} value={stop.pos}
                onChange={(e) => set('palette', cfg.palette.map((s, j) => j === i ? { ...s, pos: parseFloat(e.target.value) } : s))}
                className="flex-1 accent-[#f7b500]" />
              <span className="text-[9px] text-slate-500 font-mono w-8 text-right">{Math.round(stop.pos * 100)}%</span>
              {cfg.palette.length > 2 && (
                <button onClick={() => set('palette', cfg.palette.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 text-[12px] leading-none">×</button>
              )}
            </div>
          ))}
        </div>
        <label className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={cfg.paletteMode === 'smooth'} onChange={(e) => set('paletteMode', e.target.checked ? 'smooth' : 'linear')} />
          Smooth palette
        </label>
      </div>
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
        <span className="text-[10px] text-slate-500 font-mono w-10 text-right">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
    </Row>
  );
}
