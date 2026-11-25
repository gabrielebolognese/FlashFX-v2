import { createProperty, createKeyframe } from './factory';
import { defaultRangeSelector } from '../text/rangeSelector';
import { DEFAULT_DECODE_CHARSET } from './textDecode';
import type { TextAnimator, AnimatableProperty, TextDecode, Vec4 } from './types';

/** Default Text Decode config (B9): a 0→1 reveal keyframed over the given frames, seeded scramble. */
export function createTextDecode(startFrame = 0, durationFrames = 30): TextDecode {
  const progress = createProperty('Decode Progress', 'number', 0);
  progress.keyframes = [
    createKeyframe(startFrame, 0, 'linear'),
    createKeyframe(startFrame + durationFrames, 1, 'linear'),
  ];
  return { enabled: true, progress, charset: DEFAULT_DECODE_CHARSET, seed: 1, scrambleHold: 2 };
}

// Ready-made text animators. Each keyframes the selector `offset` so the effect plays over time
// (frames startFrame..startFrame+durationFrames). Reveal direction: a rampUp window with offset
// sweeping -window→1 reveals left→right (glyphs left of the window are visible, right are hidden).
// B45: every reveal starts its offset at MINUS the window width (end - start), so the window sits
// wholly before unit 0 and every unit (the first included) is fully hidden up to the start frame.
// A shorter lead-in (e.g. -0.15 for a 0.25 window) left the first glyph partly shown early.

/** Characters fade + rise into place, left to right. */
export function fadeInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  const offset = createProperty('Animator Offset', 'number', 0);
  offset.keyframes = [
    createKeyframe(startFrame, -0.15, 'linear'),
    createKeyframe(startFrame + durationFrames, 1, 'linear'),
  ];
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.15 },
    offset,
    delta: { opacity: -1, position: [0, 24] },
  };
}

/** Characters pop in with a scale overshoot, left to right. */
export function popInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  const offset = createProperty('Animator Offset', 'number', 0);
  offset.keyframes = [
    createKeyframe(startFrame, -0.2, 'linear'),
    createKeyframe(startFrame + durationFrames, 1, 'linear'),
  ];
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.2 },
    offset,
    delta: { opacity: -1, scale: [-0.6, -0.6] },
  };
}

/** Helper: an offset keyframe pair sweeping the reveal window across the range over the duration. */
function revealOffset(startFrame: number, durationFrames: number, from = -0.15): AnimatableProperty {
  const offset = createProperty('Animator Offset', 'number', 0);
  offset.keyframes = [
    createKeyframe(startFrame, from, 'linear'),
    createKeyframe(startFrame + durationFrames, 1, 'linear'),
  ];
  return offset;
}

/** Typewriter: each character snaps fully visible in turn (hard cut), left to right. */
export function typeOnByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    // A near-zero 'square' window → a glyph is either fully hidden or fully shown (no fade).
    selector: { ...defaultRangeSelector(), shape: 'square', start: 0, end: 0.001 },
    offset: revealOffset(startFrame, durationFrames, -0.001),
    delta: { opacity: -1 },
  };
}

/** Words rise + fade into place in sequence (cascade up, by word). */
export function cascadeUpByWord(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'word',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.3 },
    offset: revealOffset(startFrame, durationFrames, -0.3),
    delta: { opacity: -1, position: [0, 36] },
  };
}

/** Characters slide in from the left as they appear. */
export function slideInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.2 },
    offset: revealOffset(startFrame, durationFrames, -0.2),
    delta: { opacity: -1, position: [-48, 0] },
  };
}

/** Lines rise into place one after another (cascade up, by line). */
export function riseByLine(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'line',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.5 },
    offset: revealOffset(startFrame, durationFrames, -0.5),
    delta: { opacity: -1, position: [0, 48] },
  };
}

