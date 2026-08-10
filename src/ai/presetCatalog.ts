// The AI PRESET CATALOG — the engine-side half. The SCHEMA half (closed per-preset params) lives in
// @/schema/presetParams, keyed by the SAME names (verify-compiler asserts they agree). Here each
// preset knows: what it does to which properties, when a designer reaches for it, and — the point —
// how to EXPAND into real keyframe tracks by building an `AnimationPreset` and running it through the
// EXISTING engine generator `generatePresetKeyframes` (curves/easing handles come from there; we
// never author a parallel keyframe producer).
//
// staggerReveal is special: it is a GROUP preset with no tracks of its own — the assembler applies
// its `childPreset` to each child with an increasing start offset (see assemble.ts).

import type { PresetContext, AnimationPreset, GeneratedTrack } from '../core/animationPresets';
import { generatePresetKeyframes } from '../core/animationPresets';
import type { Vec2 } from '../core/types';
import type { MotionPresetName } from '../schema';

type Params = Record<string, unknown>;
const num = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
const str = (p: Params, k: string, d: string): string => (typeof p[k] === 'string' ? (p[k] as string) : d);

// direction → unit offset sign for slide presets.
const SLIDE: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export interface PresetCatalogEntry {
  name: MotionPresetName;
  category: 'entrance' | 'exit' | 'emphasis' | 'group';
  /** Which transform properties it writes (for the prompt + review). */
  targets: string[];
  /** One line: what it does and when to reach for it. */
  intent: string;
  /** Group-stagger presets expand per child, not on the group itself. */
  groupStagger?: { childParamKey: 'childPreset' };
  /** Build the AnimationPreset for these params, then the engine turns it into real keyframes. */
  expand: (params: Params, ctx: PresetContext, startFrame: number, durationFrames: number) => GeneratedTrack[];
}

function run(tracks: AnimationPreset['tracks'], ctx: PresetContext, start: number, dur: number): GeneratedTrack[] {
  const preset: AnimationPreset = { id: 'ai', name: 'ai', category: 'Combination', description: '', tracks };
  return generatePresetKeyframes(preset, ctx, start, dur);
}

