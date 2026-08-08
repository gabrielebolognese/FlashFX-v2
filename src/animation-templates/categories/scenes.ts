import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, assemble, ellipse, glow, floatLoop, swayLoop, spinLoop, twinkle, setKeys, EASE_OUT } from '../kit';

// Looping illustrated scenes — decorative animated backdrops built from ordinary shape layers with
// ambient loop keyframes (drift, sway, twinkle). Authored back-to-front (earlier child = further
// back), group-local around (0,0); the comp is 1920×1080 so local x∈[-960,960], y∈[-540,540].

// ---------- Beach with moving waves ----------
const B = {
  sky: [0.53, 0.78, 0.95, 1] as Vec4,
  sun: [1, 0.86, 0.42, 1] as Vec4,
  sunGlow: [1, 0.8, 0.3, 1] as Vec4,
  cloud: [1, 1, 1, 0.92] as Vec4,
  sea: [0.1, 0.46, 0.62, 1] as Vec4,
  foam: [0.82, 0.93, 0.96, 0.5] as Vec4,
  sand: [0.94, 0.86, 0.6, 1] as Vec4,
  ball: [0.95, 0.32, 0.32, 1] as Vec4,
};

function buildBeach(ctx: { center: Vec2 }): Layer[] {
  const g = group('Beach', ctx.center);
  const c: Layer[] = [];

  c.push(box([0, -200], 2000, 720, B.sky));
  c.push(box([0, 120], 2000, 360, B.sea));
  c.push(box([0, 400], 2000, 380, B.sand));

  const sun = dot([430, -300], 84, B.sun);
  glow(sun, B.sunGlow, 1.5, 64);
  floatLoop(sun, 0, 12, 96, 2);
  c.push(sun);

  for (let i = 0; i < 3; i++) {
    const cloud = ellipse(dot([-520 + i * 520, -330 + (i % 2) * 44], 72, B.cloud), 3.6, 0.55);
    floatLoop(cloud, 70 + i * 20, 6, 120 - i * 16, 3, 0, i);
    c.push(cloud);
  }

  for (let i = 0; i < 5; i++) {
    const w = ellipse(dot([-420 + i * 220, -10 + i * 34], 80, B.foam), 7, 0.26);
    floatLoop(w, 46 + i * 10, 7, 58 + i * 12, 4, 0, i * 0.6);
    c.push(w);
  }

  const ball = dot([430, 300], 46, B.ball);
  floatLoop(ball, 10, 18, 40, 4);
  c.push(ball);

  return assemble(g, c, 180);
}

// ---------- Forest ----------
const F = {
  sky: [0.74, 0.85, 0.86, 1] as Vec4,
  sun: [1, 0.94, 0.72, 1] as Vec4,
  sunGlow: [1, 0.9, 0.6, 1] as Vec4,
  hillFar: [0.32, 0.45, 0.3, 1] as Vec4,
  hillMid: [0.28, 0.42, 0.26, 1] as Vec4,
  ground: [0.35, 0.5, 0.28, 1] as Vec4,
  trunk: [0.36, 0.24, 0.16, 1] as Vec4,
  canopy: [0.22, 0.44, 0.24, 1] as Vec4,
  canopy2: [0.28, 0.5, 0.28, 1] as Vec4,
  leaf: [0.86, 0.55, 0.2, 1] as Vec4,
};

function buildForest(ctx: { center: Vec2 }): Layer[] {
  const g = group('Forest', ctx.center);
  const c: Layer[] = [];

  c.push(box([0, -220], 2000, 680, F.sky));

  const sun = dot([-380, -300], 72, F.sun);
  glow(sun, F.sunGlow, 1.3, 58);
  c.push(sun);

  c.push(ellipse(dot([-320, 170], 130, F.hillFar), 7, 1.1));
  c.push(ellipse(dot([420, 200], 130, F.hillMid), 7, 1.1));
  c.push(box([0, 400], 2000, 380, F.ground));

  const treeXs = [-640, -330, 30, 380, 700];
  treeXs.forEach((x, i) => {
    const depth = 0.7 + (i % 3) * 0.18;
    const baseY = 250;
    c.push(box([x, baseY], 26 * depth, 190 * depth, F.trunk));
    const canopy = dot([x, baseY - 156 * depth], 92 * depth, i % 2 ? F.canopy2 : F.canopy);
    swayLoop(canopy, 3, 70 + i * 8, 3, i * 4);
    c.push(canopy);
    const cl = dot([x - 42 * depth, baseY - 112 * depth], 64 * depth, F.canopy);
    swayLoop(cl, 3, 74 + i * 8, 3, i * 4 + 2);
    c.push(cl);
    const cr = dot([x + 44 * depth, baseY - 118 * depth], 62 * depth, F.canopy2);
    swayLoop(cr, 3, 72 + i * 8, 3, i * 4 + 3);
    c.push(cr);
  });

  for (let i = 0; i < 5; i++) {
    const leaf = dot([-520 + i * 270, -110 + i * 36], 10, F.leaf);
    floatLoop(leaf, 34, 44, 58 + i * 10, 3, i * 8, i);
    spinLoop(leaf, 52, 3, i * 8);
    c.push(leaf);
  }

  return assemble(g, c, 180);
}