/** Characters resolve from a blur (blur in), left to right. */
export function blurInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.25 },
    offset: revealOffset(startFrame, durationFrames, -0.25),
    delta: { opacity: -1, blur: 16 },
  };
}

/** Characters spin + scale into place (tumble in), left to right. */
export function tumbleInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.2 },
    offset: revealOffset(startFrame, durationFrames, -0.2),
    delta: { opacity: -1, rotation: -45, scale: [-0.4, -0.4] },
  };
}

// ---- Kinetic title styles (the four "N styles" of a Bricks-style text tutorial). Each is built only
// from range-selector features (split / deltas / shape / ease), so a viewer can rebuild it by hand in
// the Animators panel. The selector window sweeps left to right; ease low/high soften each unit's
// settle ("fast start, long settle"). Turn the layer's Motion Blur on for the streaks.

/** Style 1: words rise 80 px and fade in, one after another, with a soft settle. */
export function riseFadeByWord(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'word',
    selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.4, easeLow: 1, easeHigh: 0.2 },
    offset: revealOffset(startFrame, durationFrames, -0.4),
    delta: { opacity: -1, position: [0, 80] },
  };
}

/** Style 2: letters (spaces skipped) scale up from 20 % while rising 140 px and fading in. */
export function scaleRiseByLetter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'characterNoSpaces',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.3, easeLow: 1 },
    offset: revealOffset(startFrame, durationFrames, -0.3),
    delta: { opacity: -1, position: [0, 140], scale: [-0.8, -0.8] },
  };
}

/** Style 3: tracking burst - letters start piled together (negative tracking), small and tilted,
 *  then spring apart into place left to right. */
export function trackingBurst(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'characterNoSpaces',
    selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.5, easeLow: 1, easeHigh: 0.3 },
    offset: revealOffset(startFrame, durationFrames, -0.5),
    delta: { opacity: -1, tracking: -0.55, scale: [-0.6, -0.6], rotation: 30 },
  };
}

/** Style 4 (two stacked animators): a soft fade sweeps across first, while a slower second selector
 *  settles blur, scale and rotation - letters are visible early and keep resolving. */
export function blurSettleStack(startFrame = 0, durationFrames = 30): TextAnimator[] {
  const fadeDur = Math.max(1, Math.round(durationFrames * 0.66));
  return [
    {
      enabled: true,
      splitMode: 'characterNoSpaces',
      selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.5 },
      offset: revealOffset(startFrame, fadeDur, -0.5),
      delta: { opacity: -1 },
    },
    {
      enabled: true,
      splitMode: 'characterNoSpaces',
      selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 1, easeLow: 1 },
      offset: revealOffset(startFrame, durationFrames, -1),
      delta: { scale: [-0.4, -0.4], rotation: 15, blur: 15 },
    },
  ];
}

// ---- B36 / B45 additions: seeded scatter, a fill-colour wave and the typewriter's delete.

/** Letters fly in from seeded scattered offsets (random order, frame-pure), shrinking into place. */
export function scatterInByLetter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'characterNoSpaces',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.5, easeLow: 1, randomizeOrder: true, seed: 1 },
    offset: revealOffset(startFrame, durationFrames, -0.5),
    delta: { opacity: -1, scatter: [480, 320], scale: [-0.5, -0.5], rotation: 25 },
  };
}

/** The lime of the reference "decode" wave (r07): a pulse colour that reads on dark and light. */
const WAVE_COLOR: Vec4 = [0.78, 1, 0.24, 1];

/** A fill-colour wave: a soft band of colour sweeps across the letters and leaves them as they were. */
export function colorWaveByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'characterNoSpaces',
    selector: { ...defaultRangeSelector(), shape: 'triangle', start: 0, end: 0.35 },
    offset: revealOffset(startFrame, durationFrames, -0.35),
    delta: { fillColor: [...WAVE_COLOR] as Vec4 },
  };
}

