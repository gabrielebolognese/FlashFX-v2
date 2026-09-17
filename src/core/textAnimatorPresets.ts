import { createProperty, createKeyframe } from './factory';
import { defaultRangeSelector } from '../text/rangeSelector';
import { DEFAULT_DECODE_CHARSET } from './textDecode';
import type { TextAnimator, AnimatableProperty, TextDecode } from './types';

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
    createKeyframe(startFrame, -0.15, 'linear'),
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
    offset: revealOffset(startFrame, durationFrames, 0),
    delta: { opacity: -1 },
  };
}

/** Words rise + fade into place in sequence (cascade up, by word). */
export function cascadeUpByWord(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'word',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.3 },
    offset: revealOffset(startFrame, durationFrames),
    delta: { opacity: -1, position: [0, 36] },
  };
}

/** Characters slide in from the left as they appear. */
export function slideInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.2 },
    offset: revealOffset(startFrame, durationFrames),
    delta: { opacity: -1, position: [-48, 0] },
  };
}

/** Lines rise into place one after another (cascade up, by line). */
export function riseByLine(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'line',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.5 },
    offset: revealOffset(startFrame, durationFrames),
    delta: { opacity: -1, position: [0, 48] },
  };
}

/** Characters resolve from a blur (blur in), left to right. */
export function blurInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.25 },
    offset: revealOffset(startFrame, durationFrames),
    delta: { opacity: -1, blur: 16 },
  };
}

/** Characters spin + scale into place (tumble in), left to right. */
export function tumbleInByCharacter(startFrame = 0, durationFrames = 30): TextAnimator {
  return {
    enabled: true,
    splitMode: 'character',
    selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.2 },
    offset: revealOffset(startFrame, durationFrames),
    delta: { opacity: -1, rotation: -45, scale: [-0.4, -0.4] },
  };
}

export const TEXT_ANIMATOR_PRESETS: { id: string; label: string; build: (start?: number, dur?: number) => TextAnimator }[] = [
  { id: 'type-on', label: 'Type on (typewriter)', build: typeOnByCharacter },
  { id: 'fade-in', label: 'Fade in by character', build: fadeInByCharacter },
  { id: 'pop-in', label: 'Pop in by character', build: popInByCharacter },
  { id: 'cascade-word', label: 'Cascade up by word', build: cascadeUpByWord },
  { id: 'slide-in', label: 'Slide in by character', build: slideInByCharacter },
  { id: 'rise-line', label: 'Rise by line', build: riseByLine },
  { id: 'blur-in', label: 'Blur in by character', build: blurInByCharacter },
  { id: 'tumble-in', label: 'Tumble in by character', build: tumbleInByCharacter },
];
