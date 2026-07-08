import { useState } from 'react';
import { Repeat, Trash2, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import type { ProceduralBinding, ProceduralTransformParam, ProceduralGridParams, ProceduralTileParams } from '../../core/types';
import { PROCEDURAL_PRESETS } from '../../procedural/presets';
import { DragInput } from '../components/DragInput';

interface ProceduralPanelProps {
  layerId: string;
}

export function ProceduralPanel({ layerId }: ProceduralPanelProps) {
  const composition = useEditorStore((s) => s.composition);
  const addProceduralBinding = useEditorStore((s) => s.addProceduralBinding);
  const removeProceduralBinding = useEditorStore((s) => s.removeProceduralBinding);
  const updateProceduralBinding = useEditorStore((s) => s.updateProceduralBinding);

  const binding = (composition.proceduralBindings || []).find((b) => b.layerId === layerId);

  if (!binding) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Repeat size={13} className="text-[#f7b500]" />
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
            Procedural Loop
          </span>
        </div>
        <PresetPicker layerId={layerId} onApply={addProceduralBinding} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Repeat size={13} className="text-[#f7b500]" />
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
            Procedural Loop
          </span>
        </div>
        <button
          onClick={() => removeProceduralBinding(binding.id)}
          className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
          title="Remove loop"
        >
          <Trash2 size={11} />
        </button>
      </div>

      <BindingSettings binding={binding} onUpdate={updateProceduralBinding} />

      <div className="border-t border-[#1a2a42] pt-2">
        <span className="text-[9px] text-slate-500 uppercase px-1">Presets</span>
      </div>
      <PresetPicker layerId={layerId} onApply={addProceduralBinding} currentBinding={binding} />
    </div>
  );
}

