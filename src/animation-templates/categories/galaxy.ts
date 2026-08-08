import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, assemble, ellipse, glow, orbit, twinkle } from '../kit';

const SPACE: Vec4 = [0.03, 0.03, 0.08, 1];
const CORE: Vec4 = [1, 0.92, 0.68, 1];
const CORE_GLOW: Vec4 = [1, 0.7, 0.35, 1];
const RING: Vec4 = [0.45, 0.5, 0.75, 0.32];
const STAR: Vec4 = [1, 1, 1, 1];

// period must divide the clip length so every planet loops seamlessly.
const DUR = 240;
const PLANETS: { r: number; size: number; color: Vec4; period: number; phase: number; glow?: Vec4 }[] = [
  { r: 175, size: 15, color: [0.5, 0.7, 1, 1], period: 60, phase: 0 },
  { r: 290, size: 22, color: [1, 0.55, 0.4, 1], period: 80, phase: 1.4 },
  { r: 300, size: 9, color: [0.8, 0.9, 1, 1], period: 80, phase: 3.9 }, // a moon sharing the 2nd orbit
  { r: 420, size: 30, color: [0.7, 0.85, 0.6, 1], period: 120, phase: 2.5 },
  { r: 545, size: 18, color: [0.75, 0.6, 1, 1], period: 240, phase: 5.0 },
];

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Galaxy', ctx.center);
  const c: Layer[] = [];

  c.push(box([0, 0], 2000, 1300, SPACE));

  // Starfield
  for (let i = 0; i < 44; i++) {
    const x = ((i * 173) % 1900) - 950;
    const y = ((i * 101) % 1180) - 590;
    const s = dot([x, y], 1.5 + (i % 3), STAR);
    twinkle(s, 26 + (i % 6) * 7, 8, (i % 9) * 3);
    c.push(s);
  }

  // Orbit rings (flattened circle outlines, behind the planets)
  for (const rad of [175, 290, 420, 545]) {
    const ring = ellipse(dot([0, 0], rad, [0, 0, 0, 0]), 1, 0.42);
    if (ring.shape.type === 'circle') {
      ring.shape.strokeColor = RING;
      ring.shape.strokeWidth.defaultValue = 2;
    }
    c.push(ring);
  }

  // Glowing core
  const core = dot([0, 0], 58, CORE);
  glow(core, CORE_GLOW, 2.2, 96);
  c.push(core);

  // Planets on elliptical orbits (flattened for a tilted-disk look)
  for (const p of PLANETS) {
    const planet = dot([0, 0], p.size, p.color);
    if (p.glow) glow(planet, p.glow, 1.2, 30);
    orbit(planet, p.r, p.r * 0.42, p.period, DUR / p.period, p.phase);
    c.push(planet);
  }

  return assemble(g, c, DUR);
}

export const galaxyScene: AnimationTemplate = {
  id: 'galaxy',
  name: 'Galaxy',
  category: 'scenes',
  description: 'A glowing core with planets orbiting on tilted rings over a starfield.',
  tags: ['galaxy', 'space', 'planets', 'orbit', 'solar system', 'stars', 'scene'],
  durationFrames: DUR,
  authorFps: 30,
  build,
};
