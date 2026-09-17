import type { TutorialDef } from '../types';
import { newCircle, addMotionPath } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'motion-path',
  label: 'Motion Paths',
  title: 'Animate Along a Path',
  videoCaption: 'motion-path.mp4',
  intro:
    'Attach a layer to a bezier path and let it travel the curve instead of straight-line keyframes. The path is a chain of nodes with handles, and the layer glides along it by arc length.',
  bullets: [
    'You can create a motion path on the selected layer and drop points on the canvas in Edit mode.',
    'You can auto-smooth every node at once so the whole path becomes a flowing curve.',
    'You can choose which anchor of the layer follows the path — Center or any of the four corners.',
    'You can orient the layer to the path so it rotates to face its direction of travel.',
    'You can loop the motion continuously or ping-pong it back and forth, or leave it playing once.',
    'You can close the path into a loop, or keep it open, and see the live node count.',
  ],
  exampleLabel: 'Create motion path',
  seeExample: () => {
    const a = newCircle();
    addMotionPath(a);
  },
};
