import { createProperty, createKeyframe } from './factory';
import { defaultRangeSelector } from '../text/rangeSelector';
import type { TextAnimator } from './types';

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

export const TEXT_ANIMATOR_PRESETS: { id: string; label: string; build: (start?: number, dur?: number) => TextAnimator }[] = [
  { id: 'fade-in', label: 'Fade in by character', build: fadeInByCharacter },
  { id: 'pop-in', label: 'Pop in by character', build: popInByCharacter },
];
