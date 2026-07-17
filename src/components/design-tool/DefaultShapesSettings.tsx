/**
 * DefaultShapesSettings
 *
 * Settings panel complete — all six tabs implemented.
 * Tab 3 of 6: Default Shapes
 *
 * Provides per-shape default configuration via a persistent sidebar
 * subtab selector. Every setting writes to ShapeDefaultsService immediately
 * on change and takes effect the next time a shape of that type is created.
 */

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import {
  shapeDefaultsService,
  SHAPE_GEOMETRY_FACTORY_DEFAULTS,
  AllShapeGeometry,
  ShapeGeometryDefaults,
  RectangleGeometry,
  CircleGeometry,
  LineGeometry,
  StarGeometry,
  TextGeometry,
  ButtonGeometry,
  ChatBubbleGeometry,
  ChatFrameGeometry,
  GradientGeometry,
  AdjustmentLayerGeometry,
  SvgGeometry,
} from '../../services/ShapeDefaultsService';

// ─── Shape list ────────────────────────────────────────────────────────────────

type ShapeKey = keyof AllShapeGeometry;

const SHAPE_LIST: { key: ShapeKey; label: string }[] = [
  { key: 'rectangle',     label: 'Rectangle' },
  { key: 'circle',        label: 'Circle' },
  { key: 'star',          label: 'Star' },
  { key: 'line',          label: 'Line / Arrow' },
  { key: 'text',          label: 'Text' },
  { key: 'button',        label: 'Button' },
  { key: 'chatBubble',    label: 'Chat Bubble' },
  { key: 'chatFrame',     label: 'Chat Frame' },
  { key: 'gradient',      label: 'Gradient' },
  { key: 'adjustmentLayer', label: 'Adjustment Layer' },
  { key: 'svg',           label: 'SVG Icon' },
];

const SHAPE_LABEL: Record<ShapeKey, string> = Object.fromEntries(
  SHAPE_LIST.map(s => [s.key, s.label])
) as Record<ShapeKey, string>;

// ─── Primitive sub-components ──────────────────────────────────────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${value ? 'bg-yellow-400' : 'bg-gray-600'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const ToggleRow = ({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: () => void;
}) => (
  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border border-gray-700/50">
    <div>
      <div className="text-xs font-medium text-white">{label}</div>
      {description && <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>}
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

const NumericInput = ({ label, value, onChange, min, max, step = 1, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            const clamped = min !== undefined && max !== undefined
              ? Math.min(max, Math.max(min, v))
              : v;
            onChange(clamped);
          }
        }}
        className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
      />
      {unit && <span className="text-[11px] text-gray-500 flex-shrink-0">{unit}</span>}
    </div>
  </div>
);

const SliderRow = ({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) => {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-gray-500">{label}</label>
        <span className="text-[11px] text-gray-400 font-mono">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 appearance-none cursor-pointer"
      />
    </div>
  );
};

