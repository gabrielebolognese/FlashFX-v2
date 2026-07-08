import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import type { ShapeLayer, ShapePatternConfig } from '../../core/types';
import {
  createDefaultPattern,
  generatePatternDataUri,
  PATTERN_TYPES,
} from '../../core/material';
import { DragInput } from '../components/DragInput';
import { BrandColorPicker } from '../components/BrandColorPicker';

interface ShapePatternFillPanelProps {
  layer: ShapeLayer;
}

export function ShapePatternFillPanel({ layer }: ShapePatternFillPanelProps) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const config = layer.patternFill ?? createDefaultPattern();

  const setConfig = (next: ShapePatternConfig) =>
    updateLayerProperty(layer.id, 'patternFill', next);

  return <PatternEditor config={config} onChange={setConfig} />;
}

interface PatternEditorProps {
  config: ShapePatternConfig;
  onChange: (next: ShapePatternConfig) => void;
}

export function PatternEditor({ config, onChange }: PatternEditorProps) {
  const [expanded, setExpanded] = useState(config.enabled);

  const toggleEnabled = () => {
    onChange({ ...config, enabled: !config.enabled });
    if (!config.enabled) setExpanded(true);
  };

  const update = (updates: Partial<ShapePatternConfig>) => {
    onChange({ ...config, ...updates });
  };

  const previewUri = generatePatternDataUri(config);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-medium hover:text-slate-200"
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Pattern Overlay
        </button>
        <div className="flex items-center gap-1">
          {config.enabled && (
            <button
              onClick={() => onChange({ ...createDefaultPattern() })}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded bg-[#122240] text-slate-500 hover:text-red-400"
              title="Reset"
            >
              <X size={9} />
              Reset
            </button>
          )}
          <button
            onClick={toggleEnabled}
            className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
              config.enabled
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#122240] text-slate-500 hover:text-slate-300'
            }`}
          >
            {config.enabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          <div
            className="h-12 rounded border border-[#243a5c]"
            style={{
              backgroundImage: `url("${previewUri}")`,
              backgroundColor: config.backgroundColor === 'transparent' ? '#081220' : config.backgroundColor,
              backgroundRepeat: 'repeat',
              opacity: (config.opacity / 100) || 1,
            }}
            title="Pattern preview"
          />

          <div>
            <div className="text-[10px] text-slate-500 mb-1">Type</div>
            <div className="grid grid-cols-3 gap-0.5">
              {PATTERN_TYPES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update({ patternType: p.value })}
                  className={`px-1.5 py-1 text-[9px] rounded transition-colors ${
                    config.patternType === p.value
                      ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                      : 'bg-[#122240] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Color</label>
            <input
              type="color"
              value={config.color}
              onChange={(e) => update({ color: e.target.value.toUpperCase() })}
              className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 flex-shrink-0"
            />
            <input
              type="text"
              value={config.color}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) update({ color: v });
              }}
              className="bg-[#122240] text-[9px] font-mono text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none w-16 flex-1"
            />
            <BrandColorPicker
              onSelect={(rgba) => {
                const hex = `#${rgba.slice(0, 3).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
                update({ color: hex });
              }}
              currentAlpha={1}
            />
          </div>

          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">BG</label>
            <input
              type="color"
              value={config.backgroundColor === 'transparent' ? '#000000' : config.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value.toUpperCase() })}
              className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 flex-shrink-0"
              disabled={config.backgroundColor === 'transparent'}
            />
            <button
              onClick={() =>
                update({
                  backgroundColor: config.backgroundColor === 'transparent' ? '#000000' : 'transparent',
                })
              }
              className={`px-1.5 py-0.5 text-[9px] rounded ${
                config.backgroundColor === 'transparent'
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              Transparent
            </button>
          </div>

          <DragInput
            label="Size"
            value={config.size}
            onChange={(v) => update({ size: Math.max(1, Math.min(300, Math.round(v))) })}
            min={1}
            max={300}
            step={1}
            precision={0}
            suffix="px"
          />
          <DragInput
            label="Spacing"
            value={config.spacing}
            onChange={(v) => update({ spacing: Math.max(0, Math.min(150, Math.round(v))) })}
            min={0}
            max={150}
            step={1}
            precision={0}
            suffix="px"
          />
          <DragInput
            label="Angle"
            value={config.angle}
            onChange={(v) => update({ angle: ((Math.round(v) % 360) + 360) % 360 })}
            min={0}
            max={360}
            step={1}
            precision={0}
            suffix="deg"
          />
          <DragInput
            label="Opacity"
            value={config.opacity}
            onChange={(v) => update({ opacity: Math.max(0, Math.min(100, Math.round(v))) })}
            min={0}
            max={100}
            step={1}
            precision={0}
            suffix="%"
          />

          {config.patternType === 'custom' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500">Custom SVG</label>
              <textarea
                value={config.customSvg ?? ''}
                onChange={(e) => update({ customSvg: e.target.value })}
                placeholder='<circle cx="10" cy="10" r="5" fill="#fff"/>'
                className="w-full bg-[#122240] text-[9px] font-mono text-slate-300 px-2 py-1.5 rounded border border-[#1a2a42] focus:border-[#f7b500]/50 outline-none resize-none min-h-[48px]"
                rows={3}
              />
              <p className="text-[8px] text-slate-600">
                Inner SVG markup. Tile size: {Math.max(1, config.size + config.spacing)}px.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
