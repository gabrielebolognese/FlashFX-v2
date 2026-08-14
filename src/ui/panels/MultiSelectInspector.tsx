import { useState, useCallback, useRef } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import {
  computeAlignment, computeDistribution, computeEqualSize, computeTransformOp,
  computeSpacing, computeStackHorizontal, computeStackVertical, computeCircularArrange,
  computeRandomize, computeCenterToCanvas, computeFitToCanvas, computePixelSnap,
  computeAlignToSafeArea, computeAlignToArtboard, computeFitWidth, computeFitHeight, computeMatchCanvasAspect,
  type AlignAxis, type DistributeMode, type SizeMode, type SizeResult,
  type TransformMode, type TransformResult, type RandomizeOptions, type RandomizeResult, type FitCanvasResult,
} from '../../core/align';
import type { Layer, Vec2, Vec4, BlendMode } from '../../core/types';
import { autoCaptionAudioLayers } from '../../store/autoCaption';
import { FONT_MANIFEST } from '../../engine/fonts';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Sliders,
  MoveHorizontal,
  MoveVertical,
  Scaling,
  RotateCw,
  RectangleHorizontal,
  RectangleVertical,
  Maximize2,
  Equal,
  RefreshCw,
  Eraser,
  Space,
  LayoutGrid,
  Monitor,
  Rows3,
  Columns3,
  Circle,
  Shuffle,
  Crosshair,
  Fullscreen,
  Grid3x3,
  Shield,
  Frame,
  ArrowLeftRight,
  ArrowUpDown,
  Minus,
  Plus,
  Check,
  Undo2,
  Zap,
  Box,
  Captions,
  SlidersHorizontal,
} from 'lucide-react';
import { StaggerPanel } from './StaggerPanel';

type ArrangeTab = 'common' | 'align' | 'distribute' | 'size' | 'transform' | 'spacing' | 'arrange' | 'canvas' | 'stagger';

export function MultiSelectInspector() {
  const [tab, setTab] = useState<ArrangeTab>('common');

  return (
    <div className="flex-1 flex flex-row overflow-hidden min-h-0">
      <div tabIndex={0} className="flex-1 overflow-y-auto min-h-0 outline-none focus:outline-none">
        {tab === 'common' && <CommonPropertiesContent />}
        {tab === 'align' && <AlignContent />}
        {tab === 'distribute' && <DistributeContent />}
        {tab === 'size' && <SizeContent />}
        {tab === 'transform' && <TransformContent />}
        {tab === 'spacing' && <SpacingContent />}
        {tab === 'arrange' && <ArrangeContent />}
        {tab === 'canvas' && <CanvasContent />}
        {tab === 'stagger' && <StaggerPanel />}
      </div>
      <nav className="flex-shrink-0 w-[116px] flex flex-col py-1 border-l border-hairline bg-[#0b0e15] overflow-y-auto">
        <NavItem active={tab === 'common'} onClick={() => setTab('common')} icon={<SlidersHorizontal size={13} />} label="Common" />
        <NavItem active={tab === 'align'} onClick={() => setTab('align')} icon={<Sliders size={13} />} label="Align" />
        <NavItem active={tab === 'distribute'} onClick={() => setTab('distribute')} icon={<AlignHorizontalDistributeCenter size={13} />} label="Distribute" />
        <NavItem active={tab === 'size'} onClick={() => setTab('size')} icon={<Maximize2 size={13} />} label="Size" />
        <NavItem active={tab === 'transform'} onClick={() => setTab('transform')} icon={<RefreshCw size={13} />} label="Transform" />
        <NavItem active={tab === 'spacing'} onClick={() => setTab('spacing')} icon={<Space size={13} />} label="Spacing" />
        <NavItem active={tab === 'arrange'} onClick={() => setTab('arrange')} icon={<LayoutGrid size={13} />} label="Arrange" />
        <NavItem active={tab === 'canvas'} onClick={() => setTab('canvas')} icon={<Monitor size={13} />} label="Canvas" />
        <NavItem active={tab === 'stagger'} onClick={() => setTab('stagger')} icon={<Zap size={13} />} label="Stagger" />
      </nav>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-left transition-colors ${
        active ? 'text-accent bg-accent-wash' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[2px] transition-colors ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// --- Shared helpers ---

function applyPositionResults(results: { layerId: string; newPosition: Vec2 }[], label: string, currentFrame: number) {
  if (results.length === 0) return;
  const { composition: comp } = useEditorStore.getState();
  const oldComp = comp;
  const newLayers = comp.layers.map((layer) => {
    const result = results.find((r) => r.layerId === layer.id);
    if (!result) return layer;
    const pos = layer.transform.position;
    const newPos = { ...pos, defaultValue: result.newPosition, keyframes: pos.keyframes.length > 0 ? pos.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newPosition } : kf) : [] };
    return { ...layer, transform: { ...layer.transform, position: newPos } } as Layer;
  });
  const newComp = { ...comp, layers: newLayers };
  useHistoryStore.getState().execute({ label, execute: () => useEditorStore.setState({ composition: newComp }), undo: () => useEditorStore.setState({ composition: oldComp }) });
}

function applySizeResults(results: SizeResult[], label: string, currentFrame: number) {
  if (results.length === 0) return;
  const { composition: comp } = useEditorStore.getState();
  const oldComp = comp;
  const newLayers = comp.layers.map((layer) => {
    const result = results.find((r) => r.layerId === layer.id);
    if (!result) return layer;
    return applySizeToLayer(layer, result.changes, currentFrame);
  });
  const newComp = { ...comp, layers: newLayers };
  useHistoryStore.getState().execute({ label, execute: () => useEditorStore.setState({ composition: newComp }), undo: () => useEditorStore.setState({ composition: oldComp }) });
}

function applyTransformResults(results: TransformResult[], label: string, currentFrame: number) {
  if (results.length === 0) return;
  const { composition: comp } = useEditorStore.getState();
  const oldComp = comp;
  const newLayers = comp.layers.map((layer) => {
    const result = results.find((r) => r.layerId === layer.id);
    if (!result) return layer;
    let updated = layer;
    if (result.newScale) {
      const scale = updated.transform.scale;
      updated = { ...updated, transform: { ...updated.transform, scale: { ...scale, defaultValue: result.newScale, keyframes: scale.keyframes.length > 0 ? scale.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newScale! } : kf) : [] } } } as Layer;
    }
    if (result.newRotation !== undefined) {
      const rot = updated.transform.rotation;
      updated = { ...updated, transform: { ...updated.transform, rotation: { ...rot, defaultValue: result.newRotation, keyframes: rot.keyframes.length > 0 ? rot.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newRotation! } : kf) : [] } } } as Layer;
    }
    if (result.sizeChanges) {
      updated = applySizeToLayer(updated, result.sizeChanges, currentFrame);
    }
    return updated;
  });
  const newComp = { ...comp, layers: newLayers };
  useHistoryStore.getState().execute({ label, execute: () => useEditorStore.setState({ composition: newComp }), undo: () => useEditorStore.setState({ composition: oldComp }) });
}

