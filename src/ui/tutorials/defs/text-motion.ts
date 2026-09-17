import type { TutorialDef } from '../types';
import { newText, prop } from '../exampleApi';
import { typeOnByCharacter } from '../../../core/textAnimatorPresets';

// Tutorial for the Text Animators panel (per-character/word/line motion, decode, text-on-path).
export const tutorial: TutorialDef = {
  id: 'text-motion',
  label: 'Text Animators',
  title: 'Animate Text Per Character',
  videoCaption: 'text-motion.mp4',
  intro:
    'Text Animators break a text layer into characters, words, or lines and animate each unit in turn — the classic type-on, fade-up, and kinetic-typography looks. A range selector plus reveal timing control which units are affected and when.',
  bullets: [
    'You can drop in a ready-made preset — Type on, Fade in, Pop in, Cascade by word, Slide in, Rise by line, Blur in, or Tumble in — in one click.',
    'You can choose whether each animator splits the text by character, word, or line.',
    'You can set the transform each unit animates by: position, scale, rotation, 3D rotation (X/Y), blur, and opacity.',
    'You can shape the range selector — pick a ramp/triangle/round/smooth/square profile, drag start/end, tune the eases, and set the amount.',
    'You can randomize the order (with a seed) so units animate in scattered rather than left-to-right sequence.',
    'You can set reveal timing with a start frame and duration, and stack several animators on one layer.',
    'You can also turn on Decode (scramble) or flow the glyphs along a motion path with tangent alignment.',
  ],
  exampleLabel: 'Create type-on text',
  seeExample: () => {
    const a = newText('ANIMATE');
    prop(a, 'animators', [typeOnByCharacter(0, 30)]);
  },
};
