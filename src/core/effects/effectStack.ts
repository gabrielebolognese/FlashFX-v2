// Pure effect-stack helpers (B11a). The per-layer effect stack is an ordered `LayerEffect[]`; these
// functions resolve it for a frame and clone/sanitize it for the effect-preset system. Leaf module:
// imports only types, so it bundles in a node harness (`verify:effects`). The GPU that draws the
// effects is unchanged; this only decides which effects (in what order) reach the renderer.

import type { LayerEffect, ResolvedEffect } from '../types';

/**
 * Resolve a layer's effect stack for rendering: honors the per-layer master switch (`effectsEnabled`)
 * AND each effect's own `enabled` flag, preserving stack ORDER. `effectsEnabled === false` disables
 * the whole stack (previously this switch was a no-op). Params are copied through (static for now).
 */
export function resolveEffectStack(effects: LayerEffect[] | undefined, effectsEnabled: boolean): ResolvedEffect[] {
  if (!effectsEnabled || !effects || effects.length === 0) return [];
  const out: ResolvedEffect[] = [];
  for (const e of effects) {
    if (e.enabled === false) continue;
    out.push({ type: e.type, params: e.params.slice() });
  }
  return out;
}

/** Deep-clone an effect stack (for saving/applying a preset) so the copy shares no array references. */
export function cloneEffectStack(effects: LayerEffect[]): LayerEffect[] {
  return effects.map((e) => ({ type: e.type, enabled: e.enabled !== false, params: e.params.slice() }));
}

/**
 * Sanitize an untrusted effect stack (e.g. a preset loaded from localStorage): keep only entries with
 * a numeric `type` and a numeric params array, coerce `enabled`, and clamp params to at most 7 (the
 * shader's per-slot capacity). Returns a fresh array safe to apply to a layer.
 */
export function sanitizeEffectStack(raw: unknown): LayerEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: LayerEffect[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.type !== 'number' || !Number.isFinite(r.type)) continue;
    const params = Array.isArray(r.params)
      ? r.params.filter((p): p is number => typeof p === 'number' && Number.isFinite(p)).slice(0, 7)
      : [];
    out.push({ type: r.type, enabled: r.enabled !== false, params });
  }
  return out;
}
