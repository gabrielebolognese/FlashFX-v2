// Acceptance harness for time remapping + Exponential Scale (B5a). Bundles the pure modules
// core/timeRemap.ts and core/keyframeAssistants.ts and asserts with node:assert. The video
// decode / frame-mix path is WebCodecs/WebGPU → browser-verified (B5b).
//   node scripts/verify-time-remap.mjs   (or: npm run verify:time-remap)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'timeremap-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const kf = (frame, value) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });

try {
  const TR = await bundle('src/core/timeRemap.ts', 'timeRemap.mjs');
  const KA = await bundle('src/core/keyframeAssistants.ts', 'keyframeAssistants.mjs');
  const { linearSourceSeconds, sourceFrameFromSeconds, identityRemapSeconds } = TR;
  const { exponentialScaleSelected } = KA;

  check('sourceFrameFromSeconds: floors to a frame and clamps to [0, total-1]', () => {
    assert.equal(sourceFrameFromSeconds(1.0, 30, 300), 30);
    assert.equal(sourceFrameFromSeconds(-5, 30, 300), 0);
    assert.equal(sourceFrameFromSeconds(100, 30, 300), 299); // clamped to last
    assert.equal(sourceFrameFromSeconds(0.999, 30, 300), 29); // floor(29.97)
  });

  check('linear path is BYTE-IDENTICAL to the historical mapping', () => {
    // old: floor((localFrame/compFps) * sourceFps * rate), localFrame = frame - inPoint + startOffset
    const compFps = 30, sourceFps = 24, total = 100000;
    for (const [frame, inPoint, startOffset, rate] of [[0, 0, 0, 1], [45, 10, 5, 2], [90, 0, 0, 0.5], [200, 30, 12, 1.5]]) {
      const localFrame = frame - inPoint + startOffset;
      const old = Math.max(0, Math.min(Math.floor((localFrame / compFps) * sourceFps * rate), total - 1));
      const now = sourceFrameFromSeconds(linearSourceSeconds(frame, inPoint, frame + 100, startOffset, compFps, rate, false), sourceFps, total);
      assert.equal(now, old, `mismatch at frame ${frame}`);
    }
  });

  check('reverse: source frame DESCENDS as comp frame advances', () => {
    const inPoint = 0, outPoint = 60, compFps = 30, sourceFps = 30, total = 100000;
    const sf = (f) => sourceFrameFromSeconds(linearSourceSeconds(f, inPoint, outPoint, 0, compFps, 1, true), sourceFps, total);
    assert.ok(sf(0) > sf(30) && sf(30) > sf(59), 'reversed clip should count down');
  });

  check('identityRemapSeconds: linear endpoints reproduce constant-rate playback', () => {
    const { atIn, atOut } = identityRemapSeconds(10, 70, 6, 30, 2); // in=10,out=70,offset=6,fps=30,rate=2
    assert.ok(near(atIn, (6 / 30) * 2));                    // source seconds at inPoint
    assert.ok(near(atOut, ((70 - 10 + 6) / 30) * 2));        // and at outPoint
    // A 2-keyframe linear remap through (atIn,atOut) equals the linear path at the endpoints.
    assert.ok(near(atIn, linearSourceSeconds(10, 10, 70, 6, 30, 2, false)));
    assert.ok(near(atOut, linearSourceSeconds(70, 10, 70, 6, 30, 2, false)));
  });

  // --- Exponential Scale ---
  check('Exponential Scale: geometric ramp — constant RATIO per frame, monotonic', () => {
    const kfs = [kf(0, 10), kf(4, 160)]; // 10 → 160 (×16 over 4 frames)
    const out = exponentialScaleSelected(kfs, new Set([0, 4]));
    assert.equal(out.length, 5); // one keyframe per frame 0..4
    assert.ok(near(out[0].value, 10) && near(out[4].value, 160)); // endpoints preserved
    const ratios = [];
    for (let i = 1; i < out.length; i++) ratios.push(out[i].value / out[i - 1].value);
    for (let i = 1; i < ratios.length; i++) assert.ok(near(ratios[i], ratios[0]), 'ratio per frame must be constant');
    assert.ok(near(ratios[0], 2)); // 16^(1/4) = 2
    for (let i = 1; i < out.length; i++) assert.ok(out[i].value > out[i - 1].value, 'monotonic');
  });

  check('Exponential Scale: vec2 per component; non-positive falls back to linear', () => {
    const out = exponentialScaleSelected([kf(0, [10, 0]), kf(2, [40, 100])], new Set([0, 2]));
    // X: geometric 10→40 (mid = 20). Y: has a 0 endpoint → linear (mid = 50).
    assert.ok(near(out[1].value[0], 20));
    assert.ok(near(out[1].value[1], 50));
  });

  check('Exponential Scale: <2 selected is a no-op', () => {
    const one = [kf(0, 10)];
    assert.deepEqual(exponentialScaleSelected(one, new Set([0])), one);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ time-remap harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
