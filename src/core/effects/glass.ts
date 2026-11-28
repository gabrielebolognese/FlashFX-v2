// B38 frosted / liquid glass on shape layers (pure: types + the property factory only).
//
// A glass shape blurs the composite BELOW it inside its own outline. Rather than a new pipeline the
// renderer reuses the adjustment-layer multipass (B11b-gpu): just before the shape it inserts the
// adjustment pass `glassAdjustmentLayer` builds here - basic filters (brightness / saturation) on the
// copied composite below, the layer Blur (gaussian, split plan) over that, then the mix-only step mixes
// the blurred backdrop back by opacity x an OUTLINE MASK that traces the shape (rounded rectangle via
// a rectangle mask grown by its corner radius - the mask SDF is exact, so the corners follow; circle /
// star as the matching parametric mask; a path as a freeform mask in the shape's own local frame). The
// glass mix step adds two things an ordinary adjustment does not have, both driven by the outline
// mask's signed distance + outward normal (core/maskCoverage maskStackField = the shader's
// computeMaskStack): a rim BEND (the blurred backdrop is sampled up to `refraction` px further out near
// the edge, fading in over `edgeWidth` px) and a rim HIGHLIGHT lit from `lightAngle`. The shape itself
// then draws on top unchanged: its fill is the tint, its stroke the light edge.
//
// `glassMixPixel` is the CPU twin of the WGSL glass branch in the adjustment shader's mix-only
// prologue (engine/renderer.ts ADJUST_FS_PROLOGUE); verify:glass + gpu:glass hold them together.

import type { AnimatableProperty, GlassMixParams, ResolvedGlass, ResolvedLayer, ResolvedMask, ResolvedShape, ResolvedTransform, ShapeGlass } from '../types';
import type { MaskField } from '../refineEdge';
import { createProperty } from '../factory';
import { IDENTITY_FILTERS, type RGBA } from './adjustmentComposite';
import { shapeSdfParams } from '../shapeSdf';

export const GLASS_DEFAULTS = {
  blur: 18,
  refraction: 8,
  highlight: 0.35,
  lightAngle: -120,
  edgeWidth: 16,
  brightness: 0.06,
  saturation: 0.15,
} as const;

/** Anti-aliasing half-width of the outline mask edge, px (the shape's own SDF edge is ~1 px wide). */
export const GLASS_EDGE_FEATHER = 0.75;
/** The rim opposite the light gets this fraction of the highlight (a softer back reflection). */
export const GLASS_BACK_RIM = 0.35;
/** Id suffix of the synthesized pass (never a real layer id: real ids carry no '#glass'). */
export const GLASS_PASS_SUFFIX = '#glass';

/** The partial input an agent / the UI passes (numbers for the keyframable fields set their base). */
export interface ShapeGlassInput {
  enabled?: boolean;
  blur?: number;
  refraction?: number;
  highlight?: number;
  lightAngle?: number;
  edgeWidth?: number;
  brightness?: number;
  saturation?: number;
}

const fin = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Range rules shared by the store setter, the validator and the resolver. */
export function clampGlassField(key: keyof ShapeGlassInput, v: number): number {
  switch (key) {
    case 'blur': return clamp(v, 0, 200);
    case 'refraction': return clamp(v, -200, 200);
    case 'highlight': return clamp(v, 0, 1);
    case 'edgeWidth': return clamp(v, 0, 1000);
    case 'brightness': case 'saturation': return clamp(v, -1, 1);
    default: return v;
  }
}

function withBase(prop: AnimatableProperty, v: number): AnimatableProperty {
  return { ...prop, defaultValue: v };
}

/**
 * Apply a partial input onto an existing glass (or the defaults). A number for a keyframable field sets
 * its base value and keeps its keyframes. Invalid numbers are ignored; values are clamped.
 */
