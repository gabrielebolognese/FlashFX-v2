// B77: hold keyframes on a text layer's face (font family / weight / style). At each key's frame the face
// switches (a hold: no in-between) and the layout re-flows, like r10's type-style switcher (f674-735: one
// word cycling through faces). Before the first key the stored span style shows. Every key carries the
// full face (the agent fills missing fields from the previous face), so the font loader's walk over the
// project (engine/fonts.ts collectFontRequests) finds each face and loads it before rendering.
// Frame-pure; leaf module (types only) -> node-harnessable (`verify:text-style-keys`).

import type { FontWeight, TextLayer, TextSpanStyle } from './types';

export interface TextStyleKey {
  frame: number;
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: 'normal' | 'italic';
}

export interface TextStyleKeys {
  keys: TextStyleKey[];
  /** Which span switches (default: every span). */
  spanIndex?: number;
}

type Face = Pick<TextStyleKey, 'fontFamily' | 'fontWeight' | 'fontStyle'>;

/**
 * Sanitize keys (agent args, a loaded project): integer frames, sorted, one key per frame (the last wins),
 * missing face fields inherited from the previous key (the first from `base`). Null when nothing usable.
 */
export function normalizeTextStyleKeys(raw: unknown, base: { fontFamily: string; fontWeight: number; fontStyle?: string }): TextStyleKeys | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { keys?: unknown; spanIndex?: unknown };
  const list = Array.isArray(raw) ? raw : Array.isArray(r.keys) ? r.keys : null;
  if (!list) return null;
  const byFrame = new Map<number, Partial<Face>>();
  for (const k of list) {
    if (!k || typeof k !== 'object') continue;
    const o = k as Record<string, unknown>;
    if (typeof o.frame !== 'number' || !Number.isFinite(o.frame)) continue;
    const part: Partial<Face> = {};
    if (typeof o.fontFamily === 'string' && o.fontFamily.trim()) part.fontFamily = o.fontFamily.trim().slice(0, 80);
    if (typeof o.fontWeight === 'number' && Number.isFinite(o.fontWeight)) part.fontWeight = (Math.min(9, Math.max(1, Math.round(o.fontWeight / 100))) * 100) as FontWeight;
    if (o.fontStyle === 'italic' || o.fontStyle === 'normal') part.fontStyle = o.fontStyle;
    byFrame.set(Math.round(o.frame), part);
  }
  if (byFrame.size === 0) return null;
  const keys: TextStyleKey[] = [];
  let prev: Face = { fontFamily: base.fontFamily, fontWeight: (Math.min(9, Math.max(1, Math.round(base.fontWeight / 100))) * 100) as FontWeight, fontStyle: base.fontStyle === 'italic' ? 'italic' : 'normal' };
  for (const frame of [...byFrame.keys()].sort((a, b) => a - b)) {
    const face: Face = { ...prev, ...byFrame.get(frame) };
    keys.push({ frame, ...face });
    prev = face;
  }
  const spanIndex = !Array.isArray(raw) && typeof r.spanIndex === 'number' && Number.isFinite(r.spanIndex) ? Math.max(0, Math.round(r.spanIndex)) : undefined;
  return spanIndex === undefined ? { keys } : { keys, spanIndex };
}

/** The face in force at `frame` (the last key at or before it), or null before the first key. */
export function styleKeyAt(keys: readonly TextStyleKey[], frame: number): TextStyleKey | null {
  let hit: TextStyleKey | null = null;
  for (const k of keys) {
    if (k.frame <= frame) hit = k; else break;
  }
  return hit;
}

/** The layer as it resolves at `frame` with its style keys applied (same object when none applies). */
export function withTextStyleKeys<L extends { type: string }>(layer: L, frame: number): L {
  if (layer.type !== 'text') return layer;
  const tl = layer as unknown as TextLayer;
  const sk = tl.styleKeys;
  if (!sk || sk.keys.length === 0) return layer;
  const k = styleKeyAt(sk.keys, frame);
  if (!k) return layer;
  const face: Partial<TextSpanStyle> = { fontFamily: k.fontFamily, fontWeight: k.fontWeight, fontStyle: k.fontStyle };
  const spans = tl.content.spans.map((sp, i) => (sk.spanIndex === undefined || i === sk.spanIndex ? { ...sp, style: { ...sp.style, ...face } } : sp));
  return { ...tl, content: { ...tl.content, spans } } as unknown as L;
}
