import type { Layer, Vec4, LayerShadow, LayerGlow, LayerBlur, TextSpanStyle, BlendMode, AnimatableProperty } from './types';

// M11 — Copy/paste properties. Pure appearance-bundle extract/apply, Figma-style:
// copy a layer's look, paste only the props the TARGET type supports (skip the rest).
//
// Why not core/overrides.ts applyOverrides? That applicator is scalar-only (it sets a
// numeric AnimatableProperty defaultValue by dot-path) and can't carry a fillColor Vec4
// or an effect object. Appearance is those objects, so this module owns its own typed
// extract/apply. Pure: never mutates the input; returns a deep clone. Proven by
// scripts/verify-layerprops.mjs.

/** The portable "look" of a layer. Every field is optional — a bundle carries only what
 *  its source had, and apply only sets what the target supports. */
export interface LayerPropertyBundle {
  opacity?: number;
  blendMode?: BlendMode;
  motionBlur?: boolean;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  // Shape appearance (bases of the animatable props; keyframes on the target survive).
  fillColor?: Vec4;
  strokeColor?: Vec4;
  strokeWidth?: number;
  borderRadius?: number;
  // Text appearance (the source's first-span style, applied to every target span).
  textStyle?: TextSpanStyle;
}

/** Layer variants that carry the shared shadow/glow/blur/motionBlur effect fields. */
type EffectCarrier = Layer & { shadow?: LayerShadow; glow?: LayerGlow; blur?: LayerBlur; motionBlur?: boolean };
function hasEffects(l: Layer): l is EffectCarrier {
  return l.type === 'shape' || l.type === 'text' || l.type === 'video' || l.type === 'image' || l.type === 'lottieIcon';
}

/** Any layer carrying a blendMode field (all visual variants). */
type BlendCarrier = Layer & { blendMode?: BlendMode };
function hasBlend(l: Layer): l is BlendCarrier {
  return 'blendMode' in l;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** The appearance the paste would touch, as a list of human labels — drives the UI
 *  (menu enable-state / a "pasted N properties" hint) without re-deriving elsewhere. */
export function bundleLabels(b: LayerPropertyBundle): string[] {
  const out: string[] = [];
  if (b.fillColor) out.push('Fill');
  if (b.strokeColor) out.push('Stroke');
  if (typeof b.strokeWidth === 'number') out.push('Stroke width');
  if (typeof b.borderRadius === 'number') out.push('Corner radius');
  if (typeof b.opacity === 'number') out.push('Opacity');
  if (b.blendMode) out.push('Blend mode');
  if (b.shadow) out.push('Shadow');
  if (b.glow) out.push('Glow');
  if (b.blur) out.push('Blur');
  if (b.textStyle) out.push('Text style');
  return out;
}

/**
 * Snapshot a layer's appearance into a portable bundle. Never mutates `layer`.
 * `evalNumber` (optional) resolves an AnimatableProperty to its value at the copy frame
 * so an animated source copies the value on screen (Figma behaviour); without it the
 * static `defaultValue` base is used (the harness path).
 */
export function extractLayerProperties(layer: Layer, evalNumber?: (p: AnimatableProperty) => number): LayerPropertyBundle {
  const b: LayerPropertyBundle = {};
  const num = (p: AnimatableProperty): number => (evalNumber ? evalNumber(p) : (typeof p.defaultValue === 'number' ? p.defaultValue : 0)) + 0;

  const op = layer.transform?.opacity;
  if (op && op.valueType === 'number') b.opacity = num(op);
  if (hasBlend(layer) && layer.blendMode) b.blendMode = layer.blendMode;

  if (hasEffects(layer)) {
    if (layer.shadow) b.shadow = clone(layer.shadow);
    if (layer.glow) b.glow = clone(layer.glow);
    if (layer.blur) b.blur = clone(layer.blur);
    if (typeof layer.motionBlur === 'boolean') b.motionBlur = layer.motionBlur;
  }

  if (layer.type === 'shape') {
    const s = layer.shape;
    b.fillColor = [...s.fillColor] as Vec4;
    b.strokeColor = [...s.strokeColor] as Vec4;
    if (s.strokeWidth.valueType === 'number') b.strokeWidth = num(s.strokeWidth);
    if (s.type === 'rectangle' && s.borderRadius.valueType === 'number') b.borderRadius = num(s.borderRadius);
  }

  if (layer.type === 'text') {
    const style = layer.content.spans[0]?.style;
    if (style) b.textStyle = clone(style);
  }

  return b;
}

/** Return a deep clone of `layer` with the bundle's supported subset applied. Unsupported
 *  props for this layer type are silently skipped (Figma behaviour). Never mutates input. */
export function applyLayerProperties(layer: Layer, bundle: LayerPropertyBundle): Layer {
  const out = clone(layer);

  const op = out.transform?.opacity;
  if (typeof bundle.opacity === 'number' && op && op.valueType === 'number') {
    op.defaultValue = Math.min(1, Math.max(0, bundle.opacity));
  }
  if (bundle.blendMode && hasBlend(out)) out.blendMode = bundle.blendMode;

  if (hasEffects(out)) {
    if (bundle.shadow) out.shadow = clone(bundle.shadow);
    if (bundle.glow) out.glow = clone(bundle.glow);
    if (bundle.blur) out.blur = clone(bundle.blur);
    if (typeof bundle.motionBlur === 'boolean') out.motionBlur = bundle.motionBlur;
  }

  if (out.type === 'shape') {
    const s = out.shape;
    if (bundle.fillColor) s.fillColor = [...bundle.fillColor] as Vec4;
    if (bundle.strokeColor) s.strokeColor = [...bundle.strokeColor] as Vec4;
    if (typeof bundle.strokeWidth === 'number') s.strokeWidth.defaultValue = bundle.strokeWidth;
    if (s.type === 'rectangle' && typeof bundle.borderRadius === 'number') s.borderRadius.defaultValue = bundle.borderRadius;
  }

  if (out.type === 'text' && bundle.textStyle) {
    for (const span of out.content.spans) span.style = clone(bundle.textStyle);
  }

  return out;
}
