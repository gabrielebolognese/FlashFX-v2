import { z } from 'zod/v4';
import { zFrame, zFrameDuration } from './primitives';
import { zEasingName } from './easing';

// CLOSED per-preset params. The unstructured `record(string, number)` hole is closed: each preset
// name carries exactly its own params, so a meaningless parameter is a PARSE error, not something
// the expander has to tolerate. This is the schema half of the AI preset catalog (the expander that
// turns these into keyframes lives engine-side in src/ai/presetCatalog.ts, keyed by the same names).
//
// Params are all defaulted, and the whole `params` object defaults to `{}` — so with io:'input' the
// Coder may omit params entirely and get sensible motion. Ranges are structural (survive JSON Schema).

const SLIDE_DIR = z.enum(['left', 'right', 'up', 'down']);

/** Per-preset param schemas. Keyed by preset name (see MOTION_PRESET_NAMES). */
export const PRESET_PARAMS = {
  fadeIn: z.strictObject({}),
  slideIn: z.strictObject({
    direction: SLIDE_DIR.default('left'),
    /** Offset distance in px; when omitted the expander derives it from the comp size. */
    distance: z.number().positive().max(10000).optional(),
  }),
  popIn: z.strictObject({
    /** Overshoot scale before settling to 1 (1 = no overshoot). */
    overshoot: z.number().min(1).max(2).default(1.15),
  }),
  fadeOut: z.strictObject({}),
  slideOut: z.strictObject({
    direction: SLIDE_DIR.default('right'),
    distance: z.number().positive().max(10000).optional(),
  }),
  scaleOut: z.strictObject({
    /** Final scale (0 = shrink to nothing). */
    to: z.number().min(0).max(1).default(0),
  }),
  emphasisPulse: z.strictObject({
    /** Peak scale of the pulse. */
    peak: z.number().min(1).max(2).default(1.15),
    /** How many pulses across the duration. */
    cycles: z.int().min(1).max(4).default(1),
  }),
  staggerReveal: z.strictObject({
    /** Which entrance to apply to each child of the group. */
    childPreset: z.enum(['fadeIn', 'slideIn', 'popIn']).default('fadeIn'),
    /** Frames of delay added per successive child. */
    stepFrames: z.int().min(1).max(60).default(4),
    order: z.enum(['forward', 'reverse']).default('forward'),
  }),
} as const;

const timing = { start: zFrame, duration: zFrameDuration, easing: zEasingName.optional() };
const A = {
  fadeIn: z.strictObject({ preset: z.literal('fadeIn'), ...timing, params: PRESET_PARAMS.fadeIn.prefault({}) }),
  slideIn: z.strictObject({ preset: z.literal('slideIn'), ...timing, params: PRESET_PARAMS.slideIn.prefault({}) }),
  popIn: z.strictObject({ preset: z.literal('popIn'), ...timing, params: PRESET_PARAMS.popIn.prefault({}) }),
  fadeOut: z.strictObject({ preset: z.literal('fadeOut'), ...timing, params: PRESET_PARAMS.fadeOut.prefault({}) }),
  slideOut: z.strictObject({ preset: z.literal('slideOut'), ...timing, params: PRESET_PARAMS.slideOut.prefault({}) }),
  scaleOut: z.strictObject({ preset: z.literal('scaleOut'), ...timing, params: PRESET_PARAMS.scaleOut.prefault({}) }),
  emphasisPulse: z.strictObject({ preset: z.literal('emphasisPulse'), ...timing, params: PRESET_PARAMS.emphasisPulse.prefault({}) }),
  staggerReveal: z.strictObject({ preset: z.literal('staggerReveal'), ...timing, params: PRESET_PARAMS.staggerReveal.prefault({}) }),
};

/** A layer-level motion-preset attachment: closed per-name params, absolute start + duration (frames). */
export const zMotionPresetAttachment = z
  .discriminatedUnion('preset', [
    A.fadeIn, A.slideIn, A.popIn, A.fadeOut, A.slideOut, A.scaleOut, A.emphasisPulse, A.staggerReveal,
  ])
  .describe('a named motion preset applied at the layer (closed params per preset)');

export type MotionPresetAttachment = z.infer<typeof zMotionPresetAttachment>;
