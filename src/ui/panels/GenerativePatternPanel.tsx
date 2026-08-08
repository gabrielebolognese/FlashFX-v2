import { useEditorStore } from '../../store/editor';
import type { GenerativePatternLayer } from '../../core/types';
import { parsePatternConfig, serializePatternConfig } from '../../patterns/config';
import type { PatternConfig, PatternType } from '../../patterns/types';
import { PATTERN_TYPES } from '../../patterns/types';
import { PATTERN_PRESETS, PALETTES } from '../../patterns/presets';

const TYPE_LABEL: Record<PatternType, string> = { waves: 'Waves', plasma: 'Plasma', kaleidoscope: 'Kaleidoscope', mosaic: 'Mosaic' };

export function GenerativePatternPanel({ layer }: { layer: GenerativePatternLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const cfg = parsePatternConfig(layer.generativePattern.configJSON);

  const write = (next: PatternConfig) => updateLayerProperty(layer.id, 'generativePattern.configJSON', serializePatternConfig(next));
  const set = <K extends keyof PatternConfig>(k: K, v: PatternConfig[K]) => write({ ...cfg, [k]: v });

  return (
    <div className="p-3 space-y-3">
      {/* Presets */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {PATTERN_PRESETS.map((p) => (
            <button key={p.name} onClick={() => write(p.config)}
              className="px-2 py-1 rounded text-[11px] bg-[#122240] text-slate-300 hover:bg-[#1a2f52] hover:text-slate-100 transition-colors text-left truncate">
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      <Row label="Type">
        <select value={cfg.type} onChange={(e) => set('type', e.target.value as PatternType)}
          className="w-full h-6 px-1.5 rounded bg-[#0b1220] border border-[#1a2a42] text-[11px] text-slate-200 focus:outline-none">
          {PATTERN_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </Row>

      <Slider label="Scale" value={cfg.scale} min={0.1} max={4} step={0.05} onChange={(v) => set('scale', v)} />
      <Slider label="Speed" value={cfg.speed} min={0} max={3} step={0.05} onChange={(v) => set('speed', v)} />
      <Slider label="Rotation" value={cfg.rotationDeg} min={0} max={360} step={1} onChange={(v) => set('rotationDeg', v)} unit="°" />
      <Slider label="Complexity" value={cfg.complexity} min={1} max={8} step={1} onChange={(v) => set('complexity', v)} />
      <Slider label="Warp" value={cfg.warp} min={0} max={1.5} step={0.02} onChange={(v) => set('warp', v)} />
      <Slider label="Contrast" value={cfg.contrast} min={0} max={1.5} step={0.02} onChange={(v) => set('contrast', v)} />

      {/* Palette */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">Palette</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(PALETTES).map(([name, stops]) => (
            <button key={name} onClick={() => set('palette', stops)} title={name}
              className="w-9 h-6 rounded border border-[#1a2a42] overflow-hidden"
              style={{ background: `linear-gradient(90deg, ${stops.map((s) => `rgb(${s.color.map((c) => Math.round(c * 255)).join(',')}) ${Math.round(s.pos * 100)}%`).join(', ')})` }} />
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

function Slider({ label, value, min, max, step, onChange, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="flex-1 accent-[#f7b500]" />
        <span className="text-[10px] text-slate-500 font-mono w-10 text-right">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
    </Row>
  );
}
