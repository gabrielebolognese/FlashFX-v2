import type { TutorialDef } from '../types';
import { newRectangle, applyPatternFill, prop } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'pattern',
  label: 'Pattern Fills',
  title: 'Pattern Overlay Fills',
  videoCaption: 'pattern.mp4',
  intro:
    'Overlay a repeating, tiled pattern on top of a shape. Pick a built-in tile or write your own SVG, then dial in its color, scale, and rotation for a live preview.',
  bullets: [
    'You can choose from six pattern types: Dots, Lines, Grid, Diagonal, Chevron, or a Custom SVG tile.',
    'You can set the pattern color with a hex field, color swatch, or your saved brand colors.',
    'You can give it a solid background color or make the background transparent so the shape shows through.',
    'You can tune Size and Spacing to control how big each motif is and how far apart the tiles sit.',
    'You can rotate the whole pattern with the Angle control and fade it with Opacity.',
    'You can drop in your own inner SVG markup in Custom mode, then Reset back to the default at any time.',
  ],
  exampleLabel: 'Create pattern shape',
  seeExample: () => {
    const a = newRectangle();
    applyPatternFill(a);
    prop(a, 'patternFill.patternType', 'chevron');
    prop(a, 'patternFill.color', '#FFD84D');
    prop(a, 'patternFill.size', 10);
    prop(a, 'patternFill.spacing', 14);
    prop(a, 'patternFill.angle', 20);
  },
};
