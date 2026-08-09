// Smooth spatial-bezier camera path — acceptance.
//   node scripts/verify-camera-path.mjs   (or: npm run verify:camera-path)
//
// Proves: (1) cubicBezierVec3 with 1/3–2/3 controls collapses to a straight lerp; (2) a camera
// with position keyframes but NO spatial tangents evaluates byte-identically to the plain linear
// position (opt-in generalisation); (3) adding a tangent bows the path off the straight line; and
// (4) the along-path parameter honours the dominant axis (so timing follows the real keyframes).

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// interpolation.ts pulls in the expression engine, which references Worker at load — stub it.
globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };

const tmp = mkdtempSync(join(tmpdir(), 'campath-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

const kf = (frame, value) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });

try {
  const cam3d = await bundle('src/core/camera3d.ts');
  const interp = await bundle('src/core/interpolation.ts');
  const factory = await bundle('src/core/factory.ts');
  const { cubicBezierVec3 } = cam3d;
  const { resolveCameraEye } = interp;
  const { createCameraLayer } = factory;

  console.log('Smooth spatial-bezier camera path — acceptance\n');

  // (1) Straight-line collapse: control points on the 1/3–2/3 line ⇒ exact lerp.
  check('cubicBezierVec3 with 1/3–2/3 controls == straight lerp', () => {
    const A = [0, 0, 0], B = [300, 90, -30];
    const c1 = [100, 30, -10], c2 = [200, 60, -20];
    for (const u of [0, 0.25, 0.5, 0.7, 1]) {
      const p = cubicBezierVec3(A, c1, c2, B, u);
      assert.ok(near(p[0], A[0] + u * (B[0] - A[0])));
      assert.ok(near(p[1], A[1] + u * (B[1] - A[1])));
      assert.ok(near(p[2], A[2] + u * (B[2] - A[2])));
    }
  });

  const W = 1920, H = 1080, DUR = 60;
  const makeCam = () => {
    const c = createCameraLayer('Camera 1', W, H, DUR);
    c.transform.position.keyframes = [kf(0, [0, 0]), kf(30, [300, 0])]; // x: 0→300, y flat
    return c;
  };

  // (2) No tangents ⇒ byte-identical to the plain evaluated (linear) position.
  check('no spatialTangents ⇒ straight lerp (byte-identical)', () => {
    const c = makeCam();
    const e = resolveCameraEye(c, 15);
    assert.ok(near(e[0], 150), `x=${e[0]}`);
    assert.ok(near(e[1], 0), `y=${e[1]}`);
    // endpoints exact
    assert.ok(near(resolveCameraEye(c, 0)[0], 0));
    assert.ok(near(resolveCameraEye(c, 30)[0], 300));
  });

  // (3) A tangent at the first node bows the path off the straight line (y deviates from 0).
  check('spatial tangent bows the path (y ≠ 0 at midpoint)', () => {
    const c = makeCam();
    c.camera.spatialTangents = [{ frame: 0, tangent: [0, 200, 0] }];
    const e = resolveCameraEye(c, 15);
    // u = 0.5 (x is dominant); c1 = A+[0,200,0], c2 = B-default; bezier y = 3·(1-u)²u·200 = 75
    assert.ok(near(e[1], 75, 1e-3), `expected y≈75, got ${e[1]}`);
    assert.ok(e[1] > 1, 'path must bow off the straight line');
    // endpoints still pinned to the keyframes
    assert.ok(near(resolveCameraEye(c, 0)[1], 0));
    assert.ok(near(resolveCameraEye(c, 30)[1], 0));
  });

  // (4) Along-path parameter follows the dominant axis's real interpolation (here linear x).
  check('u tracks the dominant axis (linear ⇒ uniform)', () => {
    const c = makeCam();
    c.camera.spatialTangents = [{ frame: 0, tangent: [0, 300, 0] }];
    // At quarter frame the x is 75 → u=0.25; bezier y = 3·(0.75)²·0.25·300 = 126.5625
    const e = resolveCameraEye(c, 7.5);
    assert.ok(near(e[1], 126.5625, 1e-3), `got ${e[1]}`);
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-camera-path failed:\n', err);
  process.exit(1);
}