export function applyShapeGlassInput(prev: ShapeGlass | undefined, input: ShapeGlassInput): ShapeGlass {
  const g: ShapeGlass = prev ?? {
    enabled: true,
    blur: createProperty('Glass Blur', 'number', GLASS_DEFAULTS.blur),
    refraction: createProperty('Glass Refraction', 'number', GLASS_DEFAULTS.refraction),
    highlight: createProperty('Glass Highlight', 'number', GLASS_DEFAULTS.highlight),
    lightAngle: createProperty('Glass Light Angle', 'number', GLASS_DEFAULTS.lightAngle),
    edgeWidth: GLASS_DEFAULTS.edgeWidth,
    brightness: GLASS_DEFAULTS.brightness,
    saturation: GLASS_DEFAULTS.saturation,
  };
  const out: ShapeGlass = { ...g };
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
  for (const k of ['blur', 'refraction', 'highlight', 'lightAngle'] as const) {
    const v = input[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = withBase(g[k], clampGlassField(k, v));
  }
  for (const k of ['edgeWidth', 'brightness', 'saturation'] as const) {
    const v = input[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampGlassField(k, v);
  }
  return out;
}

/**
 * Rebuild a persisted glass (project load). `ensureProp` is the loader's AnimatableProperty sanitizer.
 * Returns undefined for anything that is not an object (the field is then dropped).
 */
export function sanitizeShapeGlass(
  raw: unknown,
  ensureProp: (val: unknown, name: string, def: number) => AnimatableProperty,
): ShapeGlass | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    blur: ensureProp(r.blur, 'Glass Blur', GLASS_DEFAULTS.blur),
    refraction: ensureProp(r.refraction, 'Glass Refraction', GLASS_DEFAULTS.refraction),
    highlight: ensureProp(r.highlight, 'Glass Highlight', GLASS_DEFAULTS.highlight),
    lightAngle: ensureProp(r.lightAngle, 'Glass Light Angle', GLASS_DEFAULTS.lightAngle),
    edgeWidth: clampGlassField('edgeWidth', fin(r.edgeWidth, GLASS_DEFAULTS.edgeWidth)),
    brightness: clampGlassField('brightness', fin(r.brightness, GLASS_DEFAULTS.brightness)),
    saturation: clampGlassField('saturation', fin(r.saturation, GLASS_DEFAULTS.saturation)),
  };
}

/** Resolve a shape's glass for a frame (`evalNum` is the resolver's evaluateNumber). Disabled /
 *  absent = undefined (the shape renders exactly as without glass). */
export function resolveShapeGlass(g: ShapeGlass | undefined, evalNum: (p: AnimatableProperty) => number): ResolvedGlass | undefined {
  if (!g || g.enabled === false) return undefined;
  const ev = (p: AnimatableProperty | undefined, d: number): number => (p && Array.isArray(p.keyframes) ? fin(evalNum(p), d) : d);
  return {
    blur: clampGlassField('blur', ev(g.blur, GLASS_DEFAULTS.blur)),
    refraction: clampGlassField('refraction', ev(g.refraction, GLASS_DEFAULTS.refraction)),
    highlight: clampGlassField('highlight', ev(g.highlight, GLASS_DEFAULTS.highlight)),
    lightAngle: ev(g.lightAngle, GLASS_DEFAULTS.lightAngle),
    edgeWidth: clampGlassField('edgeWidth', fin(g.edgeWidth, GLASS_DEFAULTS.edgeWidth)),
    brightness: clampGlassField('brightness', fin(g.brightness, GLASS_DEFAULTS.brightness)),
    saturation: clampGlassField('saturation', fin(g.saturation, GLASS_DEFAULTS.saturation)),
  };
}

/** Composition-space centre of the shape's local origin: the quad / path shaders place local p at
 *  R(p - anchor) + anchor + position. */
