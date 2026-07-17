import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  appearanceSettingsService,
  CanvasAppearance,
  ClipsTimelineAppearance,
  KeyframesTimelineAppearance,
  LayersPanelAppearance,
  MediaPageAppearance,
  OtherAppearance,
} from '../../services/AppearanceSettingsService';

type AppearanceSubtab = 'canvas' | 'clips' | 'keyframes' | 'layers' | 'media' | 'other';

const SUBTABS: { id: AppearanceSubtab; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'clips', label: 'Clips Timeline' },
  { id: 'keyframes', label: 'Keyframes Timeline' },
  { id: 'layers', label: 'Layers Panel' },
  { id: 'media', label: 'Media Page' },
  { id: 'other', label: 'Other' },
];

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

const ColorRow = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => {
  const safeHex = value.startsWith('#') && value.length <= 9 ? value.slice(0, 7) : '#000000';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 flex-1 min-w-0 truncate">{label}</span>
      <input
        type="color"
        value={safeHex}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-6 cursor-pointer border border-gray-700/50 bg-transparent flex-shrink-0"
      />
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value.trim();
          if (/^#[0-9a-fA-F]{0,8}$/.test(v) || v.startsWith('rgba') || v.startsWith('rgb') || v === 'transparent') {
            onChange(v);
          }
        }}
        className="w-28 px-2 py-1 bg-gray-800 border border-gray-700/50 text-white text-[11px] focus:outline-none focus:border-yellow-400/60 font-mono flex-shrink-0"
      />
    </div>
  );
};

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

