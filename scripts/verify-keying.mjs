// Acceptance harness for the B28 keying math (pure). Bundles core/keying/keying.ts and asserts with
// node:assert: YCbCr conversion, luma-independent chroma keying (the property naive RGB distance
// fails), soft luma key, green/blue despill, and matte choke/feather morphology. The per-pixel GPU
// keyer (WGSL) and the OffscreenCanvas bake are browser-only (B28-gpu / the Chroma Key image tool).
//   node scripts/verify-keying.mjs   (or: npm run verify:keying)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'keying-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const sum = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; };

try {
  const outfile = join(tmp, 'keying.mjs');
  await build({ entryPoints: ['src/core/keying/keying.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { rgbToYCbCr, luma709, chromaKeyAlpha, lumaKeyAlpha, suppressSpill, chokeMatte, featherMatte, dominantChannel } = M;

  check('rgbToYCbCr: grey is neutral (cb=cr=0); green cb<0,cr<0; blue cb~+0.5; luma ordered', () => {
    for (const v of [0.2, 0.5, 0.9]) { const c = rgbToYCbCr(v, v, v); assert.ok(near(c.cb, 0, 1e-9) && near(c.cr, 0, 1e-9), `grey ${v}`); assert.ok(near(c.y, v, 1e-9), 'grey luma = value'); }
    const green = rgbToYCbCr(0, 1, 0); assert.ok(green.cb < 0 && green.cr < 0, `green cb=${green.cb} cr=${green.cr}`);
    const blue = rgbToYCbCr(0, 0, 1); assert.ok(near(blue.cb, 0.5, 1e-9), `blue cb=${blue.cb}`);
    assert.ok(luma709(0, 0, 0) < luma709(0.5, 0.5, 0.5) && luma709(0.5, 0.5, 0.5) < luma709(1, 1, 1), 'luma dark<mid<light');
  });

  check('chromaKeyAlpha: key colour -> keyed (~0); red/skin -> kept (~1)', () => {
    const key = rgbToYCbCr(0, 0.8, 0); // green backing
    assert.ok(chromaKeyAlpha(0, 0.8, 0, key.cb, key.cr, 0.1, 0.05) < 0.001, 'exact key colour keyed');
    assert.ok(chromaKeyAlpha(0.9, 0.1, 0.1, key.cb, key.cr, 0.1, 0.1) > 0.99, 'red kept');
    assert.ok(chromaKeyAlpha(0.86, 0.66, 0.55, key.cb, key.cr, 0.1, 0.1) > 0.99, 'skin kept');
  });

  check('chromaKeyAlpha: LUMINANCE INDEPENDENCE - one key knocks out lit AND shadowed backing that RGB distance would miss', () => {
    const keyRGB = [0, 0.8, 0];               // the sampled (mid-lit) backing
    const shadow = [0, 0.4, 0];               // same hue, in shadow (darker)
    const key = rgbToYCbCr(keyRGB[0], keyRGB[1], keyRGB[2]);
    const ks = rgbToYCbCr(shadow[0], shadow[1], shadow[2]);
    const chromaDist = Math.hypot(ks.cb - key.cb, ks.cr - key.cr);
    const rgbDist = Math.hypot(shadow[0] - keyRGB[0], shadow[1] - keyRGB[1], shadow[2] - keyRGB[2]);
    assert.ok(chromaDist < rgbDist, `chroma ${chromaDist.toFixed(3)} < rgb ${rgbDist.toFixed(3)}`);
    // one tolerance keys both the lit key colour and the shadowed backing...
    const tol = 0.25, soft = 0.03;
    assert.ok(chromaKeyAlpha(keyRGB[0], keyRGB[1], keyRGB[2], key.cb, key.cr, tol, soft) < 0.001, 'lit backing keyed');
    assert.ok(chromaKeyAlpha(shadow[0], shadow[1], shadow[2], key.cb, key.cr, tol, soft) < 0.001, 'shadowed backing keyed');
    // ...whereas a naive RGB-Euclidean key at the same tolerance would leave the shadow un-keyed.
    assert.ok(rgbDist > tol, `RGB key would MISS the shadow (rgbDist ${rgbDist.toFixed(3)} > tol ${tol})`);
  });

  check('chromaKeyAlpha: increasing tolerance is monotonic (keys more, never less)', () => {
    const key = rgbToYCbCr(0, 0.8, 0);
    const px = [0.2, 0.55, 0.25]; // a partially-green pixel near the edge of the key
    let prev = 2;
    for (const tol of [0.0, 0.05, 0.1, 0.2, 0.3, 0.5]) {
      const a = chromaKeyAlpha(px[0], px[1], px[2], key.cb, key.cr, tol, 0.05);
      assert.ok(a <= prev + 1e-9, `alpha non-increasing as tol grows (tol ${tol}: ${a} <= ${prev})`);
      prev = a;
    }
  });

  check('lumaKeyAlpha: black keyed / white kept; invert flips; soft edge monotonic', () => {
    assert.ok(lumaKeyAlpha(0, 0, 0, 0.5, 0.2, false) < 0.001, 'black keyed (keep-above)');
    assert.ok(lumaKeyAlpha(1, 1, 1, 0.5, 0.2, false) > 0.999, 'white kept');
    assert.ok(lumaKeyAlpha(0, 0, 0, 0.5, 0.2, true) > 0.999, 'invert: black kept');
    assert.ok(lumaKeyAlpha(1, 1, 1, 0.5, 0.2, true) < 0.001, 'invert: white keyed');
    let prev = -1;
    for (const v of [0.4, 0.5, 0.6, 0.7, 0.8]) { const a = lumaKeyAlpha(v, v, v, 0.5, 0.3, false); assert.ok(a >= prev - 1e-9, `soft edge rising ${v}`); prev = a; }
  });

  check('suppressSpill: green spill reduced, R/B untouched; amount 0=identity, 1=clamped; non-spilled pixel safe', () => {
    const spill = suppressSpill(0.4, 0.7, 0.3, 1, 1);
    assert.ok(near(spill.r, 0.4) && near(spill.b, 0.3), 'R/B unchanged');
    assert.ok(near(spill.g, 0.4), 'green clamped to max(R,B) at amount 1');
    const id = suppressSpill(0.4, 0.7, 0.3, 1, 0);
    assert.ok(near(id.g, 0.7), 'amount 0 = identity');
    const half = suppressSpill(0.4, 0.7, 0.3, 1, 0.5);
    assert.ok(half.g > 0.4 && half.g < 0.7, 'amount 0.5 partial');
    const red = suppressSpill(0.9, 0.1, 0.1, 1, 1); // green key but a red pixel: green is not the max
    assert.ok(near(red.r, 0.9) && near(red.g, 0.1) && near(red.b, 0.1), 'non-spilled pixel unchanged');
    const blue = suppressSpill(0.3, 0.35, 0.8, 2, 1); // blue-screen despill
    assert.ok(near(blue.b, 0.35), 'blue clamped to max(R,G)');
    assert.equal(dominantChannel(0, 0.8, 0), 1); assert.equal(dominantChannel(0.1, 0.2, 0.9), 2); assert.equal(dominantChannel(0.9, 0.1, 0.1), 0);
  });

  check('chokeMatte: erode shrinks the opaque disc, dilate grows it, radius 0 = identity', () => {
    const w = 21, h = 21, cx = 10, cy = 10, rad = 6;
    const disc = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) disc[y * w + x] = Math.hypot(x - cx, y - cy) <= rad ? 1 : 0;
    const before = sum(disc);
    const eroded = chokeMatte(disc, w, h, 2);
    const dilated = chokeMatte(disc, w, h, -2);
    assert.ok(sum(eroded) < before, `erode shrinks (${sum(eroded)} < ${before})`);
    assert.ok(sum(dilated) > before, `dilate grows (${sum(dilated)} > ${before})`);
    assert.ok(eroded[cy * w + cx] === 1, 'disc centre stays opaque after erode');
    const ident = chokeMatte(disc, w, h, 0);
    assert.deepEqual(Array.from(ident), Array.from(disc), 'radius 0 identity');
    assert.notStrictEqual(ident, disc, 'returns a new array');
  });

  check('featherMatte: hard step -> intermediate edge values, energy ~preserved, radius 0 = identity', () => {
    const w = 21, h = 21;
    const block = new Float32Array(w * h); // centered 9x9 opaque block, interior so blur stays in bounds
    for (let y = 6; y <= 14; y++) for (let x = 6; x <= 14; x++) block[y * w + x] = 1;
    const before = sum(block);
    const feathered = featherMatte(block, w, h, 2);
    let intermediate = 0;
    for (let i = 0; i < feathered.length; i++) if (feathered[i] > 0.01 && feathered[i] < 0.99) intermediate++;
    assert.ok(intermediate > 0, 'feather introduces soft edge values');
    assert.ok(Math.abs(sum(feathered) - before) < before * 0.02, `energy ~preserved (${sum(feathered).toFixed(2)} vs ${before})`);
    const ident = featherMatte(block, w, h, 0);
    assert.deepEqual(Array.from(ident), Array.from(block), 'radius 0 identity');
  });

  check('determinism: identical inputs -> byte-identical outputs', () => {
    const key = rgbToYCbCr(0, 0.8, 0);
    const a = chromaKeyAlpha(0.3, 0.6, 0.2, key.cb, key.cr, 0.15, 0.05);
    const b = chromaKeyAlpha(0.3, 0.6, 0.2, key.cb, key.cr, 0.15, 0.05);
    assert.equal(a, b, 'chromaKeyAlpha stable');
    const m0 = new Float32Array([0, 1, 1, 0, 1, 0, 1, 1, 0]);
    assert.deepEqual(Array.from(featherMatte(m0, 3, 3, 1)), Array.from(featherMatte(m0, 3, 3, 1)), 'featherMatte stable');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ keying harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
