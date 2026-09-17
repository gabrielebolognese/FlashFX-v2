import type { TutorialDef } from '../types';
import { newRectangle, newCircle, applyGradientFill, applyGradientStroke } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'material',
  label: 'Fill & Stroke Materials',
  title: 'Fill & Stroke Materials',
  videoCaption: 'material.mp4',
  intro:
    'Give a shape a richer look by stacking gradient material layers on its fill and stroke. Each layer is a linear or radial gradient you blend and reorder to build up the final color.',
  bullets: [
    'You can build separate material stacks for the Fill and the Stroke of a shape.',
    'You can add up to 8 material layers per stack, each a linear or radial gradient.',
    'You can pick a linear direction (top→bottom, diagonals, etc.) or a radial position (center, corners).',
    'You can blend each layer with 12 modes — Normal, Multiply, Screen, Overlay, and more.',
    'You can set per-layer opacity and reorder layers up or down to change how they composite.',
    'You can edit each gradient with up to 10 color stops, adjusting color, position, and alpha per stop.',
    'You can hit Match to copy the fill material straight onto the stroke.',
  ],
  exampleLabel: 'Create gradient shapes',
  seeExample: () => {
    const a = newRectangle();
    applyGradientFill(a);
    const b = newCircle();
    applyGradientStroke(b);
  },
};
