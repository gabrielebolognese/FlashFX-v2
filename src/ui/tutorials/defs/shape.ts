import type { TutorialDef } from '../types';
import {
  newStar,
  newPolygon,
  prop,
  applyGradientFill,
  addModifier,
  select,
} from '../exampleApi';

// Tutorial for the Inspector's "Shape (…)" panel (ShapeProperties in Inspector.tsx).
export const tutorial: TutorialDef = {
  id: 'shape',
  label: 'Shape properties',
  title: 'Vector Shape Basics',
  videoCaption: 'shape.mp4',
  intro:
    'The Shape panel is where you tune a vector layer — its geometry, fill and stroke. The exact geometry controls change to match the shape type (rectangle, circle, star or polygon path).',
  bullets: [
    'You can resize the geometry: width, height and corner radius for rectangles, radius for circles, or points and inner/outer radius for stars.',
    'You can give a rectangle independent per-corner radii and switch back to one uniform corner at any time.',
    'You can set the fill and stroke colors and drag the stroke width, and animate any of these values with keyframes.',
    'You can shape a polygon path’s outline with line cap (butt/round/square) and join (miter/round/bevel) styles.',
    'You can add a dashed stroke to path shapes and control per-vertex tangent handles (mirror/angle/free).',
    'You can stack path modifiers — Trim Paths, Offset Paths, Roughen and Pucker & Bloat — on a polygon path.',
    'You can turn on the shape Repeater to multiply the shape into an evenly transformed array of copies.',
  ],
  exampleLabel: 'Create example shapes',
  seeExample: () => {
    // Two geometry types, each with a distinct treatment.
    const star = newStar();
    prop(star, 'shape.points.defaultValue', 6);
    applyGradientFill(star);

    const poly = newPolygon();
    addModifier(poly, 'roughen');
    select(poly);
  },
};
