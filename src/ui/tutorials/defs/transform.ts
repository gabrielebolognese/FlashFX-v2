import type { TutorialDef } from '../types';
import { newRectangle, prop, select } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'transform',
  label: 'the Transform panel',
  title: 'Position, Scale & Rotate',
  videoCaption: 'transform.mp4',
  intro:
    'The Transform panel holds every layer’s core spatial properties — where it sits, how big it is, how it’s turned, and how visible it is. Each value can be dragged live and keyframed to animate over time.',
  bullets: [
    'You can set a layer’s X/Y position and drag it anywhere on the canvas.',
    'You can rotate a layer in degrees with the Rotation control.',
    'You can scale a layer independently on its X and Y axes.',
    'You can fade a layer in or out with the Opacity slider.',
    'You can keyframe any of these values to animate movement, rotation, scale, or opacity.',
    'You can Separate Dimensions to give position’s X and Y their own timing and easing.',
    'You can flip on the 3D Layer switch to add Z position plus X/Y/Z rotation.',
  ],
  exampleLabel: 'Create example layer',
  seeExample: () => {
    const id = newRectangle(); // a layer to move/scale/rotate/fade
    prop(id, 'transform.rotation.defaultValue', 20);
    prop(id, 'transform.scale.defaultValue', [1.5, 1.5]);
    prop(id, 'transform.opacity.defaultValue', 0.7);
    select(id);
  },
};
