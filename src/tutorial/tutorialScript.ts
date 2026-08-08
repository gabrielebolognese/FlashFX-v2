import type { TutorialChapter } from './types';

// Phase 1 STUB storyboard — enough chapters/steps to prove the director drives the real editor and
// the controls (skip/pause/speed/chapter-jump) work. Phase 3 replaces this with the full cohesive
// build (background → shapes → boolean → styles → text → animate → effects → cloner/particles →
// outline/tidy → play & handoff). Each step: narration + optional real edit.

export const tutorialScript: TutorialChapter[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    steps: [
      { id: 'intro', say: 'Welcome to FlashFX. Sit back — I’ll build a quick motion piece so you can see what’s possible.', hold: 2600, spotlight: 'canvas' },
      { id: 'stage', say: 'This is your 16:9 stage. Everything happens on this canvas.', hold: 1800, spotlight: 'canvas' },
    ],
  },
  {
    id: 'shapes',
    title: 'Shapes',
    steps: [
      { id: 'rect', say: 'Let’s drop in a rectangle…', hold: 1400, run: (api) => { api.editor().addRectangle(); } },
      { id: 'circle', say: '…and an ellipse. These are live, editable vector shapes.', hold: 1600, run: (api) => { api.editor().addCircle(); } },
    ],
  },
  {
    id: 'handoff-preview',
    title: 'Handoff',
    steps: [
      { id: 'wrap', say: 'That’s the shell of the tour — the full build lands next.', hold: 2000, spotlight: 'canvas' },
    ],
  },
];
