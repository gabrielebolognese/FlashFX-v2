import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Copy, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { BrandColorPicker } from '../components/BrandColorPicker';
import type {
  ShapeLayer,
  ShapeMaterialConfig,
  MaterialFillLayer,
  MaterialColorStop,
  MaterialGradientType,
  MaterialBlendMode,
  MaterialLinearDirection,
  MaterialRadialType,
} from '../../core/types';
import {
  createMaterialLayer,
  createColorStop,
  createDefaultMaterial,
  getMaterialGradientCSS,
  generateShapeMaterialStyle,
  hexToRgba,
  LINEAR_DIRECTIONS,
  RADIAL_POSITIONS,
  BLEND_MODES,
  MAX_LAYERS,
  MAX_COLOR_STOPS,
} from '../../core/material';
import { DragInput } from '../components/DragInput';

interface ShapeMaterialPanelProps {
  layer: ShapeLayer;
}

export function ShapeMaterialPanel({ layer }: ShapeMaterialPanelProps) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);

  const fillConfig = layer.materialConfig ?? createDefaultMaterial();
  const strokeConfig = layer.strokeMaterialConfig ?? createDefaultMaterial();

  const setFill = (next: ShapeMaterialConfig) =>
    updateLayerProperty(layer.id, 'materialConfig', next);
  const setStroke = (next: ShapeMaterialConfig) =>
    updateLayerProperty(layer.id, 'strokeMaterialConfig', next);

  const matchStrokeToFill = () => {
    setStroke(JSON.parse(JSON.stringify(fillConfig)));
  };

  return (
    <div className="space-y-3">
      <MaterialSection
        title="Fill & Material"
        config={fillConfig}
        onChange={setFill}
      />
      <div className="border-t border-[#1a2a42]" />
      <MaterialSection
        title="Stroke Material"
        config={strokeConfig}
        onChange={setStroke}
        extraActions={
          fillConfig.enabled && fillConfig.layers.length > 0 ? (
            <button
              onClick={matchStrokeToFill}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded bg-[#122240] text-slate-400 hover:text-slate-200"
              title="Copy fill to stroke"
            >
              <Copy size={9} />
              Match
            </button>
          ) : null
        }
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  config: ShapeMaterialConfig;
  onChange: (next: ShapeMaterialConfig) => void;
  extraActions?: React.ReactNode;
}

export function MaterialSection({ title, config, onChange, extraActions }: SectionProps) {
  const layers = config.layers;
  const enabled = config.enabled;

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    onChange({ enabled: true, layers: [...layers, createMaterialLayer()] });
  };

  const clearAll = () => onChange({ enabled: false, layers: [] });

  const updateLayer = (id: string, updates: Partial<MaterialFillLayer>) => {
    onChange({
      ...config,
      enabled: true,
      layers: layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    });
  };

  const removeLayer = (id: string) => {
    const next = layers.filter((l) => l.id !== id);
    onChange({ ...config, layers: next, enabled: next.length > 0 ? config.enabled : false });
  };

  const reorderLayer = (id: string, dir: 'up' | 'down') => {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= layers.length) return;
    const next = [...layers];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...config, layers: next });
  };

  const previewStyle = generateShapeMaterialStyle(config);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {title}
        </span>
        <div className="flex items-center gap-1">
          {extraActions}
          {enabled && layers.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded bg-[#122240] text-slate-500 hover:text-red-400"
              title="None"
            >
              <X size={9} />
              None
            </button>
          )}
          <button
            onClick={addLayer}
            disabled={layers.length >= MAX_LAYERS}
            className="p-1 rounded hover:bg-[#1a2a42] text-slate-400 hover:text-slate-200 disabled:opacity-30"
            title="Add layer"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {(!enabled || layers.length === 0) && (
        <button
          onClick={addLayer}
          className="w-full py-2 rounded border border-dashed border-[#243a5c] text-[10px] text-slate-400 hover:bg-[#122240] hover:text-slate-200 hover:border-[#f7b500]/50 transition-colors"
        >
          + Add Fill Color
        </button>
      )}

      {enabled && layers.length > 0 && (
        <div
          className="h-6 rounded border border-[#243a5c]"
          style={{
            ...previewStyle,
            backgroundColor: previewStyle.backgroundColor ?? '#081220',
          }}
          title="Composite preview"
        />
      )}

      {enabled && layers.map((layer, idx) => (
        <LayerCard
          key={layer.id}
          layer={layer}
          index={idx}
          total={layers.length}
          onUpdate={(updates) => updateLayer(layer.id, updates)}
          onRemove={() => removeLayer(layer.id)}
          onReorder={(dir) => reorderLayer(layer.id, dir)}
        />
      ))}
    </div>
  );
}

interface LayerCardProps {
  layer: MaterialFillLayer;
  index: number;
  total: number;
  onUpdate: (updates: Partial<MaterialFillLayer>) => void;
  onRemove: () => void;
  onReorder: (dir: 'up' | 'down') => void;
}

