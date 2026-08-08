import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, card, label, assemble, ellipse, fallLoop, spinLoop, twinkle, burstOut, fadeIn, setKeys, EASE_OUT, LINEAR } from '../kit';

// ---------- Rocket launch ----------
function buildRocket(ctx: { center: Vec2 }): Layer[] {
  const g = group('Rocket Launch', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, -300], 2000, 720, [0.05, 0.06, 0.16, 1]));
  c.push(box([0, 360], 2000, 420, [0.16, 0.28, 0.5, 1]));
  for (let i = 0; i < 18; i++) {
    const s = dot([((i * 173) % 1880) - 940, ((i * 67) % 640) - 560], 2, [1, 1, 1, 1]);
    twinkle(s, 26 + (i % 5) * 7, 7, (i % 6) * 4);
    c.push(s);
  }

  const rk = group('Rocket', [0, 0]);
  setKeys(rk.transform.position, [{ f: 0, v: [0, 340] }, { f: 150, v: [0, -360], ease: LINEAR }]);
  setKeys(rk.transform.opacity, [{ f: 0, v: 0 }, { f: 16, v: 1 }, { f: 130, v: 1 }, { f: 150, v: 0 }]);
  c.push(rk);

  const parts: Layer[] = [
    card([0, 0], 70, 170, 24, [0.9, 0.32, 0.32, 1]),
    dot([0, -92], 36, [0.82, 0.24, 0.24, 1]),
    dot([0, -28], 22, [0.6, 0.8, 1, 1]),
  ];
  const finL = box([-46, 66], 26, 64, [0.72, 0.2, 0.2, 1]); finL.transform.rotation.defaultValue = 14;
  const finR = box([46, 66], 26, 64, [0.72, 0.2, 0.2, 1]); finR.transform.rotation.defaultValue = -14;
  parts.push(finL, finR);
  for (const p of parts) { p.parentId = rk.id; c.push(p); }

  for (let i = 0; i < 3; i++) {
    const fl = ellipse(dot([0, 120 + i * 16], 26 - i * 5, i === 0 ? [1, 0.85, 0.35, 1] : [1, 0.5, 0.2, 1]), 1, 1.6);
    fl.parentId = rk.id;
    twinkle(fl, 8 + i * 2, 18, i, 0.4);
    c.push(fl);
  }
  return assemble(g, c, 150);
}

// ---------- Coffee with steam ----------
function buildCoffee(ctx: { center: Vec2 }): Layer[] {
  const g = group('Coffee', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, [0.9, 0.85, 0.78, 1]));
  c.push(ellipse(dot([0, 232], 150, [0.74, 0.69, 0.64, 1]), 1.6, 0.4)); // saucer
  c.push(card([0, 120], 230, 210, 24, [0.96, 0.97, 0.99, 1]));          // cup
  c.push(ellipse(dot([0, 28], 108, [0.3, 0.18, 0.1, 1]), 1, 0.32));     // coffee surface

  const handle = dot([138, 120], 44, [0, 0, 0, 0]);
  if (handle.shape.type === 'circle') { handle.shape.strokeColor = [0.96, 0.97, 0.99, 1]; handle.shape.strokeWidth.defaultValue = 16; }
  c.push(handle);

  for (let i = 0; i < 3; i++) {
    const wisp = ellipse(dot([-52 + i * 52, 0], 18, [1, 1, 1, 0.5]), 1, 1.8);
    fallLoop(wisp, -210, 70 + i * 10, 2, i * 20, 24);
    c.push(wisp);
  }
  return assemble(g, c, 150);
}

// ---------- Confetti pop ----------
function buildConfetti(ctx: { center: Vec2 }): Layer[] {
  const g = group('Confetti', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, [0.1, 0.11, 0.18, 1]));

  const flash = dot([0, 0], 30, [1, 1, 1, 1]);
  setKeys(flash.transform.scale, [{ f: 0, v: [0, 0] }, { f: 6, v: [2, 2], ease: EASE_OUT }]);
  setKeys(flash.transform.opacity, [{ f: 0, v: 1 }, { f: 10, v: 0, ease: EASE_OUT }]);
  c.push(flash);

  const palette: Vec4[] = [[1, 0.3, 0.4, 1], [0.3, 0.7, 1, 1], [1, 0.8, 0.3, 1], [0.5, 0.9, 0.5, 1], [0.8, 0.5, 1, 1]];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const col = palette[i % palette.length];
    const piece = i % 2 === 0 ? box([0, 0], 18, 10, col) : dot([0, 0], 8, col);
    burstOut(piece, i % 6, (360 / n) * i + (i % 3) * 8, 240 + (i % 4) * 40, 34);
    spinLoop(piece, 20 + (i % 4) * 6, 3, i % 6);
    c.push(piece);
  }
  return assemble(g, c, 120);
}

// ---------- Loading spinner ----------
function buildSpinner(ctx: { center: Vec2 }): Layer[] {
  const g = group('Loading', ctx.center);
  const c: Layer[] = [];
  c.push(card([0, 0], 360, 360, 40, [0.1, 0.12, 0.16, 1]));

  const nDots = 12; const r = 108; const period = 48; const cycles = 3;
  for (let i = 0; i < nDots; i++) {
    const a = (i / nDots) * Math.PI * 2;
    const d = dot([Math.cos(a) * r, Math.sin(a) * r], 14, [0.4, 0.7, 1, 1]);
    twinkle(d, period, cycles, Math.round((i / nDots) * period), 0.18);
    c.push(d);
  }
  const lbl = label('Loading…', [0, 150], { size: 30, weight: 600, color: [0.7, 0.78, 0.9, 1] });
  fadeIn(lbl, 0, 10);
  c.push(lbl);
  return assemble(g, c, period * cycles);
}

export const rocketLaunch: AnimationTemplate = {
  id: 'rocket-launch', name: 'Rocket Launch', category: 'fun',
  description: 'A rocket lifts off with a flickering flame past twinkling stars.',
  tags: ['rocket', 'space', 'launch', 'startup', 'fly', 'ship'],
  durationFrames: 150, authorFps: 30, build: buildRocket,
};
export const coffeeSteam: AnimationTemplate = {
  id: 'coffee-steam', name: 'Coffee', category: 'fun',
  description: 'A steaming cup of coffee with wisps rising on a loop.',
  tags: ['coffee', 'steam', 'cup', 'cafe', 'morning', 'tea'],
  durationFrames: 150, authorFps: 30, build: buildCoffee,
};
export const confettiPop: AnimationTemplate = {
  id: 'confetti-pop', name: 'Confetti Pop', category: 'fun',
  description: 'A burst of tumbling confetti explodes from the centre.',
  tags: ['confetti', 'celebration', 'party', 'congrats', 'pop', 'win'],
  durationFrames: 120, authorFps: 30, build: buildConfetti,
};
export const loadingSpinner: AnimationTemplate = {
  id: 'loading-spinner', name: 'Loading Spinner', category: 'ui',
  description: 'A classic chasing-dot loading spinner with a label.',
  tags: ['loading', 'spinner', 'loader', 'progress', 'wait', 'ui'],
  durationFrames: 144, authorFps: 30, build: buildSpinner,
};
