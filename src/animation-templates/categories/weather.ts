import type { Layer, Vec2 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, assemble, ellipse, glow, floatLoop, fallLoop, twinkle, setKeys, EASE_IO } from '../kit';

// ---------- Sunset ----------
function buildSunset(ctx: { center: Vec2 }): Layer[] {
  const g = group('Sunset', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, -380], 2000, 360, [0.34, 0.27, 0.5, 1]));   // purple top
  c.push(box([0, -140], 2000, 240, [0.95, 0.55, 0.4, 1]));   // orange
  c.push(box([0, 60], 2000, 200, [1, 0.8, 0.45, 1]));        // yellow horizon
  c.push(box([0, 330], 2000, 460, [0.18, 0.2, 0.4, 1]));     // sea

  const refl = ellipse(box([0, 340], 90, 420, [1, 0.8, 0.5, 0.22]), 1, 1);
  twinkle(refl, 30, 6, 0, 0.4);
  c.push(refl);

  const sun = dot([0, 90], 112, [1, 0.86, 0.5, 1]);
  glow(sun, [1, 0.6, 0.3, 1], 2, 110);
  floatLoop(sun, 0, 10, 90, 2);
  c.push(sun);

  for (let i = 0; i < 3; i++) {
    const bird = ellipse(dot([-500 + i * 200, -320 + i * 30], 8, [0.15, 0.12, 0.2, 1]), 2.2, 0.5);
    floatLoop(bird, 90, 8, 90 - i * 10, 2, 0, i);
    c.push(bird);
  }
  return assemble(g, c, 180);
}

// ---------- Rain ----------
function buildRain(ctx: { center: Vec2 }): Layer[] {
  const g = group('Rain', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, [0.28, 0.32, 0.4, 1]));
  for (let i = 0; i < 3; i++) {
    const cl = ellipse(dot([-460 + i * 460, -300 + (i % 2) * 40], 78, [0.42, 0.46, 0.54, 1]), 3.6, 0.6);
    floatLoop(cl, 40, 5, 130 - i * 14, 3, 0, i);
    c.push(cl);
  }
  for (let i = 0; i < 28; i++) {
    const x = ((i * 137) % 1840) - 920;
    const drop = box([x, -200], 3, 26, [0.7, 0.8, 0.95, 0.8]);
    fallLoop(drop, 660, 26 + (i % 5) * 3, 6, (i * 7) % 30, 10);
    c.push(drop);
  }
  c.push(box([0, 470], 2000, 260, [0.2, 0.24, 0.3, 1]));
  for (let i = 0; i < 3; i++) {
    const ring = ellipse(dot([-360 + i * 360, 380], 40, [0, 0, 0, 0]), 1, 0.4);
    if (ring.shape.type === 'circle') { ring.shape.strokeColor = [0.7, 0.8, 0.95, 0.6]; ring.shape.strokeWidth.defaultValue = 3; }
    const period = 40; const cycles = 4;
    const sc: { f: number; v: Vec2; ease?: typeof EASE_IO }[] = [];
    const op: { f: number; v: number; ease?: typeof EASE_IO }[] = [];
    for (let k = 0; k < cycles; k++) {
      const b = i * 13 + k * period;
      sc.push({ f: b, v: [0.2, 0.08] }); sc.push({ f: b + period - 1, v: [1.5, 0.6], ease: EASE_IO });
      op.push({ f: b, v: 0.8 }); op.push({ f: b + period - 1, v: 0, ease: EASE_IO });
    }
    setKeys(ring.transform.scale, sc);
    setKeys(ring.transform.opacity, op);
    c.push(ring);
  }
  return assemble(g, c, 180);
}