function PresetPicker({
  layerId,
  onApply,
  currentBinding,
}: {
  layerId: string;
  onApply: (layerId: string, presetName: string) => void;
  currentBinding?: ProceduralBinding;
}) {
  const [filter, setFilter] = useState<'all' | 'transform' | 'grid' | 'tile'>('all');

  const categories = [
    { id: 'all' as const, label: 'All' },
    { id: 'transform' as const, label: 'Transform' },
    { id: 'grid' as const, label: 'Grid' },
    { id: 'tile' as const, label: 'Tile' },
  ];

  const filtered = filter === 'all'
    ? PROCEDURAL_PRESETS
    : PROCEDURAL_PRESETS.filter((p) => p.category === filter);

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`flex-1 px-1 py-0.5 text-[9px] rounded transition-colors ${
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
        {filtered.map((preset) => {
          const isActive = currentBinding && detectPreset(currentBinding) === preset.name;
          return (
            <button
              key={preset.name}
              onClick={() => onApply(layerId, preset.name)}
              className={`px-2 py-2 rounded text-[10px] text-left transition-colors ${
                isActive
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#0c1018] border border-[#1a2a42] text-slate-400 hover:text-slate-200 hover:border-[#f7b500]/50'
              }`}
              title={preset.description}
            >
              <span className="block font-medium">{preset.name}</span>
              <span className="block text-[8px] text-slate-500 mt-0.5 leading-tight">{preset.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function detectPreset(binding: ProceduralBinding): string | null {
  for (const p of PROCEDURAL_PRESETS) {
    if (p.category === 'transform' && binding.loopType === 'transform') return p.name;
    if (p.category === 'grid' && binding.loopType === 'gridArray') return p.name;
    if (p.category === 'tile' && binding.loopType === 'tileScroll') return p.name;
  }
  return null;
}

function BindingSettings({
  binding,
  onUpdate,
}: {
  binding: ProceduralBinding;
  onUpdate: (id: string, updates: Partial<ProceduralBinding>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Enabled</label>
        <button
          onClick={() => onUpdate(binding.id, { enabled: !binding.enabled })}
          className={`w-7 h-4 rounded-full transition-colors relative ${
            binding.enabled ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              binding.enabled ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <DragInput
        label="Duration"
        value={binding.loopDurationFrames}
        onChange={(v) => onUpdate(binding.id, { loopDurationFrames: Math.max(1, Math.round(v)) })}
        min={1} max={600} step={1} precision={0} suffix="f"
      />
      <DragInput
        label="Speed"
        value={binding.speedMultiplier}
        onChange={(v) => onUpdate(binding.id, { speedMultiplier: Math.max(0.1, v) })}
        min={0.1} max={10} step={0.1} precision={1} suffix="x"
      />

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-14">Ping Pong</label>
        <button
          onClick={() => onUpdate(binding.id, { pingPong: !binding.pingPong })}
          className={`w-7 h-4 rounded-full transition-colors relative ${
            binding.pingPong ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              binding.pingPong ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {binding.loopType === 'transform' && binding.transformParams && (
        <TransformParamsEditor
          params={binding.transformParams}
          onChange={(params) => onUpdate(binding.id, { transformParams: params })}
        />
      )}

      {binding.loopType === 'gridArray' && binding.gridParams && (
        <GridParamsEditor
          params={binding.gridParams}
          onChange={(params) => onUpdate(binding.id, { gridParams: params })}
        />
      )}

      {binding.loopType === 'tileScroll' && binding.tileParams && (
        <TileParamsEditor
          params={binding.tileParams}
          onChange={(params) => onUpdate(binding.id, { tileParams: params })}
        />
      )}
    </div>
  );
}

function TransformParamsEditor({
  params,
  onChange,
}: {
  params: ProceduralTransformParam[];
  onChange: (params: ProceduralTransformParam[]) => void;
}) {
  const propertyOptions: ProceduralTransformParam['property'][] = [
    'rotation', 'scale', 'scaleX', 'scaleY', 'positionX', 'positionY', 'opacity',
  ];

  const easingOptions: ProceduralTransformParam['easing'][] = ['linear', 'sine', 'cosine'];

  return (
    <div className="space-y-2 border-t border-[#1a2a42] pt-2">
      <span className="text-[9px] text-slate-500 uppercase">Transform Properties</span>
      {params.map((param, idx) => (
        <div key={idx} className="space-y-1 bg-[#0a0f18] rounded p-1.5 border border-[#1a2a42]/50">
          <div className="flex items-center gap-1">
            <select
              value={param.property}
              onChange={(e) => {
                const next = [...params];
                next[idx] = { ...next[idx], property: e.target.value as ProceduralTransformParam['property'] };
                onChange(next);
              }}
              className="flex-1 text-[9px] bg-[#122240] text-slate-300 border border-[#1a2a42] rounded px-1 py-0.5"
            >
              {propertyOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={param.easing}
              onChange={(e) => {
                const next = [...params];
                next[idx] = { ...next[idx], easing: e.target.value as ProceduralTransformParam['easing'] };
                onChange(next);
              }}
              className="text-[9px] bg-[#122240] text-slate-300 border border-[#1a2a42] rounded px-1 py-0.5 w-14"
            >
              {easingOptions.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button
              onClick={() => onChange(params.filter((_, i) => i !== idx))}
              className="p-0.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"
            >
              <Trash2 size={9} />
            </button>
          </div>
          <div className="flex gap-1">
            <DragInput label="Cyc" value={param.cycles} onChange={(v) => {
              const next = [...params]; next[idx] = { ...next[idx], cycles: Math.max(1, Math.round(v)) }; onChange(next);
            }} min={1} max={20} step={1} precision={0} className="flex-1" />
            <DragInput label="Amp" value={param.amplitude} onChange={(v) => {
              const next = [...params]; next[idx] = { ...next[idx], amplitude: v }; onChange(next);
            }} step={1} precision={1} className="flex-1" />
          </div>
          <div className="flex gap-1">
            <DragInput label="Off" value={param.offset} onChange={(v) => {
              const next = [...params]; next[idx] = { ...next[idx], offset: v }; onChange(next);
            }} step={0.5} precision={1} className="flex-1" />
            <button
              onClick={() => {
                const next = [...params];
                next[idx] = { ...next[idx], direction: (next[idx].direction === 1 ? -1 : 1) as 1 | -1 };
                onChange(next);
              }}
              className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
                param.direction === 1
                  ? 'bg-[#122240] text-slate-400'
                  : 'bg-[#f7b500]/15 text-[#ffc83d]'
              }`}
            >
              <RotateCcw size={9} className={param.direction === -1 ? 'scale-x-[-1]' : ''} />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...params, { property: 'rotation', cycles: 1, amplitude: 360, offset: 0, easing: 'linear', direction: 1 }])}
        className="w-full py-1 text-[9px] text-slate-400 hover:text-slate-200 bg-[#122240] hover:bg-[#1a2a42] rounded transition-colors"
      >
        + Add Property
      </button>
    </div>
  );
}

