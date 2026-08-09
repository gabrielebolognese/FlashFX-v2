import type { AnimationTemplate, BuildCtx } from '../types';
import type { Layer, ShapeLayer, TextLayer, Vec4 } from '../../core/types';
import { createCameraLayer, createProperty } from '../../core/factory';
import { group, card, dot, label, assemble, setKeys, fadeIn, popIn, floatLoop, EASE_IO } from '../kit';

// A 2.5D showcase: shape/text CARDS placed at different depths (world Z) with a real Camera that
// TRUCKS across and PUSHES in while aiming at a fixed focal plane — so the near cards sweep across
// the frame far faster than the distant ones (parallax). This is the camera used meaningfully:
// nothing but the camera's own move creates the motion between the layers.

const DUR = 180; // 6s @ 30fps

const WHITE: Vec4 = [0.96, 0.97, 1.0, 1];
const AMBER: Vec4 = [0.97, 0.71, 0.0, 1];
const BLUE: Vec4 = [0.35, 0.55, 0.95, 1];
const PANEL: Vec4 = [0.09, 0.12, 0.2, 1];

// Promote a card to a real 3D layer at world depth `z` (positive = farther from the camera).
function depth<T extends ShapeLayer | TextLayer>(l: T, z: number): T {
  l.is3D = true;
  l.transform.positionZ = createProperty('Z Position', 'number', z);
  return l;
}

function buildParallax(ctx: BuildCtx): Layer[] {
  const W = ctx.center[0] * 2;
  const H = ctx.center[1] * 2;
  const [cx, cy] = ctx.center;
  const zoom = (50 * W) / 36; // AE 50mm framing distance for this comp

  const g = group('2.5D Parallax', ctx.center);

  // Far backdrop panel (deep in Z).
  const panel = depth(card([0, 0], W * 0.92, H * 0.72, 30, PANEL), 1150);
  fadeIn(panel, 0, 22);

  // Title + subtitle sit on the focal plane (z=0) — the camera pivots around them.
  const title = depth(label('2.5D CAMERA', [0, -24], { size: 122, weight: 800, color: WHITE }), 0);
  const sub = depth(label('parallax in real space', [0, 92], { size: 40, weight: 500, color: AMBER }), 0);
  popIn(title, 8);
  fadeIn(sub, 26, 16);

  // Accents at staggered depths — some behind the title, some in FRONT of it (negative Z, nearest
  // the lens) so they streak across the frame as the camera moves.
  const accents: ShapeLayer[] = [
    depth(card([-440, -200], 190, 120, 16, BLUE), 340),
    depth(card([480, 70], 150, 150, 22, AMBER), 620),
    depth(dot([-360, 260], 46, AMBER), -360),
    depth(dot([430, -250], 58, BLUE), 240),
    depth(dot([-660, 340], 30, WHITE), -560), // very near foreground → strongest parallax
    depth(dot([700, -300], 34, WHITE), -500),
    depth(dot([120, 380], 22, AMBER), -300),
  ];
  accents.forEach((a, i) => {
    fadeIn(a, 10 + i * 4, 14);
    floatLoop(a, 0, 10 + (i % 3) * 6, 92 + i * 11, 3);
  });

  // ── The camera ── two-node (aims at the focal plane), trucking left→right and pushing in.
  const cam = createCameraLayer('Camera', W, H, DUR);
  cam.transform.position = createProperty('Position', 'vec2', [cx, cy]);
  setKeys(cam.transform.position, [
    { f: 0, v: [cx - 560, cy + 70], ease: EASE_IO },
    { f: DUR, v: [cx + 560, cy - 70], ease: EASE_IO },
  ]);
  cam.transform.positionZ = createProperty('Z Position', 'number', -zoom);
  setKeys(cam.transform.positionZ, [
    { f: 0, v: -zoom * 1.4, ease: EASE_IO },
    { f: DUR, v: -zoom * 0.95, ease: EASE_IO },
  ]);
  // Point of interest locked on the title (comp centre, z=0) for the whole move.
  cam.camera.pointOfInterest = createProperty('Point of Interest', 'vec2', [cx, cy]);
  cam.camera.pointOfInterestZ = createProperty('POI Z', 'number', 0);

  // Everything (incl. the camera) parents to the group so the template stays one unit. The
  // resolve reads the camera's LOCAL transform (it isn't parent-composed), so its comp-space
  // keyframes above are used as-is — parenting is inert for the camera, just tidy.
  return assemble(g, [panel, title, sub, ...accents, cam], DUR);
}

export const parallaxDepth: AnimationTemplate = {
  id: 'parallax',
  name: '2.5D Camera Parallax',
  category: 'showcase',
  description: 'Cards at different depths with a camera that trucks across and pushes in — real parallax.',
  tags: ['3d', '2.5d', 'camera', 'parallax', 'depth', 'title', 'showcase'],
  durationFrames: DUR,
  authorFps: 30,
  build: buildParallax,
};
