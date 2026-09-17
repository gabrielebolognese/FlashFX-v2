import type { TutorialDef } from '../types';
import { newRectangle, newCircle, addPhysics } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'physics',
  label: 'Physics',
  title: 'Rigid-Body Physics',
  videoCaption: 'physics.mp4',
  intro:
    'Turn layers into rigid bodies and let a gravity-driven simulation move them for you - bouncing, colliding, and settling instead of hand-keyed motion. Assign each object a role, tune its material, and the timeline auto-bakes the result.',
  bullets: [
    'You can enable the physics world so objects are actually simulated, and watch it auto-rebake whenever settings change.',
    'You can assign each layer a role - Dynamic (fully simulated), Kinematic (keyframe-driven, pushes others), Static (immovable barrier), or Ghost (trigger zone, no collision).',
    'You can pick a collider shape per object: Box, Circle, Convex Hull, or Polyline.',
    'You can tune the material - mass, bounciness, friction, and linear damping - to change how each body reacts.',
    'You can lock an object on the X axis, the Y axis, or its rotation to constrain the simulation.',
    'You can set a birth and end frame for a dynamic body and keep it solid before activation, so it drops in on cue.',
    'You can auto-derive a dynamic body\'s initial velocity from its keyframes, or set the launch speed and angle by hand.',
  ],
  exampleLabel: 'Create physics scene',
  seeExample: () => {
    const floor = newRectangle();
    addPhysics(floor, 'static');
    const ball = newCircle();
    addPhysics(ball, 'dynamic');
  },
};
