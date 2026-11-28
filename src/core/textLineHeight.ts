import type { Layer } from './types';

/** B72: a base-span lineHeight write (`content.spans[0].style.lineHeight`, dotted or bracketed) also sets the
 *  unkeyed animOverrides.lineHeight the renderer reads. Keyed overrides win and are left alone. */
export function mirrorSpanLineHeight(layer: Layer, rawPath: string, rawValue: unknown): Layer {
  if (layer.type !== 'text') return layer;
  if (!/^content\.spans(?:\.0|\[0\])\.style\.lineHeight$/.test(rawPath)) return layer;
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) return layer;
  const lh = layer.animOverrides?.lineHeight;
  if (!lh || lh.keyframes.length > 0 || lh.defaultValue === rawValue) return layer;
  return { ...layer, animOverrides: { ...layer.animOverrides, lineHeight: { ...lh, defaultValue: rawValue } } };
}