function applyRandomizeResults(results: RandomizeResult[], label: string, currentFrame: number) {
  if (results.length === 0) return;
  const { composition: comp } = useEditorStore.getState();
  const oldComp = comp;
  const newLayers = comp.layers.map((layer) => {
    const result = results.find((r) => r.layerId === layer.id);
    if (!result) return layer;
    let updated = layer;
    if (result.newPosition) {
      const pos = updated.transform.position;
      updated = { ...updated, transform: { ...updated.transform, position: { ...pos, defaultValue: result.newPosition, keyframes: pos.keyframes.length > 0 ? pos.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newPosition! } : kf) : [] } } } as Layer;
    }
    if (result.newScale) {
      const scale = updated.transform.scale;
      updated = { ...updated, transform: { ...updated.transform, scale: { ...scale, defaultValue: result.newScale, keyframes: scale.keyframes.length > 0 ? scale.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newScale! } : kf) : [] } } } as Layer;
    }
    if (result.newRotation !== undefined) {
      const rot = updated.transform.rotation;
      updated = { ...updated, transform: { ...updated.transform, rotation: { ...rot, defaultValue: result.newRotation, keyframes: rot.keyframes.length > 0 ? rot.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newRotation! } : kf) : [] } } } as Layer;
    }
    return updated;
  });
  const newComp = { ...comp, layers: newLayers };
  useHistoryStore.getState().execute({ label, execute: () => useEditorStore.setState({ composition: newComp }), undo: () => useEditorStore.setState({ composition: oldComp }) });
}

function applyFitCanvasResults(results: FitCanvasResult[], label: string, currentFrame: number) {
  if (results.length === 0) return;
  const { composition: comp } = useEditorStore.getState();
  const oldComp = comp;
  const newLayers = comp.layers.map((layer) => {
    const result = results.find((r) => r.layerId === layer.id);
    if (!result) return layer;
    const pos = layer.transform.position;
    const scale = layer.transform.scale;
    return {
      ...layer,
      transform: {
        ...layer.transform,
        position: { ...pos, defaultValue: result.newPosition, keyframes: pos.keyframes.length > 0 ? pos.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newPosition } : kf) : [] },
        scale: { ...scale, defaultValue: result.newScale, keyframes: scale.keyframes.length > 0 ? scale.keyframes.map((kf) => kf.frame === currentFrame ? { ...kf, value: result.newScale } : kf) : [] },
      },
    } as Layer;
  });
  const newComp = { ...comp, layers: newLayers };
  useHistoryStore.getState().execute({ label, execute: () => useEditorStore.setState({ composition: newComp }), undo: () => useEditorStore.setState({ composition: oldComp }) });
}

