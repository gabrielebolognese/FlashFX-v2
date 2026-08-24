import { useState, useCallback, useEffect, useRef } from 'react';
import { useInspectorStore, type InspectorTab } from '../../store/inspector';
import { DEFAULT_SHADOW, DEFAULT_GLOW, DEFAULT_BLUR } from '../../core/effectDefaults';
import { TEXT_ANIMATOR_PRESETS } from '../../core/textAnimatorPresets';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useMotionPathStore } from '../../store/motionPath';
import { useMaskStore } from '../../store/mask';
import { usePathEditStore } from '../../store/pathEdit';
import { BrandColorPicker } from '../components/BrandColorPicker';
import type { ShapeLayer, TextLayer, VideoLayer, ImageLayer, AudioLayer, ParticleLayer, GenerativePatternLayer, CameraLayer, AnimationItemLayer, LottieIconLayer, AnimatableProperty, Vec2, Vec4, RectangleShape, CircleShape, StarShape, PolygonShape, MotionPathAnchor, MotionPathLoop, Mask, MaskType, Layer, LayerShadow, LayerGlow, LayerBlur, BlurType, GlowMode, LayoutObjectLayer, LayoutContainerLayer, TextSpanStyle, TextLayoutConfig, TextGradientFill } from '../../core/types';

// Safe fallbacks so the Text inspector renders even for a text layer with missing/empty content or
// layoutConfig (defensive — factory layers set these, but selection must never crash).
const FALLBACK_SPAN_STYLE: TextSpanStyle = {
  fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontStyle: 'normal', fontSize: 48,
  color: [1, 1, 1, 1], letterSpacing: 0, lineHeight: 1.2, strokeColor: [0, 0, 0, 1], strokeWidth: 0,
  underline: false, strikethrough: false, textTransform: 'none',
};
const FALLBACK_TEXT_LAYOUT: TextLayoutConfig = {
  boundingBox: { type: 'auto' }, horizontalAlign: 'left', verticalAlign: 'top',
  overflow: 'visible', baselineShift: 0, perGlyphAnimation: false,
};
import { evaluateProperty } from '../../core/interpolation';
import { FONT_MANIFEST, defaultTrackingPx } from '../../engine/fonts';
import { useCustomFontStore } from '../../engine/customFonts';
import { autoCaptionAudioLayers, useAutoCaptionStore } from '../../store/autoCaption';
import { createProperty, createTextAnimOverrides } from '../../core/factory';
import { getMotionBlur } from '../../core/layerSwitches';
import { DEFAULT_CONSTRAINTS, type ReframeAxisMode } from '../../core/reframe';
import { Diamond, Route, Trash2, Wand2, Sliders, Sparkles, Square, Circle, Star, Hexagon, Zap, Scissors, Moon, Layers, Type, Frame, Copy, ChevronUp, ChevronDown, Eye, EyeOff, Plus, Repeat, Link2, Atom, Grid3x3, Aperture, Code2, SlidersHorizontal, Palette, Loader2, Boxes, Box, RotateCcw, Lock, Unlock, Upload, Captions } from 'lucide-react';
import { DragInput } from '../components/DragInput';
import { useAgentBuildStore } from '../agent-build/agentBuildStore';
import { useSilenceStore } from '../../store/silenceStripper';
import { BackgroundPanel } from './BackgroundPanel';
import { ParticlePanel } from './ParticlePanel';
import { ProceduralPanel } from './ProceduralPanel';
import { AnimationItemPanel } from './AnimationItemPanel';
import { AnchoringPanel } from './AnchoringPanel';
import { PhysicsPanel } from './PhysicsPanel';
import { StaggerPanel } from './StaggerPanel';
import { FieldSamplingPanel } from './FieldSamplingPanel';
import { GenerativePatternPanel } from './GenerativePatternPanel';
import { Camera3DView } from './Camera3DView';
import { ClonerInspector } from './ClonerInspector';
import { AnimatePanel } from './AnimatePanel';
import { ShapeMaterialPanel } from './ShapeMaterialPanel';
import { ShapePatternFillPanel } from './ShapePatternFillPanel';
import { LayoutParamsPanel, ChildLayoutOverridePanel } from './LayoutPanel';
import { LayoutContainerPanel } from './LayoutContainerPanel';
import { MultiSelectInspector } from './MultiSelectInspector';
import { CodeTab } from './expressions/CodeTab';
import { ImageFiltersPanel } from './filters';
import { ColorCorrectionPanel } from './color-correction';
import { smoothEntirePath } from '../../core/motionPath';
import { mediaAssetManager } from '../../engine/media/assetManager';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import type { SplitMode } from '../../core/textExplode';

// Font menu, grouped by category, sourced from the single font manifest (engine/fonts.ts) so
// the dropdown, the loader and the outline op can't drift apart.
const FONT_GROUPS: { category: string; families: string[] }[] = (['Sans', 'Display', 'Serif', 'Mono', 'System'] as const)
  .map((cat) => ({ category: cat, families: FONT_MANIFEST.filter((f) => f.category === cat).map((f) => f.family) }))
  .filter((g) => g.families.length > 0);

/** Font family row: the grouped bundled+custom menu, an "import font" button, and (when a custom
 *  font is selected) a remove button. Imported fonts are shared across all projects. */
