import type { Vec4, TextSpanStyle, LayerShadow, LayerGlow, LayerBlur } from './types';

// M21 — Shared linked styles. Named, reusable style definitions on the SceneDocument that layers
// LINK to by id; the renderer reads THROUGH the style at resolve time (edit the definition → every
// referent updates, for free, with no propagation pass and no stale copies). v1 ships COLOR styles
// (shape + text fill/stroke); text-font and effect styles are the same mechanism extended (types
// carried here already). Pure + deterministic — proven by scripts/verify-styles.mjs.

export type SharedStyleType = 'color' | 'text' | 'effect';

export type SharedStyleValue =
  | { kind: 'color'; color: Vec4 }
  | { kind: 'text'; text: Partial<Omit<TextSpanStyle, 'color' | 'strokeColor'>> }
  | { kind: 'effect'; shadow?: LayerShadow; glow?: LayerGlow; blur?: LayerBlur };

export interface SharedStyle {
  id: string;
  name: string;
  type: SharedStyleType;
  value: SharedStyleValue;
}

export type StyleLookup = (id: string) => SharedStyle | undefined;

const v4 = (c: Vec4): Vec4 => [c[0] + 0, c[1] + 0, c[2] + 0, c[3] + 0];

/**
 * Resolve a color slot through its linked style: the style's current color when linked to a valid
 * color style, else the layer's raw value (unlinked / missing / wrong-type all fall back to raw).
 */
export function resolveStyleColor(styleId: string | undefined, raw: Vec4, getStyle?: StyleLookup): Vec4 {
  if (!styleId || !getStyle) return raw;
  const s = getStyle(styleId);
  if (!s || s.value.kind !== 'color') return raw;
  return v4(s.value.color);
}

/**
 * The value to BAKE when detaching (Figma-style): the style's current color when linked & valid,
 * else the raw value. Keeps the layer's appearance while dropping the link.
 */
export function detachStyleValue(styleId: string | undefined, raw: Vec4, getStyle?: StyleLookup): Vec4 {
  return resolveStyleColor(styleId, raw, getStyle);
}