export const PRESET_CATALOG: Record<MotionPresetName, PresetCatalogEntry> = {
  fadeIn: {
    name: 'fadeIn', category: 'entrance', targets: ['transform.opacity'],
    intent: 'Bring an element on by fading from transparent. The safe default entrance.',
    expand: (_p, ctx, s, d) => run([
      { property: 'opacity', keyframes: [{ at: 0, value: 0, easing: 'easeOut' }, { at: 1, value: 1 }] },
    ], ctx, s, d),
  },
  slideIn: {
    name: 'slideIn', category: 'entrance', targets: ['transform.position', 'transform.opacity'],
    intent: 'Enter from an edge with a gentle settle. Use for cards/titles that arrive with direction.',
    expand: (p, ctx, s, d) => {
      const [sx, sy] = SLIDE[str(p, 'direction', 'left')] ?? SLIDE.left;
      const horiz = sx !== 0;
      const dist = num(p, 'distance', horiz ? ctx.compWidth * 0.6 : ctx.compHeight * 0.6);
      const from = (c: PresetContext): Vec2 => [c.position[0] + sx * dist, c.position[1] + sy * dist];
      return run([
        { property: 'position', keyframes: [{ at: 0, value: from, easing: 'easeOut' }, { at: 1, value: (c) => c.position }] },
        { property: 'opacity', keyframes: [{ at: 0, value: 0, easing: 'easeOut' }, { at: 0.6, value: 1 }] },
      ], ctx, s, d);
    },
  },
  popIn: {
    name: 'popIn', category: 'entrance', targets: ['transform.scale', 'transform.opacity'],
    intent: 'Scale up from nothing with a slight overshoot. Punchy; good for logos, badges, emphasis entrances.',
    expand: (p, ctx, s, d) => {
      const o = num(p, 'overshoot', 1.15);
      return run([
        { property: 'scale', keyframes: [{ at: 0, value: [0, 0], easing: 'easeOut' }, { at: 0.7, value: [o, o], easing: 'easeInOut' }, { at: 1, value: [1, 1] }] },
        { property: 'opacity', keyframes: [{ at: 0, value: 0, easing: 'easeOut' }, { at: 0.4, value: 1 }] },
      ], ctx, s, d);
    },
  },
  fadeOut: {
    name: 'fadeOut', category: 'exit', targets: ['transform.opacity'],
    intent: 'Take an element off by fading out. The safe default exit.',
    expand: (_p, ctx, s, d) => run([
      { property: 'opacity', keyframes: [{ at: 0, value: 1, easing: 'easeIn' }, { at: 1, value: 0 }] },
    ], ctx, s, d),
  },
  slideOut: {
    name: 'slideOut', category: 'exit', targets: ['transform.position', 'transform.opacity'],
    intent: 'Exit toward an edge while fading. Mirror of slideIn for symmetric transitions.',
    expand: (p, ctx, s, d) => {
      const [sx, sy] = SLIDE[str(p, 'direction', 'right')] ?? SLIDE.right;
      const horiz = sx !== 0;
      const dist = num(p, 'distance', horiz ? ctx.compWidth * 0.6 : ctx.compHeight * 0.6);
      const to = (c: PresetContext): Vec2 => [c.position[0] + sx * dist, c.position[1] + sy * dist];
      return run([
        { property: 'position', keyframes: [{ at: 0, value: (c) => c.position, easing: 'easeIn' }, { at: 1, value: to }] },
        { property: 'opacity', keyframes: [{ at: 0.4, value: 1, easing: 'easeIn' }, { at: 1, value: 0 }] },
      ], ctx, s, d);
    },
  },
  scaleOut: {
    name: 'scaleOut', category: 'exit', targets: ['transform.scale', 'transform.opacity'],
    intent: 'Shrink away. Good for dismissing chips/thumbnails.',
    expand: (p, ctx, s, d) => {
      const to = num(p, 'to', 0);
      return run([
        { property: 'scale', keyframes: [{ at: 0, value: (c) => c.scale, easing: 'easeIn' }, { at: 1, value: [to, to] }] },
        { property: 'opacity', keyframes: [{ at: 0.5, value: 1, easing: 'easeIn' }, { at: 1, value: 0 }] },
      ], ctx, s, d);
    },
  },
  emphasisPulse: {
    name: 'emphasisPulse', category: 'emphasis', targets: ['transform.scale'],
    intent: 'A scale pulse in place to draw the eye without moving the element. Use sparingly for emphasis.',
    expand: (p, ctx, s, d) => {
      const peak = num(p, 'peak', 1.15);
      const cycles = Math.max(1, Math.round(num(p, 'cycles', 1)));
      const kfs: { at: number; value: Vec2; easing?: 'easeInOut' }[] = [{ at: 0, value: [1, 1], easing: 'easeInOut' }];
      for (let i = 0; i < cycles; i++) {
        kfs.push({ at: (i + 0.5) / cycles, value: [peak, peak], easing: 'easeInOut' });
        kfs.push({ at: (i + 1) / cycles, value: [1, 1], easing: 'easeInOut' });
      }
      return run([{ property: 'scale', keyframes: kfs }], ctx, s, d);
    },
  },
  staggerReveal: {
    name: 'staggerReveal', category: 'group', targets: ['(children)'],
    intent: 'Reveal the children of a group one after another. The workhorse for lists, grids, and word-by-word titles.',
    groupStagger: { childParamKey: 'childPreset' },
    // No tracks on the group itself; the assembler applies childPreset per child.
    expand: () => [],
  },
  staggerExit: {
    name: 'staggerExit', category: 'group', targets: ['(children)'],
    intent: 'Clear the children of a group one after another. The exit mirror of staggerReveal — lists/grids leaving.',
    groupStagger: { childParamKey: 'childPreset' },
    expand: () => [],
  },
};

/** Expand a non-group preset attachment to keyframe tracks. */
export function expandPreset(
  name: MotionPresetName, params: Params, ctx: PresetContext, startFrame: number, durationFrames: number,
): GeneratedTrack[] {
  return PRESET_CATALOG[name].expand(params, ctx, startFrame, durationFrames);
}
