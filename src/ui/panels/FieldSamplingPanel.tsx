import { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor';
import type {
  FieldSampledConfig,
  FieldDefinition,
  SamplerDefinition,
  MarkStyle,
  FieldAnimationDef,
  GlyphFieldDef,
  NoiseFieldDef,
  GridSamplerDef,
  ScanlineSamplerDef,
  OffsetBundleSamplerDef,
} from '../../field-sampling/types';
import {
  DEFAULT_FIELD_SAMPLED_CONFIG,
  DEFAULT_GLYPH_FIELD,
  DEFAULT_NOISE_FIELD,
  DEFAULT_GRID_SAMPLER,
  DEFAULT_SCANLINE_SAMPLER,
  DEFAULT_OFFSET_BUNDLE_SAMPLER,
} from '../../field-sampling/types';
import { Grid3x3, Waves, Circle, Type, Zap, Plus } from 'lucide-react';

const FIELD_PRESETS: { name: string; config: FieldSampledConfig }[] = [
  {
    name: 'Halftone Dots',
    config: {
      ...DEFAULT_FIELD_SAMPLED_CONFIG,
      field: { ...DEFAULT_GLYPH_FIELD, text: '?', fontSize: 400 },
      sampler: { ...DEFAULT_GRID_SAMPLER, cellSize: 8, dotSizeMax: 6 },
      mark: { ...DEFAULT_FIELD_SAMPLED_CONFIG.mark, shape: 'dot' },
    },
  },
  {
    name: 'Scanline Figure',
    config: {
      ...DEFAULT_FIELD_SAMPLED_CONFIG,
      field: { ...DEFAULT_GLYPH_FIELD, text: '1', fontSize: 500 },
      sampler: { ...DEFAULT_SCANLINE_SAMPLER, lineSpacing: 4, dashMaxLength: 60 },
      mark: { ...DEFAULT_FIELD_SAMPLED_CONFIG.mark, shape: 'dash', strokeWidth: 2 },
    },
  },
  {
    name: 'Ribbon Bundle',
    config: {
      ...DEFAULT_FIELD_SAMPLED_CONFIG,
      field: { type: 'path', points: [], closed: false, smoothing: 0.8 },
      sampler: { ...DEFAULT_OFFSET_BUNDLE_SAMPLER, copyCount: 30, offsetSpacing: 3 },
      mark: { ...DEFAULT_FIELD_SAMPLED_CONFIG.mark, shape: 'line', strokeWidth: 1 },
    },
  },
  {
    name: 'Noise Rain',
    config: {
      ...DEFAULT_FIELD_SAMPLED_CONFIG,
      field: { ...DEFAULT_NOISE_FIELD, scale: 0.02, threshold: 0.3 },
      sampler: { ...DEFAULT_SCANLINE_SAMPLER, direction: 'vertical', lineSpacing: 3, noiseBreak: true },
      mark: { ...DEFAULT_FIELD_SAMPLED_CONFIG.mark, shape: 'dash', strokeWidth: 1 },
      animation: { ...DEFAULT_FIELD_SAMPLED_CONFIG.animation, noiseEvolution: 1 },
    },
  },
  {
    name: 'Hatched Letter',
    config: {
      ...DEFAULT_FIELD_SAMPLED_CONFIG,
      field: { ...DEFAULT_GLYPH_FIELD, text: '0', fontSize: 450 },
      sampler: { ...DEFAULT_SCANLINE_SAMPLER, direction: 'vertical', lineSpacing: 3, dashMaxLength: 200, threshold: 0.2 },
      mark: { ...DEFAULT_FIELD_SAMPLED_CONFIG.mark, shape: 'dash', strokeWidth: 1.2 },
    },
  },
];

export function FieldSamplingPanel() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addFieldSampledLayer = useEditorStore((s) => s.addFieldSampledLayer);

  const layer = composition.layers.find((l) => l.id === selection.activeId);
  const isFieldLayer = layer?.type === 'fieldSampled';

  const [config, setConfig] = useState<FieldSampledConfig>(() => {
    if (isFieldLayer) {
      try { return JSON.parse(layer.fieldSampled.configJSON); } catch { /* fall through */ }
    }
    return { ...DEFAULT_FIELD_SAMPLED_CONFIG };
  });

  const applyConfig = useCallback((newConfig: FieldSampledConfig) => {
    setConfig(newConfig);
    if (isFieldLayer && layer) {
      updateLayerProperty(layer.id, 'fieldSampled.configJSON', JSON.stringify(newConfig));
    }
  }, [isFieldLayer, layer, updateLayerProperty]);

  const updateField = (partial: Partial<FieldDefinition>) => {
    applyConfig({ ...config, field: { ...config.field, ...partial } as FieldDefinition });
  };

  const updateSampler = (partial: Partial<SamplerDefinition>) => {
    applyConfig({ ...config, sampler: { ...config.sampler, ...partial } as SamplerDefinition });
  };

  const updateMark = (partial: Partial<MarkStyle>) => {
    applyConfig({ ...config, mark: { ...config.mark, ...partial } });
  };

  const updateAnimation = (partial: Partial<FieldAnimationDef>) => {
    applyConfig({ ...config, animation: { ...config.animation, ...partial } });
  };

  const handleAddLayer = (preset?: FieldSampledConfig) => {
    const cfg = preset || config;
    addFieldSampledLayer(JSON.stringify({
      ...cfg,
      canvasWidth: composition.settings.width,
      canvasHeight: composition.settings.height,
    }));
  };

  const switchFieldType = (type: FieldDefinition['type']) => {
    let newField: FieldDefinition;
    switch (type) {
      case 'glyph': newField = { ...DEFAULT_GLYPH_FIELD }; break;
      case 'noise': newField = { ...DEFAULT_NOISE_FIELD }; break;
      case 'path': newField = { type: 'path', points: [], closed: false, smoothing: 0.8 }; break;
      default: return;
    }
    applyConfig({ ...config, field: newField });
  };

  const switchSamplerType = (type: SamplerDefinition['type']) => {
    let newSampler: SamplerDefinition;
    switch (type) {
      case 'grid': newSampler = { ...DEFAULT_GRID_SAMPLER }; break;
      case 'scanline': newSampler = { ...DEFAULT_SCANLINE_SAMPLER }; break;
      case 'offsetBundle': newSampler = { ...DEFAULT_OFFSET_BUNDLE_SAMPLER }; break;
      default: return;
    }
    applyConfig({ ...config, sampler: newSampler });
  };

  return (
    <div className="px-2 py-2 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
          <Grid3x3 size={12} className="text-cyan-400" />
          Field Sampling
        </h3>
      </div>

      {/* Presets */}
      <div>
        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {FIELD_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => handleAddLayer(p.config)}
              className="text-[9px] text-left px-1.5 py-1 bg-[#0a1628] border border-[#1a2a42] rounded hover:border-cyan-500/40 hover:text-cyan-300 text-slate-400 transition-colors"
            >
              <Plus size={8} className="inline mr-0.5 opacity-50" />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {!isFieldLayer && (
        <div className="text-[10px] text-slate-600 text-center py-2">
          Select a Field Sampled layer to edit, or use a preset above to create one.
        </div>
      )}

      {isFieldLayer && (
        <div className="space-y-2.5">
          {/* Field Type */}
          <FieldSection config={config} switchFieldType={switchFieldType} updateField={updateField} />

          {/* Sampler Type */}
          <SamplerSection config={config} switchSamplerType={switchSamplerType} updateSampler={updateSampler} />

          {/* Mark Style */}
          <MarkSection config={config} updateMark={updateMark} />

          {/* Animation */}
          <AnimationSection config={config} updateAnimation={updateAnimation} />
        </div>
      )}
    </div>
  );
}

