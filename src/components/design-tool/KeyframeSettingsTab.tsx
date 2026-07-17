/**
 * KeyframeSettingsTab
 *
 * Settings panel tab — Tab 4 of 6 planned settings tabs.
 * Future tabs (Tab 5–6) should be added as sibling components
 * and registered in EditorSettingsModal.tsx alongside this one.
 *
 * Controls all visual aspects of the curves keyframe editor:
 *   Section 1 — Property Curve Colors
 *   Section 2 — Curve Line Style
 *   Section 3 — Keyframe Handle Shape
 *   Section 4 — Bezier Control Point Handles
 *   Section 5 — Timeline Track Appearance (future integration point)
 *   Section 6 — Editor Background and Grid
 *   Live Preview — SVG mini-preview updating in real time
 *
 * Persistence: KeyframeDefaultsService → localStorage key `flashfx_keyframe_defaults`.
 * All changes are applied immediately via CSS custom properties on :root.
 */

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import {
  keyframeDefaultsService,
  KF_FACTORY_DEFAULTS,
  KeyframeSettings,
  HandleShape,
} from '../../services/KeyframeDefaultsService';

// ─── Shared sub-components (mirrors CodeEditorSettingsTab pattern) ─────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${value ? 'bg-yellow-400' : 'bg-gray-600'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const ToggleRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: () => void;
}) => (
  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border border-gray-700/50">
    <div>
      <div className="text-xs font-medium text-white">{label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) => {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-gray-500">{label}</label>
        <span className="text-[11px] text-gray-400 font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 appearance-none cursor-pointer"
      />
    </div>
  );
};

const ColorPickerRow = ({
  label,
  value,
  onChange,
  swatch,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  swatch?: boolean;
}) => (
  <div className="flex items-center gap-2">
    {swatch && (
      <div
        className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-600/50"
        style={{ backgroundColor: value }}
      />
    )}
    <span className="text-[11px] text-gray-500 flex-1 min-w-0">{label}</span>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-8 h-6 cursor-pointer border border-gray-700/50 bg-transparent flex-shrink-0"
    />
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const v = e.target.value.trim();
        if (/^#[0-9a-fA-F]{0,8}$/.test(v)) onChange(v);
      }}
      className="w-20 px-2 py-1 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 font-mono flex-shrink-0"
    />
  </div>
);

// ─── Collapsible Section ───────────────────────────────────────────────────────

const Section = ({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/80 hover:bg-gray-700/60 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>
      {open && <div className="p-3 space-y-3 bg-gray-900/40">{children}</div>}
    </div>
  );
};

// ─── Group separator within a section ─────────────────────────────────────────

const GroupLabel = ({ label }: { label: string }) => (
  <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest pt-1 border-t border-gray-700/30">
    {label}
  </div>
);

// ─── Handle Shape Selector ─────────────────────────────────────────────────────

const SHAPE_OPTIONS: { value: HandleShape; label: string }[] = [
  { value: 'diamond',       label: 'Diamond' },
  { value: 'square',        label: 'Square' },
  { value: 'circle',        label: 'Circle' },
  { value: 'rounded-square',label: 'Rounded' },
  { value: 'triangle',      label: 'Triangle' },
];

