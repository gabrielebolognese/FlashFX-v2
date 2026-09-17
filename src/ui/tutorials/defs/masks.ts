import type { TutorialDef } from '../types';
import { newRectangle, addMask } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'masks',
  label: 'Masks',
  title: 'Shape Masks',
  videoCaption: 'masks.mp4',
  intro:
    "Masks clip a layer to a shape, revealing only what falls inside. Stack several masks per layer and keyframe them for animated reveals.",
  bullets: [
    'You can add masks in four shapes - rectangle, ellipse, star, or polygon.',
    'You can toggle any mask on or off, and reorder, duplicate, or delete it.',
    'You can keyframe a mask’s position, size, and rotation to animate the reveal.',
    'You can feather the mask edge for a soft falloff and dial its opacity.',
    'You can invert a mask so it hides its interior instead of revealing it.',
    'You can set the point count and inner radius on star and polygon masks.',
  ],
  exampleLabel: 'Create example',
  seeExample: () => {
    const rect = newRectangle();
    addMask(rect, 'ellipse');
  },
};