function applySizeToLayer(layer: Layer, changes: Partial<{ width: number; height: number; radius: number; outerRadius: number }>, currentFrame: number): Layer {
  if (layer.type === 'shape') {
    const sl = layer as any;
    const shape = sl.shape;
    if (!shape) return layer;
    let newShape = { ...shape };
    if (changes.width !== undefined && shape.width) {
      newShape = { ...newShape, width: { ...shape.width, defaultValue: changes.width, keyframes: shape.width.keyframes.length > 0 ? shape.width.keyframes.map((kf: any) => kf.frame === currentFrame ? { ...kf, value: changes.width } : kf) : [] } };
    }
    if (changes.height !== undefined && shape.height) {
      newShape = { ...newShape, height: { ...shape.height, defaultValue: changes.height, keyframes: shape.height.keyframes.length > 0 ? shape.height.keyframes.map((kf: any) => kf.frame === currentFrame ? { ...kf, value: changes.height } : kf) : [] } };
    }
    if (changes.radius !== undefined && shape.radius) {
      newShape = { ...newShape, radius: { ...shape.radius, defaultValue: changes.radius, keyframes: shape.radius.keyframes.length > 0 ? shape.radius.keyframes.map((kf: any) => kf.frame === currentFrame ? { ...kf, value: changes.radius } : kf) : [] } };
    }
    if (changes.outerRadius !== undefined && shape.outerRadius) {
      newShape = { ...newShape, outerRadius: { ...shape.outerRadius, defaultValue: changes.outerRadius, keyframes: shape.outerRadius.keyframes.length > 0 ? shape.outerRadius.keyframes.map((kf: any) => kf.frame === currentFrame ? { ...kf, value: changes.outerRadius } : kf) : [] } };
    }
    return { ...sl, shape: newShape } as Layer;
  }
  if (layer.type === 'layoutContainer') {
    const lc = layer as any;
    return { ...lc, containerShape: { ...lc.containerShape, width: changes.width ?? lc.containerShape?.width, height: changes.height ?? lc.containerShape?.height } } as Layer;
  }
  if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') {
    const ll = layer as any;
    const lp = ll.layoutParams || {};
    return { ...ll, layoutParams: { ...lp, width: changes.width !== undefined ? { type: 'fixed', value: changes.width } : lp.width, height: changes.height !== undefined ? { type: 'fixed', value: changes.height } : lp.height } } as Layer;
  }
  return layer;
}

function SelectionHeader({ count }: { count: number }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Selection</span>
        <span className="text-[9px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono">{count} objects</span>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled }: { icon: typeof Sliders; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-hairline bg-[#0a1628]/60 text-slate-400 hover:text-slate-100 hover:bg-surface-4 hover:border-[#2a3f5f] active:bg-accent-wash active:text-accent active:border-accent-dim transition duration-100 disabled:opacity-30 disabled:pointer-events-none"
    >
      <Icon size={15} strokeWidth={1.5} />
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  );
}

function NumericInput({ value, onChange, label, min, step = 1 }: { value: number; onChange: (v: number) => void; label: string; min?: number; step?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-slate-500 w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-0.5 flex-1">
        <button onClick={() => onChange(value - step)} className="w-5 h-5 flex items-center justify-center rounded border border-hairline bg-[#0a1628]/60 text-slate-500 hover:text-slate-300 hover:bg-surface-4 transition-colors">
          <Minus size={9} />
        </button>
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-5 px-1.5 text-[9px] text-center text-slate-300 bg-surface-1 border border-hairline rounded outline-none focus:border-accent-dim"
        />
        <button onClick={() => onChange(value + step)} className="w-5 h-5 flex items-center justify-center rounded border border-hairline bg-[#0a1628]/60 text-slate-500 hover:text-slate-300 hover:bg-surface-4 transition-colors">
          <Plus size={9} />
        </button>
      </div>
    </div>
  );
}

// --- Common Properties Tab ---
// One place to edit the shared appearance of a mixed selection: opacity/blend for anything visual,
// fill/border for shapes+text, font+size for text, volume for audio, and a one-click entrance for
// all. Each control applies to every selected layer that supports it, as ONE undo step. Controls
// only appear when the selection actually contains a layer they apply to.

const COMMON_BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'add'];
const COMMON_PRESETS: { id: string; label: string }[] = [
  { id: 'fade-in', label: 'Fade In' },
  { id: 'fade-slide-up', label: 'Slide Up' },
  { id: 'pop-in', label: 'Pop' },
];

const vec4ToHex = (c: Vec4): string =>
  '#' + [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16).padStart(2, '0')).join('');
const hexToVec4 = (hex: string, alpha = 1): Vec4 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
};
const numOr = (v: number | Vec2 | undefined, d: number): number => (typeof v === 'number' ? v : d);

function ColorRow({ label, value, onChange }: { label: string; value: Vec4; onChange: (v: Vec4) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-slate-500 w-16 shrink-0">{label}</span>
      <input
        type="color"
        value={vec4ToHex(value)}
        onChange={(e) => onChange(hexToVec4(e.target.value, value[3] ?? 1))}
        className="h-6 w-9 rounded border border-hairline bg-transparent cursor-pointer"
      />
      <span className="text-[9px] text-slate-500 font-mono">{vec4ToHex(value)}</span>
    </div>
  );
}

function CommonPropertiesContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const applyAnimationPresetBatch = useEditorStore((s) => s.applyAnimationPresetBatch);

  const selected = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const shapes = selected.filter((l) => l.type === 'shape');
  const texts = selected.filter((l) => l.type === 'text');
  const audios = selected.filter((l) => l.type === 'audio');
  const visual = selected.filter((l) => l.type !== 'audio');
  const hasColor = shapes.length > 0 || texts.length > 0;

  // One undoable command that mutates every selected layer that supports the change.
  const apply = (label: string, mutate: (l: Layer) => Layer) => {
    const { composition: comp, selection: sel } = useEditorStore.getState();
    const ids = new Set(sel.selectedIds);
    const newComp = { ...comp, layers: comp.layers.map((l) => (ids.has(l.id) ? mutate(l) : l)) };
    useHistoryStore.getState().execute({
      label,
      execute: () => useEditorStore.setState({ composition: newComp }),
      undo: () => useEditorStore.setState({ composition: comp }),
    });
  };

  // Representative current values (from the first applicable selected layer).
  const repFill: Vec4 = shapes[0] ? shapes[0].shape.fillColor : texts[0]?.content.spans[0]?.style.color ?? [1, 1, 1, 1];
  const repStroke: Vec4 = shapes[0] ? shapes[0].shape.strokeColor : texts[0]?.content.spans[0]?.style.strokeColor ?? [0, 0, 0, 1];
  const repStrokeW = shapes[0] ? numOr(shapes[0].shape.strokeWidth.defaultValue, 0) : texts[0] ? numOr(texts[0].animOverrides.strokeWidth.defaultValue, 0) : 0;
  const repOpacity = Math.round(numOr(visual[0]?.transform.opacity.defaultValue, 1) * 100);
  const repBlend = (selected[0]?.blendMode ?? 'normal') as BlendMode;
  const repFont = texts[0]?.content.spans[0]?.style.fontFamily ?? 'Inter';
  const repSize = texts[0] ? numOr(texts[0].animOverrides.fontSize.defaultValue, 48) : 48;
  const repVolume = audios[0] ? Math.round(numOr(audios[0].audio.volume.defaultValue, 1) * 100) : 100;

  const setFill = (v: Vec4) => apply('Set Fill', (l) => {
    if (l.type === 'shape') return { ...l, shape: { ...l.shape, fillColor: v } } as Layer;
    if (l.type === 'text') return { ...l, content: { ...l.content, spans: l.content.spans.map((s) => ({ ...s, style: { ...s.style, color: v } })) } } as Layer;
    return l;
  });
  const setStroke = (v: Vec4) => apply('Set Border', (l) => {
    if (l.type === 'shape') return { ...l, shape: { ...l.shape, strokeColor: v } } as Layer;
    if (l.type === 'text') return { ...l, content: { ...l.content, spans: l.content.spans.map((s) => ({ ...s, style: { ...s.style, strokeColor: v } })) } } as Layer;
    return l;
  });
  const setStrokeWidth = (w: number) => apply('Set Border Width', (l) => {
    if (l.type === 'shape') return { ...l, shape: { ...l.shape, strokeWidth: { ...l.shape.strokeWidth, defaultValue: w } } } as Layer;
    if (l.type === 'text') return { ...l, animOverrides: { ...l.animOverrides, strokeWidth: { ...l.animOverrides.strokeWidth, defaultValue: w } } } as Layer;
    return l;
  });
  const setOpacity = (pct: number) => apply('Set Opacity', (l) => (l.type === 'audio' ? l : ({ ...l, transform: { ...l.transform, opacity: { ...l.transform.opacity, defaultValue: pct / 100 } } } as Layer)));
  const setBlend = (mode: BlendMode) => apply('Set Blend Mode', (l) => ({ ...l, blendMode: mode } as Layer));
  const setFontFamily = (fam: string) => apply('Set Font', (l) => (l.type === 'text' ? ({ ...l, content: { ...l.content, spans: l.content.spans.map((s) => ({ ...s, style: { ...s.style, fontFamily: fam } })) } } as Layer) : l));
  const setFontSize = (px: number) => apply('Set Font Size', (l) => (l.type === 'text' ? ({ ...l, animOverrides: { ...l.animOverrides, fontSize: { ...l.animOverrides.fontSize, defaultValue: px } } } as Layer) : l));
  const setVolume = (pct: number) => apply('Set Volume', (l) => (l.type === 'audio' ? ({ ...l, audio: { ...l.audio, volume: { ...l.audio.volume, defaultValue: pct / 100 } } } as Layer) : l));

  const selectCls = 'flex-1 h-5 px-1 text-[9px] text-slate-300 bg-surface-1 border border-hairline rounded outline-none focus:border-accent-dim';

  return (
    <div className="p-3 space-y-4">
      <SelectionHeader count={selected.length} />

      {visual.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Appearance</h3>
          <NumericInput label="Opacity %" value={repOpacity} min={0} step={5} onChange={(v) => setOpacity(Math.max(0, Math.min(100, v)))} />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500 w-16 shrink-0">Blend</span>
            <select value={repBlend} onChange={(e) => setBlend(e.target.value as BlendMode)} className={selectCls}>
              {COMMON_BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </section>
      )}

      {hasColor && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Color &amp; Border</h3>
          <ColorRow label="Fill" value={repFill} onChange={setFill} />
          <ColorRow label="Border" value={repStroke} onChange={setStroke} />
          <NumericInput label="Border W" value={Math.round(repStrokeW)} min={0} step={1} onChange={(v) => setStrokeWidth(Math.max(0, v))} />
        </section>
      )}

      {texts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Text</h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500 w-16 shrink-0">Font</span>
            <select value={repFont} onChange={(e) => setFontFamily(e.target.value)} className={selectCls}>
              {FONT_MANIFEST.map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
            </select>
          </div>
          <NumericInput label="Size" value={Math.round(repSize)} min={1} step={2} onChange={(v) => setFontSize(Math.max(1, v))} />
        </section>
      )}

      {audios.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Audio</h3>
          <NumericInput label="Volume %" value={repVolume} min={0} step={5} onChange={(v) => setVolume(Math.max(0, v))} />
        </section>
      )}

      {visual.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Animation</h3>
          <div className="grid grid-cols-3 gap-1">
            {COMMON_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyAnimationPresetBatch(selection.selectedIds, p.id, 0.6, false)}
                className="px-2 py-1.5 rounded border border-hairline bg-[#0a1628]/60 text-[10px] text-slate-300 hover:text-accent hover:border-accent-dim transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-slate-600">Applies the entrance to every selected layer.</p>
        </section>
      )}
    </div>
  );
}

