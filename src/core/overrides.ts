// Instance-override mechanism — a sparse per-instance property-override applicator.
//
// This is the primitive Prompt 4's data-bound cloner needed and that a precomp
// instance-override system would reuse: given a layer (or any plain-data domain
// object) and a sparse map of { dotPropertyPath -> value }, return a deep-cloned
// copy with just those properties overridden. Pure, no mutation of the input.
//
// Design notes:
// - Dot paths address nested fields and array indices, e.g. "content.text",
//   "content.spans.0.text", "transform.opacity".
// - When a path lands on an AnimatableProperty, its `defaultValue` (the static base
//   read when there are no keyframes) is set — the property object is NOT replaced,
//   so keyframes/id/name survive.
// - Type-aware + lenient: numeric AnimatableProperty targets coerce the value to a
//   number (skipping non-coercible values); unknown paths are skipped. It never
//   throws — a bad binding degrades to "that property unchanged", not a crash.

import type { AnimatableProperty } from './types';

export type OverrideValue = string | number | boolean;
export type OverrideMap = Record<string, OverrideValue>;

function isAnimatable(v: unknown): v is AnimatableProperty {
  return (
    typeof v === 'object' &&
    v !== null &&
    'keyframes' in v &&
    'defaultValue' in v &&
    'valueType' in v
  );
}

function setOverridePath(root: Record<string, unknown>, path: string, value: OverrideValue): void {
  const keys = path.split('.');
  let cur: unknown = root;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return; // path doesn't exist → skip
    cur = (cur as Record<string, unknown>)[keys[i]];
  }
  if (cur === null || typeof cur !== 'object') return;
  const container = cur as Record<string, unknown>;
  const leaf = keys[keys.length - 1];
  const existing = container[leaf];

  if (isAnimatable(existing)) {
    // Set the static base of an animatable property (numeric only; vec2 targets
    // aren't a data-binding case). Coerce, skip if not a finite number.
    if (existing.valueType === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n)) existing.defaultValue = n;
    }
    return;
  }
  container[leaf] = value;
}

/**
 * Return a deep copy of `target` with `overrides` applied. Empty/absent map returns
 * the input unchanged (no clone). Pure.
 */
export function applyOverrides<T>(target: T, overrides: OverrideMap): T {
  if (!overrides || Object.keys(overrides).length === 0) return target;
  const clone = structuredClone(target);
  for (const path of Object.keys(overrides)) {
    setOverridePath(clone as Record<string, unknown>, path, overrides[path]);
  }
  return clone;
}