const SelectRow = ({ label, value, options, onChange }: {
  label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void;
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

const ResetButton = ({ label, onReset }: { label: string; onReset: () => void }) => (
  <button
    onClick={() => { if (window.confirm(`Reset ${label} to factory defaults?`)) onReset(); }}
    className="w-full mt-2 px-3 py-1.5 bg-gray-800/60 hover:bg-red-900/30 border border-gray-700/50 hover:border-red-700/50 text-gray-400 hover:text-red-400 transition-colors text-xs font-medium"
  >
    Reset {label} to Default
  </button>
);

type PlayheadCapShape = ClipsTimelineAppearance['playheadCapShape'];

const PLAYHEAD_CAP_SHAPES: { id: PlayheadCapShape; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'circle', label: 'Circle' },
  { id: 'triangle-up', label: 'Tri Up' },
  { id: 'triangle-down', label: 'Tri Dn' },
  { id: 'arrow-down', label: 'Arrow' },
  { id: 'pentagon', label: 'Pentagon' },
];

const PlayheadCapSelector = ({ value, onChange }: { value: PlayheadCapShape; onChange: (v: PlayheadCapShape) => void }) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1.5">Playhead Cap Shape</label>
    <div className="grid grid-cols-7 gap-1">
      {PLAYHEAD_CAP_SHAPES.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          title={s.label}
          className={`flex flex-col items-center gap-0.5 px-1 py-1.5 border transition-colors ${value === s.id ? 'border-yellow-400/60 bg-yellow-400/10 text-yellow-400' : 'border-gray-700/50 bg-gray-800/60 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}
        >
          <PlayheadCapPreview shape={s.id} />
          <span className="text-[9px] leading-none">{s.label}</span>
        </button>
      ))}
    </div>
  </div>
);

const PlayheadCapPreview = ({ shape }: { shape: PlayheadCapShape }) => {
  const size = 14;
  const h = Math.round(size / 2);
  switch (shape) {
    case 'square': return <svg width={size} height={size} viewBox="0 0 14 14"><rect x={2} y={2} width={10} height={10} fill="currentColor" /></svg>;
    case 'diamond': return <svg width={size} height={size} viewBox="0 0 14 14"><polygon points="7,1 13,7 7,13 1,7" fill="currentColor" /></svg>;
    case 'circle': return <svg width={size} height={size} viewBox="0 0 14 14"><circle cx={7} cy={7} r={5} fill="currentColor" /></svg>;
    case 'triangle-up': return <svg width={size} height={size} viewBox="0 0 14 14"><polygon points="7,1 13,13 1,13" fill="currentColor" /></svg>;
    case 'triangle-down': return <svg width={size} height={size} viewBox="0 0 14 14"><polygon points="7,13 13,1 1,1" fill="currentColor" /></svg>;
    case 'arrow-down': return <svg width={size} height={h + 4} viewBox={`0 0 14 ${h + 4}`}><polygon points={`7,${h + 4} 13,0 1,0`} fill="currentColor" /></svg>;
    case 'pentagon': return <svg width={size} height={size} viewBox="0 0 14 14"><polygon points="7,1 13,5.5 10.9,12.5 3.1,12.5 1,5.5" fill="currentColor" /></svg>;
    default: return null;
  }
};

function CanvasSubtab() {
  const [s, setS] = useState<CanvasAppearance>(appearanceSettingsService.getCanvas());
  const upd = (patch: Partial<CanvasAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setCanvas(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <Section title="Canvas Background">
        <ColorRow label="Default Canvas Color" value={s.canvasDefaultColor} onChange={v => upd({ canvasDefaultColor: v })} />
        <div className="text-[10px] text-gray-600 -mt-1">Shown when no project background is configured.</div>
        <ColorRow label="Canvas Border Color" value={s.canvasBorderColor} onChange={v => upd({ canvasBorderColor: v })} />
        <SliderRow label="Canvas Border Width" value={s.canvasBorderWidth} min={0} max={4} step={0.5} onChange={v => upd({ canvasBorderWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Canvas Shadow Color" value={s.canvasShadowColor} onChange={v => upd({ canvasShadowColor: v })} />
        <SliderRow label="Canvas Shadow Blur" value={s.canvasShadowBlur} min={0} max={60} step={1} onChange={v => upd({ canvasShadowBlur: v })} format={v => `${v}px`} />
        <SliderRow label="Canvas Shadow Spread" value={s.canvasShadowSpread} min={0} max={30} step={1} onChange={v => upd({ canvasShadowSpread: v })} format={v => `${v}px`} />
        <ColorRow label="Workspace Background Color" value={s.workspaceBgColor} onChange={v => upd({ workspaceBgColor: v })} />
        <ToggleRow label="Checkerboard for Transparency" description="Show checkerboard pattern on transparent areas" value={s.checkerboard} onChange={() => upd({ checkerboard: !s.checkerboard })} />
        {s.checkerboard && <>
          <ColorRow label="Checkerboard Light Color" value={s.checkerboardLight} onChange={v => upd({ checkerboardLight: v })} />
          <ColorRow label="Checkerboard Dark Color" value={s.checkerboardDark} onChange={v => upd({ checkerboardDark: v })} />
          <SliderRow label="Checkerboard Cell Size" value={s.checkerboardCellSize} min={4} max={32} step={1} onChange={v => upd({ checkerboardCellSize: v })} format={v => `${v}px`} />
        </>}
      </Section>

      <Section title="Snapping">
        <ColorRow label="Canvas Center Snap Line Color" value={s.centerSnapColor} onChange={v => upd({ centerSnapColor: v })} />
        <ColorRow label="Element Snap Line Color" value={s.elementSnapColor} onChange={v => upd({ elementSnapColor: v })} />
        <SliderRow label="Snap Line Thickness" value={s.snapLineThickness} min={0.5} max={4} step={0.5} onChange={v => upd({ snapLineThickness: v })} format={v => `${v}px`} />
        <SliderRow label="Snap Line Opacity" value={s.snapLineOpacity} min={0} max={100} step={1} onChange={v => upd({ snapLineOpacity: v })} format={v => `${v}%`} />
        <ColorRow label="Snap Dot Indicator Color" value={s.snapDotColor} onChange={v => upd({ snapDotColor: v })} />
        <SliderRow label="Snap Dot Size" value={s.snapDotSize} min={2} max={12} step={1} onChange={v => upd({ snapDotSize: v })} format={v => `${v}px`} />
        <SliderRow label="Snap Proximity Threshold" value={s.snapThreshold} min={2} max={20} step={1} onChange={v => upd({ snapThreshold: v })} format={v => `${v}px`} />
        <div className="text-[10px] text-gray-600 -mt-1">How close in screen pixels an element must be before snapping activates.</div>
      </Section>

      <Section title="Selection">
        <ColorRow label="Selection Handle Color" value={s.selectionHandleColor} onChange={v => upd({ selectionHandleColor: v })} />
        <SliderRow label="Selection Handle Size" value={s.selectionHandleSize} min={4} max={16} step={1} onChange={v => upd({ selectionHandleSize: v })} format={v => `${v}px`} />
        <ColorRow label="Selection Border Color" value={s.selectionBorderColor} onChange={v => upd({ selectionBorderColor: v })} />
        <SliderRow label="Selection Border Width" value={s.selectionBorderWidth} min={0.5} max={3} step={0.5} onChange={v => upd({ selectionBorderWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Multi-Selection Fill Color" value={s.multiSelectFillColor} onChange={v => upd({ multiSelectFillColor: v })} />
        <ColorRow label="Multi-Selection Border Color" value={s.multiSelectBorderColor} onChange={v => upd({ multiSelectBorderColor: v })} />
        <SliderRow label="Multi-Selection Border Width" value={s.multiSelectBorderWidth} min={1} max={3} step={0.5} onChange={v => upd({ multiSelectBorderWidth: v })} format={v => `${v}px`} />
      </Section>

      <ResetButton label="Canvas" onReset={() => { appearanceSettingsService.resetCanvas(); setS(appearanceSettingsService.getCanvas()); }} />
    </div>
  );
}

function ClipsSubtab() {
  const [s, setS] = useState<ClipsTimelineAppearance>(appearanceSettingsService.getClipsTimeline());
  const upd = (patch: Partial<ClipsTimelineAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setClipsTimeline(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <Section title="Clip Colors">
        <ColorRow label="Shape Clip Color" value={s.clipColorShape} onChange={v => upd({ clipColorShape: v })} />
        <ColorRow label="Text Clip Color" value={s.clipColorText} onChange={v => upd({ clipColorText: v })} />
        <ColorRow label="Image Clip Color" value={s.clipColorImage} onChange={v => upd({ clipColorImage: v })} />
        <ColorRow label="Video Clip Color" value={s.clipColorVideo} onChange={v => upd({ clipColorVideo: v })} />
        <ColorRow label="Audio Clip Color" value={s.clipColorAudio} onChange={v => upd({ clipColorAudio: v })} />
        <ColorRow label="Gradient Object Clip Color" value={s.clipColorGradient} onChange={v => upd({ clipColorGradient: v })} />
        <ColorRow label="3D Shape Clip Color" value={s.clipColor3D} onChange={v => upd({ clipColor3D: v })} />
        <ColorRow label="Clip Label Text Color" value={s.clipLabelTextColor} onChange={v => upd({ clipLabelTextColor: v })} />
        <SliderRow label="Clip Label Font Size" value={s.clipLabelFontSize} min={8} max={14} step={1} onChange={v => upd({ clipLabelFontSize: v })} format={v => `${v}px`} />
        <SliderRow label="Clip Border Radius" value={s.clipBorderRadius} min={0} max={8} step={1} onChange={v => upd({ clipBorderRadius: v })} format={v => `${v}px`} />
        <ColorRow label="Clip Selected Outline Color" value={s.clipSelectedOutlineColor} onChange={v => upd({ clipSelectedOutlineColor: v })} />
        <SliderRow label="Clip Selected Outline Width" value={s.clipSelectedOutlineWidth} min={1} max={3} step={0.5} onChange={v => upd({ clipSelectedOutlineWidth: v })} format={v => `${v}px`} />
        <SliderRow label="Clip Locked Opacity" value={s.clipLockedOpacity} min={10} max={80} step={1} onChange={v => upd({ clipLockedOpacity: v })} format={v => `${v}%`} />
      </Section>

      <Section title="Playhead">
        <ColorRow label="Playhead Line Color" value={s.playheadLineColor} onChange={v => upd({ playheadLineColor: v })} />
        <SliderRow label="Playhead Line Width" value={s.playheadLineWidth} min={1} max={4} step={0.5} onChange={v => upd({ playheadLineWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Playhead Active Color (Snapping)" value={s.playheadActiveColor} onChange={v => upd({ playheadActiveColor: v })} />
        <PlayheadCapSelector value={s.playheadCapShape} onChange={v => upd({ playheadCapShape: v })} />
        <SliderRow label="Playhead Cap Size" value={s.playheadCapSize} min={6} max={20} step={1} onChange={v => upd({ playheadCapSize: v })} format={v => `${v}px`} />
        <ColorRow label="Playhead Cap Color" value={s.playheadCapColor} onChange={v => upd({ playheadCapColor: v })} />
      </Section>

      <Section title="Track Area">
        <ColorRow label="Track Background (Even)" value={s.trackBgEven} onChange={v => upd({ trackBgEven: v })} />
        <ColorRow label="Track Background (Odd)" value={s.trackBgOdd} onChange={v => upd({ trackBgOdd: v })} />
        <ColorRow label="Track Border Color" value={s.trackBorderColor} onChange={v => upd({ trackBorderColor: v })} />
        <SliderRow label="Track Border Width" value={s.trackBorderWidth} min={0} max={2} step={0.5} onChange={v => upd({ trackBorderWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Track Header Background" value={s.trackHeaderBgColor} onChange={v => upd({ trackHeaderBgColor: v })} />
        <SliderRow label="Track Height" value={s.trackHeight} min={24} max={80} step={1} onChange={v => upd({ trackHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Track Header Width" value={s.trackHeaderWidth} min={80} max={240} step={1} onChange={v => upd({ trackHeaderWidth: v })} format={v => `${v}px`} />
      </Section>

      <Section title="Ruler">
        <ColorRow label="Ruler Background Color" value={s.rulerBgColor} onChange={v => upd({ rulerBgColor: v })} />
        <ColorRow label="Ruler Text Color" value={s.rulerTextColor} onChange={v => upd({ rulerTextColor: v })} />
        <ColorRow label="Ruler Tick Color" value={s.rulerTickColor} onChange={v => upd({ rulerTickColor: v })} />
        <SliderRow label="Ruler Height" value={s.rulerHeight} min={20} max={48} step={1} onChange={v => upd({ rulerHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Ruler Font Size" value={s.rulerFontSize} min={8} max={13} step={1} onChange={v => upd({ rulerFontSize: v })} format={v => `${v}px`} />
      </Section>

      <Section title="Timeline Snapping">
        <ColorRow label="Snap Line Color" value={s.snapLineColor} onChange={v => upd({ snapLineColor: v })} />
        <SliderRow label="Snap Line Width" value={s.snapLineWidth} min={1} max={3} step={0.5} onChange={v => upd({ snapLineWidth: v })} format={v => `${v}px`} />
        <SliderRow label="Snap Line Opacity" value={s.snapLineOpacity} min={0} max={100} step={1} onChange={v => upd({ snapLineOpacity: v })} format={v => `${v}%`} />
      </Section>

      <Section title="Keyframe Diamonds on Clips">
        <ColorRow label="Keyframe Diamond Color" value={s.keyframeDiamondColor} onChange={v => upd({ keyframeDiamondColor: v })} />
        <SliderRow label="Keyframe Diamond Size" value={s.keyframeDiamondSize} min={4} max={14} step={1} onChange={v => upd({ keyframeDiamondSize: v })} format={v => `${v}px`} />
        <ColorRow label="Keyframe Diamond Border Color" value={s.keyframeDiamondBorderColor} onChange={v => upd({ keyframeDiamondBorderColor: v })} />
      </Section>

      <ResetButton label="Clips Timeline" onReset={() => { appearanceSettingsService.resetClipsTimeline(); setS(appearanceSettingsService.getClipsTimeline()); }} />
    </div>
  );
}

function KeyframesSubtab() {
  const [s, setS] = useState<KeyframesTimelineAppearance>(appearanceSettingsService.getKeyframesTimeline());
  const upd = (patch: Partial<KeyframesTimelineAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setKeyframesTimeline(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <div className="px-3 py-2 bg-blue-500/8 border border-blue-500/20 text-[11px] text-blue-400/90">
        Per-property curve colors and handle shapes are configured in the Keyframes settings tab above.
      </div>

      <Section title="Panel Structure">
        <ColorRow label="Panel Background Color" value={s.panelBgColor} onChange={v => upd({ panelBgColor: v })} />
        <SliderRow label="Track Row Height" value={s.trackRowHeight} min={18} max={48} step={1} onChange={v => upd({ trackRowHeight: v })} format={v => `${v}px`} />
        <ColorRow label="Track Row Background (Even)" value={s.trackRowBgEven} onChange={v => upd({ trackRowBgEven: v })} />
        <ColorRow label="Track Row Background (Odd)" value={s.trackRowBgOdd} onChange={v => upd({ trackRowBgOdd: v })} />
        <ColorRow label="Track Row Hover Color" value={s.trackRowHoverColor} onChange={v => upd({ trackRowHoverColor: v })} />
        <ColorRow label="Track Row Selected Color" value={s.trackRowSelectedColor} onChange={v => upd({ trackRowSelectedColor: v })} />
        <SliderRow label="Track Header Width" value={s.trackHeaderWidth} min={80} max={200} step={1} onChange={v => upd({ trackHeaderWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Track Header Text Color" value={s.trackHeaderTextColor} onChange={v => upd({ trackHeaderTextColor: v })} />
        <SliderRow label="Track Header Font Size" value={s.trackHeaderFontSize} min={8} max={13} step={1} onChange={v => upd({ trackHeaderFontSize: v })} format={v => `${v}px`} />
      </Section>

      <Section title="Grid">
        <SliderRow label="Grid Line Opacity" value={s.gridLineOpacity} min={0} max={100} step={1} onChange={v => upd({ gridLineOpacity: v })} format={v => `${v}%`} />
        <ColorRow label="Zero Line Color" value={s.zeroLineColor} onChange={v => upd({ zeroLineColor: v })} />
        <SliderRow label="Zero Line Width" value={s.zeroLineWidth} min={1} max={3} step={0.5} onChange={v => upd({ zeroLineWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Ruler Background Color" value={s.rulerBgColor} onChange={v => upd({ rulerBgColor: v })} />
        <ColorRow label="Ruler Text Color" value={s.rulerTextColor} onChange={v => upd({ rulerTextColor: v })} />
        <SliderRow label="Ruler Height" value={s.rulerHeight} min={16} max={40} step={1} onChange={v => upd({ rulerHeight: v })} format={v => `${v}px`} />
      </Section>

      <Section title="Scrubber">
        <ColorRow label="Scrubber Color" value={s.scrubberColor} onChange={v => upd({ scrubberColor: v })} />
        <SliderRow label="Scrubber Width" value={s.scrubberWidth} min={1} max={3} step={0.5} onChange={v => upd({ scrubberWidth: v })} format={v => `${v}px`} />
      </Section>

      <ResetButton label="Keyframes Timeline" onReset={() => { appearanceSettingsService.resetKeyframesTimeline(); setS(appearanceSettingsService.getKeyframesTimeline()); }} />
    </div>
  );
}

function LayersSubtab() {
  const [s, setS] = useState<LayersPanelAppearance>(appearanceSettingsService.getLayersPanel());
  const upd = (patch: Partial<LayersPanelAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setLayersPanel(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <Section title="Row Dimensions">
        <SliderRow label="Layer Row Height" value={s.layerRowHeight} min={20} max={60} step={1} onChange={v => upd({ layerRowHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Layer Indent Size" value={s.layerIndentSize} min={8} max={32} step={1} onChange={v => upd({ layerIndentSize: v })} format={v => `${v}px`} />
        <SliderRow label="Row Padding Horizontal" value={s.layerRowPaddingH} min={4} max={16} step={1} onChange={v => upd({ layerRowPaddingH: v })} format={v => `${v}px`} />
      </Section>

      <Section title="Row Colors">
        <ColorRow label="Row Background Color" value={s.rowBgColor} onChange={v => upd({ rowBgColor: v })} />
        <ColorRow label="Row Hover Color" value={s.rowHoverColor} onChange={v => upd({ rowHoverColor: v })} />
        <ColorRow label="Row Selected Color" value={s.rowSelectedColor} onChange={v => upd({ rowSelectedColor: v })} />
        <ColorRow label="Row Selected Text Color" value={s.rowSelectedTextColor} onChange={v => upd({ rowSelectedTextColor: v })} />
        <ColorRow label="Row Border Color" value={s.rowBorderColor} onChange={v => upd({ rowBorderColor: v })} />
        <SliderRow label="Row Border Width" value={s.rowBorderWidth} min={0} max={2} step={0.5} onChange={v => upd({ rowBorderWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Group Header Background" value={s.groupHeaderBgColor} onChange={v => upd({ groupHeaderBgColor: v })} />
      </Section>

      <Section title="Icons and Buttons">
        <SliderRow label="Layer Icon Size" value={s.iconSize} min={12} max={24} step={1} onChange={v => upd({ iconSize: v })} format={v => `${v}px`} />
        <ColorRow label="Layer Icon Color" value={s.iconColor} onChange={v => upd({ iconColor: v })} />
        <SliderRow label="Visibility Button Size" value={s.visibilityBtnSize} min={12} max={22} step={1} onChange={v => upd({ visibilityBtnSize: v })} format={v => `${v}px`} />
        <SliderRow label="Lock Button Size" value={s.lockBtnSize} min={12} max={22} step={1} onChange={v => upd({ lockBtnSize: v })} format={v => `${v}px`} />
        <SliderRow label="Button Spacing" value={s.buttonSpacing} min={2} max={12} step={1} onChange={v => upd({ buttonSpacing: v })} format={v => `${v}px`} />
        <ColorRow label="Button Color" value={s.buttonColor} onChange={v => upd({ buttonColor: v })} />
        <ColorRow label="Button Active Color" value={s.buttonActiveColor} onChange={v => upd({ buttonActiveColor: v })} />
        <ColorRow label="Button Hover Color" value={s.buttonHoverColor} onChange={v => upd({ buttonHoverColor: v })} />
      </Section>

      <Section title="Text">
        <SliderRow label="Layer Name Font Size" value={s.nameFontSize} min={10} max={14} step={1} onChange={v => upd({ nameFontSize: v })} format={v => `${v}px`} />
        <ColorRow label="Layer Name Color" value={s.nameColor} onChange={v => upd({ nameColor: v })} />
        <ColorRow label="Layer Name Selected Color" value={s.nameSelectedColor} onChange={v => upd({ nameSelectedColor: v })} />
        <SliderRow label="Layer Name Locked Opacity" value={s.nameLockedOpacity} min={20} max={70} step={1} onChange={v => upd({ nameLockedOpacity: v })} format={v => `${v}%`} />
      </Section>

      <Section title="Panel">
        <ColorRow label="Panel Background Color" value={s.panelBgColor} onChange={v => upd({ panelBgColor: v })} />
        <ColorRow label="Panel Header Background" value={s.panelHeaderBgColor} onChange={v => upd({ panelHeaderBgColor: v })} />
        <ColorRow label="Panel Header Text Color" value={s.panelHeaderTextColor} onChange={v => upd({ panelHeaderTextColor: v })} />
        <SliderRow label="Panel Header Height" value={s.panelHeaderHeight} min={24} max={48} step={1} onChange={v => upd({ panelHeaderHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Scrollbar Width" value={s.scrollbarWidth} min={2} max={8} step={1} onChange={v => upd({ scrollbarWidth: v })} format={v => `${v}px`} />
      </Section>

      <ResetButton label="Layers Panel" onReset={() => { appearanceSettingsService.resetLayersPanel(); setS(appearanceSettingsService.getLayersPanel()); }} />
    </div>
  );
}

function MediaSubtab() {
  const [s, setS] = useState<MediaPageAppearance>(appearanceSettingsService.getMediaPage());
  const upd = (patch: Partial<MediaPageAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setMediaPage(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <Section title="Card Dimensions">
        <SliderRow label="Card Width" value={s.cardWidth} min={60} max={240} step={1} onChange={v => upd({ cardWidth: v })} format={v => `${v}px`} />
        <SliderRow label="Card Height" value={s.cardHeight} min={40} max={180} step={1} onChange={v => upd({ cardHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Card Border Radius" value={s.cardBorderRadius} min={0} max={12} step={1} onChange={v => upd({ cardBorderRadius: v })} format={v => `${v}px`} />
        <SliderRow label="Card Grid Gap" value={s.cardGridGap} min={4} max={24} step={1} onChange={v => upd({ cardGridGap: v })} format={v => `${v}px`} />
        <SliderRow label="Card Grid Columns" value={s.cardGridColumns} min={2} max={6} step={1} onChange={v => upd({ cardGridColumns: v })} format={v => String(v)} />
      </Section>

      <Section title="Card Appearance">
        <ColorRow label="Card Background Color" value={s.cardBgColor} onChange={v => upd({ cardBgColor: v })} />
        <ColorRow label="Card Hover Background" value={s.cardHoverBgColor} onChange={v => upd({ cardHoverBgColor: v })} />
        <ColorRow label="Card Selected Background" value={s.cardSelectedBgColor} onChange={v => upd({ cardSelectedBgColor: v })} />
        <ColorRow label="Card Selected Border Color" value={s.cardSelectedBorderColor} onChange={v => upd({ cardSelectedBorderColor: v })} />
        <SliderRow label="Card Selected Border Width" value={s.cardSelectedBorderWidth} min={1} max={3} step={0.5} onChange={v => upd({ cardSelectedBorderWidth: v })} format={v => `${v}px`} />
        <ToggleRow label="Card Shadow on Hover" value={s.cardShadowOnHover} onChange={() => upd({ cardShadowOnHover: !s.cardShadowOnHover })} />
        <SelectRow label="Thumbnail Fit Mode" value={s.thumbnailFitMode}
          options={[{ label: 'Cover', value: 'cover' }, { label: 'Contain', value: 'contain' }, { label: 'Fill', value: 'fill' }]}
          onChange={v => upd({ thumbnailFitMode: v as MediaPageAppearance['thumbnailFitMode'] })} />
      </Section>

      <Section title="Labels">
        <ToggleRow label="Show Asset Titles" value={s.showAssetTitles} onChange={() => upd({ showAssetTitles: !s.showAssetTitles })} />
        {s.showAssetTitles && <>
          <SliderRow label="Title Font Size" value={s.titleFontSize} min={8} max={13} step={1} onChange={v => upd({ titleFontSize: v })} format={v => `${v}px`} />
          <ColorRow label="Title Color" value={s.titleColor} onChange={v => upd({ titleColor: v })} />
          <SliderRow label="Title Max Lines" value={s.titleMaxLines} min={1} max={3} step={1} onChange={v => upd({ titleMaxLines: v })} format={v => String(v)} />
        </>}
        <ToggleRow label="Show Asset Duration" value={s.showAssetDuration} onChange={() => upd({ showAssetDuration: !s.showAssetDuration })} />
        {s.showAssetDuration && <>
          <ColorRow label="Duration Badge Background" value={s.durationBadgeBgColor} onChange={v => upd({ durationBadgeBgColor: v })} />
          <ColorRow label="Duration Badge Text Color" value={s.durationBadgeTextColor} onChange={v => upd({ durationBadgeTextColor: v })} />
          <SliderRow label="Duration Badge Font Size" value={s.durationBadgeFontSize} min={8} max={12} step={1} onChange={v => upd({ durationBadgeFontSize: v })} format={v => `${v}px`} />
        </>}
      </Section>

      <Section title="Panel">
        <ColorRow label="Panel Background Color" value={s.panelBgColor} onChange={v => upd({ panelBgColor: v })} />
        <ColorRow label="Section Header Color" value={s.sectionHeaderColor} onChange={v => upd({ sectionHeaderColor: v })} />
        <SliderRow label="Section Header Font Size" value={s.sectionHeaderFontSize} min={10} max={14} step={1} onChange={v => upd({ sectionHeaderFontSize: v })} format={v => `${v}px`} />
        <ColorRow label="Search Bar Background" value={s.searchBarBgColor} onChange={v => upd({ searchBarBgColor: v })} />
        <ColorRow label="Search Bar Border Color" value={s.searchBarBorderColor} onChange={v => upd({ searchBarBorderColor: v })} />
      </Section>

      <ResetButton label="Media Page" onReset={() => { appearanceSettingsService.resetMediaPage(); setS(appearanceSettingsService.getMediaPage()); }} />
    </div>
  );
}

function OtherSubtab() {
  const [s, setS] = useState<OtherAppearance>(appearanceSettingsService.getOther());
  const upd = (patch: Partial<OtherAppearance>) => {
    const next = { ...s, ...patch };
    setS(next);
    appearanceSettingsService.setOther(patch);
  };

  return (
    <div className="space-y-2 p-3 overflow-y-auto h-full">
      <Section title="Context Menu">
        <ColorRow label="Background Color" value={s.contextMenuBgColor} onChange={v => upd({ contextMenuBgColor: v })} />
        <ColorRow label="Border Color" value={s.contextMenuBorderColor} onChange={v => upd({ contextMenuBorderColor: v })} />
        <SliderRow label="Border Width" value={s.contextMenuBorderWidth} min={0} max={2} step={0.5} onChange={v => upd({ contextMenuBorderWidth: v })} format={v => `${v}px`} />
        <SliderRow label="Item Height" value={s.contextMenuItemHeight} min={22} max={48} step={1} onChange={v => upd({ contextMenuItemHeight: v })} format={v => `${v}px`} />
        <SliderRow label="Item Padding Horizontal" value={s.contextMenuItemPaddingH} min={8} max={24} step={1} onChange={v => upd({ contextMenuItemPaddingH: v })} format={v => `${v}px`} />
        <ColorRow label="Item Hover Color" value={s.contextMenuItemHoverColor} onChange={v => upd({ contextMenuItemHoverColor: v })} />
        <ColorRow label="Item Text Color" value={s.contextMenuItemTextColor} onChange={v => upd({ contextMenuItemTextColor: v })} />
        <ColorRow label="Item Active Text Color" value={s.contextMenuItemActiveTextColor} onChange={v => upd({ contextMenuItemActiveTextColor: v })} />
        <ColorRow label="Separator Color" value={s.contextMenuSeparatorColor} onChange={v => upd({ contextMenuSeparatorColor: v })} />
        <SliderRow label="Separator Width" value={s.contextMenuSeparatorWidth} min={0.5} max={2} step={0.5} onChange={v => upd({ contextMenuSeparatorWidth: v })} format={v => `${v}px`} />
        <SliderRow label="Font Size" value={s.contextMenuFontSize} min={10} max={14} step={1} onChange={v => upd({ contextMenuFontSize: v })} format={v => `${v}px`} />
        <SliderRow label="Min Width" value={s.contextMenuMinWidth} min={120} max={320} step={1} onChange={v => upd({ contextMenuMinWidth: v })} format={v => `${v}px`} />
        <ColorRow label="Shadow Color" value={s.contextMenuShadowColor} onChange={v => upd({ contextMenuShadowColor: v })} />
        <SliderRow label="Shadow Blur" value={s.contextMenuShadowBlur} min={0} max={40} step={1} onChange={v => upd({ contextMenuShadowBlur: v })} format={v => `${v}px`} />
        <SelectRow label="Context Menu Animation" value={s.contextMenuAnimation}
          options={[{ label: 'None', value: 'none' }, { label: 'Fade', value: 'fade' }, { label: 'Scale', value: 'scale' }]}
          onChange={v => upd({ contextMenuAnimation: v as OtherAppearance['contextMenuAnimation'] })} />
      </Section>

      <Section title="Tooltips">
        <ColorRow label="Tooltip Background Color" value={s.tooltipBgColor} onChange={v => upd({ tooltipBgColor: v })} />
        <ColorRow label="Tooltip Text Color" value={s.tooltipTextColor} onChange={v => upd({ tooltipTextColor: v })} />
        <SliderRow label="Tooltip Font Size" value={s.tooltipFontSize} min={10} max={13} step={1} onChange={v => upd({ tooltipFontSize: v })} format={v => `${v}px`} />
        <SliderRow label="Tooltip Delay" value={s.tooltipDelay} min={0} max={1000} step={50} onChange={v => upd({ tooltipDelay: v })} format={v => `${v}ms`} />
        <SliderRow label="Tooltip Border Radius" value={s.tooltipBorderRadius} min={0} max={6} step={1} onChange={v => upd({ tooltipBorderRadius: v })} format={v => `${v}px`} />
      </Section>

      <ResetButton label="Other" onReset={() => { appearanceSettingsService.resetOther(); setS(appearanceSettingsService.getOther()); }} />
    </div>
  );
}

const AppearanceSettingsTab: React.FC = () => {
  const [activeSubtab, setActiveSubtab] = useState<AppearanceSubtab>('canvas');

  const renderSubtab = () => {
    switch (activeSubtab) {
      case 'canvas': return <CanvasSubtab />;
      case 'clips': return <ClipsSubtab />;
      case 'keyframes': return <KeyframesSubtab />;
      case 'layers': return <LayersSubtab />;
      case 'media': return <MediaSubtab />;
      case 'other': return <OtherSubtab />;
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-36 bg-gray-800/50 border-r border-gray-700/50 flex-shrink-0 overflow-y-auto">
        {SUBTABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubtab(tab.id)}
            className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-gray-700/30 ${
              activeSubtab === tab.id
                ? 'bg-yellow-400/15 text-yellow-400 border-l-2 border-l-yellow-400 pl-2.5'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-l-2 border-l-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="p-2 mt-2 border-t border-gray-700/50">
          <button
            onClick={() => { if (window.confirm('Reset ALL appearance settings to factory defaults?')) appearanceSettingsService.resetAll(); }}
            className="w-full px-2 py-1.5 bg-gray-800/60 hover:bg-red-900/30 border border-gray-700/50 hover:border-red-700/50 text-gray-500 hover:text-red-400 transition-colors text-[10px] font-medium leading-tight"
          >
            Reset All Appearance
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {renderSubtab()}
      </div>
    </div>
  );
};

export default AppearanceSettingsTab;
