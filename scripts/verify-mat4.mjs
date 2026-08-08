// Acceptance harness for the 2.5D matrix core (M0). Pure math → fully verifiable here.
//   node scripts/verify-mat4.mjs   (or: npm run verify:mat4)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'mat4-verify-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const nearV = (a, b, e = 1e-9) => a.every((x, i) => near(x, b[i], e));

try {
  await build({ entryPoints: ['src/core/mat4.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const m = await import(pathToFileURL(outfile).href);
  const { identity, multiply, multiplyAll, translate, scale, rotateX, rotateY, rotateZ, transformPoint, lookAt, perspective, composeModel } = m;

  console.log('2.5D matrix core — acceptance\n');

  check('identity is a neutral element', () => {
    const a = translate(3, -2, 5);
    assert.ok(nearV(multiply(identity(), a), a));
    assert.ok(nearV(multiply(a, identity()), a));
  });

  check('multiply is associative', () => {
    const a = translate(1, 2, 3), b = rotateZ(0.6), c = scale(2, 3, 4);
    assert.ok(nearV(multiply(multiply(a, b), c), multiply(a, multiply(b, c)), 1e-8));
  });

  check('translate / scale move points', () => {
    assert.ok(nearV(transformPoint(translate(1, 2, 3), 0, 0, 0), [1, 2, 3, 1]));
    assert.ok(nearV(transformPoint(scale(2, 3, 4), 1, 1, 1), [2, 3, 4, 1]));
  });

  check('axis rotations rotate the right way', () => {
    assert.ok(nearV(transformPoint(rotateZ(Math.PI / 2), 1, 0, 0), [0, 1, 0, 1], 1e-9)); // +X → +Y
    assert.ok(nearV(transformPoint(rotateX(Math.PI / 2), 0, 1, 0), [0, 0, 1, 1], 1e-9)); // +Y → +Z
    assert.ok(nearV(transformPoint(rotateY(Math.PI / 2), 0, 0, 1), [1, 0, 0, 1], 1e-9)); // +Z → +X
  });

  check('lookAt puts the eye at the view origin and the target on -Z', () => {
    const eye = [0, 0, 10], target = [0, 0, 0], up = [0, 1, 0];
    const v = lookAt(eye, target, up);
    assert.ok(nearV(transformPoint(v, ...eye).slice(0, 3), [0, 0, 0], 1e-8), 'eye → origin');
    const t = transformPoint(v, ...target);
    assert.ok(near(t[0], 0, 1e-8) && near(t[1], 0, 1e-8) && t[2] < 0, 'target is in front (−Z)');
  });

  check('perspective foreshortens with depth (w = −z; farther → smaller)', () => {
    const p = perspective(Math.PI / 3, 16 / 9, 0.1, 1000);
    const a = transformPoint(p, 1, 0, -1), b = transformPoint(p, 1, 0, -2);
    assert.ok(near(a[3], 1, 1e-9) && near(b[3], 2, 1e-9), 'w equals −z');
    assert.ok(Math.abs(a[0] / a[3]) > Math.abs(b[0] / b[3]), 'farther point projects nearer to centre');
  });

  check('composeModel is identity for the neutral TRS', () => {
    assert.ok(nearV(composeModel([0, 0, 0], [0, 0, 0], [1, 1, 1], [0, 0, 0]), identity(), 1e-12));
  });

  check('composeModel anchors then places (anchor pivots rotation)', () => {
    // A layer at position (100,0,0), rotated 90° about Z, anchor at its own (10,0,0):
    // the anchor point maps to the position.
    const model = composeModel([100, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1], [10, 0, 0]);
    assert.ok(nearV(transformPoint(model, 10, 0, 0).slice(0, 3), [100, 0, 0], 1e-8));
  });

  check('multiplyAll folds left-to-right', () => {
    assert.ok(nearV(multiplyAll(translate(1, 0, 0), translate(2, 0, 0)), translate(3, 0, 0), 1e-12));
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