/** Typewriter delete (backspace): characters vanish one by one from the END, hard cuts. Visible before
 *  the start frame, fully gone after it. Pair with the layer's `reflowHidden` to keep a centred line
 *  centred while it shrinks. */
export function deleteByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  const offset = createProperty('Animator Offset', 'number', 0);
  offset.keyframes = [
    createKeyframe(startFrame, 1, 'linear'),
    createKeyframe(startFrame + durationFrames, -0.001, 'linear'),
  ];
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'square', start: 0, end: 0.001 },
    offset,
    delta: { opacity: -1 },
  };
}

/**
 * B36: the keyframable selector channels of an animator, addressed as "animators.<i>.start" / ".end" /
 * ".offset". Returns the animator with that property created (base = the selector's static value) when
 * it is absent, so a keyframe op on the path works without a separate "make keyframable" step; null for
 * any other path.
 */
const SELECTOR_KEY_PATH = /^animators\.(\d+)\.(start|end|offset)$/;
export function selectorKeyPath(path: string): { index: number; channel: 'start' | 'end' | 'offset' } | null {
  const m = SELECTOR_KEY_PATH.exec(path);
  return m ? { index: Number(m[1]), channel: m[2] as 'start' | 'end' | 'offset' } : null;
}
export function withSelectorProperty(animator: TextAnimator, channel: 'start' | 'end' | 'offset'): TextAnimator {
  if (animator[channel]) return animator;
  const name = channel === 'offset' ? 'Animator Offset' : channel === 'start' ? 'Animator Start' : 'Animator End';
  return { ...animator, [channel]: createProperty(name, 'number', animator.selector[channel]) };
}

/** A preset builds one animator, or a stack of them (applied together, in order). */
export type TextAnimatorPresetBuild = (start?: number, dur?: number) => TextAnimator | TextAnimator[];

/** The animators a preset adds, always as a list. */
export function buildTextAnimatorPreset(build: TextAnimatorPresetBuild, start?: number, dur?: number): TextAnimator[] {
  const out = build(start, dur);
  return Array.isArray(out) ? out : [out];
}

export const TEXT_ANIMATOR_PRESETS: { id: string; label: string; build: TextAnimatorPresetBuild }[] = [
  { id: 'type-on', label: 'Type on (typewriter)', build: typeOnByCharacter },
  { id: 'fade-in', label: 'Fade in by character', build: fadeInByCharacter },
  { id: 'pop-in', label: 'Pop in by character', build: popInByCharacter },
  { id: 'cascade-word', label: 'Cascade up by word', build: cascadeUpByWord },
  { id: 'slide-in', label: 'Slide in by character', build: slideInByCharacter },
  { id: 'rise-line', label: 'Rise by line', build: riseByLine },
  { id: 'blur-in', label: 'Blur in by character', build: blurInByCharacter },
  { id: 'tumble-in', label: 'Tumble in by character', build: tumbleInByCharacter },
  { id: 'rise-fade-word', label: 'Kinetic 1: rise + fade by word', build: riseFadeByWord },
  { id: 'scale-rise-letter', label: 'Kinetic 2: scale up by letter', build: scaleRiseByLetter },
  { id: 'tracking-burst', label: 'Kinetic 3: tracking burst', build: trackingBurst },
  { id: 'blur-settle', label: 'Kinetic 4: fade + blur settle (2 animators)', build: blurSettleStack },
  { id: 'scatter-in', label: 'Scatter in (seeded random order)', build: scatterInByLetter },
  { id: 'color-wave', label: 'Colour wave by character', build: colorWaveByCharacter },
  { id: 'delete-char', label: 'Delete (backspace) by character', build: deleteByCharacter },
];

/** Presets that do not reveal the text from hidden (a colour pass, a delete); every other preset hides
 *  each unit up to its start frame and shows all of it from the end frame (verify:text-glyph-motion). */
export const NON_REVEAL_TEXT_ANIMATOR_PRESETS: readonly string[] = ['color-wave', 'delete-char'];