// ---------- Night sky ----------
const N = {
  sky: [0.04, 0.05, 0.13, 1] as Vec4,
  moon: [0.95, 0.96, 0.88, 1] as Vec4,
  moonGlow: [0.7, 0.78, 0.95, 1] as Vec4,
  star: [1, 1, 1, 1] as Vec4,
  shoot: [1, 1, 0.9, 1] as Vec4,
  hill: [0.02, 0.03, 0.07, 1] as Vec4,
};

function buildNight(ctx: { center: Vec2 }): Layer[] {
  const g = group('Night Sky', ctx.center);
  const c: Layer[] = [];

  c.push(box([0, 0], 2000, 1200, N.sky));

  const moon = dot([440, -260], 76, N.moon);
  glow(moon, N.moonGlow, 1.2, 52);
  floatLoop(moon, 0, 8, 120, 2);
  c.push(moon);

  for (let i = 0; i < 26; i++) {
    const x = ((i * 167) % 1860) - 930;
    const y = ((i * 97) % 620) - 520;
    const s = dot([x, y], 2 + (i % 3), N.star);
    twinkle(s, 24 + (i % 5) * 8, 6, (i % 7) * 3);
    c.push(s);
  }

  // A shooting star that streaks across, resets invisibly, and repeats.
  const streak = ellipse(dot([-700, -360], 6, N.shoot), 9, 0.5);
  streak.transform.rotation.defaultValue = -20;
  setKeys(streak.transform.position, [
    { f: 0, v: [-700, -360] }, { f: 22, v: [320, -140], ease: EASE_OUT }, { f: 23, v: [-700, -360] },
    { f: 120, v: [-700, -360] }, { f: 142, v: [320, -140], ease: EASE_OUT }, { f: 143, v: [-700, -360] },
  ]);
  setKeys(streak.transform.opacity, [
    { f: 0, v: 0 }, { f: 3, v: 1 }, { f: 22, v: 0 }, { f: 23, v: 0 },
    { f: 120, v: 0 }, { f: 123, v: 1 }, { f: 142, v: 0 }, { f: 143, v: 0 },
  ]);
  c.push(streak);

  c.push(ellipse(dot([0, 470], 150, N.hill), 8, 1.0));

  return assemble(g, c, 210);
}

export const beachScene: AnimationTemplate = {
  id: 'beach-waves',
  name: 'Beach',
  category: 'scenes',
  description: 'A sunny beach with drifting clouds and rolling waves, on a loop.',
  tags: ['beach', 'ocean', 'waves', 'sea', 'summer', 'scene', 'water'],
  durationFrames: 180,
  authorFps: 30,
  build: buildBeach,
};

export const forestScene: AnimationTemplate = {
  id: 'forest',
  name: 'Forest',
  category: 'scenes',
  description: 'Layered trees swaying in the breeze with drifting leaves.',
  tags: ['forest', 'trees', 'nature', 'woods', 'leaves', 'scene'],
  durationFrames: 180,
  authorFps: 30,
  build: buildForest,
};

export const nightScene: AnimationTemplate = {
  id: 'night-sky',
  name: 'Night Sky',
  category: 'scenes',
  description: 'A glowing moon over twinkling stars with a shooting star.',
  tags: ['night', 'stars', 'moon', 'sky', 'space', 'shooting star', 'scene'],
  durationFrames: 210,
  authorFps: 30,
  build: buildNight,
};
