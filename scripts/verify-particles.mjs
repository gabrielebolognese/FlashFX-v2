// Acceptance harness for the particle engine (B19). Bundles particles/{engine,presets,dissolve}.ts and
// asserts with node:assert: frame-purity (deterministic re-simulation for the timeline scrub), the new
// forces (wind, attractor), gravity/drag/lifetime, the points/dissolve emitter, and preset validity.
// The sim is pure math (no canvas); the render (2D canvas) is separate.
//   node scripts/verify-particles.mjs   (or: npm run verify:particles)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'particles-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

// minimal config: one deterministic particle from the origin, no forces, long life
function base(over) {
  return {
    id: 'x', name: 't', maxParticles: 20, spawnRate: 0, burstCount: 1, burstRepeat: false, burstInterval: 1,
    emitterShape: 'point', emitterRadius: 0, emitterWidth: 0, emitterHeight: 0,
    initialSpeed: { min: 0, max: 0 }, initialAngle: { min: 0, max: 0 }, initialSize: { min: 4, max: 4 },
    initialRotation: { min: 0, max: 0 }, lifetime: { min: 100, max: 100 },
    gravity: [0, 0], drag: 0, turbulenceStrength: 0, turbulenceScale: 0.01, spinSpeed: { min: 0, max: 0 },
    sizeOverLife: [1], opacityOverLife: [1], colorOverLife: [{ t: 0, color: [1, 1, 1, 1] }],
    blendMode: 'alpha', spriteShape: 'circle', trailLength: 0, ...over,
  };
}

