// Cloner — data-bound source (Prompt 4, Part B).
//
// Two pure steps:
//   1. buildInstanceOverrides — turn a data list + bindings into a per-instance
//      sparse override map (instance `i` ← `data[i % data.length]`).
//   2. buildDataBoundSources — APPLY those maps to the source layer via the shared
//      instance-override mechanism (core/overrides), yielding one content-overridden
//      source layer per instance. This is the connection that makes data binding
//      real: the full per-instance render path renders instanceSources[i] at
//      instances[i]'s transform.
//
// The mechanism (applyOverrides) is the reusable primitive Prompt 4 assumed under
// the name "the precomp instance-override mechanism"; it lives in core so a precomp
// system could share it.

import { applyOverrides } from '../core/overrides';
import type { Layer } from '../core/types';
import type { ClonerDataBinding } from './types';

/** One override map per instance: propertyPath → bound value. */
export type InstanceOverride = Record<string, string | number>;

/**
 * Build `instanceCount` override maps. `data.length` need not equal `instanceCount`
 * — instance `i` wraps via `i % data.length` (20 instances over a 5-row list repeat,
 * they don't error or leave the tail unbound). Empty data → empty maps. Pure:
 * identical inputs → identical output, any order.
 */
export function buildInstanceOverrides(
  binding: ClonerDataBinding,
  instanceCount: number,
): InstanceOverride[] {
  const n = binding.data.length;
  const out: InstanceOverride[] = [];
  for (let i = 0; i < instanceCount; i++) {
    if (n === 0) {
      out.push({});
      continue;
    }
    const row = binding.data[i % n];
    const override: InstanceOverride = {};
    for (const b of binding.bindings) {
      // Undefined dataKey → leave that property unbound (skip) rather than write undefined.
      if (b.dataKey in row) override[b.propertyPath] = row[b.dataKey];
    }
    out.push(override);
  }
  return out;
}

/**
 * Apply the per-instance override maps to the source layer, producing one
 * content-overridden source per instance (the inputs the full per-instance render
 * path renders). Pure — `applyOverrides` deep-clones, so the original `source` is
 * never mutated. `instanceCount` need not match `data.length` (wraparound handled
 * upstream). The result is frame-independent (bound values are static data), so the
 * caller may cache it by (sourceId + binding + count).
 */
export function buildDataBoundSources(
  source: Layer,
  binding: ClonerDataBinding,
  instanceCount: number,
): Layer[] {
  const overrides = buildInstanceOverrides(binding, instanceCount);
  return overrides.map((o) => applyOverrides(source, o));
}
