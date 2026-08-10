import { z } from 'zod/v4';
import { PALETTE_ROLES } from './enums';

// Leaf value schemas shared by everything. All structural (int/min/max/length/enum) so they
// survive JSON Schema export for constrained decoding; nothing here uses `.refine`.

/** A stable layer/track/style id. Free string (see ./ids for the namespaced-id note). Non-empty. */
export const zId = z.string().min(1).max(200);

/** A Coder-emitted, seed-reproducible namespaced layer id, e.g. "p2:title" (panel 2, "title").
 *  Assembly MUST preserve these verbatim — never re-mint them with the timestamp generator. The
 *  pattern is advisory (kept loose so hand ids also pass); the namespace check is structural. */
export const zNamespacedId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, 'id must be alnum with : _ - separators (no spaces)');

/** Required, human-readable semantic name (e.g. "dealer-right-arm") — the handle NL editing uses. */
export const zSemanticName = z.string().min(1).max(120).describe('semantic, human-readable layer name');

/** Absolute composition frame. Integer, ≥0. This is the document-facing time unit (NOT ms). */
export const zFrame = z.int().min(0).describe('absolute composition frame (integer)');

/** A frame DURATION (≥1). */
export const zFrameDuration = z.int().min(1).describe('duration in frames (integer, ≥1)');

/** Milliseconds — appears ONLY in the Director's plan (human-scale planning + audio sync). Integer,
 *  ≥0. Job-expansion converts ms→frames ONCE via the beat; the Coder never sees ms. */
export const zMs = z.int().min(0).describe('milliseconds (planning only; converted to frames once)');

/** A value in [0,1] (opacity, normalized position, unit falloff). */
export const zUnit = z.number().min(0).max(1);

/** Degrees (unbounded; rotations may exceed 360). */
export const zDegrees = z.number();

export const zVec2 = z.tuple([z.number(), z.number()]);
export const zVec3 = z.object({ x: z.number(), y: z.number(), z: z.number() }).strict();

/** A literal RGBA color, each channel 0..1 (matches core `Vec4`). Used where a slot has no role
 *  support and for the resolved/document form. The AI does NOT emit these directly in AI layers —
 *  it names a role; assembly resolves the role to one of these. */
export const zColorLiteral = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
  .describe('literal RGBA, each channel 0..1');

/** A hex color string (#rgb / #rrggbb / #rrggbbaa) — used by subsystems that store colors as hex
 *  (material stops, patterns, markers). */
export const zHexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

/** A color ROLE reference — the ONLY way the AI names a color. `role` indexes the style contract's
 *  palette; assembly resolves it (to a literal where the slot has no role support, or keeps the
 *  link where it does). This makes "the AI never chooses a color, only names a role" structural. */
export const zColorRole = z
  .strictObject({ role: z.enum(PALETTE_ROLES) })
  .describe('reference to a named palette role in the style contract');

/** A color SLOT the AI may emit: a role reference (preferred). Literals are intentionally NOT
 *  accepted here — a slot that must be a literal is resolved by assembly, not authored by the AI. */
export const zAiColor = zColorRole;

export type Id = z.infer<typeof zId>;
export type Vec2T = z.infer<typeof zVec2>;
export type Vec3T = z.infer<typeof zVec3>;
export type ColorLiteral = z.infer<typeof zColorLiteral>;
export type ColorRole = z.infer<typeof zColorRole>;