// --- Align Tab ---

function AlignContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 2;

  const executeAlign = useCallback((axis: AlignAxis) => {
    if (selectedLayers.length < 2) return;
    const results = computeAlignment(axis, selectedLayers, currentFrame);
    applyPositionResults(results, `Align ${axis}`, currentFrame);
  }, [selectedLayers, currentFrame]);

  const alignActions: { axis: AlignAxis; icon: typeof AlignStartVertical; label: string }[] = [
    { axis: 'left', icon: AlignStartVertical, label: 'Align Left' },
    { axis: 'centerH', icon: AlignCenterVertical, label: 'Align Center H' },
    { axis: 'right', icon: AlignEndVertical, label: 'Align Right' },
    { axis: 'top', icon: AlignStartHorizontal, label: 'Align Top' },
    { axis: 'centerV', icon: AlignCenterHorizontal, label: 'Align Center V' },
    { axis: 'bottom', icon: AlignEndHorizontal, label: 'Align Bottom' },
  ];

  // 2.5D prep: how many of the selected layers can still be turned 3D (skips camera/group/audio and
  // already-3D layers). Placing a camera in a big scene otherwise means toggling each layer by hand.
  const convertible = selectedLayers.filter((l) => l.type !== 'camera' && l.type !== 'group' && l.type !== 'audio' && !l.is3D);
  const noneToConvert = convertible.length === 0;

  // An all-audio selection can't be 3D, so that slot becomes "Add Subtitles" (transcribe → review).
  const audioSelected = selectedLayers.filter((l) => l.type === 'audio');
  const allAudio = selectedLayers.length > 0 && audioSelected.length === selectedLayers.length;

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Align</h3>
        <div className={`grid grid-cols-3 gap-1 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          {alignActions.map(({ axis, icon: Icon, label }) => (
            <button key={axis} onClick={() => executeAlign(axis)} disabled={isDisabled} title={label}
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-md border border-hairline bg-[#0a1628]/60 text-slate-400 hover:text-slate-100 hover:bg-surface-4 hover:border-[#2a3f5f] active:bg-accent-wash active:text-accent active:border-accent-dim transition duration-100">
              <Icon size={16} strokeWidth={1.5} />
              <span className="text-[8px] font-medium whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {allAudio ? (
        /* All-audio selection: transcribe on-device, then review the text before placing. */
        <section className="mt-4">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Subtitles</h3>
          <button
            onClick={() => autoCaptionAudioLayers(audioSelected.map((l) => l.id))}
            title="Transcribe the selected audio on-device (Whisper Small), review the text, then place captions"
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-accent-dim bg-accent-wash text-accent font-semibold hover:bg-accent-wash hover:border-accent-dim active:bg-accent-wash transition duration-100"
          >
            <Captions size={16} strokeWidth={2} />
            <span className="text-[11px]">Add Subtitles ({audioSelected.length})</span>
          </button>
          <p className="mt-1.5 text-[9px] text-slate-600">Transcribes each selected clip, then lets you edit the text before it lands on a Subtitles track.</p>
        </section>
      ) : (
        /* Prep a whole selection for a camera in one click (2.5D). */
        <section className="mt-4">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">3D</h3>
          <button
            onClick={() => useEditorStore.getState().convertSelectionTo3D()}
            disabled={noneToConvert}
            title={noneToConvert ? 'Every selected layer is already 3D (or can’t be 3D)' : 'Enable 3D on all selected layers so a camera can move through them'}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-accent-dim bg-accent-wash text-accent font-semibold hover:bg-accent-wash hover:border-accent-dim active:bg-accent-wash transition duration-100 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Box size={16} strokeWidth={2} />
            <span className="text-[11px]">Convert all to 3D{noneToConvert ? '' : ` (${convertible.length})`}</span>
          </button>
          <p className="mt-1.5 text-[9px] text-slate-600">Makes every selected layer 3D so a camera can move through the scene.</p>
        </section>
      )}
    </div>
  );
}

// --- Distribute Tab ---

function DistributeContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 3;

  const executeDistribute = useCallback((mode: DistributeMode) => {
    if (selectedLayers.length < 3) return;
    const results = computeDistribution(mode, selectedLayers, currentFrame);
    applyPositionResults(results, `Distribute ${mode}`, currentFrame);
  }, [selectedLayers, currentFrame]);

  const boundsActions: { mode: DistributeMode; icon: typeof AlignHorizontalDistributeCenter; label: string }[] = [
    { mode: 'horizontalBounds', icon: AlignHorizontalDistributeCenter, label: 'Horizontal' },
    { mode: 'verticalBounds', icon: AlignVerticalDistributeCenter, label: 'Vertical' },
  ];
  const centerActions: { mode: DistributeMode; icon: typeof MoveHorizontal; label: string }[] = [
    { mode: 'horizontalCenters', icon: MoveHorizontal, label: 'Horizontal' },
    { mode: 'verticalCenters', icon: MoveVertical, label: 'Vertical' },
  ];

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />
      {selectedLayers.length < 3 && selectedLayers.length >= 2 && (
        <div className="mb-4 px-2 py-2 bg-accent-wash border border-accent-dim rounded-md">
          <p className="text-[9px] text-accent">Distribution requires at least 3 selected objects.</p>
        </div>
      )}
      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Distribute Spacing</h3>
        <p className="text-[9px] text-slate-600 mb-2">Equal gaps between object edges</p>
        <div className={`grid grid-cols-2 gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          {boundsActions.map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => executeDistribute(mode)} disabled={isDisabled} title={`Distribute ${label} (Spacing)`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-hairline bg-[#0a1628]/60 text-slate-400 hover:text-slate-100 hover:bg-surface-4 hover:border-[#2a3f5f] active:bg-accent-wash active:text-accent active:border-accent-dim transition duration-100">
              <Icon size={15} strokeWidth={1.5} /><span className="text-[9px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Distribute Centers</h3>
        <p className="text-[9px] text-slate-600 mb-2">Equal distance between object centers</p>
        <div className={`grid grid-cols-2 gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          {centerActions.map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => executeDistribute(mode)} disabled={isDisabled} title={`Distribute ${label} (Centers)`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-hairline bg-[#0a1628]/60 text-slate-400 hover:text-slate-100 hover:bg-surface-4 hover:border-[#2a3f5f] active:bg-accent-wash active:text-accent active:border-accent-dim transition duration-100">
              <Icon size={15} strokeWidth={1.5} /><span className="text-[9px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// --- Size Tab ---

function SizeContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 2;

  const executeSize = useCallback((mode: SizeMode) => {
    if (selectedLayers.length < 2) return;
    const results = computeEqualSize(mode, selectedLayers, currentFrame);
    applySizeResults(results, `Size: ${mode}`, currentFrame);
  }, [selectedLayers, currentFrame]);

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Size</h3>
        <p className="text-[9px] text-slate-600 mb-3">Match dimensions to the largest object</p>
        <div className={`flex flex-col gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={RectangleHorizontal} label="Equal Width" onClick={() => executeSize('equalWidth')} disabled={isDisabled} />
          <ActionButton icon={RectangleVertical} label="Equal Height" onClick={() => executeSize('equalHeight')} disabled={isDisabled} />
          <ActionButton icon={Maximize2} label="Equal Size" onClick={() => executeSize('equalSize')} disabled={isDisabled} />
        </div>
      </section>
    </div>
  );
}

// --- Transform Tab ---

function TransformContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 2;

  const executeTransform = useCallback((mode: TransformMode) => {
    if (selectedLayers.length < 2) return;
    const results = computeTransformOp(mode, selectedLayers, currentFrame);
    applyTransformResults(results, `Transform: ${mode}`, currentFrame);
  }, [selectedLayers, currentFrame]);

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />
      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Equalize</h3>
        <p className="text-[9px] text-slate-600 mb-3">Set all objects to the largest value</p>
        <div className={`flex flex-col gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={Scaling} label="Equal Scale" onClick={() => executeTransform('equalScale')} disabled={isDisabled} />
          <ActionButton icon={RotateCw} label="Equal Rotation" onClick={() => executeTransform('equalRotation')} disabled={isDisabled} />
        </div>
      </section>
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Normalize</h3>
        <p className="text-[9px] text-slate-600 mb-3">Bake transforms into object dimensions</p>
        <div className={`flex flex-col gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={Equal} label="Normalize Scale" onClick={() => executeTransform('normalizeScale')} disabled={isDisabled} />
          <ActionButton icon={RotateCw} label="Normalize Rotation" onClick={() => executeTransform('normalizeRotation')} disabled={isDisabled} />
          <ActionButton icon={Eraser} label="Normalize Transform" onClick={() => executeTransform('normalizeTransform')} disabled={isDisabled} />
        </div>
      </section>
    </div>
  );
}

// --- Spacing Tab ---

function SpacingContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 2;
  const [hSpacing, setHSpacing] = useState(20);
  const [vSpacing, setVSpacing] = useState(20);

  const executeSpacing = useCallback((axis: 'horizontal' | 'vertical', value: number) => {
    if (selectedLayers.length < 2) return;
    const results = computeSpacing(axis, value, selectedLayers, currentFrame);
    applyPositionResults(results, `Spacing ${axis} ${value}px`, currentFrame);
  }, [selectedLayers, currentFrame]);

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />
      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Horizontal Spacing</h3>
        <p className="text-[9px] text-slate-600 mb-3">Set exact gap between objects horizontally</p>
        <div className={`flex flex-col gap-2 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <NumericInput value={hSpacing} onChange={setHSpacing} label="Gap (px)" min={-500} />
          <ActionButton icon={ArrowLeftRight} label="Apply Horizontal" onClick={() => executeSpacing('horizontal', hSpacing)} disabled={isDisabled} />
        </div>
      </section>
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Vertical Spacing</h3>
        <p className="text-[9px] text-slate-600 mb-3">Set exact gap between objects vertically</p>
        <div className={`flex flex-col gap-2 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <NumericInput value={vSpacing} onChange={setVSpacing} label="Gap (px)" min={-500} />
          <ActionButton icon={ArrowUpDown} label="Apply Vertical" onClick={() => executeSpacing('vertical', vSpacing)} disabled={isDisabled} />
        </div>
      </section>
    </div>
  );
}