try {
  const E = await bundle('src/particles/engine.ts', 'engine.mjs');
  const P = await bundle('src/particles/presets.ts', 'presets.mjs');
  const D = await bundle('src/particles/dissolve.ts', 'dissolve.mjs');
  const { ParticleEngine } = E;
  const { PARTICLE_PRESETS, PRESET_NAMES, createEmitterConfig } = P;
  const { sampleRegionPoints, sampleMaskPoints } = D;
  const FPS = 30, DT = 1 / FPS;

  check('frame-purity: same config+seed -> identical state; scrub back matches a fresh sim', () => {
    const cfg = createEmitterConfig({ spawnRate: 80, maxParticles: 200, gravity: [0, 80], turbulenceStrength: 20 });
    const a = new ParticleEngine(cfg, 12345, FPS); a.seekToFrame(40);
    const b = new ParticleEngine(cfg, 12345, FPS); b.seekToFrame(40);
    assert.equal(a.getAliveCount(), b.getAliveCount(), 'same alive count');
    assert.deepEqual(a.getParticles(), b.getParticles(), 'identical particle state');
    // scrub: go forward then back to 20, compare to a fresh sim to 20
    a.seekToFrame(60); a.seekToFrame(20);
    const fresh = new ParticleEngine(cfg, 12345, FPS); fresh.seekToFrame(20);
    assert.deepEqual(a.getParticles(), fresh.getParticles(), 'scrub-back is deterministic');
  });

  check('gravity accelerates downward', () => {
    const e = new ParticleEngine(base({ gravity: [0, 120] }), 1, FPS);
    e.seekToFrame(1); // spawns the burst at frame 0, simulates 1 frame
    const p = e.getParticles()[0];
    assert.ok(p && near(p.vy, 120 * DT, 1e-6), `vy=${p && p.vy}`);
    assert.ok(p.vx === 0);
  });

  check('drag decelerates a moving particle', () => {
    const e = new ParticleEngine(base({ initialSpeed: { min: 100, max: 100 }, initialAngle: { min: 0, max: 0 }, drag: 2 }), 1, FPS);
    e.seekToFrame(1);
    const p = e.getParticles()[0];
    assert.ok(p.vx < 100 && p.vx > 0, `drag: vx=${p.vx}`);
    assert.ok(near(p.vx, 100 * (1 - 2 * DT), 1e-6));
  });

  check('wind adds a constant directional force', () => {
    const e = new ParticleEngine(base({ wind: [300, 0] }), 1, FPS);
    e.seekToFrame(1);
    const p = e.getParticles()[0];
    assert.ok(near(p.vx, 300 * DT, 1e-6), `wind vx=${p.vx}`);
  });

  check('attractor pulls particles toward its point (and repels when negative)', () => {
    const pull = new ParticleEngine(base({ attractor: { x: 100, y: 0, strength: 800, radius: 300 } }), 1, FPS);
    pull.seekToFrame(1);
    assert.ok(pull.getParticles()[0].vx > 0, 'pulled toward +x');
    const push = new ParticleEngine(base({ attractor: { x: 100, y: 0, strength: -800, radius: 300 } }), 1, FPS);
    push.seekToFrame(1);
    assert.ok(push.getParticles()[0].vx < 0, 'pushed away');
  });

  check('particles die after their lifetime', () => {
    const e = new ParticleEngine(base({ lifetime: { min: 0.05, max: 0.05 } }), 1, FPS); // 0.05s < 2 frames
    e.seekToFrame(3);
    assert.equal(e.getAliveCount(), 0, 'expired');
  });

  check("'points' emitter spawns from sourcePoints", () => {
    const pts = [[10, 20], [30, 40], [-5, -15]];
    const e = new ParticleEngine(base({ emitterShape: 'points', sourcePoints: pts, burstCount: 6, maxParticles: 6 }), 7, FPS);
    e.seekToFrame(1);
    const alive = e.getParticles();
    assert.ok(alive.length === 6);
    for (const p of alive) assert.ok(pts.some(([x, y]) => x === p.x && y === p.y), `spawned at a source point (${p.x},${p.y})`);
  });

  check('dissolve samplers are deterministic + in-bounds', () => {
    const a = sampleRegionPoints(200, 100, 50, 99);
    const b = sampleRegionPoints(200, 100, 50, 99);
    assert.deepEqual(a, b, 'region seed deterministic');
    assert.equal(a.length, 50);
    for (const [x, y] of a) assert.ok(x >= -100 && x <= 100 && y >= -50 && y <= 50, 'within centred region');
    // mask sampler: a 4x4 mask opaque only on the right half -> all points x>=0-ish
    const w = 4, h = 4; const mask = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 2; x < w; x++) mask[y * w + x] = 255;
    const m = sampleMaskPoints(mask, w, h, 30, 5);
    assert.equal(m.length, 30);
    for (const [x] of m) assert.ok(x >= 0, `mask point on opaque (right) half: x=${x}`);
    // empty mask -> falls back to region
    assert.equal(sampleMaskPoints(new Uint8ClampedArray(w * h), w, h, 10, 1).length, 10);
  });

  check('every preset builds a valid config (bounded, real shape/blend)', () => {
    const shapes = new Set(['point', 'circle', 'rectangle', 'ring', 'points']);
    const blends = new Set(['additive', 'alpha', 'screen']);
    assert.ok(PRESET_NAMES.length >= 12, `presets: ${PRESET_NAMES.length}`);
    for (const name of PRESET_NAMES) {
      const c = PARTICLE_PRESETS[name]();
      assert.ok(c.maxParticles > 0 && c.maxParticles <= 5000, `${name} maxParticles`);
      assert.ok(shapes.has(c.emitterShape), `${name} shape`);
      assert.ok(blends.has(c.blendMode), `${name} blend`);
      assert.ok(c.lifetime.min > 0 && c.lifetime.max >= c.lifetime.min, `${name} lifetime`);
      // it must actually simulate without throwing
      const e = new ParticleEngine(c, 3, FPS); e.seekToFrame(20);
      assert.ok(e.getAliveCount() >= 0);
    }
    for (const n of ['dust', 'embers', 'steam', 'fireworks', 'dissolve']) assert.ok(PRESET_NAMES.includes(n), `has ${n}`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ particles harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