function shapeOrigin(t: ResolvedTransform): [number, number] {
  const a = (t.rotation * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const ax = t.anchorX, ay = t.anchorY;
  return [t.positionX + ax - (ax * c - ay * s), t.positionY + ay - (ax * s + ay * c)];
}

function baseMask(t: ResolvedTransform): ResolvedMask {
  const [cx, cy] = shapeOrigin(t);
  return {
    type: 'rectangle', centerX: cx, centerY: cy, sizeX: 0, sizeY: 0, rotation: t.rotation,
    feather: GLASS_EDGE_FEATHER, invert: false, opacity: 1, points: 0, innerRadius: 0, mode: 'add',
  };
}

/**
 * The outline mask that traces a resolved shape exactly as the B63 SDF shape pipeline draws it
 * (core/shapeSdf.ts shapeSdfParams: the same box, the true circle / ellipse radii, corner radii scaled
 * with the layer and clamped to half the short side; the path pipeline's vertex transform for paths).
 * null when there is no area. Per-corner radii use the largest corner (a rectangle mask has one radius).
 */
export function glassOutlineMask(shape: ResolvedShape, t: ResolvedTransform): ResolvedMask | null {
  const m = baseMask(t);
  if (shape.renderType === 'polygon') {
    if (!Array.isArray(shape.vertices) || shape.vertices.length < 3) return null;
    // Vertices stay in the shape's px frame: with size = scale the mask's local -> comp map
    // (position + R(rotation)(local * size)) is exactly the path shader's.
    return { ...m, sizeX: t.scaleX, sizeY: t.scaleY, vertices: shape.vertices, feathers: shape.vertices.map(() => GLASS_EDGE_FEATHER) };
  }
  const p = shapeSdfParams(shape, t.scaleX, t.scaleY);
  const w = Math.abs(p.boxW);
  const h = Math.abs(p.boxH);
  if (shape.renderType === 'star') {
    const [points, outer, inner] = p.star;
    if (!(outer > 0) || points < 2) return null;
    return { ...m, type: 'star', sizeX: 2 * outer, sizeY: 2 * outer, points, innerRadius: inner };
  }
  if (!(w > 0 && h > 0)) return null;
  if (shape.renderType === 'circle') return { ...m, type: 'ellipse', sizeX: w, sizeY: h };
  const r = clamp(Math.max(...p.radii), 0, Math.min(w, h) / 2);
  return { ...m, type: 'rectangle', sizeX: w - 2 * r, sizeY: h - 2 * r, expansion: r };
}

/**
 * The adjustment pass a glass shape adds just below itself, or null (no glass, a 3D / corner-pinned /
 * matte layer, nothing visible). Its masks are the outline (mode add) followed by the shape's own masks.
 */
export function glassAdjustmentLayer(layer: ResolvedLayer): ResolvedLayer | null {
  const g = layer.glass;
  if (!g || !layer.shape || layer.is3D || layer.cornerPin || layer.consumedAsMatte || layer.matte) return null;
  if (!(layer.transform.opacity > 0)) return null;
  const outline = glassOutlineMask(layer.shape, layer.transform);
  if (!outline) return null;
  const glass: GlassMixParams = { refraction: g.refraction, edgeWidth: g.edgeWidth, highlight: g.highlight, lightAngle: g.lightAngle };
  return {
    id: `${layer.id}${GLASS_PASS_SUFFIX}`,
    visible: true,
    blendMode: 'normal',
    transform: { ...layer.transform },
    masks: [outline, ...(layer.masks ?? [])],
    // Always the split plan (apply -> blur -> mix): the rim bend + highlight live in the mix step.
    blur: { type: 'gaussian', radius: g.blur, angle: 0, centerX: 0.5, centerY: 0.5, strength: 0, passes: 1 },
    adjustment: {
      effects: [],
      filters: { ...IDENTITY_FILTERS, brightness: g.brightness, saturation: g.saturation },
      coveredLayerIds: [],
      noOp: false,
      glass,
    },
    layerType: 'adjustment',
  };
}

/** Rim weight 0..1: 1 on the outline, 0 at `edgeWidth` px inside (and where no edge is near). */
export function glassRim(sd: number, edgeWidth: number): number {
  if (!(edgeWidth > 0)) return 0;
  return 1 - clamp01(-sd / edgeWidth);
}

/** The bend offset (px) and highlight amount at a point of the outline field. */
export function glassRimTerms(field: MaskField, g: GlassMixParams): { ox: number; oy: number; light: number } {
  if (!(g.edgeWidth > 0)) return { ox: 0, oy: 0, light: 0 };
  const rim = glassRim(field.sd, g.edgeWidth);
  const bend = g.refraction * rim * rim;
  const a = (g.lightAngle * Math.PI) / 180;
  const d = field.gx * Math.cos(a) + field.gy * Math.sin(a);
  const r2 = rim * rim;
  const light = g.highlight * r2 * r2 * (Math.max(d, 0) + GLASS_BACK_RIM * Math.max(-d, 0));
  return { ox: field.gx * bend, oy: field.gy * bend, light };
}

/**
 * CPU twin of the glass mix step. `below` = the untouched composite at this pixel (premultiplied),
 * `fxAt(px, py)` samples the filtered + blurred backdrop at a pixel-space point (texel centres at +0.5,
 * bilinear, clamp to edge), (px, py) = this pixel's centre, `field` = the mask stack field there (band
 * = edgeWidth), `opacity` = the shape's opacity.
 */
export function glassMixPixel(below: RGBA, fxAt: (px: number, py: number) => RGBA, px: number, py: number, field: MaskField, opacity: number, g: GlassMixParams): RGBA {
  const k = clamp01(opacity * field.alpha);
  const { ox, oy, light } = glassRimTerms(field, g);
  const fx = fxAt(px + ox, py + oy);
  const a = fx[3];
  const lit: RGBA = [Math.min(fx[0] + light * a, a), Math.min(fx[1] + light * a, a), Math.min(fx[2] + light * a, a), a];
  return [below[0] + (lit[0] - below[0]) * k, below[1] + (lit[1] - below[1]) * k, below[2] + (lit[2] - below[2]) * k, below[3] + (lit[3] - below[3]) * k];
}
