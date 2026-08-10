import { z } from 'zod/v4';
import { PALETTE_ROLES, EASING_NAMES, SHAPE_LANGUAGES, STAGGER_MODES } from './enums';
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
  mode: z.enum(STAGGER_MODES),
  /** Base inter-element gap, ms (planning). Wired through to staggerReveal/staggerExit at assembly. */
  gapMs: zMs,
  curve: z.enum(EASING_NAMES).optional(),
});

// Palette and easing counts are FIXED design ranges (not tier caps), so makeStyleContract takes no
// caps — the prompt says "bind 4 to 7 roles" and "choose 4 to 6 easings", and the schema enforces
// exactly that (both bounds, matching the prompt).
export function makeStyleContract() {
  return z
    .strictObject({
      /** Named roles → colors. The AI references roles by name; it never picks a color. 4–7 roles. */
      palette: z.array(zPaletteEntry).min(4).max(7),
      /** The closed set of easings the whole piece is allowed to use — 4 to 6. */
      easings: z.array(z.enum(EASING_NAMES)).min(4).max(6),
      /** Base timing beat, ms. All durations in the plan are integer multiples of this. */
      beatMs: zMs.refine((v) => v > 0, 'beat must be > 0'),
      shapeLanguage: z.enum(SHAPE_LANGUAGES),
      staggerDoctrine: zStaggerDoctrine,
    })
    .describe('the style contract (palette roles, allowed easings, timing beat, doctrine)');
}

export type StyleContract = z.infer<ReturnType<typeof makeStyleContract>>;
