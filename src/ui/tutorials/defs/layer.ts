import type { TutorialDef } from '../types';
import { newRectangle, prop, select } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'layer',
  label: 'Layer settings',
  title: 'Layer Name & Timing',
  videoCaption: 'layer.mp4',
  intro:
    'The Layer settings hold each layer\'s identity and lifespan. Rename it, check what kind of layer it is, and control when it appears and leaves the timeline.',
  bullets: [
    'You can rename any layer to keep a crowded timeline readable.',
    'You can see the layer\'s type at a glance in the read-only Type readout.',
    'You can set the In point to choose the frame where the layer first appears.',
    'You can set the Out point to choose the frame where the layer disappears.',
    'You can pin a top-level layer\'s edges with horizontal and vertical constraints so it reflows when the composition frame is resized.',
  ],
  exampleLabel: 'Create & name a layer',
  seeExample: () => {
    const id = newRectangle();
    prop(id, 'name', 'Hero Shape');
    prop(id, 'inPoint', 0);
    prop(id, 'outPoint', 90);
    select(id);
  },
};
