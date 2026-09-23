import type { AnimationTemplate, BuildCtx } from '../types';
import type { Layer, ShapeLayer, TextLayer, Vec4 } from '../../core/types';
import { createCameraLayer, createProperty, createAnimationItemLayer } from '../../core/factory';
import { group, card, dot, label, assemble, setKeys, fadeIn, popIn, floatLoop, glow, EASE_IO, EASE_OUT } from '../kit';

// Pro tutorial, part 1: the "20 GB of storage" reveal. A 2.5D scene - a stack of storage blocks
// (blue at the base fading to gold at the top) rises bottom-to-top at staggered depths, a big gold
// counter tickers 0 -> 20 GB as a flat HUD over the 3D stack, glowing data sparks drift in the
// foreground, and a camera pushes in + trucks across so the near blocks parallax past the far ones.
// Authored 0-based; played via insertAnimationTemplateAnimated in the starter editor.

const DUR = 210; // 7s @ 30fps

const WHITE: Vec4 = [0.96, 0.97, 1, 1];
const GOLD: Vec4 = [1, 0.82, 0.2, 1];
const BLUE: Vec4 = [0.32, 0.56, 0.96, 1];
const PANEL: Vec4 = [0.06, 0.11, 0.2, 1];

// Promote a card/label to a real 3D layer at world depth `z` (positive = farther from the camera).
function depth<T extends ShapeLayer | TextLayer>(l: T, z: number): T {
  l.is3D = true;
  l.transform.positionZ = createProperty('Z Position', 'number', z);
  return l;
}
const mix = (a: Vec4, b: Vec4, t: number): Vec4 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];

function buildStorageReveal(ctx: BuildCtx): Layer[] {
  const W = ctx.center[0] * 2, H = ctx.center[1] * 2;
  const [cx, cy] = ctx.center;
  const zoom = (50 * W) / 36; // AE 50mm framing distance for this comp
  const g = group('20 GB Storage', ctx.center);

  // Far backdrop panel (deep in Z) to ground the stack.
  const panel = depth(card([0, 60], W * 0.9, H * 0.82, 40, PANEL), 1150);
  fadeIn(panel, 0, 20);

  // The stack: 10 blocks rising into place bottom -> top, colour lerping blue -> gold, each a bit
  // farther in Z than the one below so the camera truck parallaxes them.
  const N = 10, bw = 420, bh = 42, gap = 12, bottomY = 400;
  const blocks: ShapeLayer[] = [];
  for (let i = 0; i < N; i++) {
    const yc = bottomY - i * (bh + gap) - bh / 2;
    const b = depth(card([0, yc], bw, bh, 8, mix(BLUE, GOLD, i / (N - 1))), 130 + i * 22);
    const at = 18 + i * 11;
    setKeys(b.transform.position, [{ f: at, v: [0, yc + 64] }, { f: at + 13, v: [0, yc], ease: EASE_OUT }]);
    fadeIn(b, at, 8);
    if (i >= N - 3) glow(b, GOLD, 0.9, 20); // the top (gold) blocks glow
    blocks.push(b);
  }

  // The number: 0 -> 20 GB, big gold digits. A flat HUD (not 3D) so it stays crisp over the stack;
  // its value animates over the clip via the simulated data source (no keyframes needed).
  const counterCfg = {
    type: 'counter',
    config: {
      startValue: 0, endValue: 20, decimalPlaces: 0, thousandsSeparator: false,
      prefix: '', suffix: ' GB',
      digitStyle: { fillColor: GOLD, fontSize: 200, fontFamily: 'Inter', fontWeight: 800 },
      prefixStyle: {},
    },
  };
  const dataSource = { mode: 'simulated', simulatedStart: 0, simulatedEnd: 1, simulatedEasing: 'easeOut' };
  const counter = createAnimationItemLayer('20 GB', 0, -250, 'counter', JSON.stringify(counterCfg), JSON.stringify(dataSource), DUR);
  popIn(counter, 8, 16);

  const sub = label('of cloud storage', [0, -110], { size: 46, weight: 600, color: WHITE });
  fadeIn(sub, 26, 14);

  // Foreground data sparks (near the lens, strong parallax) for life.
  const sparks: ShapeLayer[] = [];
  const seed: [number, number, number][] = [[-330, 300, 10], [320, -30, 8], [-260, -210, 7], [360, 250, 9], [-380, 70, 6], [270, 190, 8]];
  seed.forEach(([x, y, r], i) => {
    const s = depth(dot([x, y], r, i % 2 ? GOLD : WHITE), -280 - i * 45);
    fadeIn(s, 30 + i * 7, 16);
    floatLoop(s, 10, 26, 100 + i * 13, 3, 30 + i * 7);
    glow(s, i % 2 ? GOLD : BLUE, 0.7, 14);
    sparks.push(s);
  });

  // Camera: gentle truck + push-in aimed at the centre - the parallax that makes it feel 2.5D.
  const cam = createCameraLayer('Camera', W, H, DUR);
  cam.transform.position = createProperty('Position', 'vec2', [cx, cy]);
  setKeys(cam.transform.position, [{ f: 0, v: [cx - 220, cy + 60], ease: EASE_IO }, { f: DUR, v: [cx + 170, cy - 40], ease: EASE_IO }]);
  cam.transform.positionZ = createProperty('Z Position', 'number', -zoom);
  setKeys(cam.transform.positionZ, [{ f: 0, v: -zoom * 1.35, ease: EASE_IO }, { f: DUR, v: -zoom * 0.98, ease: EASE_IO }]);
  cam.camera.pointOfInterest = createProperty('Point of Interest', 'vec2', [cx, cy]);
  cam.camera.pointOfInterestZ = createProperty('POI Z', 'number', 0);

  return assemble(g, [panel, ...blocks, ...sparks, counter, sub, cam], DUR);
}

export const storageReveal: AnimationTemplate = {
  id: 'storage-reveal',
  name: '20 GB Storage Reveal',
  category: 'showcase',
  description: 'A 2.5D stack of storage blocks builds up while a big counter tickers to 20 GB.',
  tags: ['pro', 'storage', '2.5d', 'counter', 'camera', 'showcase'],
  durationFrames: DUR,
  authorFps: 30,
  build: buildStorageReveal,
};
