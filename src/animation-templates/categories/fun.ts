import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, card, assemble, growRight, spinLoop, burstOut, twinkle, setKeys, LINEAR, EASE_OUT } from '../kit';

// ---------- Pen writing ----------
const PAPER: Vec4 = [0.97, 0.96, 0.93, 1];
const INK: Vec4 = [0.15, 0.25, 0.5, 1];
const PEN: Vec4 = [0.12, 0.14, 0.2, 1];
const NIB: Vec4 = [0.92, 0.76, 0.32, 1];

function buildPen(ctx: { center: Vec2 }): Layer[] {
  const g = group('Pen Writing', ctx.center);
  const c: Layer[] = [];

  c.push(card([0, 0], 1120, 680, 22, PAPER));

  const leftX = -430;
  const lines = [
    { y: -130, w: 780, at: 0, dur: 46 },
    { y: 6, w: 660, at: 50, dur: 40 },
    { y: 132, w: 520, at: 92, dur: 34 },
  ];
  for (const ln of lines) {
    const stroke = box([leftX, ln.y], ln.w, 14, INK);
    growRight(stroke, leftX, ln.w, ln.at, ln.dur);
    c.push(stroke);
  }

  // Pen: an angled body with a nib at its tip that tracks the current writing point.
  const ROT = -32;
  const OFF: Vec2 = [39.7, 63.6]; // R(ROT)·[0,75] — offsets the body so the nib lands on the line
  const body = box([0, 0], 18, 150, PEN);
  body.transform.rotation.defaultValue = ROT;
  const keys: { f: number; v: Vec2; ease?: typeof LINEAR }[] = [];
  for (const ln of lines) {
    const ty = ln.y - 26;
    keys.push({ f: ln.at, v: [leftX - OFF[0], ty - OFF[1]] });
    keys.push({ f: ln.at + ln.dur, v: [leftX + ln.w - OFF[0], ty - OFF[1]], ease: LINEAR });
  }
  setKeys(body.transform.position, keys);
  c.push(body);

  const nib = dot([0, 75], 7, NIB); // body-local tip
  nib.parentId = body.id;
  c.push(nib);

  return assemble(g, c, 140);
}

// ---------- Clock ----------
const FACE: Vec4 = [0.96, 0.97, 0.99, 1];
const RIM: Vec4 = [0.2, 0.24, 0.32, 1];
const TICK: Vec4 = [0.3, 0.35, 0.45, 1];
const DARK: Vec4 = [0.15, 0.18, 0.25, 1];
const SEC: Vec4 = [0.9, 0.3, 0.3, 1];
const CLOCK_DUR = 180;

function hand(pivotName: string, hueKeys: { f: number; v: number }[] | null, spin: [number, number] | null,
  w: number, len: number, color: Vec4, children: Layer[]): void {
  const pivot = group(pivotName, [0, 0]);
  if (spin) spinLoop(pivot, spin[0], spin[1]);
  else if (hueKeys) setKeys(pivot.transform.rotation, hueKeys);
  children.push(pivot);
  const h = box([0, -len / 2 + 20], w, len, color);
  h.parentId = pivot.id;
  children.push(h);
}

function buildClock(ctx: { center: Vec2 }): Layer[] {
  const g = group('Clock', ctx.center);
  const c: Layer[] = [];

  c.push(dot([0, 0], 272, RIM));
  c.push(dot([0, 0], 256, FACE));

  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const tick = box([Math.sin(a) * 224, -Math.cos(a) * 224], i % 3 === 0 ? 9 : 5, i % 3 === 0 ? 30 : 22, TICK);
    tick.transform.rotation.defaultValue = i * 30;
    c.push(tick);
  }

  hand('hour', [{ f: 0, v: 0 }, { f: CLOCK_DUR, v: 120 }], null, 12, 150, DARK, c);
  hand('minute', [{ f: 0, v: 0 }, { f: CLOCK_DUR, v: 720 }], null, 8, 210, DARK, c);
  hand('second', null, [60, CLOCK_DUR / 60], 4, 240, SEC, c);

  c.push(dot([0, 0], 14, DARK));
  return assemble(g, c, CLOCK_DUR);
}

// ---------- Fireworks ----------
const SKY: Vec4 = [0.03, 0.04, 0.1, 1];
const STAR: Vec4 = [1, 1, 1, 1];
const STREAK: Vec4 = [1, 1, 0.8, 0.85];

function buildFireworks(ctx: { center: Vec2 }): Layer[] {
  const g = group('Fireworks', ctx.center);
  const c: Layer[] = [];

  c.push(box([0, 0], 2000, 1300, SKY));
  for (let i = 0; i < 16; i++) {
    const s = dot([((i * 191) % 1880) - 940, ((i * 89) % 500) - 500], 2, STAR);
    twinkle(s, 28 + (i % 4) * 8, 6, (i % 5) * 4);
    c.push(s);
  }

  const bursts: { x: number; y: number; at: number; color: Vec4 }[] = [
    { x: -380, y: -120, at: 20, color: [1, 0.6, 0.3, 1] },
    { x: 300, y: -210, at: 58, color: [0.4, 0.72, 1, 1] },
    { x: -40, y: -30, at: 100, color: [1, 0.42, 0.72, 1] },
  ];
  for (const b of bursts) {
    const streak = box([b.x, 520], 5, 42, STREAK);
    setKeys(streak.transform.position, [{ f: b.at - 16, v: [b.x, 520] }, { f: b.at, v: [b.x, b.y], ease: EASE_OUT }, { f: b.at + 1, v: [b.x, b.y] }]);
    setKeys(streak.transform.opacity, [{ f: b.at - 16, v: 0 }, { f: b.at - 14, v: 1 }, { f: b.at, v: 0 }]);
    c.push(streak);

    const n = 18;
    for (let i = 0; i < n; i++) {
      const spark = dot([b.x, b.y], 6, b.color);
      burstOut(spark, b.at, (360 / n) * i, 150 + (i % 3) * 34, 28);
      c.push(spark);
    }
  }

  return assemble(g, c, 150);
}

export const penWriting: AnimationTemplate = {
  id: 'pen-writing',
  name: 'Pen Writing',
  category: 'fun',
  description: 'A pen glides across paper as handwriting draws on, line by line.',
  tags: ['pen', 'writing', 'handwriting', 'signature', 'draw', 'ink'],
  durationFrames: 140,
  authorFps: 30,
  build: buildPen,
};

export const clockTick: AnimationTemplate = {
  id: 'clock',
  name: 'Clock',
  category: 'fun',
  description: 'A clock face with sweeping hour, minute, and second hands.',
  tags: ['clock', 'time', 'watch', 'hands', 'tick', 'countdown'],
  durationFrames: CLOCK_DUR,
  authorFps: 30,
  build: buildClock,
};

export const fireworks: AnimationTemplate = {
  id: 'fireworks',
  name: 'Fireworks',
  category: 'fun',
  description: 'Bursts of sparks launch and explode across a starry sky.',
  tags: ['fireworks', 'celebration', 'party', 'burst', 'new year', 'sparks'],
  durationFrames: 150,
  authorFps: 30,
  build: buildFireworks,
};