function LayerCard({ layer, index, total, onUpdate, onRemove, onReorder }: LayerCardProps) {
  const [expanded, setExpanded] = useState(index === 0);

  const previewBg = getMaterialGradientCSS(layer);

  return (
    <div className="rounded border border-[#1a2a42] bg-[#0c1018] overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-[#122240]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <div
          className="w-6 h-4 rounded-sm border border-[#243a5c] flex-shrink-0"
          style={{ background: previewBg }}
        />
        <span className="text-[10px] text-slate-300 flex-1 truncate">
          Layer {index + 1} - {layer.type}
        </span>
        <span className="text-[9px] text-slate-500">{layer.opacity}%</span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onReorder('up')}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-20"
          >
            <ArrowUp size={9} />
          </button>
          <button
            onClick={() => onReorder('down')}
            disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-20"
          >
            <ArrowDown size={9} />
          </button>
          <button
            onClick={onRemove}
            className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-red-400"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2.5 py-2 space-y-2 border-t border-[#1a2a42]">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Type</label>
            <div className="flex gap-0.5">
              {(['linear', 'radial'] as MaterialGradientType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdate({ type: t })}
                  className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                    layer.type === t
                      ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                      : 'bg-[#122240] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {layer.type === 'linear' && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Dir</label>
              <select
                value={layer.direction ?? 'top-to-bottom'}
                onChange={(e) => onUpdate({ direction: e.target.value as MaterialLinearDirection, angle: undefined })}
                className="flex-1 bg-[#122240] text-[10px] text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none"
              >
                {LINEAR_DIRECTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          {layer.type === 'radial' && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Pos</label>
              <select
                value={layer.radialType ?? 'center'}
                onChange={(e) => onUpdate({ radialType: e.target.value as MaterialRadialType })}
                className="flex-1 bg-[#122240] text-[10px] text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none"
              >
                {RADIAL_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Blend</label>
            <select
              value={layer.blendMode}
              onChange={(e) => onUpdate({ blendMode: e.target.value as MaterialBlendMode })}
              className="flex-1 bg-[#122240] text-[10px] text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none"
            >
              {BLEND_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <DragInput
            label="Opacity"
            value={layer.opacity}
            onChange={(v) => onUpdate({ opacity: Math.max(0, Math.min(100, Math.round(v))) })}
            min={0}
            max={100}
            step={1}
            precision={0}
            suffix="%"
          />

          <ColorStopsEditor
            stops={layer.colorStops}
            onChange={(stops) => onUpdate({ colorStops: stops })}
          />
        </div>
      )}
    </div>
  );
}

interface StopsProps {
  stops: MaterialColorStop[];
  onChange: (stops: MaterialColorStop[]) => void;
}

function ColorStopsEditor({ stops, onChange }: StopsProps) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const previewBg = `linear-gradient(90deg, ${sorted
    .map((s) => `${hexToRgba(s.color, s.opacity / 100)} ${s.position}%`)
    .join(', ')})`;

  const updateStop = (id: string, updates: Partial<MaterialColorStop>) => {
    onChange(stops.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const addStop = () => {
    if (stops.length >= MAX_COLOR_STOPS) return;
    let pos = 50;
    if (stops.length >= 2) {
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      pos = (prev.position + last.position) / 2;
    }
    onChange([...stops, createColorStop('#888888', Math.round(pos))]);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 1) return;
    onChange(stops.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Color Stops</span>
        <button
          onClick={addStop}
          disabled={stops.length >= MAX_COLOR_STOPS}
          className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-30"
          title="Add stop"
        >
          <Plus size={10} />
        </button>
      </div>

      <div className="h-4 rounded border border-[#243a5c]" style={{ background: previewBg }} />

      {sorted.map((stop) => (
        <div key={stop.id} className="flex items-center gap-1">
          <input
            type="color"
            value={stop.color}
            onChange={(e) => updateStop(stop.id, { color: e.target.value.toUpperCase() })}
            className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 flex-shrink-0"
          />
          <input
            type="text"
            value={stop.color}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateStop(stop.id, { color: v });
            }}
            className="bg-[#122240] text-[9px] font-mono text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none w-14"
          />
          <BrandColorPicker
            onSelect={(rgba) => {
              const hex = `#${rgba.slice(0, 3).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
              updateStop(stop.id, { color: hex });
            }}
            currentAlpha={stop.opacity / 100}
          />
          <DragInput
            label="P"
            value={stop.position}
            onChange={(v) => updateStop(stop.id, { position: Math.max(0, Math.min(100, Math.round(v))) })}
            min={0}
            max={100}
            step={1}
            precision={0}
            className="flex-1"
          />
          <DragInput
            label="A"
            value={stop.opacity}
            onChange={(v) => updateStop(stop.id, { opacity: Math.max(0, Math.min(100, Math.round(v))) })}
            min={0}
            max={100}
            step={1}
            precision={0}
            className="flex-1"
          />
          <button
            onClick={() => removeStop(stop.id)}
            disabled={stops.length <= 1}
            className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-600 hover:text-red-400 disabled:opacity-20 flex-shrink-0"
          >
            <Trash2 size={9} />
          </button>
        </div>
      ))}
    </div>
  );
}