function FontFamilyRow({ value, onPick }: { value: string; onPick: (family: string) => void }) {
  const customFonts = useCustomFontStore((s) => s.fonts);
  const importFont = useCustomFontStore((s) => s.importFont);
  const removeFont = useCustomFontStore((s) => s.removeFont);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customFamilies = Array.from(new Set(customFonts.map((f) => f.family)));
  const selectedCustom = customFonts.find((f) => f.family === value);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    setErr(null);
    setBusy(true);
    let lastFamily: string | null = null;
    for (const file of files) {
      try { lastFamily = await importFont(file); }
      catch (ex) { setErr(ex instanceof Error ? ex.message : 'Font import failed'); }
    }
    setBusy(false);
    if (lastFamily) onPick(lastFamily); // select the newly imported face
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <label className="text-caption text-slate-500 w-14 flex-shrink-0">Family</label>
        <select
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="flex-1 min-w-0 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
        >
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.families.map((f) => (<option key={f} value={f}>{f}</option>))}
            </optgroup>
          ))}
          {customFamilies.length > 0 && (
            <optgroup label="Custom">
              {customFamilies.map((f) => (<option key={f} value={f}>{f}</option>))}
            </optgroup>
          )}
        </select>
        <button
          title="Import a font (TTF / OTF / WOFF / WOFF2). Shared across all projects."
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-white/5 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        </button>
        {selectedCustom && (
          <button
            title={`Remove "${selectedCustom.family}" from your custom fonts`}
            onClick={() => removeFont(selectedCustom.id)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-white/5"
          >
            <Trash2 size={12} />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,application/x-font-ttf"
          multiple
          className="hidden"
          onChange={onFiles}
        />
      </div>
      {err && <p className="text-[9px] text-rose-400 pl-14 leading-snug">{err}</p>}
    </div>
  );
}

/** Compact gradient-fill editor for text: kind + start/end stops + angle. Solid clears the fill. */
function TextGradientControl({ fill, onChange }: { fill?: TextGradientFill; onChange: (next: TextGradientFill | undefined) => void }) {
  const kind = fill?.kind ?? 'none';
  const stops = fill?.stops ?? [];
  const start = stops[0] ?? { color: [1, 1, 1] as [number, number, number], position: 0, opacity: 1 };
  const end = stops[stops.length - 1] ?? { color: [0.4, 0.5, 1] as [number, number, number], position: 1, opacity: 1 };

  const setKind = (k: string) => {
    if (k === 'none') { onChange(undefined); return; }
    const nk = k as TextGradientFill['kind'];
    if (fill) { onChange({ ...fill, kind: nk }); return; }
    onChange({
      kind: nk, angle: 90,
      stops: [
        { color: [1, 1, 1], position: 0, opacity: 1 },
        { color: [0.4, 0.5, 1], position: 1, opacity: 1 },
      ],
    });
  };
  const setStop = (which: 'start' | 'end', v: Vec4) => {
    if (!fill) return;
    const s = fill.stops.length >= 2
      ? fill.stops.slice()
      : [{ color: start.color, position: 0, opacity: start.opacity }, { color: end.color, position: 1, opacity: end.opacity }];
    const idx = which === 'start' ? 0 : s.length - 1;
    s[idx] = { ...s[idx], color: [v[0], v[1], v[2]], opacity: v[3] };
    onChange({ ...fill, stops: s });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <label className="text-caption text-slate-500 w-14 flex-shrink-0">Gradient</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="flex-1 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
        >
          <option value="none">Solid</option>
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
          <option value="conic">Conic</option>
        </select>
      </div>
      {fill && (
        <>
          <ColorInput label="Start" value={[start.color[0], start.color[1], start.color[2], start.opacity] as Vec4} onChange={(v) => setStop('start', v)} />
          <ColorInput label="End" value={[end.color[0], end.color[1], end.color[2], end.opacity] as Vec4} onChange={(v) => setStop('end', v)} />
          {kind !== 'radial' && (
            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Angle</label>
              <input
                type="range" min={0} max={360} value={fill.angle}
                onChange={(e) => onChange({ ...fill, angle: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-caption text-slate-400 w-8 text-right">{Math.round(fill.angle)}°</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Inspector() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const layer = composition.layers.find((l) => l.id === selection.activeId);
  const [tab, setTab] = useState<InspectorTab>('properties');

  // Honor an externally requested tab (e.g. from the top-bar Effects menu),
  // then clear it. Placed before the early returns to satisfy rules-of-hooks.
  const requestedTab = useInspectorStore((s) => s.requestedTab);
  const clearRequestedTab = useInspectorStore((s) => s.clearRequestedTab);
  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab);
      clearRequestedTab();
    }
  }, [requestedTab, clearRequestedTab]);

  if (selection.selectedIds.length >= 2) {
    return <MultiSelectInspector />;
  }

  if (!layer) {
    return <BackgroundPanel />;
  }

  const isText = layer.type === 'text';
  const isShape = layer.type === 'shape';
  const isVideo = layer.type === 'video';
  const isImage = layer.type === 'image';

  // Advanced = Material + Pattern, which only ShapeLayer carries. TextLayer has no
  // material/pattern in the data model or renderer, so text used to get an Advanced
  // tab containing two permanently-empty sections.
  const hasAdvanced = isShape;
  const hasEffects = isText || isShape || isVideo || isImage;

  const tabs: { id: InspectorTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'properties', label: 'Properties', icon: <Sliders size={13} />, show: true },
    { id: 'advanced', label: 'Advanced', icon: <Layers size={13} />, show: hasAdvanced },
    { id: 'filters', label: 'Filters', icon: <SlidersHorizontal size={13} />, show: isImage },
    { id: 'colorCorrection', label: 'Color', icon: <Palette size={13} />, show: isImage },
    { id: 'motionPath', label: 'Motion Path', icon: <Route size={13} />, show: true },
    { id: 'effects', label: 'Effects', icon: <Wand2 size={13} />, show: hasEffects },
    { id: 'motionControl', label: 'Motion Control', icon: <Type size={13} />, show: isText },
    { id: 'masks', label: 'Masks', icon: <Frame size={13} />, show: hasEffects },
    { id: 'loop', label: 'Loop', icon: <Repeat size={13} />, show: layer.type !== 'audio' && layer.type !== 'particle' },
    { id: 'anchor', label: 'Anchor', icon: <Link2 size={13} />, show: layer.type !== 'audio' && layer.type !== 'group' },
    { id: 'physics', label: 'Physics', icon: <Atom size={13} />, show: layer.type !== 'audio' && layer.type !== 'group' },
    { id: 'stagger', label: 'Stagger', icon: <Zap size={13} />, show: false },
    { id: 'fieldSampling', label: 'Field', icon: <Grid3x3 size={13} />, show: layer.type === 'fieldSampled' },
    { id: 'cloner', label: 'Cloner', icon: <Boxes size={13} />, show: layer.type === 'cloner' },
    { id: 'code', label: 'Code', icon: <Code2 size={13} />, show: layer.type !== 'audio' && layer.type !== 'group' },
    { id: 'animate', label: 'Animate', icon: <Sparkles size={13} />, show: true },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  // The remembered tab may not exist for the current layer type; fall back so
  // the content area never renders an unavailable tab.
  const activeTab: InspectorTab = visibleTabs.some((t) => t.id === tab) ? tab : 'properties';

  return (
    <div className="flex-1 flex flex-row overflow-hidden min-h-0">
      <div tabIndex={0} className="flex-1 overflow-y-auto min-h-0 outline-none focus:outline-none">
        <InspectorTabContent tab={activeTab} layer={layer} />
      </div>
      {/* A camera has no standard tabs — hide the sidebar so the 3D View gets the full width. */}
      {layer.type !== 'camera' && (
        <nav className="flex-shrink-0 w-[116px] flex flex-col py-1 border-l border-hairline bg-[#0b0e15] overflow-y-auto">
          {visibleTabs.map((t) => (
            <NavItem
              key={t.id}
              active={activeTab === t.id}
              onClick={() => setTab(t.id)}
              icon={t.icon}
              label={t.label}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex items-center gap-2 px-3 py-2 text-caption font-medium text-left transition-colors ${
        active
          ? 'text-accent bg-accent-wash'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
      }`}
    >
      <span
        className={`absolute left-0 top-0 bottom-0 w-[2px] transition-colors ${
          active ? 'bg-accent' : 'bg-transparent'
        }`}
      />
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function InspectorTabContent({ tab, layer }: { tab: InspectorTab; layer: Layer }) {
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const toggleLayer3D = useEditorStore((s) => s.toggleLayer3D);
  const compW = useEditorStore((s) => s.composition.settings.width);
  const compH = useEditorStore((s) => s.composition.settings.height);

  const hasKeyframeAt = (prop: AnimatableProperty) =>
    prop.keyframes.some((k) => k.frame === currentFrame);

  const isText = layer.type === 'text';
  const isShape = layer.type === 'shape';
  const isVideo = layer.type === 'video';
  const isImage = layer.type === 'image';
  const isAudio = layer.type === 'audio';
  const isParticle = layer.type === 'particle';
  const isPattern = layer.type === 'generativePattern';
  const isAnimationItem = layer.type === 'animationItem';

  if (tab === 'animate') {
    return <AnimatePanel layerId={layer.id} />;
  }

  if (tab === 'code') {
    return <CodeTab layer={layer} />;
  }

  if (tab === 'motionPath') {
    return <MotionPathSection layerId={layer.id} />;
  }

  if (tab === 'effects') {
    return <EffectsSection layer={layer} />;
  }

  if (tab === 'filters' && isImage) {
    return <ImageFiltersPanel layer={layer as ImageLayer} />;
  }

  if (tab === 'colorCorrection' && isImage) {
    return <ColorCorrectionPanel layer={layer as ImageLayer} />;
  }

  if (tab === 'masks') {
    return <MaskSection layerId={layer.id} currentFrame={currentFrame} />;
  }

  if (tab === 'loop') {
    return <ProceduralPanel layerId={layer.id} />;
  }

  if (tab === 'anchor') {
    return <AnchoringPanel />;
  }

  if (tab === 'physics') {
    return <PhysicsPanel />;
  }

  if (tab === 'stagger') {
    return <StaggerPanel />;
  }

  if (tab === 'cloner') {
    return <ClonerInspector />;
  }
  if (tab === 'fieldSampling') {
    return <FieldSamplingPanel />;
  }

  if (tab === 'motionControl' && isText) {
    return <TextMotionControlSection layer={layer as TextLayer} />;
  }

  if (tab === 'advanced') {
    if (isShape) {
      return (
        <>
          <Section title="Material">
            <ShapeMaterialPanel layer={layer as ShapeLayer} />
          </Section>
          <Section title="Pattern">
            <ShapePatternFillPanel layer={layer as ShapeLayer} />
          </Section>
        </>
      );
    }
    return null;
  }

  // Camera: a custom object — no standard transform/effect properties. The inspector shows a live
  // 3D View (alongside the normal canvas) for placing it; double-click the camera opens Settings.
  if (layer.type === 'camera') {
    return (
      <>
        <div className="p-2 border-b border-hairline">
          <StringInput label="Name" value={layer.name} onChange={(v) => updateLayerProperty(layer.id, 'name', v)} />
        </div>
        <Camera3DView layer={layer as CameraLayer} />
      </>
    );
  }

  // Default: Properties (basic).
  return (
    <>
      {/* Audio layers have no spatial transform or constraints — skip both sections. */}
      {!isAudio && (
      <Section title="Transform">
        {/* 2.5D — 3D layer switch. Off for groups (cameras render their own panel above). */}
        {layer.type !== 'group' && (
          <button
            onClick={() => toggleLayer3D(layer.id)}
            title="Toggle 3D layer (adds Z position + X/Y/Z rotation)"
            className={`flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded text-caption border transition-colors ${
              layer.is3D
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-surface-3 border-hairline text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box size={12} />
            3D Layer{layer.is3D ? ' · on' : ''}
          </button>
        )}
        <Vec2DragInput
          label="Position"
          prop={layer.transform.position}
          frame={currentFrame}
          onChangeValue={(v) => updateLayerProperty(layer.id, 'transform.position.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'transform.position', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(layer.transform.position)}
          labels={['X', 'Y']}
          defaultValue={[compW / 2, compH / 2]}
          propPath="transform.position"
        />
        {/* 2.5D depth: Z position (present once the layer is 3D). */}
        {layer.is3D && layer.transform.positionZ && (
          <NumberDragInput
            label="Z Position"
            prop={layer.transform.positionZ}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'transform.positionZ.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'transform.positionZ', currentFrame, v)}
            hasKeyframe={hasKeyframeAt(layer.transform.positionZ)}
            step={1}
            defaultValue={0}
          />
        )}
        {layer.is3D && layer.transform.rotationX && (
          <NumberDragInput
            label="X Rotation"
            prop={layer.transform.rotationX}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'transform.rotationX.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'transform.rotationX', currentFrame, v)}
            hasKeyframe={hasKeyframeAt(layer.transform.rotationX)}
            suffix="deg"
            step={0.5}
            defaultValue={0}
          />
        )}
        {layer.is3D && layer.transform.rotationY && (
          <NumberDragInput
            label="Y Rotation"
            prop={layer.transform.rotationY}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'transform.rotationY.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'transform.rotationY', currentFrame, v)}
            hasKeyframe={hasKeyframeAt(layer.transform.rotationY)}
            suffix="deg"
            step={0.5}
            defaultValue={0}
          />
        )}
        <NumberDragInput
          label={layer.is3D ? 'Z Rotation' : 'Rotation'}
          prop={layer.transform.rotation}
          frame={currentFrame}
          onChange={(v) => updateLayerProperty(layer.id, 'transform.rotation.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'transform.rotation', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(layer.transform.rotation)}
          suffix="deg"
          step={0.5}
          defaultValue={0}
          propPath="transform.rotation"
        />
        <Vec2DragInput
          label="Scale"
          prop={layer.transform.scale}
          frame={currentFrame}
          onChangeValue={(v) => updateLayerProperty(layer.id, 'transform.scale.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'transform.scale', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(layer.transform.scale)}
          step={0.01}
          precision={2}
          labels={['X', 'Y']}
          defaultValue={[1, 1]}
          propPath="transform.scale"
        />
        <NumberDragInput
          label="Opacity"
          prop={layer.transform.opacity}
          frame={currentFrame}
          onChange={(v) => updateLayerProperty(layer.id, 'transform.opacity.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'transform.opacity', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(layer.transform.opacity)}
          min={0}
          max={1}
          step={0.01}
          precision={2}
          defaultValue={1}
          propPath="transform.opacity"
        />
      </Section>
      )}

      {isText && (
        <>
          <TextProperties
            layer={layer as TextLayer}
            currentFrame={currentFrame}
            updateLayerProperty={updateLayerProperty}
            addKeyframe={addKeyframe}
            hasKeyframeAt={hasKeyframeAt}
          />
          <TextAnimators layer={layer as TextLayer} updateLayerProperty={updateLayerProperty} />
        </>
      )}

      {isShape && (
        <ShapeProperties
          layer={layer as ShapeLayer}
          currentFrame={currentFrame}
          updateLayerProperty={updateLayerProperty}
          addKeyframe={addKeyframe}
          hasKeyframeAt={hasKeyframeAt}
        />
      )}

      {isVideo && (
        <VideoProperties
          layer={layer as VideoLayer}
          updateLayerProperty={updateLayerProperty}
        />
      )}

      {isImage && (
        <ImageProperties
          layer={layer as ImageLayer}
        />
      )}

      {isAudio && (
        <AudioProperties
          layer={layer as AudioLayer}
          currentFrame={currentFrame}
          updateLayerProperty={updateLayerProperty}
          addKeyframe={addKeyframe}
          hasKeyframeAt={hasKeyframeAt}
        />
      )}

      {isParticle && (
        <ParticlePanel layer={layer as ParticleLayer} />
      )}

      {isPattern && (
        <GenerativePatternPanel layer={layer as GenerativePatternLayer} />
      )}


      {isAnimationItem && (
        <AnimationItemPanel layer={layer as AnimationItemLayer} />
      )}

      {layer.type === 'lottieIcon' && (
        <LottieIconSection layer={layer as LottieIconLayer} />
      )}

      {(layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') && (
        <LayoutParamsPanel layer={layer as LayoutObjectLayer} />
      )}

      {layer.type === 'layoutContainer' && (
        <LayoutContainerPanel layer={layer as LayoutContainerLayer} />
      )}

      {!isAudio && <ConstraintsSection layer={layer} />}

      {/* Name/type sit BELOW the more important properties (transform, type-specific, constraints). */}
      <Section title="Layer">
        <StringInput
          label="Name"
          value={layer.name}
          onChange={(v) => updateLayerProperty(layer.id, 'name', v)}
        />
        <div className="flex items-center gap-2 mt-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Type</label>
          <span className="text-caption text-slate-400 capitalize">{layer.type}</span>
        </div>
      </Section>

      {/* Show child override panel if this layer is inside a layout */}
      {(() => {
        const composition = useEditorStore.getState().composition;
        const parentLayout = composition.layers.find(
          (l) => (l.type === 'hbox' || l.type === 'vbox' || l.type === 'grid') && (l as LayoutObjectLayer).children.includes(layer.id)
        ) as LayoutObjectLayer | undefined;
        if (!parentLayout) return null;
        const override = parentLayout.childOverrides[layer.id] || { grow: 0, shrink: 1, margin: { top: 0, right: 0, bottom: 0, left: 0 }, layoutVisibility: 'visible' as const };
        return <ChildLayoutOverridePanel layoutId={parentLayout.id} childId={layer.id} override={override} />;
      })()}

      <Section title="Timing">
        <div className="flex gap-2">
          <DragInput label="In" value={layer.inPoint} onChange={(v) => updateLayerProperty(layer.id, 'inPoint', Math.round(v))} min={0} precision={0} />
          <DragInput label="Out" value={layer.outPoint} onChange={(v) => updateLayerProperty(layer.id, 'outPoint', Math.round(v))} min={1} precision={0} />
        </div>
      </Section>
    </>
  );
}

function ShapeProperties({
  layer, currentFrame, updateLayerProperty, addKeyframe, hasKeyframeAt,
}: {
  layer: ShapeLayer;
  currentFrame: number;
  updateLayerProperty: (id: string, path: string, value: unknown) => void;
  addKeyframe: (id: string, path: string, frame: number, value: number | [number, number]) => void;
  hasKeyframeAt: (prop: AnimatableProperty) => boolean;
}) {
  const shape = layer.shape;
  const setPathVertexHandleMode = useEditorStore((s) => s.setPathVertexHandleMode);
  const selectedVertices = usePathEditStore((s) => s.selectedVertices);

  return (
    <Section title={`Shape (${shape.type})`}>
      {shape.type === 'rectangle' && (
        <>
          <NumberDragInput
            label="Width"
            prop={(shape as RectangleShape).width}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.width.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'shape.width', currentFrame, v)}
            hasKeyframe={hasKeyframeAt((shape as RectangleShape).width)}
            min={1}
          />
          <NumberDragInput
            label="Height"
            prop={(shape as RectangleShape).height}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.height.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'shape.height', currentFrame, v)}
            hasKeyframe={hasKeyframeAt((shape as RectangleShape).height)}
            min={1}
          />
          {(() => {
            const rect = shape as RectangleShape;
            const cr = rect.cornerRadii;
            if (!cr) {
              return (
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <NumberDragInput
                      label="Corner R"
                      prop={rect.borderRadius}
                      frame={currentFrame}
                      onChange={(v) => updateLayerProperty(layer.id, 'shape.borderRadius.defaultValue', v)}
                      onKeyframe={(v) => addKeyframe(layer.id, 'shape.borderRadius', currentFrame, v)}
                      hasKeyframe={hasKeyframeAt(rect.borderRadius)}
                      min={0}
                    />
                  </div>
                  <button
                    title="Independent corners"
                    onClick={() => {
                      const base = evaluateProperty(rect.borderRadius, currentFrame) as number;
                      updateLayerProperty(layer.id, 'shape.cornerRadii', [
                        createProperty('Corner TL', 'number', base),
                        createProperty('Corner TR', 'number', base),
                        createProperty('Corner BR', 'number', base),
                        createProperty('Corner BL', 'number', base),
                      ]);
                    }}
                    className="mt-4 p-1 rounded text-slate-500 hover:text-cyan-400 hover:bg-white/5"
                  >
                    <Grid3x3 size={12} />
                  </button>
                </div>
              );
            }
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-overline uppercase tracking-wide text-slate-500">Corners</span>
                  <button
                    title="Use one uniform corner radius"
                    onClick={() => updateLayerProperty(layer.id, 'shape.cornerRadii', undefined)}
                    className="text-caption text-cyan-400 hover:text-cyan-300"
                  >
                    Uniform
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(['TL', 'TR', 'BR', 'BL'] as const).map((lbl, i) => (
                    <NumberDragInput
                      key={lbl}
                      label={lbl}
                      prop={cr[i]}
                      frame={currentFrame}
                      onChange={(v) => updateLayerProperty(layer.id, `shape.cornerRadii.${i}.defaultValue`, v)}
                      onKeyframe={(v) => addKeyframe(layer.id, `shape.cornerRadii.${i}`, currentFrame, v)}
                      hasKeyframe={hasKeyframeAt(cr[i])}
                      min={0}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {shape.type === 'circle' && (
        <NumberDragInput
          label="Radius"
          prop={(shape as CircleShape).radius}
          frame={currentFrame}
          onChange={(v) => updateLayerProperty(layer.id, 'shape.radius.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'shape.radius', currentFrame, v)}
          hasKeyframe={hasKeyframeAt((shape as CircleShape).radius)}
          min={1}
        />
      )}

      {shape.type === 'star' && (
        <>
          <NumberDragInput
            label="Points"
            prop={(shape as StarShape).points}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.points.defaultValue', Math.round(v))}
            onKeyframe={(v) => addKeyframe(layer.id, 'shape.points', currentFrame, Math.round(v))}
            hasKeyframe={hasKeyframeAt((shape as StarShape).points)}
            min={3}
            max={50}
            step={1}
            precision={0}
          />
          <NumberDragInput
            label="Outer R"
            prop={(shape as StarShape).outerRadius}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.outerRadius.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'shape.outerRadius', currentFrame, v)}
            hasKeyframe={hasKeyframeAt((shape as StarShape).outerRadius)}
            min={1}
          />
          <NumberDragInput
            label="Inner R"
            prop={(shape as StarShape).innerRadius}
            frame={currentFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.innerRadius.defaultValue', v)}
            onKeyframe={(v) => addKeyframe(layer.id, 'shape.innerRadius', currentFrame, v)}
            hasKeyframe={hasKeyframeAt((shape as StarShape).innerRadius)}
            min={1}
          />
        </>
      )}

      {shape.type === 'polygon' && (
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Vertices</label>
          <span className="text-caption text-slate-400">{(shape as PolygonShape).vertices.length}</span>
          <span className="text-caption text-slate-600 ml-1">
            ({(shape as PolygonShape).closed ? 'closed' : 'open'})
          </span>
        </div>
      )}

      <ColorStyleRow label="Fill" layerId={layer.id} slot="fill" rawColor={shape.fillColor} onRawChange={(v) => updateLayerProperty(layer.id, 'shape.fillColor', v)} />
      <ColorStyleRow label="Stroke" layerId={layer.id} slot="stroke" rawColor={shape.strokeColor} onRawChange={(v) => updateLayerProperty(layer.id, 'shape.strokeColor', v)} />
      <NumberDragInput
        label="Stroke W"
        prop={shape.strokeWidth}
        frame={currentFrame}
        onChange={(v) => updateLayerProperty(layer.id, 'shape.strokeWidth.defaultValue', v)}
        onKeyframe={(v) => addKeyframe(layer.id, 'shape.strokeWidth', currentFrame, v)}
        hasKeyframe={hasKeyframeAt(shape.strokeWidth)}
        min={0}
        max={50}
        step={0.5}
      />

      {shape.type === 'polygon' && (
        <>
          <SegmentedControl
            label="Cap"
            value={(shape as PolygonShape).lineCap ?? 'butt'}
            options={[['butt', 'Butt'], ['round', 'Round'], ['square', 'Square']]}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.lineCap', v)}
          />
          <SegmentedControl
            label="Join"
            value={(shape as PolygonShape).lineJoin ?? 'miter'}
            options={[['miter', 'Miter'], ['round', 'Round'], ['bevel', 'Bevel']]}
            onChange={(v) => updateLayerProperty(layer.id, 'shape.lineJoin', v)}
          />
          {selectedVertices.length > 0 && (() => {
            const v0 = (shape as PolygonShape).vertices[selectedVertices[0]];
            const cur = v0?.handleMode ?? (v0?.vertexType === 'corner' ? 'independent' : 'mirrored');
            return (
              <SegmentedControl
                label="Tangent"
                value={cur}
                options={[['mirrored', 'Mirror'], ['angle', 'Angle'], ['independent', 'Free']]}
                onChange={(v) => setPathVertexHandleMode(layer.id, selectedVertices, v as 'mirrored' | 'angle' | 'independent')}
              />
            );
          })()}
        </>
      )}
    </Section>
  );
}

function SegmentedControl({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-caption text-slate-500 w-14 flex-shrink-0">{label}</label>
      <div className="flex flex-1 rounded overflow-hidden border border-[#23293a]">
        {options.map(([val, name]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`flex-1 text-caption py-1 transition-colors ${
              value === val
                ? 'bg-accent-wash text-accent-hover'
                : 'bg-surface-2 text-slate-400 hover:text-slate-200 hover:bg-surface-3'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function StripSilenceButton({ layerId }: { layerId: string }) {
  const openSilence = useSilenceStore((s) => s.open);
  return (
    <button
      onClick={() => openSilence(layerId)}
      className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-surface-3 hover:bg-surface-4 text-caption text-slate-300 hover:text-cyan-400 transition-colors"
    >
      <Scissors size={11} className="text-cyan-400" />
      Strip Silence
    </button>
  );
}

function shutterHint(angle: number): string {
  if (angle <= 0) return 'No blur';
  if (angle <= 90) return 'Light';
  if (angle <= 180) return 'Standard';
  if (angle <= 270) return 'Heavy';
  return 'Extreme';
}

const GLOW_MODES: { value: GlowMode; label: string }[] = [
  { value: 'image', label: 'Bloom' },
  { value: 'outer', label: 'Outer' },
  { value: 'inner', label: 'Inner' },
];

const BLUR_TYPES: { value: BlurType; label: string }[] = [
  { value: 'gaussian', label: 'Gaussian' },
  { value: 'directional', label: 'Directional' },
  { value: 'radial', label: 'Radial' },
  { value: 'kawase', label: 'Kawase' },
];

// Generalized, extensible Effects section. Motion Blur is the first effect in a
// per-layer effects pipeline (future: Glow, Shadow, Directional Blur). The UI
// only configures parameters — all blur math runs on the GPU in the renderer.
function EffectsSection({ layer }: { layer: Layer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const enabled = getMotionBlur(layer);
  const shutter = (layer as { motionBlurShutter?: number }).motionBlurShutter ?? 180;
  const shadow = (layer as { shadow?: LayerShadow }).shadow;
  const shadowEnabled = !!shadow?.enabled;
  const glow = (layer as { glow?: LayerGlow }).glow;
  const glowEnabled = !!glow?.enabled;
  const blur = (layer as { blur?: LayerBlur }).blur;
  const blurEnabled = !!blur?.enabled;

  return (
    <Section title="Effects">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className="text-cyan-400" />
          <span className="text-caption text-slate-300">Motion Blur</span>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => updateLayerProperty(layer.id, 'motionBlur', !enabled)}
          className={`relative w-8 h-[18px] rounded-full transition-colors ${enabled ? 'bg-cyan-500' : 'bg-surface-4'}`}
        >
          <span
            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${enabled ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-caption text-slate-500">Shutter Angle</label>
            <span className="text-caption text-cyan-400 font-mono">{Math.round(shutter)}° · {shutterHint(shutter)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={shutter}
            onChange={(e) => updateLayerProperty(layer.id, 'motionBlurShutter', parseInt(e.target.value, 10))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <p className="text-[9px] text-slate-600 leading-relaxed">
            Longer shutter angles stretch the motion streak. Enable the Motion Blur preview
            toggle in the viewport to see it; exports always render at full quality.
          </p>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Moon size={12} className="text-cyan-400" />
          <span className="text-caption text-slate-300">Shadow</span>
        </div>
        <button
          role="switch"
          aria-checked={shadowEnabled}
          onClick={() => updateLayerProperty(layer.id, 'shadow', shadowEnabled ? { ...shadow, enabled: false } : DEFAULT_SHADOW)}
          className={`relative w-8 h-[18px] rounded-full transition-colors ${shadowEnabled ? 'bg-cyan-500' : 'bg-surface-4'}`}
        >
          <span
            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${shadowEnabled ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
          />
        </button>
      </div>

      {shadowEnabled && shadow && (
        <div className="mt-2 space-y-2">
          <ColorInput
            label="Color"
            value={shadow.color}
            onChange={(v) => updateLayerProperty(layer.id, 'shadow.color', v)}
          />
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={shadow.color[3]}
              onChange={(e) => updateLayerProperty(layer.id, 'shadow.color', [shadow.color[0], shadow.color[1], shadow.color[2], parseFloat(e.target.value)])}
              className="flex-1 accent-cyan-400 cursor-pointer"
            />
            <span className="text-caption text-cyan-400 font-mono w-8 text-right">{Math.round(shadow.color[3] * 100)}%</span>
          </div>

          <ShadowSlider
            label="Angle" suffix="°" min={0} max={360} step={1} value={shadow.lightAngle}
            onChange={(v) => updateLayerProperty(layer.id, 'shadow.lightAngle', v)}
          />
          <ShadowSlider
            label="Distance" suffix="px" min={0} max={400} step={1} value={shadow.lightDistance}
            onChange={(v) => updateLayerProperty(layer.id, 'shadow.lightDistance', v)}
          />
          <ShadowSlider
            label="Stretch" suffix="×" min={0.2} max={3} step={0.01} value={shadow.shadowScale} precision={2}
            onChange={(v) => updateLayerProperty(layer.id, 'shadow.shadowScale', v)}
          />
          <ShadowSlider
            label="Blur" suffix="px" min={0} max={80} step={1} value={shadow.blurRadius}
            onChange={(v) => updateLayerProperty(layer.id, 'shadow.blurRadius', v)}
          />

          <div className="flex items-center justify-between pt-1">
            <label className="text-caption text-slate-500">Shadow Only</label>
            <button
              role="switch"
              aria-checked={shadow.onlyShadow}
              onClick={() => updateLayerProperty(layer.id, 'shadow.onlyShadow', !shadow.onlyShadow)}
              className={`relative w-8 h-[18px] rounded-full transition-colors ${shadow.onlyShadow ? 'bg-cyan-500' : 'bg-surface-4'}`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${shadow.onlyShadow ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-cyan-400" />
          <span className="text-caption text-slate-300">Glow</span>
        </div>
        <button
          role="switch"
          aria-checked={glowEnabled}
          onClick={() => updateLayerProperty(layer.id, 'glow', glowEnabled ? { ...glow, enabled: false } : DEFAULT_GLOW)}
          className={`relative w-8 h-[18px] rounded-full transition-colors ${glowEnabled ? 'bg-cyan-500' : 'bg-surface-4'}`}
        >
          <span
            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${glowEnabled ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
          />
        </button>
      </div>

      {glowEnabled && glow && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Mode</label>
            <div className="flex-1 flex gap-1">
              {GLOW_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => updateLayerProperty(layer.id, 'glow.mode', m.value)}
                  className={`flex-1 text-[9px] py-1 rounded transition-colors ${
                    glow.mode === m.value
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-surface-4 text-slate-400 border border-transparent hover:border-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <ColorInput
            label="Color"
            value={glow.color}
            onChange={(v) => updateLayerProperty(layer.id, 'glow.color', v)}
          />

          <ShadowSlider
            label="Intensity" suffix="x" min={0} max={5} step={0.1} value={glow.intensity} precision={1}
            onChange={(v) => updateLayerProperty(layer.id, 'glow.intensity', v)}
          />
          <ShadowSlider
            label="Radius" suffix="px" min={0} max={100} step={1} value={glow.radius}
            onChange={(v) => updateLayerProperty(layer.id, 'glow.radius', v)}
          />
          {glow.mode === 'image' && (
            <ShadowSlider
              label="Threshold" suffix="" min={0} max={1} step={0.01} value={glow.threshold} precision={2}
              onChange={(v) => updateLayerProperty(layer.id, 'glow.threshold', v)}
            />
          )}

          <div className="flex items-center justify-between pt-1">
            <label className="text-caption text-slate-500">Glow Only</label>
            <button
              role="switch"
              aria-checked={glow.onlyGlow}
              onClick={() => updateLayerProperty(layer.id, 'glow.onlyGlow', !glow.onlyGlow)}
              className={`relative w-8 h-[18px] rounded-full transition-colors ${glow.onlyGlow ? 'bg-cyan-500' : 'bg-surface-4'}`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${glow.onlyGlow ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Aperture size={12} className="text-cyan-400" />
          <span className="text-caption text-slate-300">Blur</span>
        </div>
        <button
          role="switch"
          aria-checked={blurEnabled}
          onClick={() => updateLayerProperty(layer.id, 'blur', blurEnabled ? { ...blur, enabled: false } : DEFAULT_BLUR)}
          className={`relative w-8 h-[18px] rounded-full transition-colors ${blurEnabled ? 'bg-cyan-500' : 'bg-surface-4'}`}
        >
          <span
            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${blurEnabled ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
          />
        </button>
      </div>

      {blurEnabled && blur && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Type</label>
            <div className="flex-1 flex gap-1">
              {BLUR_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  onClick={() => updateLayerProperty(layer.id, 'blur.type', bt.value)}
                  className={`flex-1 text-[9px] py-1 rounded transition-colors ${
                    blur.type === bt.value
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-surface-4 text-slate-400 border border-transparent hover:border-slate-600'
                  }`}
                >
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          {(blur.type === 'gaussian' || blur.type === 'kawase') && (
            <ShadowSlider
              label="Radius" suffix="px" min={0} max={100} step={1} value={blur.radius}
              onChange={(v) => updateLayerProperty(layer.id, 'blur.radius', v)}
            />
          )}

          {blur.type === 'directional' && (
            <>
              <ShadowSlider
                label="Angle" suffix="°" min={0} max={360} step={1} value={blur.angle}
                onChange={(v) => updateLayerProperty(layer.id, 'blur.angle', v)}
              />
              <ShadowSlider
                label="Strength" suffix="px" min={0} max={200} step={1} value={blur.strength}
                onChange={(v) => updateLayerProperty(layer.id, 'blur.strength', v)}
              />
            </>
          )}

          {blur.type === 'radial' && (
            <>
              <ShadowSlider
                label="Strength" suffix="" min={0} max={100} step={1} value={blur.strength}
                onChange={(v) => updateLayerProperty(layer.id, 'blur.strength', v)}
              />
              <ShadowSlider
                label="Center X" suffix="" min={0} max={1} step={0.01} value={blur.centerX} precision={2}
                onChange={(v) => updateLayerProperty(layer.id, 'blur.centerX', v)}
              />
              <ShadowSlider
                label="Center Y" suffix="" min={0} max={1} step={0.01} value={blur.centerY} precision={2}
                onChange={(v) => updateLayerProperty(layer.id, 'blur.centerY', v)}
              />
            </>
          )}

          {blur.type === 'kawase' && (
            <ShadowSlider
              label="Passes" suffix="" min={1} max={8} step={1} value={blur.passes}
              onChange={(v) => updateLayerProperty(layer.id, 'blur.passes', v)}
            />
          )}
        </div>
      )}
    </Section>
  );
}

function ShadowSlider({
  label, suffix, min, max, step, value, onChange, precision = 0,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  precision?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-caption text-slate-500">{label}</label>
        <span className="text-caption text-cyan-400 font-mono">{value.toFixed(precision)}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-400 cursor-pointer"
      />
    </div>
  );
}

function VideoProperties({
  layer, updateLayerProperty,
}: {
  layer: VideoLayer;
  updateLayerProperty: (id: string, path: string, value: unknown) => void;
}) {
  const { video } = layer;
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Section title="Video">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Source</label>
          <span className="text-caption text-slate-400 truncate">{video.sourceWidth}x{video.sourceHeight}</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Duration</label>
          <span className="text-caption text-slate-400">{formatDuration(video.sourceDuration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">FPS</label>
          <span className="text-caption text-slate-400">{video.sourceFrameRate}</span>
        </div>
        <LockAspectToggle layer={layer} />
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Offset</label>
          <DragInput
            value={video.startOffset}
            onChange={(v) => updateLayerProperty(layer.id, 'video.startOffset', Math.max(0, Math.round(v)))}
            min={0}
            precision={0}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Speed</label>
          <DragInput
            value={video.playbackRate}
            onChange={(v) => updateLayerProperty(layer.id, 'video.playbackRate', Math.max(0.1, v))}
            min={0.1}
            max={10}
            step={0.1}
            precision={2}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Muted</label>
          <button
            onClick={() => updateLayerProperty(layer.id, 'video.muted', !video.muted)}
            className={`px-1.5 py-0.5 text-[9px] rounded ${
              video.muted
                ? 'bg-red-500/20 text-red-400'
                : 'bg-surface-3 text-slate-500 hover:text-slate-300'
            }`}
          >
            {video.muted ? 'Muted' : 'Unmuted'}
          </button>
        </div>
        <StripSilenceButton layerId={layer.id} />
      </div>
    </Section>
  );
}

// Corner-resize aspect lock (default on for media). Shift always temporarily inverts it on the canvas.
function LockAspectToggle({ layer }: { layer: ImageLayer | VideoLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const locked = layer.lockAspect !== false;
  return (
    <div className="flex items-center gap-2">
      <label className="text-caption text-slate-500 w-14 flex-shrink-0">Aspect</label>
      <button
        onClick={() => updateLayerProperty(layer.id, 'lockAspect', !locked)}
        title={locked ? 'Corner-resize keeps the aspect ratio (hold Shift to free it)' : 'Corner-resize is free (hold Shift to lock)'}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-caption font-medium transition-colors ${locked ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-400 hover:text-slate-200'}`}
      >
        {locked ? <Lock size={11} /> : <Unlock size={11} />}
        {locked ? 'Locked' : 'Free'}
      </button>
    </div>
  );
}

function ImageProperties({
  layer,
}: {
  layer: ImageLayer;
}) {
  const { image } = layer;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Section title="Image">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Size</label>
            <span className="text-caption text-slate-400">{image.sourceWidth}x{image.sourceHeight}</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Format</label>
            <span className="text-caption text-slate-400">{image.format.replace('image/', '').toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">File Size</label>
            <span className="text-caption text-slate-400">{formatSize(image.fileSize)}</span>
          </div>
          <LockAspectToggle layer={layer} />
        </div>
      </Section>

      <Section title="Tools">
        <RemoveBackgroundButton layer={layer} />
      </Section>
    </>
  );
}

type BgRemovalStatus = 'idle' | 'downloading' | 'processing' | 'done' | 'error';

function RemoveBackgroundButton({ layer }: { layer: ImageLayer }) {
  const [status, setStatus] = useState<BgRemovalStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const handleRemove = useCallback(async () => {
    if (!activeProjectId) return;

    setStatus('downloading');
    setProgress(0);
    setError(null);

    try {
      const { removeBackground } = await import('@imgly/background-removal');

      const sourceUrl = mediaAssetManager.getObjectUrl(layer.image.assetId);
      if (!sourceUrl) throw new Error('Image source not found');

      const blob = await removeBackground(sourceUrl, {
        progress: (key: string, current: number, total: number) => {
          if (key.includes('fetch') || key.includes('download')) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            setStatus('downloading');
            setProgress(pct);
          } else if (key.includes('compute') || key.includes('inference')) {
            setStatus('processing');
            setProgress(100);
          }
        },
      });

      const file = new File([blob], `${layer.name}-no-bg.png`, { type: 'image/png' });
      const { assetId, metadata } = await mediaAssetManager.importImage(file, activeProjectId);

      updateLayerProperty(layer.id, 'image', {
        assetId,
        sourceWidth: metadata.width,
        sourceHeight: metadata.height,
        format: metadata.format,
        fileSize: metadata.fileSize,
      });

      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to remove background');
    }
  }, [layer.image.assetId, layer.id, layer.name, activeProjectId, updateLayerProperty]);

  const isProcessing = status === 'downloading' || status === 'processing';
  const progressWidth = status === 'processing' ? 100 : progress;

  return (
    <div className="space-y-2">
      <button
        onClick={handleRemove}
        disabled={isProcessing}
        className={`w-full relative overflow-hidden flex items-center justify-center gap-2 py-2 rounded-md text-caption font-medium transition ${
          isProcessing
            ? 'bg-accent-wash border border-accent-dim text-accent-hover cursor-wait'
            : status === 'done'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-accent-wash hover:bg-accent-wash border border-accent-dim hover:border-accent-dim text-accent-hover'
        }`}
      >
        {isProcessing && (
          <div
            className="absolute inset-0 bg-accent-wash transition duration-300 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        )}
        <span className="relative flex items-center gap-2">
          {isProcessing ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              {status === 'downloading' ? `Downloading model... ${progress}%` : 'Removing background...'}
            </>
          ) : status === 'done' ? (
            <>
              <Scissors size={13} />
              Background Removed
            </>
          ) : (
            <>
              <Scissors size={13} />
              Remove Background
            </>
          )}
        </span>
      </button>

      {isProcessing && progress < 100 && status === 'downloading' && (
        <p className="text-[9px] text-slate-600 text-center">
          First run downloads the AI model (~40MB). Cached for future use.
        </p>
      )}

      {status === 'error' && error && (
        <p className="text-[9px] text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}


function AudioProperties({
  layer, currentFrame, updateLayerProperty, addKeyframe, hasKeyframeAt,
}: {
  layer: AudioLayer;
  currentFrame: number;
  updateLayerProperty: (id: string, path: string, value: unknown) => void;
  addKeyframe: (id: string, path: string, frame: number, value: number | [number, number]) => void;
  hasKeyframeAt: (prop: AnimatableProperty) => boolean;
}) {
  const { audio } = layer;
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  };

  return (
    <Section title="Audio">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Muted</label>
          <button
            onClick={() => updateLayerProperty(layer.id, 'audio.muted', !audio.muted)}
            className={`px-1.5 py-0.5 text-[9px] rounded ${
              audio.muted
                ? 'bg-red-500/20 text-red-400'
                : 'bg-surface-3 text-slate-500 hover:text-slate-300'
            }`}
          >
            {audio.muted ? 'Muted' : 'Unmuted'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Duration</label>
          <span className="text-caption text-slate-400">{formatDuration(audio.sourceDuration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Sample</label>
          <span className="text-caption text-slate-400">{(audio.sampleRate / 1000).toFixed(1)} kHz</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Channels</label>
          <span className="text-caption text-slate-400">{audio.channels === 1 ? 'Mono' : audio.channels === 2 ? 'Stereo' : `${audio.channels}ch`}</span>
        </div>
        <NumberDragInput
          label="Volume"
          prop={audio.volume}
          frame={currentFrame}
          onChange={(v) => updateLayerProperty(layer.id, 'audio.volume.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'audio.volume', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(audio.volume)}
          min={0}
          max={2}
          step={0.01}
          precision={2}
        />
        <NumberDragInput
          label="Pitch"
          prop={audio.pitch}
          frame={currentFrame}
          onChange={(v) => updateLayerProperty(layer.id, 'audio.pitch.defaultValue', v)}
          onKeyframe={(v) => addKeyframe(layer.id, 'audio.pitch', currentFrame, v)}
          hasKeyframe={hasKeyframeAt(audio.pitch)}
          min={-24}
          max={24}
          step={1}
          precision={0}
          suffix="st"
        />
        <StripSilenceButton layerId={layer.id} />
        <AutoCaptionButton layerId={layer.id} />
      </div>
    </Section>
  );
}

function AutoCaptionButton({ layerId }: { layerId: string }) {
  const active = useAutoCaptionStore((s) => s.active);
  return (
    <button
      onClick={() => autoCaptionAudioLayers([layerId])}
      disabled={active}
      title="Transcribe this clip on-device (Whisper Small) and add subtitles to the timeline"
      className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-surface-3 hover:bg-surface-4 text-caption text-slate-300 hover:text-accent transition-colors disabled:opacity-50 disabled:hover:text-slate-300"
    >
      <Captions size={11} className="text-accent" />
      {active ? 'Auto-Captioning…' : 'Auto-Caption'}
    </button>
  );
}


function TextMotionControlSection({ layer }: { layer: TextLayer }) {
  const explodeTextLayer = useEditorStore((s) => s.explodeTextLayer);
  const frameRate = useEditorStore((s) => s.composition.settings.frameRate);

  const [mode, setMode] = useState<SplitMode>('character');
  const [unit, setUnit] = useState<'seconds' | 'frames'>('seconds');
  const [amount, setAmount] = useState<number>(0.05);

  const staggerFrames = unit === 'seconds'
    ? Math.max(0, amount) * frameRate
    : Math.max(0, amount);

  const canConvert = (layer.content?.spans ?? []).map((s) => s.text).join('').trim().length > 0;

  const MODES: { id: SplitMode; label: string }[] = [
    { id: 'character', label: 'Character' },
    { id: 'word', label: 'Word' },
    { id: 'line', label: 'Line' },
    { id: 'paragraph', label: 'Paragraph' },
  ];

  const handleConvert = () => {
    if (!canConvert) return;
    explodeTextLayer(layer.id, mode, staggerFrames);
  };

  return (
    <Section title="Text Motion Control">
      <div className="space-y-2">
        <div>
          <label className="text-caption text-slate-500 block mb-1">Split Mode</label>
          <div className="grid grid-cols-2 gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`text-caption px-2 py-1 rounded border transition-colors ${
                  mode === m.id
                    ? 'border-accent text-accent bg-accent-wash'
                    : 'border-hairline text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-caption text-slate-500 block mb-1">Stagger Delay</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={unit === 'seconds' ? 0.01 : 1}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-surface-3 text-caption text-slate-300 px-1.5 py-1 rounded border border-hairline focus:border-accent-dim outline-none"
            />
            <div className="flex rounded border border-hairline overflow-hidden">
              <button
                onClick={() => setUnit('seconds')}
                className={`text-caption px-2 py-1 transition-colors ${
                  unit === 'seconds' ? 'bg-accent-wash text-accent' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Sec
              </button>
              <button
                onClick={() => setUnit('frames')}
                className={`text-caption px-2 py-1 transition-colors ${
                  unit === 'frames' ? 'bg-accent-wash text-accent' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Frames
              </button>
            </div>
          </div>
          <p className="text-[9px] text-slate-600 mt-1">
            {Math.round(staggerFrames * 100) / 100} frame{staggerFrames === 1 ? '' : 's'} between clips
          </p>
        </div>

        <button
          onClick={handleConvert}
          disabled={!canConvert}
          className={`w-full flex items-center justify-center gap-1.5 text-caption font-medium px-2 py-1.5 rounded transition-colors ${
            canConvert
              ? 'bg-accent text-white hover:bg-accent'
              : 'bg-surface-3 text-slate-600 cursor-not-allowed'
          }`}
        >
          <Zap size={12} />
          Convert to Motion Clips
        </button>
      </div>
    </Section>
  );
}

// Minimal per-character animator controls: add a preset, toggle/remove animators. The full editor
// (selector + delta controls) is a later pass; presets keyframe the reveal so it plays on scrub.
function TextAnimators({ layer, updateLayerProperty }: { layer: TextLayer; updateLayerProperty: (layerId: string, path: string, value: unknown) => void }) {
  const animators = layer.animators ?? [];
  const set = (next: unknown) => updateLayerProperty(layer.id, 'animators', next);
  return (
    <div className="border-t border-hairline px-3 py-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Animators</div>
      {animators.length === 0 && (
        <p className="mb-2 text-[10.5px] leading-snug text-slate-600">Per-character animation (single-line text).</p>
      )}
      <div className="space-y-1">
        {animators.map((a, i) => (
          <div key={i} className="flex items-center gap-2 rounded border border-hairline bg-surface-1 px-2 py-1">
            <button
              type="button"
              title="Enable / disable"
              onClick={() => set(animators.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))}
              className={`h-3 w-3 flex-shrink-0 rounded-sm border ${a.enabled ? 'border-accent bg-accent' : 'border-hairline'}`}
            />
            <span className="flex-1 truncate text-[11px] text-slate-300">Animator {i + 1} · {a.splitMode}</span>
            <button type="button" title="Remove" onClick={() => set(animators.filter((_, j) => j !== i))} className="text-[12px] leading-none text-slate-500 hover:text-danger">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEXT_ANIMATOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => set([...animators, p.build(0, 30)])}
            className="rounded-md border border-hairline bg-surface-1 px-2 py-1 text-[10.5px] text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            + {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextProperties({
  layer, currentFrame, updateLayerProperty, addKeyframe, hasKeyframeAt,
}: {
  layer: TextLayer;
  currentFrame: number;
  updateLayerProperty: (id: string, path: string, value: unknown) => void;
  addKeyframe: (id: string, path: string, frame: number, value: number | [number, number]) => void;
  hasKeyframeAt: (prop: AnimatableProperty) => boolean;
}) {
  // Guard against a text layer with missing/empty content (some layers arrive without a full
  // content/spans shape) — reading it unguarded is what crashed the panel on selection. `style`
  // falls back to a full default so every downstream `style.*` read is safe.
  const spans = layer.content?.spans ?? [];
  const span = spans[0];
  const style = span?.style ?? FALLBACK_SPAN_STYLE;
  const overrides = layer.animOverrides ?? createTextAnimOverrides();
  const lc = layer.layoutConfig ?? FALLBACK_TEXT_LAYOUT;

  const fullText = spans.map((s) => s.text).join('');

  return (
    <>
      <Section title="Text Content">
        <div className="flex flex-col gap-1">
          <textarea
            value={fullText}
            onChange={(e) => updateLayerProperty(layer.id, 'content.spans', [{ text: e.target.value, style: style }])}
            className="w-full bg-surface-3 text-caption text-slate-300 px-2 py-1.5 rounded border border-hairline focus:border-accent-dim outline-none resize-none min-h-[48px]"
            rows={3}
            maxLength={500}
          />
          <span className="text-[9px] text-slate-600 text-right">{fullText.length}/500</span>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-caption text-slate-500 w-14 flex-shrink-0">Bounding</label>
          <div className="flex gap-0.5">
            {(['auto', 'fixedWidth', 'fixed'] as const).map((bbType) => (
              <button
                key={bbType}
                onClick={() => {
                  if (bbType === 'auto') updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'auto' });
                  else if (bbType === 'fixedWidth') updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'fixedWidth', width: 300 });
                  else updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'fixed', width: 300, height: 200 });
                }}
                className={`px-1.5 py-0.5 text-[9px] rounded ${
                  lc.boundingBox.type === bbType
                    ? 'bg-accent-wash text-accent'
                    : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                }`}
              >
                {bbType === 'auto' ? 'Auto' : bbType === 'fixedWidth' ? 'Width' : 'Fixed'}
              </button>
            ))}
          </div>
        </div>

        {lc.boundingBox.type !== 'auto' && (
          <div className="flex items-center gap-1">
            <label className="text-caption text-slate-500 w-14 flex-shrink-0">Box</label>
            <div className="flex gap-1 flex-1">
              <input
                type="number"
                value={Math.round('width' in lc.boundingBox ? lc.boundingBox.width : 300)}
                onChange={(e) => {
                  const w = Math.max(8, Number(e.target.value));
                  if (lc.boundingBox.type === 'fixed') updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'fixed', width: w, height: lc.boundingBox.height });
                  else updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'fixedWidth', width: w });
                }}
                className="w-1/2 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
              />
              {lc.boundingBox.type === 'fixed' && (
                <input
                  type="number"
                  value={Math.round(lc.boundingBox.height)}
                  onChange={(e) => updateLayerProperty(layer.id, 'layoutConfig.boundingBox', { type: 'fixed', width: lc.boundingBox.type === 'fixed' ? lc.boundingBox.width : 300, height: Math.max(8, Number(e.target.value)) })}
                  className="w-1/2 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
                />
              )}
            </div>
          </div>
        )}
      </Section>

      {style && (
        <>
          <Section title="Font">
            <FontFamilyRow
              value={style.fontFamily}
              onPick={(fam) => {
                updateLayerProperty(layer.id, 'content.spans[0].style.fontFamily', fam);
                // Premium touch: apply the face's default tracking, but only if the user hasn't
                // set their own (treat 0 as "unset" so we never clobber a choice).
                if (overrides.letterSpacing.defaultValue === 0) {
                  const fsRaw = overrides.fontSize.defaultValue;
                  const fs = typeof fsRaw === 'number' ? fsRaw : style.fontSize;
                  const t = defaultTrackingPx(fam, fs);
                  if (t !== 0) updateLayerProperty(layer.id, 'animOverrides.letterSpacing.defaultValue', t);
                }
              }}
            />

            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Weight</label>
              <select
                value={style.fontWeight}
                onChange={(e) => updateLayerProperty(layer.id, 'content.spans[0].style.fontWeight', Number(e.target.value))}
                className="flex-1 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
              >
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Style</label>
              <div className="flex gap-0.5">
                <button
                  onClick={() => updateLayerProperty(layer.id, 'content.spans[0].style.fontStyle', style.fontStyle === 'italic' ? 'normal' : 'italic')}
                  className={`px-1.5 py-0.5 text-[9px] rounded italic ${
                    style.fontStyle === 'italic' ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  I
                </button>
              </div>
            </div>

            <NumberDragInput
              label="Size"
              prop={overrides.fontSize}
              frame={currentFrame}
              onChange={(v) => updateLayerProperty(layer.id, 'animOverrides.fontSize.defaultValue', v)}
              onKeyframe={(v) => addKeyframe(layer.id, 'animOverrides.fontSize', currentFrame, v)}
              hasKeyframe={hasKeyframeAt(overrides.fontSize)}
              min={4}
              max={500}
            />
          </Section>

          <Section title="Spacing">
            <NumberDragInput
              label="Tracking"
              prop={overrides.letterSpacing}
              frame={currentFrame}
              onChange={(v) => updateLayerProperty(layer.id, 'animOverrides.letterSpacing.defaultValue', v)}
              onKeyframe={(v) => addKeyframe(layer.id, 'animOverrides.letterSpacing', currentFrame, v)}
              hasKeyframe={hasKeyframeAt(overrides.letterSpacing)}
              step={0.5}
            />

            <NumberDragInput
              label="Leading"
              prop={overrides.lineHeight}
              frame={currentFrame}
              onChange={(v) => updateLayerProperty(layer.id, 'animOverrides.lineHeight.defaultValue', v)}
              onKeyframe={(v) => addKeyframe(layer.id, 'animOverrides.lineHeight', currentFrame, v)}
              hasKeyframe={hasKeyframeAt(overrides.lineHeight)}
              min={0.5}
              max={5}
              step={0.05}
              precision={2}
            />
          </Section>

          <Section title="Color">
            <ColorInput
              label="Fill"
              value={style.color}
              onChange={(v) => updateLayerProperty(layer.id, 'content.spans[0].style.color', v)}
            />
            <TextGradientControl
              fill={style.fill}
              onChange={(next) => updateLayerProperty(layer.id, 'content.spans[0].style.fill', next)}
            />
            <ColorInput
              label="Stroke"
              value={style.strokeColor}
              onChange={(v) => updateLayerProperty(layer.id, 'content.spans[0].style.strokeColor', v)}
            />
            <NumberDragInput
              label="Stroke W"
              prop={overrides.strokeWidth}
              frame={currentFrame}
              onChange={(v) => updateLayerProperty(layer.id, 'animOverrides.strokeWidth.defaultValue', v)}
              onKeyframe={(v) => addKeyframe(layer.id, 'animOverrides.strokeWidth', currentFrame, v)}
              hasKeyframe={hasKeyframeAt(overrides.strokeWidth)}
              min={0}
              max={20}
              step={0.5}
            />
          </Section>

          <Section title="Alignment & Layout">
            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">H Align</label>
              <div className="flex gap-0.5">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() => updateLayerProperty(layer.id, 'layoutConfig.horizontalAlign', align)}
                    className={`px-1.5 py-0.5 text-[9px] rounded ${
                      lc.horizontalAlign === align
                        ? 'bg-accent-wash text-accent'
                        : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {lc.boundingBox.type === 'fixed' && (
              <div className="flex items-center gap-1">
                <label className="text-caption text-slate-500 w-14 flex-shrink-0">V Align</label>
                <div className="flex gap-0.5">
                  {(['top', 'middle', 'bottom'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateLayerProperty(layer.id, 'layoutConfig.verticalAlign', align)}
                      className={`px-1.5 py-0.5 text-[9px] rounded ${
                        lc.verticalAlign === align
                          ? 'bg-accent-wash text-accent'
                          : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {align.charAt(0).toUpperCase() + align.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Transform</label>
              <div className="flex gap-0.5">
                {(['none', 'uppercase', 'lowercase', 'capitalize'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateLayerProperty(layer.id, 'content.spans[0].style.textTransform', t)}
                    className={`px-1 py-0.5 text-[8px] rounded ${
                      style.textTransform === t
                        ? 'bg-accent-wash text-accent'
                        : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t === 'none' ? 'Aa' : t === 'uppercase' ? 'AA' : t === 'lowercase' ? 'aa' : 'Ab'}
                  </button>
                ))}
              </div>
            </div>

            {lc.boundingBox.type !== 'auto' && (
              <div className="flex items-center gap-1">
                <label className="text-caption text-slate-500 w-14 flex-shrink-0">Overflow</label>
                <div className="flex gap-0.5">
                  {(['visible', 'clip', 'truncate'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => updateLayerProperty(layer.id, 'layoutConfig.overflow', o)}
                      className={`px-1.5 py-0.5 text-[9px] rounded ${
                        lc.overflow === o
                          ? 'bg-accent-wash text-accent'
                          : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Decoration">
            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Style</label>
              <div className="flex gap-0.5">
                <button
                  onClick={() => updateLayerProperty(layer.id, 'content.spans[0].style.underline', !style.underline)}
                  className={`px-1.5 py-0.5 text-[9px] rounded underline ${
                    style.underline ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  U
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'content.spans[0].style.strikethrough', !style.strikethrough)}
                  className={`px-1.5 py-0.5 text-[9px] rounded line-through ${
                    style.strikethrough ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

function LottieIconSection({ layer }: { layer: LottieIconLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const lottie = layer.lottieIcon;

  return (
    <div className="border-b border-hairline">
      <div className="px-3 py-1.5 bg-surface-sunken">
        <span className="text-overline uppercase tracking-wider text-slate-500 font-medium">Lottie Animation</span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-caption text-slate-500 w-20 flex-shrink-0">Color</label>
          <input
            type="color"
            value={lottie.color}
            onChange={(e) => updateLayerProperty(layer.id, 'lottieIcon.color', e.target.value)}
            className="w-6 h-6 rounded border border-hairline bg-transparent cursor-pointer"
          />
          <span className="text-[9px] text-slate-500 font-mono">{lottie.color}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-caption text-slate-500 w-20 flex-shrink-0">Start Frame</label>
          <DragInput
            value={lottie.startFrame}
            onChange={(v) => updateLayerProperty(layer.id, 'lottieIcon.startFrame', Math.max(0, Math.round(v)))}
            min={0}
            max={lottie.totalFrames - 1}
            step={1}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-caption text-slate-500 w-20 flex-shrink-0">Total Frames</label>
          <span className="text-caption text-slate-300">{lottie.totalFrames}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-caption text-slate-500 w-20 flex-shrink-0">Frame Rate</label>
          <span className="text-caption text-slate-300">{lottie.frameRate} fps</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-caption text-slate-500 w-20 flex-shrink-0">Size</label>
          <span className="text-caption text-slate-300">{lottie.sourceWidth} x {lottie.sourceHeight}</span>
        </div>
      </div>
    </div>
  );
}

// M14 — per-axis reframe constraints. A 5-way segmented control per axis fully expresses
// Left/Center/Right + Stretch + Scale (a 3×3 pin grid can't represent stretch/scale). Only
// meaningful for top-level layers; children ride their parent.
const H_CONSTRAINT_OPTS: { mode: ReframeAxisMode; label: string }[] = [
  { mode: 'min', label: 'Left' }, { mode: 'center', label: 'Center' }, { mode: 'max', label: 'Right' },
  { mode: 'stretch', label: 'Stretch' }, { mode: 'scale', label: 'Scale' },
];
const V_CONSTRAINT_OPTS: { mode: ReframeAxisMode; label: string }[] = [
  { mode: 'min', label: 'Top' }, { mode: 'center', label: 'Center' }, { mode: 'max', label: 'Bottom' },
  { mode: 'stretch', label: 'Stretch' }, { mode: 'scale', label: 'Scale' },
];

function ConstraintRow({ label, opts, value, onChange }: { label: string; opts: { mode: ReframeAxisMode; label: string }[]; value: ReframeAxisMode; onChange: (m: ReframeAxisMode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-caption text-slate-500 w-14 flex-shrink-0">{label}</label>
      <div className="flex flex-1 rounded border border-hairline overflow-hidden">
        {opts.map((o) => (
          <button
            key={o.mode}
            onClick={() => onChange(o.mode)}
            className={`flex-1 text-[9px] py-1 transition-colors ${value === o.mode ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-400 hover:text-slate-200'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConstraintsSection({ layer }: { layer: Layer }) {
  const setLayerConstraints = useEditorStore((s) => s.setLayerConstraints);
  if (layer.parentId !== null) {
    return (
      <Section title="Constraints">
        <div className="text-caption text-slate-500">Pinned to parent — reframe constraints apply to top-level layers only.</div>
      </Section>
    );
  }
  const c = layer.constraints ?? DEFAULT_CONSTRAINTS;
  return (
    <Section title="Constraints">
      <div className="space-y-1.5">
        <ConstraintRow label="Horizontal" opts={H_CONSTRAINT_OPTS} value={c.h} onChange={(m) => setLayerConstraints(layer.id, { h: m })} />
        <ConstraintRow label="Vertical" opts={V_CONSTRAINT_OPTS} value={c.v} onChange={(m) => setLayerConstraints(layer.id, { v: m })} />
        <div className="text-[9px] text-slate-600 pt-0.5">Reflows when the composition frame is resized.</div>
      </div>
    </Section>
  );
}

// M21 — a fill/stroke color row that can LINK to a shared style. When linked, the swatch shows
// the style's color and editing updates the style (→ all referents); a chain menu links to an
// existing style, creates one from the current color, or detaches (bakes the value locally).
function ColorStyleRow({ label, layerId, slot, rawColor, onRawChange }: {
  label: string; layerId: string; slot: 'fill' | 'stroke'; rawColor: Vec4; onRawChange: (v: Vec4) => void;
}) {
  const styles = useEditorStore((s) => s.styles);
  const layer = useEditorStore((s) => s.composition.layers.find((l) => l.id === layerId));
  const createColorStyle = useEditorStore((s) => s.createColorStyle);
  const updateStyleColor = useEditorStore((s) => s.updateStyleColor);
  const linkLayerColorStyle = useEditorStore((s) => s.linkLayerColorStyle);
  const detachLayerColorStyle = useEditorStore((s) => s.detachLayerColorStyle);
  const [open, setOpen] = useState(false);

  const styleId = (layer as { fillStyleId?: string; strokeStyleId?: string } | undefined)?.[slot === 'fill' ? 'fillStyleId' : 'strokeStyleId'];
  const linked = styleId ? styles[styleId] : undefined;
  const linkedColor = linked?.value.kind === 'color' ? linked.value.color : undefined;
  const eff = linkedColor ?? rawColor;
  const colorStyles = Object.values(styles).filter((s) => s.type === 'color');
  const swatch = (c: Vec4) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;

  return (
    <div className="relative flex items-center gap-1">
      <div className="flex-1">
        <ColorInput label={label} value={eff} onChange={(v) => (linked && styleId ? updateStyleColor(styleId, v) : onRawChange(v))} />
      </div>
      <button onClick={() => setOpen((o) => !o)} title="Link to style" className={`p-1 rounded hover:bg-white/5 ${linked ? 'text-cyan-400' : 'text-slate-600'}`}><Link2 size={12} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-canvas-banner" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-50 w-44 bg-surface-2 border border-hairline rounded-md shadow-overlay p-1 text-caption">
            {linked && <div className="px-1.5 py-1 text-slate-500">Linked: {linked.name}</div>}
            <div className="max-h-40 overflow-y-auto">
              {colorStyles.map((s) => (
                <button key={s.id} onClick={() => { linkLayerColorStyle(layerId, slot, s.id); setOpen(false); }} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/5 text-slate-300">
                  <span className="w-3 h-3 rounded-sm border border-hairline" style={{ background: s.value.kind === 'color' ? swatch(s.value.color) : undefined }} />
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { const id = createColorStyle(eff); linkLayerColorStyle(layerId, slot, id); setOpen(false); }} className="w-full text-left px-1.5 py-1 rounded hover:bg-white/5 text-cyan-300">+ New style from color</button>
            {linked && <button onClick={() => { detachLayerColorStyle(layerId, slot); setOpen(false); }} className="w-full text-left px-1.5 py-1 rounded hover:bg-white/5 text-slate-400">Detach</button>}
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline">
      <div className="px-3 py-1.5 bg-surface-sunken">
        <span className="text-overline uppercase tracking-wider text-slate-500 font-medium">{title}</span>
      </div>
      <div className="px-3 py-2 space-y-1">{children}</div>
    </div>
  );
}

function StringInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-caption text-slate-500 w-14 flex-shrink-0">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-surface-3 text-caption text-slate-300 px-1.5 py-0.5 rounded border border-hairline focus:border-accent-dim outline-none"
      />
    </div>
  );
}

function NumberDragInput({
  label, prop, frame, onChange, onKeyframe, hasKeyframe, min, max, step, precision, suffix, defaultValue, propPath,
}: {
  label: string;
  prop: AnimatableProperty;
  frame: number;
  onChange: (v: number) => void;
  onKeyframe: (v: number) => void;
  hasKeyframe: boolean;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  /** When provided, shows a revert-to-default button (active only when the value differs). */
  defaultValue?: number;
  /** Dotted property path (e.g. "transform.opacity") — powers `data-prop` targeting and the
   *  agent-build highlight ring. */
  propPath?: string;
}) {
  const val = evaluateProperty(prop, frame) as number;
  const highlighted = useAgentBuildStore((s) => s.highlightPropPath) === propPath && !!propPath;

  const handleChange = (v: number) => {
    if (prop.keyframes.length > 0) onKeyframe(v);
    else onChange(v);
  };

  const canRevert = defaultValue !== undefined && Math.abs(val - defaultValue) > 1e-6;

  return (
    <div
      data-prop={propPath}
      className={`flex items-center gap-0.5 rounded transition-shadow ${highlighted ? 'ring-2 ring-accent shadow-[0_0_12px_2px_#f7b50055]' : ''}`}
    >
      <DragInput
        label={label}
        value={val}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        precision={precision}
        suffix={suffix}
        className="flex-1"
      />
      {defaultValue !== undefined && (
        <RevertButton canRevert={canRevert} onRevert={() => handleChange(defaultValue)} />
      )}
      <button
        onClick={() => onKeyframe(val)}
        className={`p-0.5 rounded transition-colors flex-shrink-0 ${hasKeyframe ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
        title="Add keyframe"
      >
        <Diamond size={10} fill={hasKeyframe ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

// Small revert-to-default control shared by the transform inputs. Dimmed when already at default.
function RevertButton({ canRevert, onRevert }: { canRevert: boolean; onRevert: () => void }) {
  return (
    <button
      onClick={canRevert ? onRevert : undefined}
      disabled={!canRevert}
      className={`p-0.5 rounded transition-colors flex-shrink-0 ${canRevert ? 'text-slate-500 hover:text-amber-400' : 'text-slate-700 cursor-default'}`}
      title={canRevert ? 'Revert to default' : 'Already at default'}
    >
      <RotateCcw size={10} />
    </button>
  );
}

function Vec2DragInput({
  label, prop, frame, onChangeValue, onKeyframe, hasKeyframe, step, precision, labels, defaultValue, propPath,
}: {
  label: string;
  prop: AnimatableProperty;
  frame: number;
  onChangeValue: (v: Vec2) => void;
  onKeyframe: (v: Vec2) => void;
  hasKeyframe: boolean;
  step?: number;
  precision?: number;
  labels?: [string, string];
  /** When provided, shows a revert-to-default button (active only when the value differs). */
  defaultValue?: Vec2;
  /** Dotted property path (e.g. "transform.position") — powers `data-prop` targeting and the
   *  agent-build highlight ring. */
  propPath?: string;
}) {
  const raw = evaluateProperty(prop, frame) as Vec2 | null;
  const val: Vec2 = raw ?? [0, 0];
  const highlighted = useAgentBuildStore((s) => s.highlightPropPath) === propPath && !!propPath;

  const handleChange = (idx: number, v: number) => {
    const newVal: Vec2 = [...val];
    newVal[idx] = v;
    if (prop.keyframes.length > 0) onKeyframe(newVal);
    else onChangeValue(newVal);
  };

  const revert = () => {
    if (!defaultValue) return;
    if (prop.keyframes.length > 0) onKeyframe([...defaultValue]);
    else onChangeValue([...defaultValue]);
  };
  const canRevert = !!defaultValue && (Math.abs(val[0] - defaultValue[0]) > 1e-6 || Math.abs(val[1] - defaultValue[1]) > 1e-6);

  return (
    <div
      data-prop={propPath}
      className={`flex items-center gap-0.5 rounded transition-shadow ${highlighted ? 'ring-2 ring-accent shadow-[0_0_12px_2px_#f7b50055]' : ''}`}
    >
      <span className="text-caption text-slate-500 w-14 flex-shrink-0">{label}</span>
      <div className="flex-1 flex gap-1 min-w-0">
        <div className="flex-1 flex items-center gap-0.5 min-w-0">
          {labels && <span className="text-[9px] text-slate-600">{labels[0]}</span>}
          <DragInput value={val[0]} onChange={(v) => handleChange(0, v)} step={step} precision={precision} className="flex-1" />
        </div>
        <div className="flex-1 flex items-center gap-0.5 min-w-0">
          {labels && <span className="text-[9px] text-slate-600">{labels[1]}</span>}
          <DragInput value={val[1]} onChange={(v) => handleChange(1, v)} step={step} precision={precision} className="flex-1" />
        </div>
      </div>
      {defaultValue && <RevertButton canRevert={canRevert} onRevert={revert} />}
      <button
        onClick={() => onKeyframe(val)}
        className={`p-0.5 rounded transition-colors flex-shrink-0 ${hasKeyframe ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
        title="Add keyframe"
      >
        <Diamond size={10} fill={hasKeyframe ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function ColorInput({
  label, value, onChange,
}: {
  label: string;
  value: [number, number, number, number];
  onChange: (v: [number, number, number, number]) => void;
}) {
  const hex = `#${value.slice(0, 3).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;

  return (
    <div className="flex items-center gap-1">
      <label className="text-caption text-slate-500 w-14 flex-shrink-0">{label}</label>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const h = e.target.value;
          const r = parseInt(h.slice(1, 3), 16) / 255;
          const g = parseInt(h.slice(3, 5), 16) / 255;
          const b = parseInt(h.slice(5, 7), 16) / 255;
          onChange([r, g, b, value[3]]);
        }}
        className="w-6 h-5 bg-transparent border-0 cursor-pointer p-0"
      />
      <span className="text-caption text-slate-500 font-mono flex-1">{hex}</span>
      <BrandColorPicker onSelect={onChange} currentAlpha={value[3]} />
    </div>
  );
}

const ANCHOR_OPTIONS: { value: MotionPathAnchor; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'topLeft', label: 'Top Left' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'bottomRight', label: 'Bottom Right' },
];

const LOOP_OPTIONS: { value: MotionPathLoop; label: string }[] = [
  { value: 'none', label: 'No Loop' },
  { value: 'loop', label: 'Loop' },
  { value: 'pingPong', label: 'Ping Pong' },
];

function MaskSection({ layerId, currentFrame }: { layerId: string; currentFrame: number }) {
  const composition = useEditorStore((s) => s.composition);
  const addMask = useEditorStore((s) => s.addMask);
  const removeMask = useEditorStore((s) => s.removeMask);
  const updateMaskProperty = useEditorStore((s) => s.updateMaskProperty);
  const addMaskKeyframe = useEditorStore((s) => s.addMaskKeyframe);
  const duplicateMask = useEditorStore((s) => s.duplicateMask);
  const reorderMask = useEditorStore((s) => s.reorderMask);
  const selectedMaskId = useMaskStore((s) => s.selectedMaskId);
  const setSelectedMaskId = useMaskStore((s) => s.setSelectedMaskId);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const layer = composition.layers.find((l) => l.id === layerId);
  const masks: Mask[] = layer && 'masks' in layer && Array.isArray(layer.masks) ? layer.masks : [];
  const mask = masks.find((m) => m.id === selectedMaskId) ?? null;

  const MASK_TYPES: { type: MaskType; label: string; icon: typeof Square }[] = [
    { type: 'rectangle', label: 'Rectangle', icon: Square },
    { type: 'ellipse', label: 'Ellipse', icon: Circle },
    { type: 'star', label: 'Star', icon: Star },
    { type: 'polygon', label: 'Polygon', icon: Hexagon },
  ];

  const handleAdd = (type: MaskType) => {
    addMask(layerId, type);
    setAddMenuOpen(false);
    setTimeout(() => {
      const l = useEditorStore.getState().composition.layers.find((x) => x.id === layerId);
      const ms = l && 'masks' in l && Array.isArray(l.masks) ? l.masks : [];
      const created = ms[ms.length - 1];
      if (created) setSelectedMaskId(created.id);
    }, 0);
  };

  const hasKf = (prop: AnimatableProperty) => prop.keyframes.some((k) => k.frame === currentFrame);

  return (
    <Section title="Masks">
      <div className="space-y-2">
        {/* Mask list */}
        <div className="rounded border border-hairline bg-[#0d1f38] overflow-visible relative">
          {masks.length === 0 ? (
            <div className="px-2 py-3 text-center text-caption text-slate-500">No masks</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {masks.map((m, idx) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMaskId(m.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border-b border-hairline last:border-b-0 transition-colors ${
                    m.id === selectedMaskId
                      ? 'bg-yellow-500/10'
                      : 'hover:bg-[#162a4a]'
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); updateMaskProperty(layerId, m.id, 'enabled', !m.enabled); }}
                    className="text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {m.enabled !== false ? <Eye size={10} /> : <EyeOff size={10} />}
                  </button>
                  <span className={`flex-1 text-caption truncate ${m.id === selectedMaskId ? 'text-yellow-300' : 'text-slate-300'}`}>
                    {m.name || `Mask ${idx + 1}`}
                  </span>
                  <span className="text-[9px] text-slate-500 capitalize">{m.type}</span>
                </div>
              ))}
            </div>
          )}
          {/* Add mask toolbar */}
          <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-hairline bg-surface-1">
            <div className="relative">
              <button
                onClick={() => setAddMenuOpen(!addMenuOpen)}
                className="p-1 rounded text-slate-400 hover:text-yellow-300 hover:bg-yellow-500/10 transition-colors"
                title="Add mask"
              >
                <Plus size={11} />
              </button>
              {addMenuOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[#0d1f38] border border-hairline rounded shadow-overlay py-0.5 min-w-[100px]">
                  {MASK_TYPES.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => handleAdd(type)}
                      className="flex items-center gap-1.5 w-full px-2 py-1 text-caption text-slate-300 hover:bg-yellow-500/10 hover:text-yellow-300 transition-colors"
                    >
                      <Icon size={10} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {mask && (
              <>
                <button
                  onClick={() => duplicateMask(layerId, mask.id)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#162a4a] transition-colors"
                  title="Duplicate"
                >
                  <Copy size={10} />
                </button>
                <button
                  onClick={() => reorderMask(layerId, mask.id, 'up')}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#162a4a] transition-colors"
                  title="Move up"
                >
                  <ChevronUp size={10} />
                </button>
                <button
                  onClick={() => reorderMask(layerId, mask.id, 'down')}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#162a4a] transition-colors"
                  title="Move down"
                >
                  <ChevronDown size={10} />
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => { setSelectedMaskId(null); removeMask(layerId, mask.id); }}
                  className="p-1 rounded text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Selected mask properties */}
        {mask && (
          <div className="space-y-2 pt-1 border-t border-hairline">
            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Type</label>
              <select
                value={mask.type}
                onChange={(e) => updateMaskProperty(layerId, mask.id, 'type', e.target.value as MaskType)}
                className="flex-1 bg-surface-4 border border-hairline rounded px-1.5 py-0.5 text-caption text-slate-300 outline-none"
              >
                {MASK_TYPES.map((opt) => (
                  <option key={opt.type} value={opt.type}>{opt.label}</option>
                ))}
              </select>
            </div>

            <Vec2DragInput
              label="Position"
              prop={mask.position}
              frame={currentFrame}
              onChangeValue={(v) => updateMaskProperty(layerId, mask.id, 'position.defaultValue', v)}
              onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'position', currentFrame, v)}
              hasKeyframe={hasKf(mask.position)}
              labels={['X', 'Y']}
            />
            <Vec2DragInput
              label="Size"
              prop={mask.size}
              frame={currentFrame}
              onChangeValue={(v) => updateMaskProperty(layerId, mask.id, 'size.defaultValue', [Math.max(1, v[0]), Math.max(1, v[1])])}
              onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'size', currentFrame, [Math.max(1, v[0]), Math.max(1, v[1])])}
              hasKeyframe={hasKf(mask.size)}
              labels={['W', 'H']}
            />
            <NumberDragInput
              label="Rotation"
              prop={mask.rotation}
              frame={currentFrame}
              onChange={(v) => updateMaskProperty(layerId, mask.id, 'rotation.defaultValue', v)}
              onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'rotation', currentFrame, v)}
              hasKeyframe={hasKf(mask.rotation)}
              suffix="deg"
              step={0.5}
            />
            <NumberDragInput
              label="Feather"
              prop={mask.feather}
              frame={currentFrame}
              onChange={(v) => updateMaskProperty(layerId, mask.id, 'feather.defaultValue', v)}
              onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'feather', currentFrame, v)}
              hasKeyframe={hasKf(mask.feather)}
              min={0}
              step={0.5}
            />
            <NumberDragInput
              label="Opacity"
              prop={mask.opacity}
              frame={currentFrame}
              onChange={(v) => updateMaskProperty(layerId, mask.id, 'opacity.defaultValue', v)}
              onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'opacity', currentFrame, v)}
              hasKeyframe={hasKf(mask.opacity)}
              min={0}
              max={1}
              step={0.01}
              precision={2}
            />

            {(mask.type === 'star' || mask.type === 'polygon') && (
              <div className="flex items-center gap-1">
                <label className="text-caption text-slate-500 w-14 flex-shrink-0">Points</label>
                <DragInput
                  value={mask.points}
                  onChange={(v) => updateMaskProperty(layerId, mask.id, 'points', Math.max(3, Math.round(v)))}
                  min={3}
                  step={1}
                  precision={0}
                  className="flex-1"
                />
              </div>
            )}

            {mask.type === 'star' && (
              <NumberDragInput
                label="Inner R"
                prop={mask.innerRadius}
                frame={currentFrame}
                onChange={(v) => updateMaskProperty(layerId, mask.id, 'innerRadius.defaultValue', v)}
                onKeyframe={(v) => addMaskKeyframe(layerId, mask.id, 'innerRadius', currentFrame, v)}
                hasKeyframe={hasKf(mask.innerRadius)}
                min={0}
                step={0.5}
              />
            )}

            <div className="flex items-center gap-1">
              <label className="text-caption text-slate-500 w-14 flex-shrink-0">Invert</label>
              <button
                onClick={() => updateMaskProperty(layerId, mask.id, 'inverted', !mask.inverted)}
                className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                  mask.inverted
                    ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
                    : 'bg-surface-4 border-hairline text-slate-400 hover:border-yellow-500/30'
                }`}
              >
                {mask.inverted ? 'Inverted' : 'Normal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function MotionPathSection({ layerId }: { layerId: string }) {
  const composition = useEditorStore((s) => s.composition);
  const addMotionPath = useEditorStore((s) => s.addMotionPath);
  const removeMotionPath = useEditorStore((s) => s.removeMotionPath);
  const updateMotionPath = useEditorStore((s) => s.updateMotionPath);
  const setEditMode = useMotionPathStore((s) => s.setEditMode);
  const setActivePathId = useMotionPathStore((s) => s.setActivePathId);
  const editMode = useMotionPathStore((s) => s.editMode);

  const paths = (composition.motionPaths || []).filter((p) => p.layerId === layerId);
  const activePath = paths[0] ?? null;

  const handleCreate = () => {
    addMotionPath(layerId);
    setTimeout(() => {
      const newPaths = useEditorStore.getState().composition.motionPaths.filter((p) => p.layerId === layerId);
      const created = newPaths[newPaths.length - 1];
      if (created) {
        setActivePathId(created.id);
        setEditMode('creating');
      }
    }, 0);
  };

  const handleDelete = () => {
    if (!activePath) return;
    setEditMode('idle');
    setActivePathId(null);
    removeMotionPath(activePath.id);
  };

  const handleToggleEdit = () => {
    if (!activePath) return;
    if (editMode === 'creating') {
      setEditMode('editing');
    } else if (editMode === 'editing') {
      setEditMode('idle');
      setActivePathId(null);
    } else {
      setActivePathId(activePath.id);
      setEditMode('editing');
    }
  };

  const handleSmooth = () => {
    if (!activePath || activePath.nodes.length < 2) return;
    const smoothed = smoothEntirePath(activePath);
    updateMotionPath(activePath.id, { nodes: smoothed });
  };

  return (
    <Section title="Motion Path">
      {!activePath ? (
        <button
          onClick={handleCreate}
          className="w-full px-2 py-1.5 text-caption rounded bg-accent-wash border border-accent-dim text-accent hover:bg-accent-wash transition-colors flex items-center justify-center gap-1.5"
        >
          <Route size={11} />
          Create Motion Path
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleEdit}
              className={`flex-1 px-2 py-1 text-[9px] rounded border transition-colors ${
                editMode !== 'idle'
                  ? 'bg-accent-wash border-accent-dim text-accent-hover'
                  : 'bg-surface-4 border-hairline text-slate-400 hover:border-accent-dim'
              }`}
            >
              {editMode === 'creating' ? 'Adding Points...' : editMode === 'editing' ? 'Editing...' : 'Edit Path'}
            </button>
            <button
              onClick={handleSmooth}
              className="px-2 py-1 text-[9px] rounded bg-surface-4 border border-hairline text-slate-400 hover:border-amber-500/30 hover:text-amber-300 transition-colors"
              title="Auto Smooth"
            >
              <Wand2 size={10} />
            </button>
            <button
              onClick={handleDelete}
              className="px-2 py-1 text-[9px] rounded bg-surface-4 border border-hairline text-slate-400 hover:border-red-500/30 hover:text-red-300 transition-colors"
              title="Delete Path"
            >
              <Trash2 size={10} />
            </button>
          </div>

          <div className="flex items-center gap-1 text-[9px] text-slate-500">
            <span>{activePath.nodes.length} nodes</span>
            <span className="text-slate-700">|</span>
            <span>{activePath.closed ? 'Closed' : 'Open'}</span>
          </div>

          {/* Anchor */}
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-slate-500 w-14 flex-shrink-0">Anchor</label>
            <select
              value={activePath.anchor}
              onChange={(e) => updateMotionPath(activePath.id, { anchor: e.target.value as MotionPathAnchor })}
              className="flex-1 bg-surface-4 border border-hairline rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none"
            >
              {ANCHOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Loop */}
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-slate-500 w-14 flex-shrink-0">Loop</label>
            <select
              value={activePath.loop}
              onChange={(e) => updateMotionPath(activePath.id, { loop: e.target.value as MotionPathLoop })}
              className="flex-1 bg-surface-4 border border-hairline rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none"
            >
              {LOOP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Orient to Path */}
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-slate-500 w-14 flex-shrink-0">Orient</label>
            <button
              onClick={() => updateMotionPath(activePath.id, { orientToPath: !activePath.orientToPath })}
              className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                activePath.orientToPath
                  ? 'bg-accent-wash border-accent-dim text-accent-hover'
                  : 'bg-surface-4 border-hairline text-slate-500'
              }`}
            >
              Orient to Path
            </button>
          </div>

          {/* Close path toggle */}
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-slate-500 w-14 flex-shrink-0">Closed</label>
            <button
              onClick={() => updateMotionPath(activePath.id, { closed: !activePath.closed })}
              className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                activePath.closed
                  ? 'bg-accent-wash border-accent-dim text-accent-hover'
                  : 'bg-surface-4 border-hairline text-slate-500'
              }`}
            >
              {activePath.closed ? 'Closed' : 'Open'}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

