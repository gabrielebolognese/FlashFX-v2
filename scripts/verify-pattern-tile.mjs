// Acceptance harness for B17 (pure): generative-pattern presets (validated against PATTERN_TYPES) and
// the motion-tile / seamless-scroll param model. The pattern types already render; the tiling render
// (repeat + mirror + edge blend) is B17-gpu.
//   node scripts/verify-pattern-tile.mjs   (or: npm run verify:pattern-tile)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'pattern-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const P = await bundle('src/patterns/presets.ts', 'presets.mjs');
  const T = await bundle('src/patterns/types.ts', 'types.mjs');
  const M = await bundle('src/core/effects/tileParams.ts', 'tileParams.mjs');
  const { PATTERN_PRESETS } = P;
  const { PATTERN_TYPES } = T;
  const { wrapOffset, resolveScroll, clampMotionTile, tileUV, DEFAULT_MOTION_TILE } = M;
  const types = new Set(PATTERN_TYPES);

  check('every pattern preset uses a real PATTERN_TYPE with in-range params', () => {
    assert.ok(PATTERN_PRESETS.length >= 15, `presets: ${PATTERN_PRESETS.length}`);
    for (const p of PATTERN_PRESETS) {
      assert.ok(p.name, 'name');
      const c = p.config;
      assert.ok(types.has(c.type), `${p.name}: type ${c.type} is real`);
      assert.ok(c.scale > 0 && c.speed >= 0 && c.complexity >= 0, `${p.name}: numeric params`);
      assert.ok(c.warp >= 0 && c.contrast >= 0, `${p.name}: warp/contrast`);
      assert.ok(c.paletteMode === 'linear' || c.paletteMode === 'smooth', `${p.name}: paletteMode`);
      assert.ok(Array.isArray(c.palette) && c.palette.length >= 2, `${p.name}: palette`);
    }
    // the B17 sim presets are present
    const names = PATTERN_PRESETS.map((p) => p.name);
    for (const n of ['Caustics', 'Wave World', 'Radio Waves', 'Fractal Noise']) assert.ok(names.includes(n), `has ${n}`);
  });

  check('wrapOffset is seamless (equal at 0 and size; wraps negatives)', () => {
    assert.ok(near(wrapOffset(0, 100), 0));
    assert.ok(near(wrapOffset(100, 100), 0), 'size wraps to 0 (seamless)');
    assert.ok(near(wrapOffset(150, 100), 50));
    assert.ok(near(wrapOffset(-30, 100), 70));
    assert.equal(wrapOffset(5, 0), 0);
  });

  check('resolveScroll: frame 0 = no offset; direction sign; monotonic; resolution-relative; frame-pure', () => {
    const s0 = resolveScroll({ direction: 0, speed: 50 }, 0, 30, 1920, 1080);
    assert.ok(near(s0.dx, 0) && near(s0.dy, 0), 'frame 0 -> 0');
    const right = resolveScroll({ direction: 0, speed: 50 }, 60, 30, 1920, 1080);
    const down = resolveScroll({ direction: 90, speed: 50 }, 60, 30, 1920, 1080);
    assert.ok(right.dx > 0 && Math.abs(right.dy) < 1e-6, 'dir 0 -> +x');
    assert.ok(down.dy > 0 && Math.abs(down.dx) < 1e-6, 'dir 90 -> +y');
    assert.ok(resolveScroll({ direction: 0, speed: 80 }, 60, 30, 1920, 1080).dx > right.dx, 'faster -> further');
    // resolution-relative: same speed/time travels further on a larger short side
    const big = resolveScroll({ direction: 0, speed: 50 }, 60, 30, 3840, 2160);
    assert.ok(big.dx > right.dx * 1.9, 'resolution-relative');
    // frame-pure
    assert.deepEqual(resolveScroll({ direction: 33, speed: 40 }, 45, 30, 1000, 800), resolveScroll({ direction: 33, speed: 40 }, 45, 30, 1000, 800));
  });

  check('clampMotionTile bounds tiles + speed; DEFAULT is valid', () => {
    const t = clampMotionTile({ tilesX: 0.4, tilesY: -3, mirror: 1, scroll: { direction: 10, speed: 250 } });
    assert.equal(t.tilesX, 1); assert.equal(t.tilesY, 1); assert.equal(t.mirror, true); assert.equal(t.scroll.speed, 100);
    assert.ok(DEFAULT_MOTION_TILE.tilesX >= 1 && DEFAULT_MOTION_TILE.scroll.speed >= 0);
  });

  check('tileUV wraps into [0,1) and mirrors alternating tiles', () => {
    const tile = { tilesX: 2, tilesY: 1, mirror: false, scroll: { direction: 0, speed: 0 } };
    const noScroll = { dx: 0, dy: 0, dxWrapped: 0, dyWrapped: 0 };
    for (const [u, v] of [[0, 0], [0.5, 0.5], [0.99, 0.2], [0.25, 0.75]]) {
      const [fu, fv] = tileUV(u, v, tile, noScroll, 100, 100);
      assert.ok(fu >= 0 && fu < 1 && fv >= 0 && fv < 1, `uv in range for ${u},${v}`);
    }
    // mirror: second tile (u in [0.5,1)) flips horizontally vs unmirrored
    const mir = { ...tile, mirror: true };
    const [fuM] = tileUV(0.75, 0, mir, noScroll, 100, 100); // su=1.5 -> floor 1 (odd) -> mirrored
    const [fuN] = tileUV(0.75, 0, tile, noScroll, 100, 100);
    assert.ok(near(fuN, 0.5) && near(fuM, 0.5), 'symmetric point unaffected');
    const [fuM2] = tileUV(0.6, 0, mir, noScroll, 100, 100); // su=1.2 -> frac .2, mirrored -> .8
    assert.ok(near(fuM2, 0.8), `mirrored frac ${fuM2}`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ pattern-tile harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
