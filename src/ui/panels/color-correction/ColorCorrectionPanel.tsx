import { useState, useCallback, useRef } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import type { ImageLayer, ColorWheelValues } from '../../../core/types';
import { useEditorStore } from '../../../store/editor';

interface CurvePoint {
  x: number;
  y: number;
}

export function ColorCorrectionPanel({ layer }: { layer: ImageLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const { colorCorrection } = layer;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    basic: true,
    whiteBalance: true,
    wheels: true,
    curves: false,
  });

  const toggle = (section: string) => {
    setExpanded((p) => ({ ...p, [section]: !p[section] }));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Color Correction
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4 space-y-0.5">
        {/* Basic Section */}
        <CollapsibleSection
          label="Basic"
          expanded={expanded.basic}
          onToggle={() => toggle('basic')}
        >
          <GradingSlider
            label="Brightness"
            value={layer.filters.brightness}
            min={-1} max={1} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'filters.brightness', v)}
          />
          <GradingSlider
            label="Contrast"
            value={colorCorrection.contrast ?? 0}
            min={-1} max={1} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.contrast', v)}
          />
          <GradingSlider
            label="Exposure"
            value={layer.filters.exposure}
            min={-3} max={3} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'filters.exposure', v)}
          />
          <GradingSlider
            label="Saturation"
            value={colorCorrection.saturation ?? 0}
            min={-1} max={1} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.saturation', v)}
          />
          <GradingSlider
            label="Vibrance"
            value={colorCorrection.vibrance ?? 0}
            min={-1} max={1} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.vibrance', v)}
          />
          <GradingSlider
            label="Pivot"
            value={colorCorrection.pivot ?? 0.5}
            min={0} max={1} step={0.01}
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.pivot', v)}
          />
          <GradingSlider
            label="Gamma"
            value={layer.filters.gamma}
            min={0.1} max={3} step={0.01}
            defaultValue={1}
            onChange={(v) => updateLayerProperty(layer.id, 'filters.gamma', v)}
          />
        </CollapsibleSection>

        {/* White Balance */}
        <CollapsibleSection
          label="White Balance"
          expanded={expanded.whiteBalance}
          onToggle={() => toggle('whiteBalance')}
        >
          <GradingSlider
            label="Temperature"
            value={colorCorrection.temperature ?? 0}
            min={-1} max={1} step={0.01}
            gradient="linear-gradient(to right, #4499ff, #ff8800)"
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.temperature', v)}
          />
          <GradingSlider
            label="Tint"
            value={colorCorrection.tint ?? 0}
            min={-1} max={1} step={0.01}
            gradient="linear-gradient(to right, #22c55e, #d946ef)"
            onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.tint', v)}
          />
        </CollapsibleSection>

        {/* Color Wheels */}
        <CollapsibleSection
          label="Color Wheels"
          expanded={expanded.wheels}
          onToggle={() => toggle('wheels')}
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <ProColorWheel
              label="Lift"
              sublabel="Shadows"
              values={colorCorrection.lift}
              onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.lift', v)}
            />
            <ProColorWheel
              label="Gamma"
              sublabel="Midtones"
              values={colorCorrection.gamma}
              onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.gamma', v)}
            />
            <ProColorWheel
              label="Gain"
              sublabel="Highlights"
              values={colorCorrection.gain}
              onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.gain', v)}
            />
            <ProColorWheel
              label="Offset"
              sublabel="Global"
              values={colorCorrection.offset ?? { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 }}
              onChange={(v) => updateLayerProperty(layer.id, 'colorCorrection.offset', v)}
            />
          </div>
        </CollapsibleSection>

        {/* Curves */}
        <CollapsibleSection
          label="Curves"
          expanded={expanded.curves}
          onToggle={() => toggle('curves')}
        >
          <CurvesEditor />
        </CollapsibleSection>
      </div>
    </div>
  );
}

