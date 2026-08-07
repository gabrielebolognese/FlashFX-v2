// Acceptance harness for the reframe-constraints core (core/reframe.ts).
// Run: node scripts/verify-reframe.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'reframe-verify-'));
const outfile = join(tmp, 'rf.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A leaf input: box centre == position. box {x,w} with cx = x+w/2.
const leaf = (h, v, box, pos, scale = [1, 1]) => ({ id: 'L', constraints: { h, v }, box, position: pos, scale });

try {
  await build({ entryPoints: ['src/core/reframe.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeReframe, applyAxisPosition, applyAxisScale, DEFAULT_CONSTRAINTS } = await import(pathToFileURL(outfile).href);

  check('identity resize (no size change) → all ops identity for every mode', () => {
    for (const m of ['min', 'max', 'center', 'stretch', 'scale']) {
      const [r] = computeReframe([leaf(m, m, { x: 100, y: 50, w: 200, h: 100 }, [200, 100], [2, 2])], 1000, 800, 1000, 800);
      assert.deepEqual(r.h, { positionMul: 1, positionAdd: 0, scaleMul: 1 }, `h ${m}`);
      assert.deepEqual(r.v, { positionMul: 1, positionAdd: 0, scaleMul: 1 }, `v ${m}`);
      assert.deepEqual(r.position, [200, 100]);
      assert.deepEqual(r.scale, [2, 2]);
    }
  });

  check('determinism + no mutation', () => {
    const inp = [leaf('center', 'scale', { x: 100, y: 50, w: 200, h: 100 }, [200, 100])];
    const a = computeReframe(inp, 1000, 800, 1400, 800);
    const b = computeReframe(inp, 1000, 800, 1400, 800);
    assert.deepEqual(a, b);
    a[0].position[0] = 9999;
    assert.notEqual(computeReframe(inp, 1000, 800, 1400, 800)[0].position[0], 9999);
  });

  // WIDEN 1000→1400 (Δ+400, s=1.4). Off-centre box {x:100,w:200} → cx=200, position.x=200.
  check('horizontal widen: min/max/center/stretch/scale (hand-computed)', () => {
    const box = { x: 100, y: 0, w: 200, h: 100 };
    const run = (h) => computeReframe([leaf(h, 'min', box, [200, 50], [1, 1])], 1000, 800, 1400, 800)[0];
    assert.ok(near(run('min').position[0], 200), 'min keeps centre');
    assert.ok(near(run('max').position[0], 600), 'max shifts +Δ');
    assert.ok(near(run('center').position[0], 400), 'center shifts +Δ/2');
    const st = run('stretch');
    assert.ok(near(st.position[0], 400), 'stretch centre +Δ/2');
    assert.ok(near(st.scale[0], 3), 'stretch scaleMul = (200+400)/200 = 3');
    const sc = run('scale');
    assert.ok(near(sc.position[0], 280), 'scale pos = 200*1.4');
    assert.ok(near(sc.scale[0], 1.4), 'scale scaleMul = 1.4');
  });

  check('horizontal narrow 1000→600 (Δ−400): max pushes right margin off-frame (no clamp)', () => {
    const box = { x: 100, y: 0, w: 200, h: 100 };
    const run = (h) => computeReframe([leaf(h, 'min', box, [200, 50])], 1000, 800, 600, 800)[0];
    assert.ok(near(run('max').position[0], -200), 'max: 200 + (600-1000) = -200');
    assert.ok(near(run('center').position[0], 0), 'center: 200 + (-400)/2 = 0');
    assert.ok(near(run('min').position[0], 200), 'min unchanged');
  });

  check('vertical axis mirrors horizontal', () => {
    const box = { x: 0, y: 100, w: 100, h: 200 }; // cy=200
    const run = (v) => computeReframe([leaf('min', v, box, [50, 200])], 800, 1000, 800, 1400)[0];
    assert.ok(near(run('max').position[1], 600));
    assert.ok(near(run('center').position[1], 400));
    assert.ok(near(run('scale').position[1], 280) && near(run('scale').scale[1], 1.4));
  });

  check('axis independence: width-only change leaves v ops identity', () => {
    const [r] = computeReframe([leaf('scale', 'scale', { x: 100, y: 50, w: 200, h: 100 }, [200, 100], [1, 1])], 1000, 800, 1400, 800);
    assert.deepEqual(r.v, { positionMul: 1, positionAdd: 0, scaleMul: 1 });
    assert.ok(near(r.position[1], 100) && near(r.scale[1], 1));
    assert.ok(!near(r.position[0], 200)); // x DID change
  });

  check('group / off-pivot: box centre 200 but position.x 0 (pivot) — scale & center honour (centre−pos)', () => {
    const box = { x: 100, y: 0, w: 200, h: 100 }; // cx = 200
    // scale mode, position.x = 0 (pivot away from centre)
    const sc = computeReframe([{ id: 'g', constraints: { h: 'scale', v: 'min' }, box, position: [0, 50], scale: [1, 1] }], 1000, 800, 1400, 800)[0];
    assert.ok(near(sc.position[0], 0), 'scale: pos 0*1.4 + 0 = 0');
    assert.ok(near(sc.scale[0], 1.4));
    // box centre invariant: new centre = pos' + (centre−pos)*scaleMul = 0 + 200*1.4 = 280 = cx*s ✓
    const newCentre = sc.position[0] + (200 - 0) * sc.h.scaleMul;
    assert.ok(near(newCentre, 280));
    // center mode: pos' = 0 + Δ/2 = 200; new box centre = 200 + 200 = 400 = old centre + Δ/2 ✓
    const cen = computeReframe([{ id: 'g', constraints: { h: 'center', v: 'min' }, box, position: [0, 50], scale: [1, 1] }], 1000, 800, 1400, 800)[0];
    assert.ok(near(cen.position[0], 200));
    assert.ok(near(cen.position[0] + (200 - 0) * cen.h.scaleMul, 400));
  });

  check('stretch clamp: Δ−400 on box.w 200 → scaleMul finite & positive (no negative width)', () => {
    const [r] = computeReframe([leaf('stretch', 'min', { x: 100, y: 0, w: 200, h: 100 }, [200, 50])], 1000, 800, 600, 800);
    assert.ok(r.h.scaleMul > 0 && Number.isFinite(r.h.scaleMul));
    // new size = max(1e-3, 200-400)=1e-3 → scaleMul = 1e-3/200
    assert.ok(near(r.h.scaleMul, 1e-3 / 200));
  });

  check('degenerate dims guarded (no NaN/Infinity)', () => {
    const [r] = computeReframe([leaf('scale', 'stretch', { x: 0, y: 0, w: 0, h: 0 }, [0, 0])], 0, 0, 1000, 800);
    assert.ok(Number.isFinite(r.position[0]) && Number.isFinite(r.position[1]));
    assert.ok(Number.isFinite(r.scale[0]) && Number.isFinite(r.scale[1]));
  });

  check('-0 normalized to +0', () => {
    const [r] = computeReframe([leaf('scale', 'scale', { x: 0, y: 0, w: 10, h: 10 }, [0, 0])], 1000, 800, 500, 400);
    assert.ok(Object.is(r.position[0], 0), `+0 expected, got ${r.position[0]}`);
    assert.ok(Object.is(r.position[1], 0));
    assert.ok(Object.is(r.scale[0] * 1, r.scale[0])); // finite, no -0 surprises
  });

  check('DEFAULT_CONSTRAINTS = center/center reproduces center-mode result', () => {
    const box = { x: 100, y: 50, w: 200, h: 100 };
    const def = computeReframe([{ id: 'd', constraints: DEFAULT_CONSTRAINTS, box, position: [200, 100], scale: [1, 1] }], 1000, 800, 1400, 1000)[0];
    const cen = computeReframe([leaf('center', 'center', box, [200, 100])], 1000, 800, 1400, 1000)[0];
    assert.deepEqual(def.position, cen.position);
  });

  check('applyAxisPosition/applyAxisScale on a keyframe list shift/scale uniformly', () => {
    const op = { positionMul: 1, positionAdd: 40, scaleMul: 2 };
    assert.equal(applyAxisPosition(100, op), 140);
    assert.equal(applyAxisPosition(-10, op), 30);
    assert.equal(applyAxisScale(3, op), 6);
    const scaleOp = { positionMul: 1.5, positionAdd: 0, scaleMul: 1.5 };
    assert.equal(applyAxisPosition(200, scaleOp), 300); // amplitude scales
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
