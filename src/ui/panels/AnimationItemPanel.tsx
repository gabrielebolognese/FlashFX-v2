import { useState } from 'react';
import { Activity } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { BrandColorPicker } from '../components/BrandColorPicker';
import type { AnimationItemLayer } from '../../core/types';
import type { AnimationItemConfig, DataSourceConfig, ProgressBarConfig, StopwatchConfig, CounterConfig, RatingStarsConfig, LoadingSpinnerConfig, GaugeConfig } from '../../animation-items/types';
import { ANIMATION_ITEM_PRESETS } from '../../animation-items/presets';
import { DragInput } from '../components/DragInput';

interface AnimationItemPanelProps {
  layer: AnimationItemLayer;
}

export function AnimationItemPanel({ layer }: AnimationItemPanelProps) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const [section, setSection] = useState<'presets' | 'data' | 'style'>('style');

  let itemConfig: AnimationItemConfig;
  let dataSource: DataSourceConfig;
  try {
    itemConfig = JSON.parse(layer.animationItem.configJSON);
    dataSource = JSON.parse(layer.animationItem.dataSourceJSON);
  } catch {
    return <div className="text-[10px] text-red-400 px-2">Invalid configuration</div>;
  }

  const updateConfig = (newConfig: AnimationItemConfig) => {
    updateLayerProperty(layer.id, 'animationItem.configJSON', JSON.stringify(newConfig));
  };

  const updateDataSource = (newData: DataSourceConfig) => {
    updateLayerProperty(layer.id, 'animationItem.dataSourceJSON', JSON.stringify(newData));
  };

  const applyPreset = (presetName: string) => {
    const preset = ANIMATION_ITEM_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    updateLayerProperty(layer.id, 'animationItem.configJSON', JSON.stringify(preset.itemConfig));
    updateLayerProperty(layer.id, 'animationItem.dataSourceJSON', JSON.stringify(preset.dataSource));
    updateLayerProperty(layer.id, 'animationItem.itemType', preset.itemConfig.type);
  };

  const sections: { id: typeof section; label: string }[] = [
    { id: 'presets', label: 'Presets' },
    { id: 'data', label: 'Data' },
    { id: 'style', label: 'Style' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Activity size={13} className="text-[#f7b500]" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          Animation Item
        </span>
      </div>

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

      {section === 'presets' && (
        <PresetSection currentType={itemConfig.type} onApply={applyPreset} />
      )}

      {section === 'data' && (
        <DataSection dataSource={dataSource} onChange={updateDataSource} />
      )}

      {section === 'style' && (
        <StyleSection itemConfig={itemConfig} onChange={updateConfig} />
      )}
    </div>
  );
}