const ColorRow = ({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-gray-500 flex-1 min-w-0">{label}</span>
    <input
      type="color"
      value={value.startsWith('rgba') || value === 'transparent' ? '#000000' : value}
      onChange={e => onChange(e.target.value)}
      className="w-8 h-6 cursor-pointer border border-gray-700/50 bg-transparent flex-shrink-0"
    />
    <input
      type="text"
      value={value}
      onChange={e => {
        const v = e.target.value.trim();
        if (/^#[0-9a-fA-F]{0,8}$/.test(v) || v === 'transparent' || v.startsWith('rgba') || v.startsWith('rgb')) {
          onChange(v);
        }
      }}
      className="w-24 px-2 py-1 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 font-mono flex-shrink-0"
    />
  </div>
);

const SelectRow = ({ label, value, options, onChange }: {
  label: string; value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const SegmentedControl = ({ label, value, options, onChange }: {
  label?: string; value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) => (
  <div>
    {label && <label className="text-[11px] text-gray-500 block mb-1">{label}</label>}
    <div className="flex">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-xs font-medium border-t border-b transition-colors
            ${i === 0 ? 'border-l' : ''} ${i === options.length - 1 ? 'border-r' : ''}
            ${value === opt.value
              ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
              : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// ─── Collapsible Section ───────────────────────────────────────────────────────

const Section = ({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/80 hover:bg-gray-700/60 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>
      {open && <div className="p-3 space-y-3 bg-gray-900/40">{children}</div>}
    </div>
  );
};

// ─── Constant options ──────────────────────────────────────────────────────────

const BLEND_MODES = [
  'normal','multiply','screen','overlay','darken','lighten',
  'color-dodge','color-burn','hard-light','soft-light','difference',
  'exclusion','hue','saturation','color','luminosity',
].map(m => ({ label: m.charAt(0).toUpperCase() + m.slice(1).replace('-', ' '), value: m }));

const FONT_WEIGHTS = [
  { label: '300 Light', value: '300' },
  { label: '400 Regular', value: '400' },
  { label: '500 Medium', value: '500' },
  { label: '600 SemiBold', value: '600' },
  { label: '700 Bold', value: '700' },
  { label: '800 ExtraBold', value: '800' },
];

const TEXT_ALIGNS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
  { label: 'Justify', value: 'justify' },
];

const ADJUSTMENT_TYPES = [
  { label: 'Brightness / Contrast', value: 'brightness-contrast' },
  { label: 'Hue / Saturation', value: 'hue-saturation' },
  { label: 'Color', value: 'color' },
  { label: 'Levels', value: 'levels' },
  { label: 'Curves', value: 'curves' },
];

// ─── Base sections shared by all shapes ───────────────────────────────────────

function BaseGeometrySection({ g, upd }: { g: ShapeGeometryDefaults; upd: (p: Partial<ShapeGeometryDefaults>) => void }) {
  return (
    <Section title="Geometry & Size">
      <div className="grid grid-cols-2 gap-3">
        <NumericInput label="Default Width (px)" value={g.defaultWidth} min={1} onChange={v => upd({ defaultWidth: v })} />
        <NumericInput label="Default Height (px)" value={g.defaultHeight} min={1} onChange={v => upd({ defaultHeight: v })} />
        <NumericInput label="Rotation (°)" value={g.defaultRotation} min={-360} max={360} onChange={v => upd({ defaultRotation: v })} />
      </div>
      <SliderRow label="Opacity" value={g.defaultOpacity} min={0} max={100} step={1}
        onChange={v => upd({ defaultOpacity: v })} format={v => `${v}%`} />
      <SelectRow label="Blend Mode" value={g.defaultBlendMode} options={BLEND_MODES}
        onChange={v => upd({ defaultBlendMode: v })} />
      <ToggleRow label="Lock Aspect Ratio" value={g.lockAspectRatio}
        onChange={() => upd({ lockAspectRatio: !g.lockAspectRatio })} />
    </Section>
  );
}

function FillSection({ g, upd }: { g: ShapeGeometryDefaults; upd: (p: Partial<ShapeGeometryDefaults>) => void }) {
  return (
    <Section title="Fill">
      <ToggleRow label="Fill Enabled" value={g.fillEnabled}
        onChange={() => upd({ fillEnabled: !g.fillEnabled })} />
      {g.fillEnabled && (
        <>
          <ColorRow label="Fill Color" value={g.fillColor} onChange={v => upd({ fillColor: v })} />
          <SliderRow label="Fill Opacity" value={g.fillOpacity} min={0} max={100} step={1}
            onChange={v => upd({ fillOpacity: v })} format={v => `${v}%`} />
        </>
      )}
    </Section>
  );
}

function StrokeSection({ g, upd }: { g: ShapeGeometryDefaults; upd: (p: Partial<ShapeGeometryDefaults>) => void }) {
  return (
    <Section title="Stroke">
      <ToggleRow label="Stroke Enabled" value={g.strokeEnabled}
        onChange={() => upd({ strokeEnabled: !g.strokeEnabled })} />
      {g.strokeEnabled && (
        <>
          <ColorRow label="Stroke Color" value={g.strokeColor} onChange={v => upd({ strokeColor: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumericInput label="Stroke Width (px)" value={g.strokeWidth} min={0} max={100}
              onChange={v => upd({ strokeWidth: v })} />
          </div>
          <SegmentedControl label="Stroke Position" value={g.strokePosition}
            options={[{ label: 'Inside', value: 'inside' }, { label: 'Center', value: 'center' }, { label: 'Outside', value: 'outside' }]}
            onChange={v => upd({ strokePosition: v as 'inside' | 'center' | 'outside' })} />
          <SegmentedControl label="Stroke Type" value={g.strokeType}
            options={[{ label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' }]}
            onChange={v => upd({ strokeType: v as 'solid' | 'dashed' | 'dotted' })} />
          <SliderRow label="Stroke Opacity" value={g.strokeOpacity} min={0} max={100} step={1}
            onChange={v => upd({ strokeOpacity: v })} format={v => `${v}%`} />
          {g.strokeType === 'dashed' && (
            <div className="grid grid-cols-2 gap-3">
              <NumericInput label="Dash Length" value={g.dashLength} min={1} onChange={v => upd({ dashLength: v })} />
              <NumericInput label="Gap Length" value={g.gapLength} min={1} onChange={v => upd({ gapLength: v })} />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function ShadowSection({ g, upd }: { g: ShapeGeometryDefaults; upd: (p: Partial<ShapeGeometryDefaults>) => void }) {
  return (
    <Section title="Shadow" defaultOpen={false}>
      <ToggleRow label="Shadow Enabled" value={g.shadowEnabled}
        onChange={() => upd({ shadowEnabled: !g.shadowEnabled })} />
      {g.shadowEnabled && (
        <>
          <SegmentedControl label="Shadow Type" value={g.shadowType}
            options={[{ label: 'Drop Shadow', value: 'drop' }, { label: 'Inner Shadow', value: 'inner' }]}
            onChange={v => upd({ shadowType: v as 'drop' | 'inner' })} />
          <ColorRow label="Shadow Color" value={g.shadowColor} onChange={v => upd({ shadowColor: v })} />
          <SliderRow label="Shadow Opacity" value={g.shadowOpacity} min={0} max={100} step={1}
            onChange={v => upd({ shadowOpacity: v })} format={v => `${v}%`} />
          <div className="grid grid-cols-2 gap-3">
            <NumericInput label="Offset X (px)" value={g.shadowOffsetX} min={-100} max={100} onChange={v => upd({ shadowOffsetX: v })} />
            <NumericInput label="Offset Y (px)" value={g.shadowOffsetY} min={-100} max={100} onChange={v => upd({ shadowOffsetY: v })} />
            <NumericInput label="Blur (px)" value={g.shadowBlur} min={0} max={100} onChange={v => upd({ shadowBlur: v })} />
            <NumericInput label="Spread (px)" value={g.shadowSpread} min={-100} max={100} onChange={v => upd({ shadowSpread: v })} />
          </div>
        </>
      )}
    </Section>
  );
}

function BlurSection({ g, upd }: { g: ShapeGeometryDefaults; upd: (p: Partial<ShapeGeometryDefaults>) => void }) {
  return (
    <Section title="Blur Effects" defaultOpen={false}>
      <ToggleRow label="Blur Enabled" value={g.blurEnabled}
        onChange={() => upd({ blurEnabled: !g.blurEnabled })} />
      {g.blurEnabled && (
        <>
          <SelectRow label="Blur Type" value={g.blurType}
            options={[
              { label: 'Gaussian', value: 'gaussian' },
              { label: 'Motion', value: 'motion' },
              { label: 'Zoom', value: 'zoom' },
            ]}
            onChange={v => upd({ blurType: v as 'gaussian' | 'motion' | 'zoom' })} />
          <SliderRow label="Blur Intensity" value={g.blurIntensity} min={0} max={100} step={1}
            onChange={v => upd({ blurIntensity: v })} />
          {g.blurType === 'motion' && (
            <NumericInput label="Motion Blur Direction (°)" value={g.motionBlurDirection}
              min={0} max={360} onChange={v => upd({ motionBlurDirection: v })} />
          )}
        </>
      )}
    </Section>
  );
}

// ─── Shape-specific geometry sections ─────────────────────────────────────────

function RectangleSpecific({ g, upd }: { g: RectangleGeometry; upd: (p: Partial<RectangleGeometry>) => void }) {
  return (
    <Section title="Rectangle Geometry">
      <NumericInput label="Corner Radius (px)" value={g.cornerRadius} min={0} max={500}
        onChange={v => upd({ cornerRadius: v })} />
    </Section>
  );
}

function CircleSpecific({ g, upd }: { g: CircleGeometry; upd: (p: Partial<CircleGeometry>) => void }) {
  return (
    <Section title="Ellipse Geometry">
      <div className="grid grid-cols-2 gap-3">
        <NumericInput label="Start Angle (°)" value={g.startAngle} min={0} max={360}
          onChange={v => upd({ startAngle: v })} />
        <NumericInput label="End Angle (°)" value={g.endAngle} min={0} max={360}
          onChange={v => upd({ endAngle: v })} />
      </div>
      <SliderRow label="Inner Radius (donut)" value={g.innerRadius} min={0} max={99} step={1}
        onChange={v => upd({ innerRadius: v })} format={v => `${v}%`} />
    </Section>
  );
}

function LineSpecific({ g, upd }: { g: LineGeometry; upd: (p: Partial<LineGeometry>) => void }) {
  return (
    <Section title="Line / Arrow Geometry">
      <SegmentedControl label="Line Cap" value={g.lineCap}
        options={[{ label: 'Butt', value: 'butt' }, { label: 'Round', value: 'round' }, { label: 'Square', value: 'square' }]}
        onChange={v => upd({ lineCap: v as 'butt' | 'round' | 'square' })} />
      <div className="grid grid-cols-2 gap-3">
        <NumericInput label="Smoothing" value={g.smoothing} min={0} max={100}
          onChange={v => upd({ smoothing: v })} />
      </div>
      <ToggleRow label="Close Path" description="Connect last point back to first"
        value={g.closePath} onChange={() => upd({ closePath: !g.closePath })} />
      <div className="border-t border-gray-700/50 pt-3 mt-1">
        <p className="text-[11px] text-gray-500 mb-2 uppercase tracking-wider font-semibold">Arrowheads</p>
        <ToggleRow label="Arrow at Start" value={g.arrowStart}
          onChange={() => upd({ arrowStart: !g.arrowStart })} />
        <ToggleRow label="Arrow at End" value={g.arrowEnd}
          onChange={() => upd({ arrowEnd: !g.arrowEnd })} />
        <SelectRow label="Arrowhead Type" value={g.arrowheadType}
          options={[
            { label: 'Triangle', value: 'triangle' },
            { label: 'Circle', value: 'circle' },
            { label: 'Bar', value: 'bar' },
            { label: 'Diamond', value: 'diamond' },
          ]}
          onChange={v => upd({ arrowheadType: v as 'triangle' | 'circle' | 'bar' | 'diamond' })} />
        <NumericInput label="Arrowhead Size (px)" value={g.arrowheadSize} min={1} max={100}
          onChange={v => upd({ arrowheadSize: v })} />
      </div>
    </Section>
  );
}

function StarSpecific({ g, upd }: { g: StarGeometry; upd: (p: Partial<StarGeometry>) => void }) {
  return (
    <Section title="Star Geometry">
      <SliderRow label="Point Count" value={g.starPoints} min={3} max={20} step={1}
        onChange={v => upd({ starPoints: v })} format={v => `${v} pts`} />
      <SliderRow label="Inner Radius Ratio" value={g.starInnerRadius} min={5} max={95} step={1}
        onChange={v => upd({ starInnerRadius: v })} format={v => `${v}%`} />
    </Section>
  );
}

function TextSpecific({ g, upd }: { g: TextGeometry; upd: (p: Partial<TextGeometry>) => void }) {
  return (
    <Section title="Text Defaults">
      <div>
        <label className="text-[11px] text-gray-500 block mb-1">Default Text Content</label>
        <input
          type="text"
          value={g.defaultText}
          onChange={e => upd({ defaultText: e.target.value })}
          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumericInput label="Font Size (px)" value={g.fontSize} min={6} max={300}
          onChange={v => upd({ fontSize: v })} />
        <SelectRow label="Font Weight" value={g.fontWeight} options={FONT_WEIGHTS}
          onChange={v => upd({ fontWeight: v })} />
      </div>
      <div>
        <label className="text-[11px] text-gray-500 block mb-1">Font Family</label>
        <input
          type="text"
          value={g.fontFamily}
          onChange={e => upd({ fontFamily: e.target.value })}
          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
        />
      </div>
      <SelectRow label="Text Alignment" value={g.textAlign} options={TEXT_ALIGNS}
        onChange={v => upd({ textAlign: v })} />
      <SelectRow label="Vertical Align" value={g.verticalAlign}
        options={[{ label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' }]}
        onChange={v => upd({ verticalAlign: v })} />
      <ColorRow label="Text Color" value={g.textColor} onChange={v => upd({ textColor: v })} />
      <SelectRow label="Text Transform" value={g.textTransform}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Capitalize', value: 'capitalize' },
        ]}
        onChange={v => upd({ textTransform: v })} />
    </Section>
  );
}

function ButtonSpecific({ g, upd }: { g: ButtonGeometry; upd: (p: Partial<ButtonGeometry>) => void }) {
  return (
    <>
      <Section title="Button Geometry">
        <NumericInput label="Corner Radius (px)" value={g.cornerRadius} min={0} max={500}
          onChange={v => upd({ cornerRadius: v })} />
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="Horizontal Padding (px)" value={g.paddingH} min={0}
            onChange={v => upd({ paddingH: v })} />
          <NumericInput label="Vertical Padding (px)" value={g.paddingV} min={0}
            onChange={v => upd({ paddingV: v })} />
        </div>
      </Section>
      <Section title="Button Text Defaults">
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Default Button Text</label>
          <input
            type="text"
            value={g.defaultText}
            onChange={e => upd({ defaultText: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="Font Size (px)" value={g.fontSize} min={6} max={100}
            onChange={v => upd({ fontSize: v })} />
          <SelectRow label="Font Weight" value={g.fontWeight} options={FONT_WEIGHTS}
            onChange={v => upd({ fontWeight: v })} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Font Family</label>
          <input
            type="text"
            value={g.fontFamily}
            onChange={e => upd({ fontFamily: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          />
        </div>
        <SelectRow label="Text Alignment" value={g.textAlign} options={TEXT_ALIGNS}
          onChange={v => upd({ textAlign: v })} />
        <ColorRow label="Text Color" value={g.textColor} onChange={v => upd({ textColor: v })} />
      </Section>
    </>
  );
}

function ChatBubbleSpecific({ g, upd }: { g: ChatBubbleGeometry; upd: (p: Partial<ChatBubbleGeometry>) => void }) {
  return (
    <>
      <Section title="Chat Bubble Geometry">
        <NumericInput label="Corner Radius (px)" value={g.cornerRadius} min={0} max={200}
          onChange={v => upd({ cornerRadius: v })} />
      </Section>
      <Section title="Chat Bubble Text Defaults">
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Default Message Text</label>
          <input
            type="text"
            value={g.defaultText}
            onChange={e => upd({ defaultText: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="Font Size (px)" value={g.fontSize} min={6} max={100}
            onChange={v => upd({ fontSize: v })} />
          <SelectRow label="Font Weight" value={g.fontWeight} options={FONT_WEIGHTS}
            onChange={v => upd({ fontWeight: v })} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Font Family</label>
          <input
            type="text"
            value={g.fontFamily}
            onChange={e => upd({ fontFamily: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          />
        </div>
        <SelectRow label="Text Alignment" value={g.textAlign} options={TEXT_ALIGNS}
          onChange={v => upd({ textAlign: v })} />
        <ColorRow label="Text Color" value={g.textColor} onChange={v => upd({ textColor: v })} />
      </Section>
    </>
  );
}

function ChatFrameSpecific({ g, upd }: { g: ChatFrameGeometry; upd: (p: Partial<ChatFrameGeometry>) => void }) {
  return (
    <Section title="Chat Frame Geometry">
      <NumericInput label="Corner Radius (px)" value={g.cornerRadius} min={0} max={500}
        onChange={v => upd({ cornerRadius: v })} />
    </Section>
  );
}

function GradientSpecific({ g, upd }: { g: GradientGeometry; upd: (p: Partial<GradientGeometry>) => void }) {
  return (
    <Section title="Gradient Settings">
      <SelectRow label="Gradient Type" value={g.gradientType}
        options={[
          { label: 'Linear', value: 'linear' },
          { label: 'Radial', value: 'radial' },
          { label: 'Conic', value: 'conic' },
        ]}
        onChange={v => upd({ gradientType: v as 'linear' | 'radial' | 'conic' })} />
      {g.gradientType === 'linear' && (
        <NumericInput label="Gradient Angle (°)" value={g.gradientAngle} min={0} max={360}
          onChange={v => upd({ gradientAngle: v })} />
      )}
      <div className="space-y-2">
        <div className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Gradient Stops</div>
        <ColorRow label="Stop 1 Color" value={g.gradientColor1} onChange={v => upd({ gradientColor1: v })} />
        <SliderRow label="Stop 1 Position" value={g.gradientPosition1} min={0} max={100} step={1}
          onChange={v => upd({ gradientPosition1: v })} format={v => `${v}%`} />
        <ColorRow label="Stop 2 Color" value={g.gradientColor2} onChange={v => upd({ gradientColor2: v })} />
        <SliderRow label="Stop 2 Position" value={g.gradientPosition2} min={0} max={100} step={1}
          onChange={v => upd({ gradientPosition2: v })} format={v => `${v}%`} />
      </div>
    </Section>
  );
}

function AdjustmentLayerSpecific({ g, upd }: { g: AdjustmentLayerGeometry; upd: (p: Partial<AdjustmentLayerGeometry>) => void }) {
  return (
    <Section title="Adjustment Layer Settings">
      <SelectRow label="Adjustment Type" value={g.adjustmentType} options={ADJUSTMENT_TYPES}
        onChange={v => upd({ adjustmentType: v })} />
      <SliderRow label="Intensity" value={g.adjustmentIntensity} min={0} max={100} step={1}
        onChange={v => upd({ adjustmentIntensity: v })} format={v => `${v}%`} />
    </Section>
  );
}

function SvgSpecific({ g, upd }: { g: SvgGeometry; upd: (p: Partial<SvgGeometry>) => void }) {
  return (
    <Section title="SVG Icon Colors">
      <ColorRow label="Fill Color" value={g.svgFillColor} onChange={v => upd({ svgFillColor: v })} />
      <ColorRow label="Stroke Color" value={g.svgStrokeColor} onChange={v => upd({ svgStrokeColor: v })} />
    </Section>
  );
}

// ─── Per-shape settings panel ──────────────────────────────────────────────────

function ShapePanel({ shapeKey, geometry, onUpdate, onReset }: {
  shapeKey: ShapeKey;
  geometry: AllShapeGeometry[ShapeKey];
  onUpdate: (patch: Partial<AllShapeGeometry[ShapeKey]>) => void;
  onReset: () => void;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const label = SHAPE_LABEL[shapeKey];
  const g = geometry as ShapeGeometryDefaults;
  const upd = (patch: Partial<ShapeGeometryDefaults>) => onUpdate(patch as Partial<AllShapeGeometry[ShapeKey]>);

  return (
    <div className="space-y-3 pb-4">
      <BaseGeometrySection g={g} upd={upd} />
      <FillSection g={g} upd={upd} />
      <StrokeSection g={g} upd={upd} />
      <ShadowSection g={g} upd={upd} />
      <BlurSection g={g} upd={upd} />

      {shapeKey === 'rectangle' && (
        <RectangleSpecific
          g={geometry as RectangleGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'circle' && (
        <CircleSpecific
          g={geometry as CircleGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'line' && (
        <LineSpecific
          g={geometry as LineGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'star' && (
        <StarSpecific
          g={geometry as StarGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'text' && (
        <TextSpecific
          g={geometry as TextGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'button' && (
        <ButtonSpecific
          g={geometry as ButtonGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'chatBubble' && (
        <ChatBubbleSpecific
          g={geometry as ChatBubbleGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'chatFrame' && (
        <ChatFrameSpecific
          g={geometry as ChatFrameGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'gradient' && (
        <GradientSpecific
          g={geometry as GradientGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'adjustmentLayer' && (
        <AdjustmentLayerSpecific
          g={geometry as AdjustmentLayerGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}
      {shapeKey === 'svg' && (
        <SvgSpecific
          g={geometry as SvgGeometry}
          upd={p => onUpdate(p as Partial<AllShapeGeometry[ShapeKey]>)}
        />
      )}

      <div className="pt-1">
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full px-3 py-2 text-xs font-medium text-red-400 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
          >
            Reset {label} Defaults
          </button>
        ) : (
          <div className="border border-red-500/40 bg-red-500/8 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-300">
                Reset {label} defaults to factory settings?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { onReset(); setShowResetConfirm(false); }}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const DefaultShapesSettings: React.FC = () => {
  const [selectedShape, setSelectedShape] = useState<ShapeKey>('rectangle');
  const [allGeometry, setAllGeometry] = useState<AllShapeGeometry>(() =>
    shapeDefaultsService.getAllGeometryDefaults()
  );
  const [showGlobalResetConfirm, setShowGlobalResetConfirm] = useState(false);

  const handleUpdate = useCallback(<K extends keyof AllShapeGeometry>(
    shapeKey: K,
    patch: Partial<AllShapeGeometry[K]>
  ) => {
    setAllGeometry(prev => {
      const next: AllShapeGeometry = {
        ...prev,
        [shapeKey]: { ...prev[shapeKey], ...patch },
      };
      shapeDefaultsService.updateShapeGeometry(shapeKey, patch);
      return next;
    });
  }, []);

  const handleResetShape = useCallback((shapeKey: ShapeKey) => {
    shapeDefaultsService.resetShapeGeometry(shapeKey);
    setAllGeometry(prev => ({
      ...prev,
      [shapeKey]: { ...SHAPE_GEOMETRY_FACTORY_DEFAULTS[shapeKey] },
    }));
  }, []);

  const handleResetAll = () => {
    shapeDefaultsService.resetAllGeometry();
    setAllGeometry(shapeDefaultsService.getAllGeometryDefaults());
    setShowGlobalResetConfirm(false);
  };

  const currentGeometry = allGeometry[selectedShape];

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: '100%' }}>
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Shape subtab sidebar */}
        <div className="w-32 flex-shrink-0 border-r border-gray-700/50 overflow-y-auto">
          <div className="py-1">
            {SHAPE_LIST.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedShape(key)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors border-l-2 ${
                  selectedShape === key
                    ? 'bg-yellow-400/15 text-yellow-400 border-l-yellow-400 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-l-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Shape settings content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-3">
          <ShapePanel
            shapeKey={selectedShape}
            geometry={currentGeometry}
            onUpdate={(patch) => handleUpdate(selectedShape, patch)}
            onReset={() => handleResetShape(selectedShape)}
          />
        </div>
      </div>

      {/* Global reset bar */}
      <div className="flex-shrink-0 border-t border-gray-700/50 p-3">
        {!showGlobalResetConfirm ? (
          <button
            onClick={() => setShowGlobalResetConfirm(true)}
            className="w-full px-3 py-2 text-xs font-medium text-red-400 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
          >
            Reset All Shape Defaults
          </button>
        ) : (
          <div className="border border-red-500/40 bg-red-500/8 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-300">
                Reset all shape defaults to factory settings? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={() => setShowGlobalResetConfirm(false)}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DefaultShapesSettings;