const renderShapeIcon = (shape: HandleShape, size = 16, fill = '#f59e0b', stroke = '#1f2937') => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  switch (shape) {
    case 'diamond': {
      const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case 'square': {
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case 'circle': {
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case 'rounded-square': {
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.35} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case 'triangle': {
      const pts = `${cx},${cy - r} ${cx + r},${cy + r * 0.7} ${cx - r},${cy + r * 0.7}`;
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
  }
};

const ShapeSelector = ({
  value,
  onChange,
  fill,
}: {
  value: HandleShape;
  onChange: (s: HandleShape) => void;
  fill: string;
}) => (
  <div className="flex gap-1.5 flex-wrap">
    {SHAPE_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        title={opt.label}
        className={`flex flex-col items-center gap-1 px-2 py-1.5 border transition-colors ${
          value === opt.value
            ? 'border-yellow-400/60 bg-yellow-400/10'
            : 'border-gray-700/50 bg-gray-800/50 hover:bg-gray-700/50 hover:border-gray-600/60'
        }`}
      >
        {renderShapeIcon(opt.value, 18, fill, '#1f2937')}
        <span className="text-[10px] text-gray-400">{opt.label}</span>
      </button>
    ))}
  </div>
);

// ─── Live Preview ──────────────────────────────────────────────────────────────

const LivePreview = ({ settings }: { settings: KeyframeSettings }) => {
  const W = 260;
  const H = 100;

  const kfA = { x: W * 0.15, y: H * 0.8 };
  const kfB = { x: W * 0.5,  y: H * 0.2 };
  const kfC = { x: W * 0.85, y: H * 0.7 };

  const cp1Out = { x: kfA.x + (kfB.x - kfA.x) * 0.5, y: kfA.y };
  const cp1In  = { x: kfB.x - (kfB.x - kfA.x) * 0.4, y: kfB.y };
  const cp2Out = { x: kfB.x + (kfC.x - kfB.x) * 0.4, y: kfB.y };
  const cp2In  = { x: kfC.x - (kfC.x - kfB.x) * 0.5, y: kfC.y };

  const pathD = `M ${kfA.x},${kfA.y} C ${cp1Out.x},${cp1Out.y} ${cp1In.x},${cp1In.y} ${kfB.x},${kfB.y} C ${cp2Out.x},${cp2Out.y} ${cp2In.x},${cp2In.y} ${kfC.x},${kfC.y}`;

  const handleR = Math.min(settings.handleSize, 6);
  const cpR     = Math.min(settings.cpSize, 5);

  const renderHandle = (cx: number, cy: number, selected: boolean) => {
    const r = selected ? handleR * settings.handleSelectedMultiplier : handleR;
    const fill   = selected ? settings.handleSelectedFill   : settings.colorX;
    const stroke = selected ? settings.handleSelectedBorder : settings.handleBorder;
    const sw     = selected ? settings.handleBorderWidth * 1.5 : settings.handleBorderWidth;

    switch (settings.handleShape) {
      case 'diamond': {
        const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
        return <polygon key={`h-${cx}`} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'square':
        return <rect key={`h-${cx}`} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'rounded-square':
        return <rect key={`h-${cx}`} x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.35} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'triangle': {
        const pts = `${cx},${cy - r} ${cx + r},${cy + r * 0.7} ${cx - r},${cy + r * 0.7}`;
        return <polygon key={`h-${cx}`} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      default:
        return <circle key={`h-${cx}`} cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  const renderCp = (cx: number, cy: number) => {
    const fill   = settings.cpFill;
    const stroke = settings.cpBorder;
    const sw     = settings.cpBorderWidth;

    switch (settings.cpShape) {
      case 'diamond': {
        const pts = `${cx},${cy - cpR} ${cx + cpR},${cy} ${cx},${cy + cpR} ${cx - cpR},${cy}`;
        return <polygon key={`cp-${cx}`} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'square':
        return <rect key={`cp-${cx}`} x={cx - cpR} y={cy - cpR} width={cpR * 2} height={cpR * 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'triangle': {
        const pts = `${cx},${cy - cpR} ${cx + cpR},${cy + cpR * 0.7} ${cx - cpR},${cy + cpR * 0.7}`;
        return <polygon key={`cp-${cx}`} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      default:
        return <circle key={`cp-${cx}`} cx={cx} cy={cy} r={cpR} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  return (
    <div className="border border-gray-700/50">
      <div className="px-3 py-1.5 bg-gray-800/80 border-b border-gray-700/50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
        Live Preview
      </div>
      <div className="p-2" style={{ background: settings.editorBg }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <defs>
            <pattern id="kf-preview-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={settings.gridColor} strokeWidth={0.3 * (settings.gridOpacity / 100 * 3.33)} />
            </pattern>
          </defs>
          <rect width={W} height={H} fill={settings.editorBg} />
          <rect width={W} height={H} fill="url(#kf-preview-grid)" />

          <path d={pathD} fill="none" stroke={settings.colorX} strokeWidth={settings.curveWidth} opacity={settings.curveOpacity} />

          <line x1={kfB.x} y1={kfB.y} x2={cp1In.x} y2={cp1In.y}
            stroke={settings.colorHandleLine} strokeWidth={settings.handleLineWidth}
            strokeDasharray="2,2" opacity={settings.handleLineOpacity} />
          <line x1={kfB.x} y1={kfB.y} x2={cp2Out.x} y2={cp2Out.y}
            stroke={settings.colorHandleLine} strokeWidth={settings.handleLineWidth}
            strokeDasharray="2,2" opacity={settings.handleLineOpacity} />

          {renderCp(cp1In.x, cp1In.y)}
          {renderCp(cp2Out.x, cp2Out.y)}

          {renderHandle(kfA.x, kfA.y, false)}
          {renderHandle(kfB.x, kfB.y, true)}
          {renderHandle(kfC.x, kfC.y, false)}
        </svg>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const KeyframeSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<KeyframeSettings>(() =>
    keyframeDefaultsService.getDefaults()
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const update = useCallback(<K extends keyof KeyframeSettings>(key: K, value: KeyframeSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      keyframeDefaultsService.update(next);
      return next;
    });
  }, []);

  const handleReset = () => {
    keyframeDefaultsService.resetToFactory();
    setSettings({ ...KF_FACTORY_DEFAULTS });
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-3 pb-4">

      {/* Section 1 — Property Curve Colors */}
      <Section title="Property Curve Colors">
        <GroupLabel label="Position" />
        <ColorPickerRow label="Position X"    value={settings.colorX}      onChange={(v) => update('colorX', v)}      swatch />
        <ColorPickerRow label="Position Y"    value={settings.colorY}      onChange={(v) => update('colorY', v)}      swatch />

        <GroupLabel label="Transform" />
        <ColorPickerRow label="Width"         value={settings.colorWidth}       onChange={(v) => update('colorWidth', v)}       swatch />
        <ColorPickerRow label="Height"        value={settings.colorHeight}      onChange={(v) => update('colorHeight', v)}      swatch />
        <ColorPickerRow label="Rotation"      value={settings.colorRotation}    onChange={(v) => update('colorRotation', v)}    swatch />
        <ColorPickerRow label="Scale X"       value={settings.colorScaleX}      onChange={(v) => update('colorScaleX', v)}      swatch />
        <ColorPickerRow label="Scale Y"       value={settings.colorScaleY}      onChange={(v) => update('colorScaleY', v)}      swatch />

        <GroupLabel label="Appearance" />
        <ColorPickerRow label="Opacity"       value={settings.colorOpacity}     onChange={(v) => update('colorOpacity', v)}     swatch />
        <ColorPickerRow label="Fill Color"    value={settings.colorFill}        onChange={(v) => update('colorFill', v)}        swatch />
        <ColorPickerRow label="Stroke Color"  value={settings.colorStroke}      onChange={(v) => update('colorStroke', v)}      swatch />
        <ColorPickerRow label="Stroke Width"  value={settings.colorStrokeWidth} onChange={(v) => update('colorStrokeWidth', v)} swatch />
        <ColorPickerRow label="Border Radius" value={settings.colorBorderRadius} onChange={(v) => update('colorBorderRadius', v)} swatch />

        <GroupLabel label="Shadow" />
        <ColorPickerRow label="Shadow Blur"   value={settings.colorShadowBlur}  onChange={(v) => update('colorShadowBlur', v)}  swatch />
        <ColorPickerRow label="Shadow X"      value={settings.colorShadowX}     onChange={(v) => update('colorShadowX', v)}     swatch />
        <ColorPickerRow label="Shadow Y"      value={settings.colorShadowY}     onChange={(v) => update('colorShadowY', v)}     swatch />

        <GroupLabel label="Text" />
        <ColorPickerRow label="Font Size"       value={settings.colorFontSize}      onChange={(v) => update('colorFontSize', v)}      swatch />
        <ColorPickerRow label="Letter Spacing"  value={settings.colorLetterSpacing} onChange={(v) => update('colorLetterSpacing', v)} swatch />

        <GroupLabel label="Special" />
        <ColorPickerRow label="Default Curve"    value={settings.colorDefault}   onChange={(v) => update('colorDefault', v)}   swatch />
        <ColorPickerRow label="Selected Curve"   value={settings.colorSelected}  onChange={(v) => update('colorSelected', v)}  swatch />
        <ColorPickerRow label="Handle Lines"     value={settings.colorHandleLine} onChange={(v) => update('colorHandleLine', v)} swatch />
      </Section>

      {/* Section 2 — Curve Line Style */}
      <Section title="Curve Line Style" defaultOpen={false}>
        <SliderRow
          label="Default Curve Width"
          value={settings.curveWidth}
          min={0.5}
          max={5}
          step={0.1}
          onChange={(v) => update('curveWidth', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <SliderRow
          label="Selected Curve Width"
          value={settings.curveWidthSelected}
          min={0.5}
          max={6}
          step={0.1}
          onChange={(v) => update('curveWidthSelected', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <SliderRow
          label="Handle Line Width"
          value={settings.handleLineWidth}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => update('handleLineWidth', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <SliderRow
          label="Handle Line Opacity"
          value={Math.round(settings.handleLineOpacity * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update('handleLineOpacity', v / 100)}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Curve Opacity"
          value={Math.round(settings.curveOpacity * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update('curveOpacity', v / 100)}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Inactive Curve Opacity"
          value={Math.round(settings.inactiveCurveOpacity * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update('inactiveCurveOpacity', v / 100)}
          format={(v) => `${v}%`}
        />
      </Section>

      {/* Section 3 — Keyframe Handle Shape */}
      <Section title="Keyframe Handle Shape" defaultOpen={false}>
        <div>
          <label className="text-[11px] text-gray-500 block mb-2">Handle Shape</label>
          <ShapeSelector
            value={settings.handleShape}
            onChange={(s) => update('handleShape', s)}
            fill={settings.handleFill}
          />
        </div>
        <SliderRow
          label="Handle Size"
          value={settings.handleSize}
          min={2}
          max={12}
          step={1}
          onChange={(v) => update('handleSize', v)}
          format={(v) => `${v}px`}
        />
        <ColorPickerRow label="Handle Fill"            value={settings.handleFill}           onChange={(v) => update('handleFill', v)} />
        <ColorPickerRow label="Handle Border"          value={settings.handleBorder}         onChange={(v) => update('handleBorder', v)} />
        <SliderRow
          label="Handle Border Width"
          value={settings.handleBorderWidth}
          min={0}
          max={3}
          step={0.1}
          onChange={(v) => update('handleBorderWidth', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <ColorPickerRow label="Selected Handle Fill"   value={settings.handleSelectedFill}   onChange={(v) => update('handleSelectedFill', v)} />
        <ColorPickerRow label="Selected Handle Border" value={settings.handleSelectedBorder} onChange={(v) => update('handleSelectedBorder', v)} />
        <SliderRow
          label="Selected Handle Size Multiplier"
          value={settings.handleSelectedMultiplier}
          min={1.0}
          max={2.5}
          step={0.1}
          onChange={(v) => update('handleSelectedMultiplier', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}×`}
        />
        <ColorPickerRow label="Hovered Handle Fill"    value={settings.handleHoveredFill}    onChange={(v) => update('handleHoveredFill', v)} />
      </Section>

      {/* Section 4 — Bezier Control Point Handles */}
      <Section title="Bezier Control Points" defaultOpen={false}>
        <div>
          <label className="text-[11px] text-gray-500 block mb-2">Control Point Shape</label>
          <ShapeSelector
            value={settings.cpShape}
            onChange={(s) => update('cpShape', s)}
            fill={settings.cpFill}
          />
        </div>
        <SliderRow
          label="Control Point Size"
          value={settings.cpSize}
          min={2}
          max={10}
          step={1}
          onChange={(v) => update('cpSize', v)}
          format={(v) => `${v}px`}
        />
        <ColorPickerRow label="Control Point Fill"          value={settings.cpFill}        onChange={(v) => update('cpFill', v)} />
        <ColorPickerRow label="Control Point Border"        value={settings.cpBorder}      onChange={(v) => update('cpBorder', v)} />
        <SliderRow
          label="Control Point Border Width"
          value={settings.cpBorderWidth}
          min={0}
          max={2}
          step={0.1}
          onChange={(v) => update('cpBorderWidth', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <ColorPickerRow label="Selected Control Point Fill" value={settings.cpSelectedFill} onChange={(v) => update('cpSelectedFill', v)} />
        <ToggleRow
          label="Linked Handles by Default"
          description="Moving one bezier handle mirrors the other for smooth easing"
          value={settings.linkedHandles}
          onChange={() => update('linkedHandles', !settings.linkedHandles)}
        />
      </Section>

      {/* Section 5 — Timeline Track Appearance (future integration) */}
      <Section title="Timeline Track Appearance" defaultOpen={false}>
        <div className="px-3 py-2 bg-blue-500/8 border border-blue-500/20 text-[11px] text-blue-400/90">
          Timeline keyframe diamond settings will wire to the timeline renderer in a future update.
          Colors configured here are saved and will apply when the integration is complete.
        </div>
        <ColorPickerRow label="Timeline Keyframe Color"          value={settings.colorDefault}  onChange={(v) => update('colorDefault', v)} />
        <ColorPickerRow label="Timeline Keyframe Selected Color" value={settings.colorSelected} onChange={(v) => update('colorSelected', v)} />
      </Section>

      {/* Section 6 — Editor Background and Grid */}
      <Section title="Editor Background &amp; Grid" defaultOpen={false}>
        <ColorPickerRow label="Editor Background"  value={settings.editorBg}     onChange={(v) => update('editorBg', v)} />
        <ColorPickerRow label="Grid Line Color"    value={settings.gridColor}    onChange={(v) => update('gridColor', v)} />
        <SliderRow
          label="Grid Line Opacity"
          value={settings.gridOpacity}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update('gridOpacity', v)}
          format={(v) => `${v}%`}
        />
        <ColorPickerRow label="Zero Line Color"    value={settings.zeroLineColor} onChange={(v) => update('zeroLineColor', v)} />
        <SliderRow
          label="Zero Line Width"
          value={settings.zeroLineWidth}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => update('zeroLineWidth', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
        <ColorPickerRow label="Playhead Line Color" value={settings.playheadColor} onChange={(v) => update('playheadColor', v)} />
      </Section>

      {/* Live Preview */}
      <LivePreview settings={settings} />

      {/* Reset */}
      <div className="pt-1">
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full px-3 py-2 text-xs font-medium text-red-400 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
          >
            Reset Keyframe Settings to Default
          </button>
        ) : (
          <div className="border border-red-500/40 bg-red-500/8 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-300">
                Reset all keyframe settings to factory defaults? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
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
};

export default KeyframeSettingsTab;