function PresetSection({ currentType, onApply }: { currentType: string; onApply: (name: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'progressBar' | 'stopwatch' | 'counter' | 'ratingStars' | 'loadingSpinner' | 'gauge'>('all');

  const categories = [
    { id: 'all' as const, label: 'All' },
    { id: 'progressBar' as const, label: 'Progress' },
    { id: 'counter' as const, label: 'Counter' },
    { id: 'stopwatch' as const, label: 'Timer' },
    { id: 'loadingSpinner' as const, label: 'Loader' },
    { id: 'gauge' as const, label: 'Gauge' },
  ];

  const filtered = filter === 'all'
    ? ANIMATION_ITEM_PRESETS
    : ANIMATION_ITEM_PRESETS.filter((p) => p.itemConfig.type === filter || (filter === 'stopwatch' && p.itemConfig.type === 'countdown'));

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 flex-wrap">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
              filter === c.id
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#122240] text-slate-500 hover:text-slate-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {filtered.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onApply(preset.name)}
            className={`px-2 py-2 rounded text-[10px] text-left transition-colors ${
              currentType === preset.itemConfig.type
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#0c1018] border border-[#1a2a42] text-slate-400 hover:text-slate-200 hover:border-[#f7b500]/50'
            }`}
            title={preset.description}
          >
            <span className="block font-medium">{preset.name}</span>
            <span className="block text-[8px] text-slate-500 mt-0.5 leading-tight">{preset.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DataSection({ dataSource, onChange }: { dataSource: DataSourceConfig; onChange: (d: DataSourceConfig) => void }) {
  const easings: DataSourceConfig['simulatedEasing'][] = ['linear', 'easeOut', 'easeInOut', 'spring'];

  return (
    <div className="space-y-2">
      <DragInput
        label="Start"
        value={dataSource.simulatedStart * 100}
        onChange={(v) => onChange({ ...dataSource, simulatedStart: v / 100 })}
        min={0} max={100} step={1} precision={0} suffix="%"
      />
      <DragInput
        label="End"
        value={dataSource.simulatedEnd * 100}
        onChange={(v) => onChange({ ...dataSource, simulatedEnd: v / 100 })}
        min={0} max={100} step={1} precision={0} suffix="%"
      />
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Easing</label>
        <div className="flex gap-0.5 flex-wrap">
          {easings.map((e) => (
            <button
              key={e}
              onClick={() => onChange({ ...dataSource, simulatedEasing: e })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                dataSource.simulatedEasing === e
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleSection({ itemConfig, onChange }: { itemConfig: AnimationItemConfig; onChange: (c: AnimationItemConfig) => void }) {
  switch (itemConfig.type) {
    case 'progressBar':
      return <ProgressBarStyle config={itemConfig.config} onChange={(config) => onChange({ type: 'progressBar', config })} />;
    case 'stopwatch':
    case 'countdown':
      return <StopwatchStyle config={itemConfig.config} onChange={(config) => onChange({ type: itemConfig.type, config })} />;
    case 'counter':
      return <CounterStyle config={itemConfig.config} onChange={(config) => onChange({ type: 'counter', config })} />;
    case 'ratingStars':
      return <RatingStarsStyle config={itemConfig.config} onChange={(config) => onChange({ type: 'ratingStars', config })} />;
    case 'loadingSpinner':
      return <SpinnerStyle config={itemConfig.config} onChange={(config) => onChange({ type: 'loadingSpinner', config })} />;
    case 'gauge':
      return <GaugeStyle config={itemConfig.config} onChange={(config) => onChange({ type: 'gauge', config })} />;
  }
}

function ProgressBarStyle({ config, onChange }: { config: ProgressBarConfig; onChange: (c: ProgressBarConfig) => void }) {
  const shapes: ProgressBarConfig['shape'][] = ['linear', 'radial', 'segmented'];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Shape</label>
        <div className="flex gap-0.5">
          {shapes.map((s) => (
            <button key={s} onClick={() => onChange({ ...config, shape: s })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.shape === s ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>
      {config.shape === 'linear' && (
        <>
          <DragInput label="Width" value={config.trackWidth} onChange={(v) => onChange({ ...config, trackWidth: Math.max(50, v) })} min={50} max={800} step={5} precision={0} />
          <DragInput label="Height" value={config.trackHeight} onChange={(v) => onChange({ ...config, trackHeight: Math.max(8, v) })} min={8} max={80} step={1} precision={0} />
          <DragInput label="Radius" value={config.trackStyle?.cornerRadius ?? 12} onChange={(v) => onChange({ ...config, trackStyle: { ...config.trackStyle, cornerRadius: v }, fillStyle: { ...config.fillStyle, cornerRadius: Math.max(0, v - 2) } })} min={0} max={40} step={1} precision={0} />
        </>
      )}
      {config.shape === 'radial' && (
        <>
          <DragInput label="Size" value={config.trackWidth} onChange={(v) => onChange({ ...config, trackWidth: v, trackHeight: v })} min={40} max={400} step={5} precision={0} />
          <DragInput label="Thick" value={config.trackStyle?.strokeWidth ?? 10} onChange={(v) => onChange({ ...config, trackStyle: { ...config.trackStyle, strokeWidth: v }, fillStyle: { ...config.fillStyle, strokeWidth: v } })} min={2} max={40} step={1} precision={0} />
        </>
      )}
      {config.shape === 'segmented' && (
        <>
          <DragInput label="Segments" value={config.segmentCount} onChange={(v) => onChange({ ...config, segmentCount: Math.max(2, Math.round(v)) })} min={2} max={20} step={1} precision={0} />
          <DragInput label="Gap" value={config.segmentGap} onChange={(v) => onChange({ ...config, segmentGap: Math.max(1, v) })} min={1} max={20} step={1} precision={0} />
          <DragInput label="Width" value={config.trackWidth} onChange={(v) => onChange({ ...config, trackWidth: Math.max(50, v) })} min={50} max={800} step={5} precision={0} />
          <DragInput label="Height" value={config.trackHeight} onChange={(v) => onChange({ ...config, trackHeight: Math.max(8, v) })} min={8} max={80} step={1} precision={0} />
        </>
      )}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Label</label>
        <button onClick={() => onChange({ ...config, showLabel: !config.showLabel })}
          className={`w-7 h-4 rounded-full transition-colors relative ${config.showLabel ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.showLabel ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      <ColorPicker label="Track" color={config.trackStyle?.fillColor ?? [0.12, 0.15, 0.22, 1]} onChange={(fillColor) => onChange({ ...config, trackStyle: { ...config.trackStyle, fillColor } })} />
      <ColorPicker label="Fill" color={config.fillStyle?.fillColor ?? [0.96, 0.71, 0, 1]} onChange={(fillColor) => onChange({ ...config, fillStyle: { ...config.fillStyle, fillColor } })} />
    </div>
  );
}

function StopwatchStyle({ config, onChange }: { config: StopwatchConfig; onChange: (c: StopwatchConfig) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Variant</label>
        <div className="flex gap-0.5">
          {(['digital', 'analog'] as const).map((v) => (
            <button key={v} onClick={() => onChange({ ...config, variant: v })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.variant === v ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Direction</label>
        <div className="flex gap-0.5">
          {(['up', 'down'] as const).map((d) => (
            <button key={d} onClick={() => onChange({ ...config, direction: d })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.direction === d ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}>{d}</button>
          ))}
        </div>
      </div>
      <DragInput label="Duration" value={config.totalDurationSeconds} onChange={(v) => onChange({ ...config, totalDurationSeconds: Math.max(1, v) })} min={1} max={3600} step={1} precision={0} suffix="s" />
      {config.variant === 'digital' && (
        <DragInput label="Font Size" value={config.digitStyle?.fontSize ?? 48} onChange={(v) => onChange({ ...config, digitStyle: { ...config.digitStyle, fontSize: v } })} min={12} max={200} step={1} precision={0} />
      )}
      <ColorPicker label="Color" color={config.digitStyle?.fillColor ?? [1, 1, 1, 1]} onChange={(fillColor) => onChange({ ...config, digitStyle: { ...config.digitStyle, fillColor } })} />
    </div>
  );
}

function CounterStyle({ config, onChange }: { config: CounterConfig; onChange: (c: CounterConfig) => void }) {
  return (
    <div className="space-y-2">
      <DragInput label="Start" value={config.startValue} onChange={(v) => onChange({ ...config, startValue: v })} step={1} precision={0} />
      <DragInput label="End" value={config.endValue} onChange={(v) => onChange({ ...config, endValue: v })} step={1} precision={0} />
      <DragInput label="Decimals" value={config.decimalPlaces} onChange={(v) => onChange({ ...config, decimalPlaces: Math.max(0, Math.round(v)) })} min={0} max={4} step={1} precision={0} />
      <DragInput label="Font Size" value={config.digitStyle?.fontSize ?? 64} onChange={(v) => onChange({ ...config, digitStyle: { ...config.digitStyle, fontSize: v } })} min={12} max={200} step={1} precision={0} />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Commas</label>
        <button onClick={() => onChange({ ...config, thousandsSeparator: !config.thousandsSeparator })}
          className={`w-7 h-4 rounded-full transition-colors relative ${config.thousandsSeparator ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.thousandsSeparator ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-1">
        <div className="flex-1">
          <label className="text-[9px] text-slate-500">Prefix</label>
          <input value={config.prefix} onChange={(e) => onChange({ ...config, prefix: e.target.value })}
            className="w-full text-[10px] bg-[#122240] text-slate-300 border border-[#1a2a42] rounded px-1.5 py-0.5 mt-0.5" />
        </div>
        <div className="flex-1">
          <label className="text-[9px] text-slate-500">Suffix</label>
          <input value={config.suffix} onChange={(e) => onChange({ ...config, suffix: e.target.value })}
            className="w-full text-[10px] bg-[#122240] text-slate-300 border border-[#1a2a42] rounded px-1.5 py-0.5 mt-0.5" />
        </div>
      </div>
      <ColorPicker label="Color" color={config.digitStyle?.fillColor ?? [1, 1, 1, 1]} onChange={(fillColor) => onChange({ ...config, digitStyle: { ...config.digitStyle, fillColor } })} />
    </div>
  );
}

function RatingStarsStyle({ config, onChange }: { config: RatingStarsConfig; onChange: (c: RatingStarsConfig) => void }) {
  return (
    <div className="space-y-2">
      <DragInput label="Stars" value={config.maxStars} onChange={(v) => onChange({ ...config, maxStars: Math.max(1, Math.round(v)) })} min={1} max={10} step={1} precision={0} />
      <DragInput label="Target" value={config.targetValue} onChange={(v) => onChange({ ...config, targetValue: Math.max(0, Math.min(config.maxStars, v)) })} min={0} max={config.maxStars} step={0.5} precision={1} />
      <DragInput label="Size" value={config.starSize} onChange={(v) => onChange({ ...config, starSize: Math.max(10, v) })} min={10} max={100} step={2} precision={0} />
      <DragInput label="Gap" value={config.starGap} onChange={(v) => onChange({ ...config, starGap: Math.max(0, v) })} min={0} max={40} step={1} precision={0} />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Sequential</label>
        <button onClick={() => onChange({ ...config, animateSequentially: !config.animateSequentially })}
          className={`w-7 h-4 rounded-full transition-colors relative ${config.animateSequentially ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.animateSequentially ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      <ColorPicker label="Filled" color={config.filledStyle?.fillColor ?? [0.96, 0.71, 0, 1]} onChange={(fillColor) => onChange({ ...config, filledStyle: { ...config.filledStyle, fillColor } })} />
      <ColorPicker label="Empty" color={config.emptyStyle?.fillColor ?? [0.2, 0.22, 0.28, 1]} onChange={(fillColor) => onChange({ ...config, emptyStyle: { ...config.emptyStyle, fillColor } })} />
    </div>
  );
}

function SpinnerStyle({ config, onChange }: { config: LoadingSpinnerConfig; onChange: (c: LoadingSpinnerConfig) => void }) {
  const variants: LoadingSpinnerConfig['variant'][] = ['dots', 'ring', 'bars', 'pulse'];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Variant</label>
        <div className="flex gap-0.5 flex-wrap">
          {variants.map((v) => (
            <button key={v} onClick={() => onChange({ ...config, variant: v })}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
                config.variant === v ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}>{v}</button>
          ))}
        </div>
      </div>
      <DragInput label="Size" value={config.size} onChange={(v) => onChange({ ...config, size: Math.max(20, v) })} min={20} max={200} step={5} precision={0} />
      <DragInput label="Speed" value={config.speed} onChange={(v) => onChange({ ...config, speed: Math.max(0.5, v) })} min={0.5} max={10} step={0.5} precision={1} suffix="x" />
      {(config.variant === 'dots' || config.variant === 'bars') && (
        <DragInput label="Count" value={config.elementCount} onChange={(v) => onChange({ ...config, elementCount: Math.max(3, Math.round(v)) })} min={3} max={16} step={1} precision={0} />
      )}
      <ColorPicker label="Color" color={config.dotStyle?.fillColor ?? [0.96, 0.71, 0, 1]} onChange={(fillColor) => onChange({ ...config, dotStyle: { ...config.dotStyle, fillColor } })} />
    </div>
  );
}

function GaugeStyle({ config, onChange }: { config: GaugeConfig; onChange: (c: GaugeConfig) => void }) {
  return (
    <div className="space-y-2">
      <DragInput label="Min" value={config.minValue} onChange={(v) => onChange({ ...config, minValue: v })} step={1} precision={0} />
      <DragInput label="Max" value={config.maxValue} onChange={(v) => onChange({ ...config, maxValue: v })} step={1} precision={0} />
      <DragInput label="Start Angle" value={config.startAngle} onChange={(v) => onChange({ ...config, startAngle: v })} min={-180} max={180} step={5} precision={0} suffix="deg" />
      <DragInput label="Sweep" value={config.sweepAngle} onChange={(v) => onChange({ ...config, sweepAngle: v })} min={30} max={360} step={5} precision={0} suffix="deg" />
      <DragInput label="Thick" value={config.trackStyle?.strokeWidth ?? 14} onChange={(v) => onChange({ ...config, trackStyle: { ...config.trackStyle, strokeWidth: v }, fillStyle: { ...config.fillStyle, strokeWidth: v } })} min={2} max={40} step={1} precision={0} />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Needle</label>
        <button onClick={() => onChange({ ...config, showNeedle: !config.showNeedle })}
          className={`w-7 h-4 rounded-full transition-colors relative ${config.showNeedle ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.showNeedle ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Ticks</label>
        <button onClick={() => onChange({ ...config, showTicks: !config.showTicks })}
          className={`w-7 h-4 rounded-full transition-colors relative ${config.showTicks ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.showTicks ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      <ColorPicker label="Track" color={config.trackStyle?.fillColor ?? [0.12, 0.15, 0.22, 1]} onChange={(fillColor) => onChange({ ...config, trackStyle: { ...config.trackStyle, fillColor } })} />
      <ColorPicker label="Fill" color={config.fillStyle?.fillColor ?? [0.96, 0.71, 0, 1]} onChange={(fillColor) => onChange({ ...config, fillStyle: { ...config.fillStyle, fillColor } })} />
    </div>
  );
}

function ColorPicker({ label, color, onChange }: { label: string; color: [number, number, number, number]; onChange: (c: [number, number, number, number]) => void }) {
  const hex = '#' + [color[0], color[1], color[2]].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  return (
    <div className="flex items-center gap-1">
      <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">{label}</label>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const h = e.target.value;
          const r = parseInt(h.slice(1, 3), 16) / 255;
          const g = parseInt(h.slice(3, 5), 16) / 255;
          const b = parseInt(h.slice(5, 7), 16) / 255;
          onChange([r, g, b, color[3]]);
        }}
        className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0"
      />
      <span className="text-[9px] text-slate-500 font-mono flex-1">{hex}</span>
      <BrandColorPicker onSelect={onChange} currentAlpha={color[3]} />
    </div>
  );
}