function FieldSection({
  config,
  switchFieldType,
  updateField,
}: {
  config: FieldSampledConfig;
  switchFieldType: (type: FieldDefinition['type']) => void;
  updateField: (partial: Partial<FieldDefinition>) => void;
}) {
  const field = config.field;

  return (
    <div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Type size={9} /> Field Source
      </div>
      <select
        value={field.type}
        onChange={(e) => switchFieldType(e.target.value as FieldDefinition['type'])}
        className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300 mb-1.5"
      >
        <option value="glyph">Glyph / Text</option>
        <option value="noise">Noise Field</option>
        <option value="path">Path</option>
      </select>

      {field.type === 'glyph' && (
        <GlyphFieldControls field={field} updateField={updateField} />
      )}
      {field.type === 'noise' && (
        <NoiseFieldControls field={field as NoiseFieldDef} updateField={updateField} />
      )}
    </div>
  );
}

function GlyphFieldControls({
  field,
  updateField,
}: {
  field: GlyphFieldDef;
  updateField: (partial: Partial<FieldDefinition>) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] text-slate-500 block">
        Text
        <input
          type="text"
          value={field.text}
          onChange={(e) => updateField({ text: e.target.value })}
          className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
        />
      </label>
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Font Size
          <input
            type="number"
            value={field.fontSize}
            min={20}
            max={1000}
            step={10}
            onChange={(e) => updateField({ fontSize: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Weight
          <input
            type="number"
            value={field.fontWeight}
            min={100}
            max={900}
            step={100}
            onChange={(e) => updateField({ fontWeight: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <label className="text-[9px] text-slate-500 block">
        Font Family
        <select
          value={field.fontFamily}
          onChange={(e) => updateField({ fontFamily: e.target.value })}
          className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
        >
          {['Inter', 'Arial', 'Helvetica', 'Georgia', 'Courier New', 'Verdana', 'Montserrat'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NoiseFieldControls({
  field,
  updateField,
}: {
  field: NoiseFieldDef;
  updateField: (partial: Partial<FieldDefinition>) => void;
}) {
  return (
    <div className="space-y-1">
      <select
        value={field.noiseType}
        onChange={(e) => updateField({ noiseType: e.target.value as NoiseFieldDef['noiseType'] })}
        className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300"
      >
        <option value="simplex">Simplex</option>
        <option value="perlin">Perlin</option>
        <option value="worley">Worley</option>
      </select>
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Scale
          <input type="number" value={field.scale} min={0.001} max={0.5} step={0.005}
            onChange={(e) => updateField({ scale: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Octaves
          <input type="number" value={field.octaves} min={1} max={8} step={1}
            onChange={(e) => updateField({ octaves: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <label className="text-[9px] text-slate-500 block">
        Threshold: {(field.threshold * 100).toFixed(0)}%
        <input type="range" min={0} max={100} value={field.threshold * 100}
          onChange={(e) => updateField({ threshold: +e.target.value / 100 })}
          className="w-full h-1 mt-0.5"
        />
      </label>
      <label className="text-[9px] text-slate-500 block">
        Time Speed: {field.timeSpeed.toFixed(1)}
        <input type="range" min={0} max={50} value={field.timeSpeed * 10}
          onChange={(e) => updateField({ timeSpeed: +e.target.value / 10 })}
          className="w-full h-1 mt-0.5"
        />
      </label>
    </div>
  );
}

function SamplerSection({
  config,
  switchSamplerType,
  updateSampler,
}: {
  config: FieldSampledConfig;
  switchSamplerType: (type: SamplerDefinition['type']) => void;
  updateSampler: (partial: Partial<SamplerDefinition>) => void;
}) {
  const sampler = config.sampler;

  return (
    <div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Waves size={9} /> Sampling Mode
      </div>
      <select
        value={sampler.type}
        onChange={(e) => switchSamplerType(e.target.value as SamplerDefinition['type'])}
        className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300 mb-1.5"
      >
        <option value="grid">Grid / Halftone</option>
        <option value="scanline">Scanline / Dashes</option>
        <option value="offsetBundle">Offset Bundle / Ribbon</option>
      </select>

      {sampler.type === 'grid' && <GridSamplerControls sampler={sampler} updateSampler={updateSampler} />}
      {sampler.type === 'scanline' && <ScanlineSamplerControls sampler={sampler as ScanlineSamplerDef} updateSampler={updateSampler} />}
      {sampler.type === 'offsetBundle' && <OffsetBundleControls sampler={sampler as OffsetBundleSamplerDef} updateSampler={updateSampler} />}
    </div>
  );
}

function GridSamplerControls({ sampler, updateSampler }: { sampler: GridSamplerDef; updateSampler: (p: Partial<SamplerDefinition>) => void }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Cell Size
          <input type="number" value={sampler.cellSize} min={2} max={40} step={1}
            onChange={(e) => updateSampler({ cellSize: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Jitter
          <input type="number" value={sampler.jitter} min={0} max={1} step={0.05}
            onChange={(e) => updateSampler({ jitter: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Min Size
          <input type="number" value={sampler.dotSizeMin} min={0.5} max={20} step={0.5}
            onChange={(e) => updateSampler({ dotSizeMin: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Max Size
          <input type="number" value={sampler.dotSizeMax} min={1} max={30} step={0.5}
            onChange={(e) => updateSampler({ dotSizeMax: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <label className="text-[9px] text-slate-500 block">
        Threshold: {(sampler.threshold * 100).toFixed(0)}%
        <input type="range" min={0} max={100} value={sampler.threshold * 100}
          onChange={(e) => updateSampler({ threshold: +e.target.value / 100 })}
          className="w-full h-1 mt-0.5"
        />
      </label>
    </div>
  );
}

function ScanlineSamplerControls({ sampler, updateSampler }: { sampler: ScanlineSamplerDef; updateSampler: (p: Partial<SamplerDefinition>) => void }) {
  return (
    <div className="space-y-1">
      <select
        value={sampler.direction}
        onChange={(e) => updateSampler({ direction: e.target.value as 'horizontal' | 'vertical' })}
        className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300"
      >
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </select>
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Line Spacing
          <input type="number" value={sampler.lineSpacing} min={1} max={20} step={1}
            onChange={(e) => updateSampler({ lineSpacing: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Max Dash
          <input type="number" value={sampler.dashMaxLength} min={5} max={300} step={5}
            onChange={(e) => updateSampler({ dashMaxLength: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <label className="text-[9px] text-slate-500 block">
        Threshold: {(sampler.threshold * 100).toFixed(0)}%
        <input type="range" min={0} max={100} value={sampler.threshold * 100}
          onChange={(e) => updateSampler({ threshold: +e.target.value / 100 })}
          className="w-full h-1 mt-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
        <input type="checkbox" checked={sampler.noiseBreak}
          onChange={(e) => updateSampler({ noiseBreak: e.target.checked })}
          className="w-3 h-3 rounded"
        />
        Noise break gaps
      </label>
      {sampler.noiseBreak && (
        <label className="text-[9px] text-slate-500 block">
          Gap chance: {(sampler.gapChance * 100).toFixed(0)}%
          <input type="range" min={0} max={50} value={sampler.gapChance * 100}
            onChange={(e) => updateSampler({ gapChance: +e.target.value / 100 })}
            className="w-full h-1 mt-0.5"
          />
        </label>
      )}
    </div>
  );
}

function OffsetBundleControls({ sampler, updateSampler }: { sampler: OffsetBundleSamplerDef; updateSampler: (p: Partial<SamplerDefinition>) => void }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px] text-slate-500">
          Copies
          <input type="number" value={sampler.copyCount} min={2} max={80} step={1}
            onChange={(e) => updateSampler({ copyCount: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500">
          Spacing
          <input type="number" value={sampler.offsetSpacing} min={0.5} max={20} step={0.5}
            onChange={(e) => updateSampler({ offsetSpacing: +e.target.value })}
            className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
          />
        </label>
      </div>
      <label className="text-[9px] text-slate-500">
        Opacity Falloff
        <select value={sampler.opacityFalloff}
          onChange={(e) => updateSampler({ opacityFalloff: e.target.value as OffsetBundleSamplerDef['opacityFalloff'] })}
          className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
        >
          <option value="linear">Linear</option>
          <option value="easeOut">Ease Out</option>
          <option value="gaussian">Gaussian</option>
        </select>
      </label>
      <label className="text-[9px] text-slate-500 block">
        Stroke Width: {sampler.strokeWidth}px
        <input type="range" min={5} max={30} value={sampler.strokeWidth * 10}
          onChange={(e) => updateSampler({ strokeWidth: +e.target.value / 10 })}
          className="w-full h-1 mt-0.5"
        />
      </label>
    </div>
  );
}

function MarkSection({
  config,
  updateMark,
}: {
  config: FieldSampledConfig;
  updateMark: (partial: Partial<MarkStyle>) => void;
}) {
  const mark = config.mark;

  return (
    <div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Circle size={9} /> Mark Style
      </div>
      <div className="space-y-1">
        <select value={mark.shape}
          onChange={(e) => updateMark({ shape: e.target.value as MarkStyle['shape'] })}
          className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300"
        >
          <option value="dot">Dot</option>
          <option value="dash">Dash</option>
          <option value="line">Line</option>
        </select>
        <div className="grid grid-cols-2 gap-1">
          <label className="text-[9px] text-slate-500">
            Size Min
            <input type="number" value={mark.sizeMin} min={0.5} max={20} step={0.5}
              onChange={(e) => updateMark({ sizeMin: +e.target.value })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
            />
          </label>
          <label className="text-[9px] text-slate-500">
            Size Max
            <input type="number" value={mark.sizeMax} min={1} max={30} step={0.5}
              onChange={(e) => updateMark({ sizeMax: +e.target.value })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
            />
          </label>
        </div>
        <label className="text-[9px] text-slate-500 block">
          Stroke Width: {mark.strokeWidth}px
          <input type="range" min={5} max={50} value={mark.strokeWidth * 10}
            onChange={(e) => updateMark({ strokeWidth: +e.target.value / 10 })}
            className="w-full h-1 mt-0.5"
          />
        </label>
        <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
          <input type="checkbox" checked={mark.roundCaps}
            onChange={(e) => updateMark({ roundCaps: e.target.checked })}
            className="w-3 h-3 rounded"
          />
          Round caps
        </label>
      </div>
    </div>
  );
}

function AnimationSection({
  config,
  updateAnimation,
}: {
  config: FieldSampledConfig;
  updateAnimation: (partial: Partial<FieldAnimationDef>) => void;
}) {
  const anim = config.animation;

  return (
    <div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Zap size={9} /> Animation
      </div>
      <div className="space-y-1">
        <label className="text-[9px] text-slate-500 block">
          Noise Evolution: {anim.noiseEvolution.toFixed(1)}
          <input type="range" min={0} max={50} value={anim.noiseEvolution * 10}
            onChange={(e) => updateAnimation({ noiseEvolution: +e.target.value / 10 })}
            className="w-full h-1 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500 block">
          Rotation: {anim.rotationSpeed.toFixed(1)} deg/s
          <input type="range" min={0} max={360} value={anim.rotationSpeed}
            onChange={(e) => updateAnimation({ rotationSpeed: +e.target.value })}
            className="w-full h-1 mt-0.5"
          />
        </label>
        <label className="text-[9px] text-slate-500 block">
          Breathe: {anim.breatheAmplitude.toFixed(2)}
          <input type="range" min={0} max={100} value={anim.breatheAmplitude * 100}
            onChange={(e) => updateAnimation({ breatheAmplitude: +e.target.value / 100 })}
            className="w-full h-1 mt-0.5"
          />
        </label>
      </div>
    </div>
  );
}
