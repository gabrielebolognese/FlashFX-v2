// Acceptance harness for the B53 corner pin (pure maths + resolve + persistence). The real-renderer
// pixel proof is gpu:camera-cards (local, needs a GPU).
//   node scripts/verify-corner-pin.mjs   (or: npm run verify:corner-pin)
//
// Proves: the clip-space matrix lands every source corner exactly on its pin and every interior point
// on the B27 homography (the SAME solver - no second implementation); unpinned-equivalent pins reduce
// to the 2D NDC map; w stays positive over the quad (incl. the SDF margin) so the GPU never clips it;
// bow-tie / concave / collinear / non-finite pins are rejected; mirrored pins work; deterministic;
// resolveFrame evaluates keyframed pins per frame (and leaves unpinned layers untouched); a save/load
// round-trip keeps the pins.

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// interpolation.ts pulls in the expression engine, which references Worker at load - stub it.
globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };

const tmp = mkdtempSync(join(tmpdir(), 'cornerpin-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

try {
  const cp = await bundle('src/core/cornerPin.ts');
  const hom = await bundle('src/core/tracking/homography.ts');
  const interp = await bundle('src/core/interpolation.ts');
  const factory = await bundle('src/core/factory.ts');
  const val = await bundle('src/project-system/services/validation.ts');
  const { cornerPinMatrix, cornerPinHomography, cornerPinSourceQuad, isConvexQuad } = cp;
  const { computeHomography, applyHomography } = hom;

  console.log('Corner pin (B53) - acceptance\n');

  const W = 1920, H = 1080;
  // Clip-space matrix -> comp px (the GPU's perspective divide + viewport map).
  const toPx = (m, x, y) => {
    const cx = m[0] * x + m[4] * y + m[12], cy = m[1] * x + m[5] * y + m[13], cz = m[2] * x + m[6] * y + m[14], cw = m[3] * x + m[7] * y + m[15];
    return { px: [((cx / cw + 1) / 2) * W, ((1 - cy / cw) / 2) * H], w: cw, z: cz / cw };
  };
  const src = cornerPinSourceQuad(0, 0, 400, 300);
  const phone = [[700, 220], [1180, 300], [1150, 880], [690, 960]]; // a tilted phone screen
  const keystone = [[860, 300], [1060, 300], [1260, 780], [660, 780]]; // r01 "404" trapezoid

  check('source quad is TL, TR, BR, BL around the centre', () => {
    assert.deepEqual(src, [[-200, -150], [200, -150], [200, 150], [-200, 150]]);
  });

  check('every source corner lands on its pin (< 1e-6 px) for a phone quad and a keystone', () => {
    for (const dst of [phone, keystone]) {
      const m = cornerPinMatrix(src, dst, W, H);
      assert.ok(m, 'matrix');
      src.forEach((p, i) => {
        const r = toPx(m, p[0], p[1]).px;
        assert.ok(Math.hypot(r[0] - dst[i][0], r[1] - dst[i][1]) < 1e-6, `corner ${i}: ${r} vs ${dst[i]}`);
      });
    }
  });

  check('interior points follow the B27 homography exactly (same solver, no second implementation)', () => {
    const m = cornerPinMatrix(src, phone, W, H);
    const Hm = computeHomography(src, phone);
    assert.deepEqual(cornerPinHomography(src, phone), Hm, 'cornerPinHomography IS computeHomography (w already positive)');
    for (const p of [[0, 0], [-120, 80], [150, -140], [33, 17], [199, 149]]) {
      const a = toPx(m, p[0], p[1]).px, b = applyHomography(Hm, p);
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${p}: ${a} vs ${b}`);
    }
  });

  check('perspective is real: the centre maps to the diagonals crossing, not the corner average', () => {
    const m = cornerPinMatrix(src, keystone, W, H);
    const c = toPx(m, 0, 0).px;
    const avg = [keystone.reduce((s, p) => s + p[0], 0) / 4, keystone.reduce((s, p) => s + p[1], 0) / 4];
    // diagonals TL-BR and TR-BL intersect at the projective centre.
    const [a, b, c2, d] = keystone;
    const den = (a[0] - c2[0]) * (b[1] - d[1]) - (a[1] - c2[1]) * (b[0] - d[0]);
    const t = ((a[0] - b[0]) * (b[1] - d[1]) - (a[1] - b[1]) * (b[0] - d[0])) / den;
    const X = [a[0] + t * (c2[0] - a[0]), a[1] + t * (c2[1] - a[1])];
    assert.ok(Math.hypot(c[0] - X[0], c[1] - X[1]) < 1e-6, `centre ${c} vs diagonals ${X}`);
    assert.ok(Math.hypot(c[0] - avg[0], c[1] - avg[1]) > 5, 'and it differs from the affine average');
  });

  check('pins equal to the flat placement reduce to the 2D NDC map (w = 1, z = 0)', () => {
    const flat = src.map(([x, y]) => [x + 960, y + 540]);
    const m = cornerPinMatrix(src, flat, W, H);
    for (const p of [[-200, -150], [0, 0], [120, 40]]) {
      const r = toPx(m, p[0], p[1]);
      assert.ok(Math.abs(r.w - 1) < 1e-9 && Math.abs(r.z) < 1e-12, `w ${r.w} z ${r.z}`);
      assert.ok(Math.hypot(r.px[0] - (p[0] + 960), r.px[1] - (p[1] + 540)) < 1e-9);
    }
  });

  check('w > 0 over the whole quad incl. the 1.1 SDF margin and text padding (the GPU never clips a pin)', () => {
    for (const dst of [phone, keystone, [[100, 100], [1800, 400], [1700, 700], [200, 1000]]]) {
      const m = cornerPinMatrix(src, dst, W, H);
      for (let i = -11; i <= 11; i++) for (let j = -11; j <= 11; j++) {
        const r = toPx(m, (i / 10) * 220, (j / 10) * 165);
        assert.ok(r.w > 0, `w ${r.w} at ${i},${j}`);
      }
    }
  });

  check('mirrored pins (reversed winding) are a valid flip', () => {
    const mirrored = [phone[1], phone[0], phone[3], phone[2]];
    const m = cornerPinMatrix(src, mirrored, W, H);
    assert.ok(m);
    src.forEach((p, i) => { const r = toPx(m, p[0], p[1]); assert.ok(r.w > 0 && Math.hypot(r.px[0] - mirrored[i][0], r.px[1] - mirrored[i][1]) < 1e-6); });
  });

  check('bow-tie, concave, collinear, repeated and non-finite pins are rejected (null = draw unpinned)', () => {
    const bowtie = [phone[0], phone[2], phone[1], phone[3]];
    const concave = [[0, 0], [400, 0], [150, 120], [0, 300]];
    const collinear = [[0, 0], [100, 0], [200, 0], [0, 300]];
    const repeated = [[0, 0], [0, 0], [300, 300], [0, 300]];
    const nan = [[0, 0], [NaN, 0], [300, 300], [0, 300]];
    for (const q of [bowtie, concave, collinear, repeated, nan]) {
      assert.equal(isConvexQuad(q), false, JSON.stringify(q));
      assert.equal(cornerPinMatrix(src, q, W, H), null, JSON.stringify(q));
    }
    assert.equal(isConvexQuad(phone), true);
  });

  check('deterministic: the same pins give a bit-identical matrix', () => {
    assert.deepEqual(cornerPinMatrix(src, phone, W, H), cornerPinMatrix(src, phone, W, H));
  });

  const { createComposition, createRectangleLayer, createProperty } = factory;
  const { resolveFrame } = interp;
  const kf = (frame, value) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });
  const comp = createComposition('c', { width: W, height: H, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] });
  const a = createRectangleLayer('a', 960, 540, 400, 300, [1, 1, 1, 1], 60);
  const b = createRectangleLayer('b', 300, 300, 100, 100, [1, 1, 1, 1], 60);
  a.cornerPin = {
    topLeft: createProperty('Top Left', 'vec2', [760, 390]),
    topRight: createProperty('Top Right', 'vec2', [1160, 390]),
    bottomRight: createProperty('Bottom Right', 'vec2', [1160, 690]),
    bottomLeft: createProperty('Bottom Left', 'vec2', [760, 690]),
  };
  a.cornerPin.topRight.keyframes = [kf(0, [1160, 390]), kf(20, [1100, 450])];
  comp.layers = [a, b];

  check('resolveFrame evaluates keyframed pins per frame; unpinned layers get no pin', () => {
    const f0 = resolveFrame(comp, 0), f10 = resolveFrame(comp, 10), f20 = resolveFrame(comp, 20);
    const pa = (f) => f.layers.find((l) => l.id === a.id).cornerPin;
    assert.deepEqual(pa(f0), [[760, 390], [1160, 390], [1160, 690], [760, 690]]);
    assert.deepEqual(pa(f10)[1], [1130, 420]);
    assert.deepEqual(pa(f20)[1], [1100, 450]);
    assert.equal(f10.layers.find((l) => l.id === b.id).cornerPin, undefined);
    const plain = { ...comp, layers: [b] };
    assert.equal(resolveFrame(plain, 0).layers[0].cornerPin, undefined, 'comp without pins: no field at all');
  });

  check('save/load (validateComposition) keeps the pins and their keyframes', () => {
    const back = val.validateComposition(JSON.parse(JSON.stringify(comp)));
    const la = back.layers.find((l) => l.id === a.id);
    assert.ok(la.cornerPin, 'cornerPin survived');
    assert.deepEqual(la.cornerPin.topLeft.defaultValue, [760, 390]);
    assert.equal(la.cornerPin.topRight.keyframes.length, 2);
    assert.equal(back.layers.find((l) => l.id === b.id).cornerPin, undefined);
  });

  console.log(`\n✅ ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