function CollapsibleSection({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-[7px] text-left transition-colors hover:bg-white/[0.03] group"
      >
        <ChevronRight
          size={11}
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-[10px] font-medium text-slate-300">{label}</span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-3 pt-1 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

function GradingSlider({
  label,
  value,
  min,
  max,
  step,
  defaultValue = 0,
  gradient,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  gradient?: string;
  onChange: (v: number) => void;
}) {
  const isActive = value !== defaultValue;
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const centerPct = range > 0 ? ((defaultValue - min) / range) * 100 : 50;

  return (
    <div className="flex items-center gap-1.5 group/slider">
      <label className="text-[10px] text-slate-500 w-[72px] flex-shrink-0 truncate">{label}</label>
      <div className="flex-1 relative h-[16px] flex items-center">
        <div
          className="absolute inset-x-0 h-[4px] rounded-full overflow-hidden"
          style={{ background: gradient || '#1a2a42' }}
        >
          {!gradient && (
            <div
              className="absolute inset-y-0 bg-[#f7b500]/50 rounded-full"
              style={{
                left: `${Math.min(centerPct, pct)}%`,
                width: `${Math.abs(pct - centerPct)}%`,
              }}
            />
          )}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-slate-400 bg-[#0e1c32] pointer-events-none transition-colors group-hover/slider:border-slate-300"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <span className={`text-[9px] font-mono w-9 text-right flex-shrink-0 ${isActive ? 'text-[#f7b500]' : 'text-slate-600'}`}>
        {formatNum(value, step)}
      </span>
      {isActive && (
        <button
          onClick={() => onChange(defaultValue)}
          className="opacity-0 group-hover/slider:opacity-100 text-slate-600 hover:text-slate-400 transition-opacity flex-shrink-0"
          title="Reset"
        >
          <RotateCcw size={9} />
        </button>
      )}
    </div>
  );
}

function ProColorWheel({
  label,
  sublabel,
  values,
  onChange,
}: {
  label: string;
  sublabel: string;
  values: ColorWheelValues;
  onChange: (v: ColorWheelValues) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);

  const handleWheelPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = rect.width / 2;

    const update = (ev: PointerEvent | React.PointerEvent) => {
      const clientX = 'clientX' in ev ? ev.clientX : 0;
      const clientY = 'clientY' in ev ? ev.clientY : 0;
      const cx = clientX - rect.left - radius;
      const cy = clientY - rect.top - radius;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const clampedDist = Math.min(dist / radius, 1);
      const angle = Math.atan2(cy, cx);

      const r = Math.max(0, Math.cos(angle)) * clampedDist;
      const g = Math.max(0, -Math.sin(angle)) * clampedDist;
      const b = Math.max(0, -Math.cos(angle)) * clampedDist;

      onChange({ ...values, r, g, b, intensity: clampedDist });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    const handleMove = (ev: PointerEvent) => update(ev);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    update(e);
  }, [values, onChange]);

  const handleDoubleClick = useCallback(() => {
    onChange({ r: 0, g: 0, b: 0, intensity: 0, luminance: values.luminance });
  }, [values.luminance, onChange]);

  const dotX = 50 + (values.r - values.b) * 40;
  const dotY = 50 - values.g * 40;
  const luminance = values.luminance ?? 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-medium text-slate-400">{label}</span>
        <span className="text-[8px] text-slate-600">{sublabel}</span>
      </div>

      {/* Wheel */}
      <div
        ref={wheelRef}
        className="w-[76px] h-[76px] rounded-full relative cursor-crosshair flex-shrink-0"
        style={{
          background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        onPointerDown={handleWheelPointer}
        onDoubleClick={handleDoubleClick}
      >
        {/* Dark center overlay */}
        <div className="absolute inset-[8px] rounded-full bg-[#0a1628]/80" />
        {/* Grid lines */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-px h-[60%] bg-slate-700/30" />
          <div className="absolute w-[60%] h-px bg-slate-700/30" />
        </div>
        {/* Indicator dot */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)] border border-white/80 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-1 h-1 rounded-full bg-slate-500/60" />
        </div>
      </div>

      {/* Luminance slider */}
      <div className="w-full px-1">
        <div className="relative h-[14px] flex items-center">
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-gradient-to-r from-[#0a0a0a] via-[#555] to-[#ffffff]" />
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={luminance}
            onChange={(e) => onChange({ ...values, luminance: Number(e.target.value) })}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute w-2.5 h-2.5 rounded-full border border-slate-400 bg-[#0e1c32] pointer-events-none"
            style={{ left: `calc(${((luminance + 1) / 2) * 100}% - 5px)` }}
          />
        </div>
      </div>

      {/* Value readout */}
      <span className="text-[8px] text-slate-600 font-mono">
        {values.intensity > 0.01 ? values.intensity.toFixed(2) : '0.00'}
      </span>
    </div>
  );
}

function CurvesEditor() {
  const [activeChannel, setActiveChannel] = useState<'rgb' | 'r' | 'g' | 'b'>('rgb');
  const [points, setPoints] = useState<Record<string, CurvePoint[]>>({
    rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const channelColors: Record<string, string> = {
    rgb: '#e2e8f0',
    r: '#ef4444',
    g: '#22c55e',
    b: '#3b82f6',
  };

  const currentPoints = points[activeChannel];

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;

    const existingIdx = currentPoints.findIndex((p) => {
      const dx = p.x - x;
      const dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 0.05;
    });

    if (existingIdx >= 0) {
      setDraggingIdx(existingIdx);
    } else {
      const newPoints = [...currentPoints, { x, y }].sort((a, b) => a.x - b.x);
      setPoints((prev) => ({ ...prev, [activeChannel]: newPoints }));
      const newIdx = newPoints.findIndex((p) => p.x === x && p.y === y);
      setDraggingIdx(newIdx);
    }

    const handleMove = (ev: PointerEvent) => {
      const mx = (ev.clientX - rect.left) / rect.width;
      const my = 1 - (ev.clientY - rect.top) / rect.height;
      setPoints((prev) => {
        const pts = [...prev[activeChannel]];
        const idx = draggingIdx ?? existingIdx;
        if (idx < 0 || idx >= pts.length) return prev;
        if (idx === 0) {
          pts[idx] = { x: 0, y: Math.max(0, Math.min(1, my)) };
        } else if (idx === pts.length - 1) {
          pts[idx] = { x: 1, y: Math.max(0, Math.min(1, my)) };
        } else {
          pts[idx] = { x: Math.max(0, Math.min(1, mx)), y: Math.max(0, Math.min(1, my)) };
        }
        return { ...prev, [activeChannel]: pts.sort((a, b) => a.x - b.x) };
      });
    };

    const handleUp = () => {
      setDraggingIdx(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [activeChannel, currentPoints, draggingIdx]);

  const handleReset = useCallback(() => {
    setPoints((prev) => ({
      ...prev,
      [activeChannel]: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }));
  }, [activeChannel]);

  const pathD = currentPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${(1 - p.y) * 100}`)
    .join(' ');

  return (
    <div className="space-y-2">
      {/* Channel tabs */}
      <div className="flex items-center gap-0.5">
        {(['rgb', 'r', 'g', 'b'] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`px-2 py-0.5 text-[9px] font-mono rounded transition-colors ${
              activeChannel === ch
                ? 'text-white'
                : 'text-slate-600 hover:text-slate-400'
            }`}
            style={activeChannel === ch ? { backgroundColor: channelColors[ch] + '20', color: channelColors[ch] } : undefined}
          >
            {ch.toUpperCase()}
          </button>
        ))}
        <button
          onClick={handleReset}
          className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
          title="Reset curve"
        >
          <RotateCcw size={10} />
        </button>
      </div>

      {/* Curve canvas */}
      <div className="relative w-full aspect-square bg-[#0c1a2d] rounded-md border border-[#1a2a42] overflow-hidden">
        {/* Grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {[25, 50, 75].map((v) => (
            <g key={v}>
              <line x1={v} y1={0} x2={v} y2={100} stroke="#1a2a42" strokeWidth="0.5" />
              <line x1={0} y1={v} x2={100} y2={v} stroke="#1a2a42" strokeWidth="0.5" />
            </g>
          ))}
          {/* Diagonal reference */}
          <line x1={0} y1={100} x2={100} y2={0} stroke="#1a2a42" strokeWidth="0.5" strokeDasharray="2,2" />
        </svg>

        {/* Curve */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={handleSvgPointerDown}
        >
          <path
            d={pathD}
            fill="none"
            stroke={channelColors[activeChannel]}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {currentPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x * 100}
              cy={(1 - p.y) * 100}
              r={3}
              fill={channelColors[activeChannel]}
              stroke="#0a1628"
              strokeWidth="1"
              className="cursor-grab"
            />
          ))}
        </svg>
      </div>

      {/* Channel info */}
      <div className="flex items-center justify-between text-[8px] text-slate-600 px-1">
        <span>Input</span>
        <span>{currentPoints.length} points</span>
        <span>Output</span>
      </div>
    </div>
  );
}

function formatNum(value: number, step: number): string {
  if (step >= 1) return Math.round(value).toString();
  if (step >= 0.1) return value.toFixed(1);
  return value.toFixed(2);
}
