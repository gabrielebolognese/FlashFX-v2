import type { TutorialDef } from '../types';
import { newRectangle, prop, select } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'timing',
  label: 'Timing',
  title: 'Layer In & Out',
  videoCaption: 'timing.mp4',
  intro:
    'Timing controls when a layer lives on the timeline — the frame it appears and the frame it disappears. Use it to trim a layer to just the range you need.',
  bullets: [
    'You can set the In point — the frame where the layer becomes visible.',
    'You can set the Out point — the frame where the layer leaves the timeline.',
    'You can drag either field to scrub the value, or type an exact frame.',
    'You can trim a layer to a short window without adding or moving any keyframes.',
    'You can stagger several layers by giving each a different In point.',
    'Values snap to whole frames — In never drops below 0, Out never below 1.',
  ],
  exampleLabel: 'Create timed layer',
  seeExample: () => {
    const id = newRectangle();
    prop(id, 'inPoint', 12);
    prop(id, 'outPoint', 60);
    select(id);
  },
};