function GridParamsEditor({
  params,
  onChange,
}: {
  params: ProceduralGridParams;
  onChange: (params: ProceduralGridParams) => void;
}) {
  const phaseOptions: ProceduralGridParams['phaseOffsetMode'][] = [
    'diagonal', 'radial', 'horizontal', 'vertical', 'random',
  ];

  return (
    <div className="space-y-2 border-t border-[#1a2a42] pt-2">
      <span className="text-[9px] text-slate-500 uppercase">Grid Layout</span>
      <div className="flex gap-1">
        <DragInput label="Rows" value={params.rows} onChange={(v) => onChange({ ...params, rows: Math.max(1, Math.round(v)) })} min={1} max={20} step={1} precision={0} className="flex-1" />
        <DragInput label="Cols" value={params.cols} onChange={(v) => onChange({ ...params, cols: Math.max(1, Math.round(v)) })} min={1} max={20} step={1} precision={0} className="flex-1" />
      </div>
      <div className="flex gap-1">
        <DragInput label="Cell W" value={params.cellWidth} onChange={(v) => onChange({ ...params, cellWidth: Math.max(10, v) })} min={10} max={500} step={5} precision={0} className="flex-1" />
        <DragInput label="Cell H" value={params.cellHeight} onChange={(v) => onChange({ ...params, cellHeight: Math.max(10, v) })} min={10} max={500} step={5} precision={0} className="flex-1" />
      </div>
      <div className="flex gap-1">
        <DragInput label="Gap X" value={params.spacingX} onChange={(v) => onChange({ ...params, spacingX: v })} min={0} max={100} step={1} precision={0} className="flex-1" />
        <DragInput label="Gap Y" value={params.spacingY} onChange={(v) => onChange({ ...params, spacingY: v })} min={0} max={100} step={1} precision={0} className="flex-1" />
      </div>

      <span className="text-[9px] text-slate-500 uppercase">Phase</span>
      <div className="flex gap-0.5 flex-wrap">
        {phaseOptions.map((p) => (
          <button
            key={p}
            onClick={() => onChange({ ...params, phaseOffsetMode: p })}
            className={`px-1.5 py-0.5 text-[9px] rounded transition-colors capitalize ${
              params.phaseOffsetMode === p
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#122240] text-slate-500 hover:text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <DragInput label="Spread" value={params.phaseSpread * 100} onChange={(v) => onChange({ ...params, phaseSpread: Math.max(0, Math.min(100, v)) / 100 })} min={0} max={100} step={1} precision={0} suffix="%" />

      <TransformParamsEditor
        params={params.baseTransforms}
        onChange={(baseTransforms) => onChange({ ...params, baseTransforms })}
      />
    </div>
  );
}

function TileParamsEditor({
  params,
  onChange,
}: {
  params: ProceduralTileParams;
  onChange: (params: ProceduralTileParams) => void;
}) {
  return (
    <div className="space-y-2 border-t border-[#1a2a42] pt-2">
      <span className="text-[9px] text-slate-500 uppercase">Tile Scroll</span>
      <div className="flex gap-1">
        <DragInput label="Scroll X" value={params.scrollX} onChange={(v) => onChange({ ...params, scrollX: Math.round(v) })} step={1} precision={0} className="flex-1" suffix="tiles" />
        <DragInput label="Scroll Y" value={params.scrollY} onChange={(v) => onChange({ ...params, scrollY: Math.round(v) })} step={1} precision={0} className="flex-1" suffix="tiles" />
      </div>
      <div className="flex gap-1">
        <DragInput label="Tile W" value={params.tileWidth} onChange={(v) => onChange({ ...params, tileWidth: Math.max(10, v) })} min={10} max={1000} step={5} precision={0} className="flex-1" />
        <DragInput label="Tile H" value={params.tileHeight} onChange={(v) => onChange({ ...params, tileHeight: Math.max(10, v) })} min={10} max={1000} step={5} precision={0} className="flex-1" />
      </div>
    </div>
  );
}
