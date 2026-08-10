import { z } from 'zod/v4';
import { PALETTE_ROLES, EASING_NAMES } from './enums';
import { zHexColor, zMs } from './primitives';

// The STYLE CONTRACT the Director commits to. This is a PLANNING artifact (its beat is in ms) and
// it is persisted on the document as a required input for the edit path. It is the bridge for the
// colors invariant: the palette assigns a concrete color to each named ROLE, and everything the
// Coder emits references roles — so "the AI names a role, never a color" holds, and assembly
// resolves a role to a literal wherever a slot has no role link.

export const zPaletteEntry = z
  .strictObject({ role: z.enum(PALETTE_ROLES), color: zHexColor })
  .describe('binds a semantic role to a concrete color');

export const zStaggerDoctrine = z.strictObject({
  mode: z.enum(['none', 'perLayer', 'perGroup', 'spatial']),
  /** Base inter-element gap, ms (planning). */
  gapMs: zMs,
  curve: z.enum(EASING_NAMES).optional(),
});

export function makeStyleContract(caps: Caps) {
  return z
    .strictObject({
      /** Named roles → colors. The AI references roles by name; it never picks a color. */
      palette: z.array(zPaletteEntry).min(1).max(caps.maxPaletteEntries),
      /** The closed set of 4–6 easings the whole piece is allowed to use. */
      easings: z.array(z.enum(EASING_NAMES)).min(1).max(6),
      /** Base timing beat, ms. All durations in the plan are integer multiples of this. */
      beatMs: zMs.refine((v) => v > 0, 'beat must be > 0'),
      shapeLanguage: z.enum(['rounded', 'sharp', 'geometric', 'organic', 'mixed']),
      staggerDoctrine: zStaggerDoctrine,
    })
    .describe('the style contract (palette roles, allowed easings, timing beat, doctrine)');
}

import type { Caps } from './caps';
export type StyleContract = z.infer<ReturnType<typeof makeStyleContract>>;