// ---------- City skyline ----------
function buildCity(ctx: { center: Vec2 }): Layer[] {
  const g = group('City Skyline', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, [0.08, 0.1, 0.2, 1]));

  const moon = dot([560, -300], 60, [0.95, 0.96, 0.9, 1]);
  glow(moon, [0.7, 0.75, 0.95, 1], 1.2, 44);
  c.push(moon);
  for (let i = 0; i < 16; i++) {
    const s = dot([((i * 181) % 1880) - 940, ((i * 71) % 460) - 500], 2, [1, 1, 1, 1]);
    twinkle(s, 26 + (i % 5) * 7, 7, (i % 6) * 4);
    c.push(s);
  }

  const buildings = [
    { x: -760, w: 180, h: 360 }, { x: -540, w: 150, h: 500 }, { x: -340, w: 200, h: 300 },
    { x: -110, w: 170, h: 560 }, { x: 110, w: 210, h: 420 }, { x: 350, w: 160, h: 620 },
    { x: 560, w: 190, h: 380 }, { x: 780, w: 170, h: 480 },
  ];
  for (const b of buildings) {
    const topY = 540 - b.h;
    c.push(box([b.x, topY + b.h / 2], b.w, b.h, [0.11, 0.13, 0.22, 1]));
    // window grid
    const cols = Math.max(2, Math.floor(b.w / 46));
    const rows = Math.max(2, Math.floor(b.h / 60));
    for (let cx = 0; cx < cols; cx++) {
      for (let ry = 0; ry < rows; ry++) {
        if ((cx + ry * 3) % 5 === 0) continue; // some dark windows
        const wx = b.x - b.w / 2 + 22 + cx * (b.w / cols);
        const wy = topY + 26 + ry * (b.h / rows);
        const win = box([wx, wy], 14, 20, [1, 0.85, 0.45, 1]);
        if ((cx * 2 + ry) % 4 === 0) twinkle(win, 40 + (cx % 3) * 12, 4, (cx + ry) * 5, 0.25);
        c.push(win);
      }
    }
  }
  return assemble(g, c, 180);
}

// ---------- Snow ----------
function buildSnow(ctx: { center: Vec2 }): Layer[] {
  const g = group('Snow', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, [0.46, 0.56, 0.72, 1]));
  c.push(ellipse(dot([0, 470], 180, [0.9, 0.93, 0.98, 1]), 7, 1.1)); // snowy ground mound

  // snowman
  c.push(dot([300, 340], 70, [0.96, 0.97, 1, 1]));
  c.push(dot([300, 250], 52, [0.96, 0.97, 1, 1]));
  const head = dot([300, 175], 40, [0.96, 0.97, 1, 1]);
  c.push(head);
  c.push(dot([288, 168], 5, [0.1, 0.1, 0.12, 1]));
  c.push(dot([312, 168], 5, [0.1, 0.1, 0.12, 1]));
  c.push(box([300, 182], 26, 8, [0.95, 0.5, 0.2, 1])); // carrot nose

  for (let i = 0; i < 34; i++) {
    const x = ((i * 149) % 1880) - 940;
    const flake = dot([x, -560], 3 + (i % 3), [1, 1, 1, 0.95]);
    fallLoop(flake, 1120, 90 + (i % 5) * 16, 2, (i * 11) % 80, 26);
    c.push(flake);
  }
  return assemble(g, c, 180);
}

export const sunsetScene: AnimationTemplate = {
  id: 'sunset', name: 'Sunset', category: 'scenes',
  description: 'A sun sinking into the sea under warm gradient skies, with drifting birds.',
  tags: ['sunset', 'sea', 'sky', 'evening', 'ocean', 'scene', 'sun'],
  durationFrames: 180, authorFps: 30, build: buildSunset,
};
export const rainScene: AnimationTemplate = {
  id: 'rain', name: 'Rain', category: 'scenes',
  description: 'Rain falls from drifting clouds and ripples in puddles below.',
  tags: ['rain', 'weather', 'storm', 'clouds', 'water', 'scene'],
  durationFrames: 180, authorFps: 30, build: buildRain,
};
export const cityScene: AnimationTemplate = {
  id: 'city-skyline', name: 'City Skyline', category: 'scenes',
  description: 'A night skyline with a glowing moon and twinkling windows.',
  tags: ['city', 'skyline', 'buildings', 'night', 'urban', 'scene', 'windows'],
  durationFrames: 180, authorFps: 30, build: buildCity,
};
export const snowScene: AnimationTemplate = {
  id: 'snow', name: 'Snow', category: 'scenes',
  description: 'Snowflakes drift down over a snowman on a winter evening.',
  tags: ['snow', 'winter', 'snowman', 'christmas', 'cold', 'scene'],
  durationFrames: 180, authorFps: 30, build: buildSnow,
};
