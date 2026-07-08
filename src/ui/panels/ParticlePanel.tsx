import { useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { BrandColorPicker } from '../components/BrandColorPicker';
import type { ParticleLayer } from '../../core/types';
import type { EmitterConfig } from '../../particles/types';
import { PARTICLE_PRESETS, PRESET_NAMES, createEmitterConfig } from '../../particles/presets';
import { DragInput } from '../components/DragInput';

interface ParticlePanelProps {
  layer: ParticleLayer;
}

export function ParticlePanel({ layer }: ParticlePanelProps) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const [section, setSection] = useState<'presets' | 'emitter' | 'forces' | 'appearance'>('presets');

  let config: EmitterConfig;
  try {
    config = JSON.parse(layer.particle.emitterConfig);
  } catch {
    config = createEmitterConfig();
  }

  const updateConfig = (updates: Partial<EmitterConfig>) => {
    const next = { ...config, ...updates };
    updateLayerProperty(layer.id, 'particle.emitterConfig', JSON.stringify(next));
  };

  const applyPreset = (presetName: string) => {
    const preset = PARTICLE_PRESETS[presetName]?.();
    if (!preset) return;
    updateLayerProperty(layer.id, 'particle.emitterConfig', JSON.stringify(preset));
    updateLayerProperty(layer.id, 'particle.preset', presetName);
  };

  const randomizeSeed = () => {
    updateLayerProperty(layer.id, 'particle.seed', Math.floor(Math.random() * 100000));
  };

  const sections: { id: typeof section; label: string }[] = [
    { id: 'presets', label: 'Presets' },
    { id: 'emitter', label: 'Emitter' },
    { id: 'forces', label: 'Forces' },
    { id: 'appearance', label: 'Look' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles size={13} className="text-[#f7b500]" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          Particle System
        </span>
      </div>

      {/* Section tabs */}
      <div className="flex gap-0.5">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 px-1.5 py-1 text-[9px] rounded transition-colors ${
              section === s.id
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#122240] text-slate-500 hover:text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Seed */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-10">Seed</span>
        <span className="text-[10px] text-slate-300 font-mono flex-1">{layer.particle.seed}</span>
        <button
          onClick={randomizeSeed}
          className="p-1 rounded hover:bg-[#1a2a42] text-slate-400 hover:text-slate-200"
          title="Randomize seed"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      {section === 'presets' && (
        <PresetsSection currentPreset={layer.particle.preset} onApply={applyPreset} />
      )}

      {section === 'emitter' && (
        <EmitterSection config={config} onChange={updateConfig} />
      )}

      {section === 'forces' && (
        <ForcesSection config={config} onChange={updateConfig} />
      )}

      {section === 'appearance' && (
        <AppearanceSection config={config} onChange={updateConfig} />
      )}
    </div>
  );
}

function PresetsSection({ currentPreset, onApply }: { currentPreset: string; onApply: (name: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PRESET_NAMES.map((name) => (
        <button
          key={name}
          onClick={() => onApply(name)}
          className={`px-2 py-2 rounded text-[10px] text-left transition-colors capitalize ${
            currentPreset === name
              ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
              : 'bg-[#0c1018] border border-[#1a2a42] text-slate-400 hover:text-slate-200 hover:border-[#f7b500]/50'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function EmitterSection({ config, onChange }: { config: EmitterConfig; onChange: (u: Partial<EmitterConfig>) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Shape</label>
        <div className="flex gap-0.5">
          {(['point', 'circle', 'ring', 'rectangle'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ emitterShape: s })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.emitterShape === s
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {(config.emitterShape === 'circle' || config.emitterShape === 'ring') && (
        <DragInput label="Radius" value={config.emitterRadius} onChange={(v) => onChange({ emitterRadius: Math.max(1, v) })} min={1} max={500} step={1} precision={0} />
      )}
      {config.emitterShape === 'rectangle' && (
        <>
          <DragInput label="Width" value={config.emitterWidth} onChange={(v) => onChange({ emitterWidth: Math.max(1, v) })} min={1} max={1000} step={1} precision={0} />
          <DragInput label="Height" value={config.emitterHeight} onChange={(v) => onChange({ emitterHeight: Math.max(1, v) })} min={1} max={1000} step={1} precision={0} />
        </>
      )}

      <DragInput label="Max" value={config.maxParticles} onChange={(v) => onChange({ maxParticles: Math.max(10, Math.round(v)) })} min={10} max={5000} step={10} precision={0} />
      <DragInput label="Rate" value={config.spawnRate} onChange={(v) => onChange({ spawnRate: Math.max(0, v) })} min={0} max={500} step={1} precision={0} suffix="/s" />
      <DragInput label="Burst" value={config.burstCount} onChange={(v) => onChange({ burstCount: Math.max(0, Math.round(v)) })} min={0} max={1000} step={1} precision={0} />

      <div className="border-t border-[#1a2a42] pt-2">
        <span className="text-[9px] text-slate-500 uppercase">Initial Values</span>
      </div>
      <DragInput label="Speed Min" value={config.initialSpeed.min} onChange={(v) => onChange({ initialSpeed: { ...config.initialSpeed, min: v } })} min={0} max={1000} step={1} precision={0} />
      <DragInput label="Speed Max" value={config.initialSpeed.max} onChange={(v) => onChange({ initialSpeed: { ...config.initialSpeed, max: v } })} min={0} max={1000} step={1} precision={0} />
      <DragInput label="Angle Min" value={config.initialAngle.min} onChange={(v) => onChange({ initialAngle: { ...config.initialAngle, min: v } })} step={1} precision={0} suffix="deg" />
      <DragInput label="Angle Max" value={config.initialAngle.max} onChange={(v) => onChange({ initialAngle: { ...config.initialAngle, max: v } })} step={1} precision={0} suffix="deg" />
      <DragInput label="Size Min" value={config.initialSize.min} onChange={(v) => onChange({ initialSize: { ...config.initialSize, min: Math.max(0.5, v) } })} min={0.5} max={200} step={0.5} precision={1} />
      <DragInput label="Size Max" value={config.initialSize.max} onChange={(v) => onChange({ initialSize: { ...config.initialSize, max: Math.max(0.5, v) } })} min={0.5} max={200} step={0.5} precision={1} />
      <DragInput label="Life Min" value={config.lifetime.min} onChange={(v) => onChange({ lifetime: { ...config.lifetime, min: Math.max(0.1, v) } })} min={0.1} max={20} step={0.1} precision={1} suffix="s" />
      <DragInput label="Life Max" value={config.lifetime.max} onChange={(v) => onChange({ lifetime: { ...config.lifetime, max: Math.max(0.1, v) } })} min={0.1} max={20} step={0.1} precision={1} suffix="s" />
    </div>
  );
}

function ForcesSection({ config, onChange }: { config: EmitterConfig; onChange: (u: Partial<EmitterConfig>) => void }) {
  return (
    <div className="space-y-2">
      <DragInput label="Gravity X" value={config.gravity[0]} onChange={(v) => onChange({ gravity: [v, config.gravity[1]] })} step={1} precision={0} />
      <DragInput label="Gravity Y" value={config.gravity[1]} onChange={(v) => onChange({ gravity: [config.gravity[0], v] })} step={1} precision={0} />
      <DragInput label="Drag" value={config.drag} onChange={(v) => onChange({ drag: Math.max(0, v) })} min={0} max={10} step={0.1} precision={1} />
      <DragInput label="Turbulence" value={config.turbulenceStrength} onChange={(v) => onChange({ turbulenceStrength: Math.max(0, v) })} min={0} max={500} step={1} precision={0} />
      <DragInput label="Turb Scale" value={config.turbulenceScale} onChange={(v) => onChange({ turbulenceScale: Math.max(0.001, v) })} min={0.001} max={0.1} step={0.001} precision={3} />
      <DragInput label="Spin Min" value={config.spinSpeed.min} onChange={(v) => onChange({ spinSpeed: { ...config.spinSpeed, min: v } })} step={0.1} precision={1} />
      <DragInput label="Spin Max" value={config.spinSpeed.max} onChange={(v) => onChange({ spinSpeed: { ...config.spinSpeed, max: v } })} step={0.1} precision={1} />
    </div>
  );
}

function AppearanceSection({ config, onChange }: { config: EmitterConfig; onChange: (u: Partial<EmitterConfig>) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Shape</label>
        <div className="flex gap-0.5 flex-wrap">
          {(['circle', 'square', 'star', 'spark', 'smoke'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ spriteShape: s })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.spriteShape === s
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Blend</label>
        <div className="flex gap-0.5">
          {(['alpha', 'additive', 'screen'] as const).map((b) => (
            <button
              key={b}
              onClick={() => onChange({ blendMode: b })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.blendMode === b
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#1a2a42] pt-2">
        <span className="text-[9px] text-slate-500 uppercase">Color Over Life</span>
      </div>
      {config.colorOverLife.map((stop, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <input
            type="color"
            value={rgbToHex(stop.color[0], stop.color[1], stop.color[2])}
            onChange={(e) => {
              const [r, g, b] = hexToRgb(e.target.value);
              const newStops = [...config.colorOverLife];
              newStops[idx] = { ...newStops[idx], color: [r, g, b, stop.color[3]] };
              onChange({ colorOverLife: newStops });
            }}
            className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 flex-shrink-0"
          />
          <BrandColorPicker
            onSelect={(rgba) => {
              const newStops = [...config.colorOverLife];
              newStops[idx] = { ...newStops[idx], color: [rgba[0], rgba[1], rgba[2], stop.color[3]] };
              onChange({ colorOverLife: newStops });
            }}
            currentAlpha={stop.color[3]}
          />
          <DragInput
            label="t"
            value={Math.round(stop.t * 100)}
            onChange={(v) => {
              const newStops = [...config.colorOverLife];
              newStops[idx] = { ...newStops[idx], t: Math.max(0, Math.min(100, Math.round(v))) / 100 };
              onChange({ colorOverLife: newStops });
            }}
            min={0} max={100} step={1} precision={0}
            className="flex-1"
          />
          <DragInput
            label="A"
            value={Math.round(stop.color[3] * 100)}
            onChange={(v) => {
              const newStops = [...config.colorOverLife];
              newStops[idx] = { ...newStops[idx], color: [stop.color[0], stop.color[1], stop.color[2], Math.max(0, Math.min(100, Math.round(v))) / 100] };
              onChange({ colorOverLife: newStops });
            }}
            min={0} max={100} step={1} precision={0}
            className="flex-1"
          />
        </div>
      ))}
    </div>
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