// --- Arrange Tab ---

function ArrangeContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 2;
  const [stackSpacing, setStackSpacing] = useState(10);
  const [randomOpts, setRandomOpts] = useState<RandomizeOptions>({ positionRange: 50, rotationRange: 15, scaleRange: 0.3, seed: 42 });
  const [randomPending, setRandomPending] = useState(false);
  const preRandomComp = useRef<typeof composition | null>(null);

  const executeStack = useCallback((dir: 'h' | 'v') => {
    if (selectedLayers.length < 2) return;
    const results = dir === 'h'
      ? computeStackHorizontal(stackSpacing, selectedLayers, currentFrame)
      : computeStackVertical(stackSpacing, selectedLayers, currentFrame);
    applyPositionResults(results, `Stack ${dir === 'h' ? 'Horizontal' : 'Vertical'}`, currentFrame);
  }, [selectedLayers, currentFrame, stackSpacing]);

  const executeCircular = useCallback(() => {
    if (selectedLayers.length < 2) return;
    const results = computeCircularArrange(selectedLayers, currentFrame);
    applyPositionResults(results, 'Circular Arrange', currentFrame);
  }, [selectedLayers, currentFrame]);

  const executeRandomize = useCallback(() => {
    if (selectedLayers.length < 2) return;
    preRandomComp.current = useEditorStore.getState().composition;
    const results = computeRandomize(randomOpts, selectedLayers, currentFrame);
    applyRandomizeResults(results, 'Randomize', currentFrame);
    setRandomPending(true);
  }, [selectedLayers, currentFrame, randomOpts]);

  const confirmRandomize = useCallback(() => {
    preRandomComp.current = null;
    setRandomPending(false);
  }, []);

  const undoRandomize = useCallback(() => {
    if (preRandomComp.current) {
      useEditorStore.setState({ composition: preRandomComp.current });
      useHistoryStore.getState().undo();
      preRandomComp.current = null;
    }
    setRandomPending(false);
  }, []);

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />

      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Tidy Up</h3>
        <p className="text-[9px] text-slate-600 mb-3">Snap into a clean row / column / grid with equal spacing (Ctrl+Alt+T)</p>
        <div className={`${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={LayoutGrid} label="Tidy Up" onClick={() => useEditorStore.getState().tidyUpSelection()} disabled={isDisabled} />
        </div>
      </section>

      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Stack</h3>
        <p className="text-[9px] text-slate-600 mb-3">Arrange objects in a row or column</p>
        <div className={`flex flex-col gap-2 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <NumericInput value={stackSpacing} onChange={setStackSpacing} label="Gap (px)" min={-200} />
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton icon={Columns3} label="Horizontal" onClick={() => executeStack('h')} disabled={isDisabled} />
            <ActionButton icon={Rows3} label="Vertical" onClick={() => executeStack('v')} disabled={isDisabled} />
          </div>
        </div>
      </section>

      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Circular</h3>
        <p className="text-[9px] text-slate-600 mb-3">Distribute evenly around a circle</p>
        <div className={`${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={Circle} label="Circular Arrange" onClick={executeCircular} disabled={isDisabled} />
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Randomize</h3>
        <p className="text-[9px] text-slate-600 mb-3">Offset objects with controlled randomness</p>
        <div className={`flex flex-col gap-2 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <NumericInput value={randomOpts.positionRange} onChange={(v) => setRandomOpts((o) => ({ ...o, positionRange: v }))} label="Position" min={0} step={5} />
          <NumericInput value={randomOpts.rotationRange} onChange={(v) => setRandomOpts((o) => ({ ...o, rotationRange: v }))} label="Rotation" min={0} step={5} />
          <NumericInput value={randomOpts.scaleRange} onChange={(v) => setRandomOpts((o) => ({ ...o, scaleRange: v }))} label="Scale" min={0} step={0.05} />
          <NumericInput value={randomOpts.seed} onChange={(v) => setRandomOpts((o) => ({ ...o, seed: v }))} label="Seed" min={0} step={1} />

          {!randomPending ? (
            <ActionButton icon={Shuffle} label="Randomize" onClick={executeRandomize} disabled={isDisabled} />
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={confirmRandomize}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-emerald-700/50 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/40 hover:border-emerald-600/60 active:bg-emerald-700/40 transition duration-100"
              >
                <Check size={13} strokeWidth={2} />
                <span className="text-[9px] font-semibold">Confirm</span>
              </button>
              <button
                onClick={undoRandomize}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-red-800/50 bg-red-900/20 text-red-400 hover:bg-red-800/30 hover:border-red-700/50 active:bg-red-700/30 transition duration-100"
              >
                <Undo2 size={13} strokeWidth={2} />
                <span className="text-[9px] font-semibold">Undo</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// --- Canvas Tab ---

function CanvasContent() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const selectedLayers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const isDisabled = selectedLayers.length < 1;
  const canvasW = (composition as any).settings?.width || 1920;
  const canvasH = (composition as any).settings?.height || 1080;

  const executeCenterToCanvas = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeCenterToCanvas(selectedLayers, currentFrame, canvasW, canvasH);
    applyPositionResults(results, 'Center to Canvas', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executeFitToCanvas = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeFitToCanvas(selectedLayers, currentFrame, canvasW, canvasH);
    applyFitCanvasResults(results, 'Fit to Canvas', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executePixelSnap = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computePixelSnap(selectedLayers, currentFrame);
    applyPositionResults(results, 'Pixel Snap', currentFrame);
  }, [selectedLayers, currentFrame]);

  const executeAlignSafeArea = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeAlignToSafeArea(selectedLayers, currentFrame, canvasW, canvasH);
    applyPositionResults(results, 'Align to Safe Area', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executeAlignArtboard = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeAlignToArtboard(selectedLayers, currentFrame, canvasW, canvasH);
    applyPositionResults(results, 'Align to Artboard', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executeFitWidth = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeFitWidth(selectedLayers, currentFrame, canvasW, canvasH);
    applyFitCanvasResults(results, 'Fit Width', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executeFitHeight = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeFitHeight(selectedLayers, currentFrame, canvasW, canvasH);
    applyFitCanvasResults(results, 'Fit Height', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  const executeMatchAspect = useCallback(() => {
    if (selectedLayers.length < 1) return;
    const results = computeMatchCanvasAspect(selectedLayers, currentFrame, canvasW, canvasH);
    applyFitCanvasResults(results, 'Match Canvas Aspect', currentFrame);
  }, [selectedLayers, currentFrame, canvasW, canvasH]);

  return (
    <div className="p-3">
      <SelectionHeader count={selectedLayers.length} />

      <section className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Position</h3>
        <p className="text-[9px] text-slate-600 mb-3">Move selection relative to canvas</p>
        <div className={`flex flex-col gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={Crosshair} label="Center Selection" onClick={executeCenterToCanvas} disabled={isDisabled} />
          <ActionButton icon={Shield} label="Align to Safe Area" onClick={executeAlignSafeArea} disabled={isDisabled} />
          <ActionButton icon={Frame} label="Align to Artboard" onClick={executeAlignArtboard} disabled={isDisabled} />
          <ActionButton icon={Grid3x3} label="Pixel Snap" onClick={executePixelSnap} disabled={isDisabled} />
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Fit</h3>
        <p className="text-[9px] text-slate-600 mb-3">Scale selection to match canvas</p>
        <div className={`flex flex-col gap-1.5 ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
          <ActionButton icon={Fullscreen} label="Fit to Canvas" onClick={executeFitToCanvas} disabled={isDisabled} />
          <ActionButton icon={ArrowLeftRight} label="Fit Width" onClick={executeFitWidth} disabled={isDisabled} />
          <ActionButton icon={ArrowUpDown} label="Fit Height" onClick={executeFitHeight} disabled={isDisabled} />
          <ActionButton icon={Maximize2} label="Match Canvas Aspect" onClick={executeMatchAspect} disabled={isDisabled} />
        </div>
      </section>
    </div>
  );
}
