// Acceptance harness for mask uniform packing + coverage (B10d-mask; modes / expansion / field B10e). Bundles the pure
// core/maskCoverage.ts (packMaskSlots + its CPU twin of the mask WGSL) and engine/maskWgsl.ts, and
// asserts with node:assert. The same twin is checked against the real GPU by `npm run gpu:masks`.
//   node scripts/verify-mask-coverage.mjs   (or: npm run verify:mask-coverage)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { legacyMaskStackCoverage } from './lib/legacy-mask-twin.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'maskcov-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

// The pre-B10d-mask renderer writer, verbatim - the golden reference for parametric-only stacks.
function legacyWrite(data, maskCountOffset, masksOffset, masks) {
  const typeMap = { rectangle: 1, ellipse: 2, star: 3, polygon: 4 };
  const count = masks ? Math.min(masks.length, 8) : 0;
  data[maskCountOffset] = count;
  for (let i = 0; i < count; i++) {
    const m = masks[i];
    const base = masksOffset + i * 12;
    data[base] = typeMap[m.type] ?? 1;
    data[base + 1] = m.invert ? 1 : 0;
    data[base + 2] = m.opacity;
    data[base + 3] = m.feather;
    data[base + 4] = m.centerX;
    data[base + 5] = m.centerY;
    data[base + 6] = m.sizeX * 0.5;
    data[base + 7] = m.sizeY * 0.5;
    data[base + 8] = m.rotation * (Math.PI / 180);
    data[base + 9] = m.points;
    data[base + 10] = m.innerRadius;
    data[base + 11] = 0;
  }
  for (let i = count; i < 8; i++) {
    const base = masksOffset + i * 12;
    for (let j = 0; j < 12; j++) data[base + j] = 0;
  }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const K = 0.5523;
const cv = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const bv = (p, hin, hout) => ({ position: p, handleIn: hin, handleOut: hout, vertexType: 'smooth' });
const square = () => [cv(-0.5, -0.5), cv(0.5, -0.5), cv(0.5, 0.5), cv(-0.5, 0.5)];
const circle = () => [
  bv([0.5, 0], [0, -0.5 * K], [0, 0.5 * K]),
  bv([0, 0.5], [0.5 * K, 0], [-0.5 * K, 0]),
  bv([-0.5, 0], [0, 0.5 * K], [0, -0.5 * K]),
  bv([0, -0.5], [-0.5 * K, 0], [0.5 * K, 0]),
];
const wavy = (n, lobes = 5) => {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 * (0.82 + 0.18 * Math.sin(a * lobes));
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return pts.map((p, i) => {
    const pr = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
    const h = [(nx[0] - pr[0]) / 6, (nx[1] - pr[1]) / 6];
    return bv(p, [-h[0], -h[1]], h);
  });
};
const rm = (o) => ({ type: 'rectangle', centerX: 100, centerY: 100, sizeX: 100, sizeY: 100, rotation: 0, feather: 0, invert: false, opacity: 1, points: 5, innerRadius: 10, ...o });

try {
  const C = await bundle('src/core/maskCoverage.ts', 'maskCoverage.mjs');
  const W = await bundle('src/engine/maskWgsl.ts', 'maskWgsl.mjs');
  const {
    packMaskSlots, maskStackCoverage, freeformCoverage, encodeFreeform, allocateFreeformSlots, freeformSlotNeed,
    MASK_BLOCK_FLOATS, FREEFORM_MASK_TYPE, MASK_SLOTS,
  } = C;
  const pack = (masks) => { const b = new Float32Array(MASK_BLOCK_FLOATS); const n = packMaskSlots(masks, b, 0); return { b, n }; };
  const cov = (masks, x, y) => { const { b, n } = pack(masks); return maskStackCoverage(b, 0, n, x, y); };

  check('parametric-only stacks pack byte-for-byte like the legacy writer (0..10 masks, at offsets)', () => {
    const r = rng(7);
    const types = ['rectangle', 'ellipse', 'star', 'polygon', 'bogus'];
    for (let trial = 0; trial < 60; trial++) {
      const n = Math.floor(r() * 11);
      const masks = Array.from({ length: n }, () => rm({
        type: types[Math.floor(r() * types.length)], centerX: r() * 500, centerY: r() * 300, sizeX: r() * 400, sizeY: r() * 300,
        rotation: r() * 360 - 180, feather: r() * 20, invert: r() < 0.5, opacity: r(), points: 3 + Math.floor(r() * 6), innerRadius: r() * 50,
      }));
      for (const [countOff, masksOff, len] of [[10, 12, 140], [15, 28, 260], [17, 20, 200]]) {
        const a = new Float32Array(len).fill(7), b = new Float32Array(len).fill(7);
        legacyWrite(a, countOff, masksOff, masks);
        b[countOff] = packMaskSlots(masks, b, masksOff);
        assert.deepEqual(Buffer.from(b.buffer), Buffer.from(a.buffer), `trial ${trial} offsets ${masksOff}`);
      }
    }
    const a = new Float32Array(120).fill(3), b = new Float32Array(120).fill(3);
    legacyWrite(a, 10, 12, undefined);
    b[10] = packMaskSlots(undefined, b, 12);
    assert.deepEqual(b, a, 'no masks zeroes the block, count 0');
  });

  check('freeform header + data layout (comp-space bezier stream, span = 1 + ceil(7n/12))', () => {
    const { b, n } = pack([rm({ vertices: square(), centerX: 100, centerY: 50, sizeX: 40, sizeY: 20, feather: 3, invert: true, opacity: 0.5 })]);
    assert.equal(n, 4);
    assert.deepEqual(Array.from(b.slice(0, 12)), [FREEFORM_MASK_TYPE, 1, 0.5, 3, 4, 0, 80, 40, 120, 60, 4, 0]);
    assert.deepEqual(Array.from(b.slice(12, 19)), [80, 40, 80, 40, 80, 40, 3]); // v0: pos, in-point, out-point, feather
    assert.deepEqual(Array.from(b.slice(19, 21)), [120, 40]);
    assert.ok(b.slice(12 + 28, 96).every((x) => x === 0), 'tail zeroed');
  });

  check('coverage: hard-edged square is 1 inside, 0 outside, 0.5 exactly on the edge', () => {
    const m = [rm({ vertices: square() })]; // 50..150
    assert.equal(cov(m, 100, 100), 1);
    assert.equal(cov(m, 60.5, 140.5), 1);
    assert.equal(cov(m, 30, 100), 0);
    assert.equal(cov(m, 151, 100), 0);
    assert.equal(cov(m, 150, 100), 0.5);
  });

  check('coverage: feather is centred on the edge, symmetric and monotone', () => {
    const m = [rm({ vertices: square(), feather: 8 })];
    assert.equal(cov(m, 150, 100), 0.5);
    assert.equal(cov(m, 142, 100), 1);
    assert.equal(cov(m, 158, 100), 0);
    assert.ok(Math.abs(cov(m, 146, 100) + cov(m, 154, 100) - 1) < 1e-9, 'symmetric about the edge');
    let prev = 1;
    for (let x = 140; x <= 160; x += 0.5) { const c = cov(m, x, 100); assert.ok(c <= prev + 1e-12); prev = c; }
  });

  check('coverage: invert and opacity follow the parametric convention', () => {
    const m = [rm({ vertices: square(), invert: true, opacity: 0.6 })];
    assert.ok(Math.abs(cov(m, 100, 100) - 0.4) < 1e-6, 'inside: inverted 0 at 60% opacity → 0.4');
    assert.equal(cov(m, 20, 20), 1);
  });

  check('coverage: per-vertex feather interpolates along the nearest edge', () => {
    const m = [rm({ vertices: square(), feathers: [0, 10, 10, 0] })]; // top edge: v0 (0) → v1 (10)
    const mid = cov(m, 100, 47.5); // 2.5 px outside the top edge at its midpoint: feather 5
    const expect = 1 - (((2.5 + 5) / 10) ** 2) * (3 - 2 * ((2.5 + 5) / 10));
    assert.ok(Math.abs(mid - expect) < 1e-6, `${mid} vs ${expect}`);
    assert.ok(cov(m, 55, 48) < cov(m, 145, 48), 'softer toward the feathered vertex');
  });

  check('coverage: concave outlines (star notches are outside)', () => {
    const star = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; const r = i % 2 ? 0.2 : 0.5; return cv(Math.cos(a) * r, Math.sin(a) * r); });
    const m = [rm({ vertices: star })];
    assert.equal(cov(m, 100, 100), 1);
    assert.equal(cov(m, 145, 100), 1, 'inside a point');
    const notch = [100 + Math.cos(Math.PI / 5) * 40, 100 + Math.sin(Math.PI / 5) * 40];
    assert.equal(cov(m, notch[0], notch[1]), 0, 'notch between points is outside');
  });

  check('coverage: nonzero winding (a bow-tie fills both lobes)', () => {
    const bow = [cv(-0.5, -0.5), cv(0.5, 0.5), cv(0.5, -0.5), cv(-0.5, 0.5)];
    const m = [rm({ vertices: bow })];
    assert.equal(cov(m, 60, 100), 1);
    assert.equal(cov(m, 140, 100), 1);
    assert.equal(cov(m, 100, 60), 0);
  });

  check('coverage: a 4-vertex bezier circle covers ~πr² (curves traced, not chorded)', () => {
    const m = [rm({ vertices: circle(), sizeX: 160, sizeY: 160 })];
    const { b, n } = pack(m);
    let area = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) area += maskStackCoverage(b, 0, n, x + 0.5, y + 0.5);
    // Chords sit inside the arc by at most the flatten tolerance (0.25px): the mean radius error must
    // stay under it, i.e. |area - pi r^2| < 2 pi r * 0.25.
    const ideal = Math.PI * 80 * 80;
    assert.ok(Math.abs(area - ideal) < 2 * Math.PI * 80 * C.FREEFORM_FLATTEN_TOL, `area ${area.toFixed(1)} vs ${ideal.toFixed(1)}`);
  });

  check('mask frame: position / size / rotation move the outline like a parametric mask', () => {
    const m = [rm({ vertices: [cv(0, 0), cv(0.5, 0), cv(0.5, 0.2)], centerX: 300, centerY: 200, sizeX: 100, sizeY: 100, rotation: 90 })];
    assert.equal(cov(m, 296, 240), 1, 'local +x is comp +y at 90 deg');
    assert.equal(cov(m, 340, 204), 0);
  });

  check('a path mask with < 3 vertices encloses nothing and is skipped (identity)', () => {
    const { b, n } = pack([rm({ vertices: [cv(0, 0), cv(0.5, 0)] })]);
    assert.equal(n, 0);
    assert.equal(maskStackCoverage(b, 0, n, 100, 100), 1);
  });

  check('stacking: parametric masks after a freeform run read their own slots', () => {
    const m = [rm({ vertices: square() }), rm({ type: 'ellipse', centerX: 150, centerY: 150, sizeX: 80, sizeY: 80 })];
    const { n } = pack(m);
    assert.equal(n, 5);
    assert.equal(cov(m, 140, 140), 1, 'inside both');
    assert.equal(cov(m, 180, 150), 0, 'inside the ellipse only');
    assert.equal(cov(m, 60, 60), 0, 'inside the square only');
  });

  check('over budget: a 30-vertex outline is reduced to fit 8 slots and stays within ~1px', () => {
    const verts = wavy(30);
    const m = rm({ vertices: verts, sizeX: 300, sizeY: 260, centerX: 160, centerY: 140 });
    const { b, n } = pack([m]);
    assert.ok(n <= MASK_SLOTS);
    assert.ok(b[4] < 30 && b[4] >= 3);
    const exact = new Float32Array(12 + 30 * 7 + 12);
    const comp = verts.map((v) => ({ ...v, position: [160 + v.position[0] * 300, 140 + v.position[1] * 260], handleIn: [v.handleIn[0] * 300, v.handleIn[1] * 260], handleOut: [v.handleOut[0] * 300, v.handleOut[1] * 260] }));
    const e = encodeFreeform(comp, comp.map(() => 0), 10000);
    exact.set([FREEFORM_MASK_TYPE, 0, 1, e.maxFeather, e.count, e.mode, ...e.bbox, 1, 0], 0);
    exact.set(e.data, 12);
    let bad = 0, total = 0;
    for (let y = 0; y < 280; y += 2) for (let x = 0; x < 320; x += 2) {
      total++;
      const reduced = maskStackCoverage(b, 0, n, x + 0.5, y + 0.5);
      const full = freeformCoverage(exact, 0, x + 0.5, y + 0.5);
      if (Math.abs(reduced - full.alpha) > 0.5 && Math.abs(full.signedDist) > 1.5) bad++;
    }
    assert.equal(bad, 0, `${bad}/${total} samples disagree by more than 1.5px of edge`);
  });

  check('allocation: water-filled by need, small outlines stay exact, unrenderable shares released', () => {
    const c4 = rm({ vertices: circle() });
    const p = rm({ type: 'ellipse' });
    assert.equal(freeformSlotNeed(4), 4);
    assert.deepEqual(allocateFreeformSlots([c4, c4]), [4, 4]);
    assert.deepEqual(allocateFreeformSlots([c4, p, rm({ vertices: wavy(16) })]), [3, 0, 4]);
    assert.deepEqual(allocateFreeformSlots([...Array(6).fill(p), c4]), [0, 0, 0, 0, 0, 0, 2]);
    assert.deepEqual(allocateFreeformSlots([...Array(7).fill(p), c4]), [0, 0, 0, 0, 0, 0, 0, 0]);
    const squeezed = pack([...Array(6).fill(p), c4]);
    assert.equal(squeezed.n, 8);
    assert.equal(squeezed.b[6 * 12 + 5], 1, 'two slots → polyline mode');
  });

  check('frame-pure + memo-safe: packing the same masks twice is byte-identical', () => {
    const masks = [rm({ vertices: wavy(20) }), rm({ type: 'star' }), rm({ vertices: circle(), feathers: [1, 2, 3, 4] })];
    const a = pack(masks).b, b2 = pack(masks).b;
    const fresh = pack(masks.map((m) => ({ ...m }))).b;
    assert.deepEqual(Buffer.from(a.buffer), Buffer.from(b2.buffer));
    assert.deepEqual(Buffer.from(a.buffer), Buffer.from(fresh.buffer));
  });

  // ── B10e: mask modes + expansion + the combined signed-distance field ──
  const { maskStackField, MASK_MODE_ID, MASK_MODES, isMaskMode } = C;
  const field = (masks, x, y) => { const { b, n } = pack(masks); return maskStackField(b, 0, n, x, y); };
  const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

  check('B10e legacy stacks (no mode / expansion) cover EXACTLY as the frozen pre-B10e twin (random parametric + freeform)', () => {
    const r = rng(1010);
    const types = ['rectangle', 'ellipse', 'star', 'polygon'];
    let samples = 0;
    for (let trial = 0; trial < 40; trial++) {
      const n = 1 + Math.floor(r() * 5);
      const masks = Array.from({ length: n }, () => {
        const base = {
          type: types[Math.floor(r() * types.length)], centerX: 40 + r() * 120, centerY: 40 + r() * 120, sizeX: 30 + r() * 140, sizeY: 30 + r() * 140,
          rotation: r() * 360 - 180, feather: r() * 8, invert: r() < 0.3, opacity: 0.3 + r() * 0.7, points: 3 + Math.floor(r() * 6), innerRadius: 5 + r() * 30,
        };
        if (r() < 0.4) base.vertices = r() < 0.5 ? circle() : wavy(6 + Math.floor(r() * 10));
        return rm(base);
      });
      const { b, n: count } = pack(masks);
      for (let k = 0; k < 120; k++) {
        const x = r() * 200, y = r() * 200;
        assert.equal(maskStackCoverage(b, 0, count, x, y), legacyMaskStackCoverage(b, 0, count, x, y), `trial ${trial} @ ${x},${y}`);
        samples++;
      }
    }
    assert.ok(samples === 4800);
  });

  check('B10e packing: mode rides in params.y (invert + 2*id), expansion in the last slot float; absent = legacy bytes', () => {
    assert.deepEqual(MASK_MODE_ID, { intersect: 0, add: 1, subtract: 2, lighten: 3, darken: 4, difference: 5 });
    assert.deepEqual(MASK_MODES.map((m) => m.id), ['add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']);
    assert.ok(isMaskMode('add') && !isMaskMode('bogus') && !isMaskMode(undefined) && !isMaskMode('toString'));
    const p = pack([rm({ mode: 'subtract', invert: true, expansion: -6.5 }), rm({ mode: 'difference' }), rm({})]);
    assert.equal(p.b[1], 1 + 2 * 2);
    assert.equal(p.b[11], -6.5);
    assert.equal(p.b[12 + 1], 2 * 5);
    assert.equal(p.b[12 + 11], 0);
    assert.equal(p.b[24 + 1], 0, 'no mode -> legacy intersect id 0');
    const f = pack([rm({ vertices: square(), mode: 'add', expansion: 3, invert: true })]);
    assert.equal(f.b[0], FREEFORM_MASK_TYPE);
    assert.equal(f.b[1], 1 + 2 * 1);
    assert.equal(f.b[11], 3, 'freeform header carries the expansion');
    const bad = pack([rm({ mode: 'nope', expansion: NaN })]);
    assert.equal(bad.b[1], 0);
    assert.equal(bad.b[11], 0, 'a non-finite expansion packs as 0');
  });

  // Two hard 60x60 squares overlapping in x 70..90: A = 40..100, B = 70..130 (y 70..130 for both).
  const A = (o = {}) => rm({ centerX: 70, centerY: 100, sizeX: 60, sizeY: 60, ...o });
  const B = (o = {}) => rm({ centerX: 100, centerY: 100, sizeX: 60, sizeY: 60, ...o });
  const zones = (masks) => ({ aOnly: cov(masks, 55, 100), both: cov(masks, 80, 100), bOnly: cov(masks, 115, 100), none: cov(masks, 150, 100) });

  check('B10e modes (AE semantics): add = union, subtract = A minus B, intersect = overlap, difference = xor, lighten/darken', () => {
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'add' })]), { aOnly: 1, both: 1, bOnly: 1, none: 0 });
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'subtract' })]), { aOnly: 1, both: 0, bOnly: 0, none: 0 });
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'intersect' })]), { aOnly: 0, both: 1, bOnly: 0, none: 0 });
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'difference' })]), { aOnly: 1, both: 0, bOnly: 1, none: 0 });
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'lighten' })]), { aOnly: 1, both: 1, bOnly: 1, none: 0 });
    assert.deepEqual(zones([A({ mode: 'add' }), B({ mode: 'darken' })]), { aOnly: 0, both: 1, bOnly: 0, none: 0 });
    // Legacy (no mode on either) = multiply = intersect.
    assert.deepEqual(zones([A(), B()]), { aOnly: 0, both: 1, bOnly: 0, none: 0 });
  });

  check('B10e first-mask start: a lone subtract cuts a hole in the full layer; lone add / intersect keep the inside', () => {
    assert.deepEqual(zones([B({ mode: 'subtract' })]), { aOnly: 1, both: 0, bOnly: 0, none: 1 });
    assert.deepEqual(zones([B({ mode: 'add' })]), { aOnly: 0, both: 1, bOnly: 1, none: 0 });
    assert.deepEqual(zones([B({ mode: 'intersect' })]), { aOnly: 0, both: 1, bOnly: 1, none: 0 });
    assert.deepEqual(zones([B({ mode: 'darken' })]), { aOnly: 0, both: 1, bOnly: 1, none: 0 });
    assert.deepEqual(zones([B({ mode: 'difference' })]), { aOnly: 0, both: 1, bOnly: 1, none: 0 });
    // An inverted subtract (the keep-inside-B idiom): full minus outside-of-B.
    assert.deepEqual(zones([B({ mode: 'subtract', invert: true })]), { aOnly: 0, both: 1, bOnly: 1, none: 0 });
  });

  check('B10e opacity: add/subtract scale the contribution; intersect/darken keep the legacy "0 = no effect" rule', () => {
    near(cov([B({ mode: 'add', opacity: 0.5 })], 115, 100), 0.5, 1e-12, 'add 50% inside');
    near(cov([B({ mode: 'add', opacity: 0.5 })], 150, 100), 0, 1e-12, 'add 50% outside');
    near(cov([B({ opacity: 0.5 })], 150, 100), 0.5, 1e-12, 'legacy intersect 50% outside');
    near(cov([A({ mode: 'add' }), B({ mode: 'subtract', opacity: 0.25 })], 80, 100), 0.75, 1e-12, 'subtract 25%');
    near(cov([A({ mode: 'add' }), B({ mode: 'add', opacity: 0 })], 115, 100), 0, 1e-12, 'add 0% adds nothing');
    near(cov([A({ mode: 'add' }), B({ mode: 'intersect', opacity: 0 })], 55, 100), 1, 1e-12, 'intersect 0% has no effect');
    // Add is cumulative + clamped: two 50% adds over the same area reach 100%.
    near(cov([B({ mode: 'add', opacity: 0.5 }), B({ mode: 'add', opacity: 0.5 })], 115, 100), 1, 1e-12, 'cumulative add');
  });

  check('B10e expansion moves the edge by exactly N px (rect, freeform, star), + grows, - chokes, feather centred on it', () => {
    // Rect B: right edge at x = 130.
    near(cov([B({ mode: 'add', expansion: 10 })], 139.5, 100), 1, 0, 'grown 10 px');
    near(cov([B({ mode: 'add', expansion: 10 })], 140, 100), 0.5, 1e-9, 'edge at 140');
    near(cov([B({ mode: 'add', expansion: -10 })], 120, 100), 0.5, 1e-9, 'choked edge at 120');
    near(cov([B({ mode: 'add', expansion: -10 })], 125, 100), 0, 0, 'choked off');
    near(cov([B({ mode: 'add', expansion: 6, feather: 4 })], 136, 100), 0.5, 1e-9, 'feather centred on the expanded edge');
    // Freeform square 50..150 (the harness rm default).
    near(cov([rm({ vertices: square(), expansion: 7 })], 157, 100), 0.5, 1e-9, 'freeform grown');
    near(cov([rm({ vertices: square(), expansion: 7 })], 156, 20), 0, 0, 'freeform corner rounds (distance-based)');
    near(cov([rm({ vertices: square(), expansion: -7 })], 143, 100), 0.5, 1e-9, 'freeform choked');
    // Grown freeform is not clipped by the bbox early-out.
    near(cov([rm({ vertices: square(), expansion: 30 })], 175, 100), 1, 0, 'past the bbox, inside the grown edge');
    // Star: expansion is a uniform offset of its distance field.
    const st = (e) => [rm({ type: 'star', sizeX: 120, innerRadius: 25, points: 5, expansion: e })];
    let grown = 0, base = 0;
    for (let y = 0; y < 200; y += 2) for (let x = 0; x < 200; x += 2) { grown += cov(st(4), x, y); base += cov(st(0), x, y); }
    assert.ok(grown > base * 1.1, `star grows (${base} -> ${grown})`);
  });

  check('B10e field: the alpha path and the field path (any band) agree on alpha everywhere (incl. the freeform bbox early-out)', () => {
    const stacks = [
      [rm({ vertices: wavy(9), feather: 3, expansion: 4 }), B({ mode: 'subtract', feather: 2 })],
      [A({ mode: 'add', invert: true }), rm({ vertices: circle(), mode: 'difference', sizeX: 80, sizeY: 80 })],
      [rm({ type: 'star', mode: 'lighten', opacity: 0.6 }), rm({ vertices: square(), expansion: -5, mode: 'darken' })],
    ];
    const r = rng(33);
    for (const st of stacks) {
      const { b, n } = pack(st);
      for (let k = 0; k < 400; k++) {
        const x = r() * 220 - 10, y = r() * 220 - 10;
        const a0 = maskStackCoverage(b, 0, n, x, y);
        for (const band of [Infinity, 12, 3, 0.5]) assert.equal(maskStackField(b, 0, n, x, y, band).alpha, a0, `band ${band}`);
      }
    }
  });

  check('B10e field: signed distance + unit outward normal of the combined matte (CSG)', () => {
    // Lone rect B (70..130): 5 px right of its edge.
    let f = field([B({ mode: 'add' })], 135, 100);
    near(f.sd, 5, 1e-9, 'sd outside');
    near(f.gx, 1, 1e-9); near(f.gy, 0, 1e-9);
    f = field([B({ mode: 'add' })], 100, 75);
    near(f.sd, -5, 1e-9, 'sd inside, top edge nearest');
    near(f.gx, 0, 1e-9); near(f.gy, -1, 1e-9, 'normal points out through the top');
    // Expansion shifts the distance.
    near(field([B({ mode: 'add', expansion: 3 })], 135, 100).sd, 2, 1e-9);
    // Inverted: the KEPT region is outside the rect, so the sign and normal flip.
    f = field([B({ mode: 'add', invert: true })], 135, 100);
    near(f.sd, -5, 1e-9); near(f.gx, -1, 1e-9);
    // Subtract hole (B, x 70..130) punched in a wide A (x 20..180): at x = 75, 5 px inside the hole
    // from its left edge, the distance to the kept region is +5 and the normal points away from the
    // kept region (into the hole).
    f = field([A({ mode: 'add', sizeX: 160, centerX: 100 }), B({ mode: 'subtract' })], 75, 100);
    near(f.sd, 5, 1e-9, 'inside the hole, 5 px from its edge');
    near(f.gx, 1, 1e-9, 'normal points into the hole');
    // Union: the nearer surface wins.
    f = field([A({ mode: 'add' }), B({ mode: 'add' })], 135, 100);
    near(f.sd, 5, 1e-9); near(f.gx, 1, 1e-9);
    // Freeform circle (r = 50 at 100,100): the normal is radial.
    f = field([rm({ vertices: circle(), mode: 'add' })], 100 + 60 * Math.cos(0.7), 100 + 60 * Math.sin(0.7));
    near(f.sd, 10, 0.3, 'circle sd');
    near(f.gx, Math.cos(0.7), 0.02); near(f.gy, Math.sin(0.7), 0.02);
    // Exactly on a polyline edge: the perpendicular, oriented outward.
    f = field([rm({ vertices: square(), mode: 'add' })], 150, 100);
    near(Math.abs(f.sd), 0, 1e-9); near(f.gx, 1, 1e-9); near(f.gy, 0, 1e-9);
    // No masks contributing: the field has no edge (refine stays off there).
    const none = maskStackField(new Float32Array(MASK_BLOCK_FLOATS), 0, 0, 10, 10);
    assert.equal(none.alpha, 1); assert.ok(none.sd < -1e29); assert.equal(none.gx, 0);
  });

  check('B10e field: normals are unit length across random stacks (|g| = 1 wherever an edge contributes)', () => {
    const r = rng(77);
    const st = [rm({ vertices: wavy(12), mode: 'add', expansion: 2 }), rm({ type: 'ellipse', centerX: 130, sizeX: 90, sizeY: 60, mode: 'subtract' }), rm({ type: 'star', centerY: 70, mode: 'add', sizeX: 70 })];
    const { b, n } = pack(st);
    for (let k = 0; k < 500; k++) {
      const x = r() * 200, y = r() * 200;
      const f = maskStackField(b, 0, n, x, y);
      const g = Math.hypot(f.gx, f.gy);
      assert.ok(Math.abs(g - 1) < 1e-6, `|g| = ${g} at ${x},${y}`);
    }
  });

  check('B10e field band: a finite band (the refine radius) is exact wherever |sd| < band and never invents an edge', () => {
    const r = rng(91);
    const stacks = [
      [rm({ vertices: wavy(12), mode: 'add', expansion: 2 }), rm({ type: 'ellipse', centerX: 130, sizeX: 90, sizeY: 60, mode: 'subtract' })],
      [rm({ vertices: circle(), centerX: 60, sizeX: 60, sizeY: 60, mode: 'add' }), rm({ vertices: square(), centerX: 150, centerY: 150, sizeX: 40, sizeY: 40, mode: 'difference' })],
      [rm({ vertices: circle(), centerX: 60, sizeX: 70, sizeY: 70, mode: 'add' }), rm({ vertices: square(), centerX: 140, centerY: 120, sizeX: 50, sizeY: 50, mode: 'intersect', expansion: -4 })],
      [rm({ vertices: circle(), sizeX: 80, sizeY: 80, mode: 'add', invert: true, feather: 3 })],
    ];
    let inBand = 0;
    for (const st of stacks) {
      const { b, n } = pack(st);
      for (const band of [4, 10]) {
        for (let k = 0; k < 600; k++) {
          const x = r() * 260 - 30, y = r() * 260 - 30;
          const full = maskStackField(b, 0, n, x, y);
          const banded = maskStackField(b, 0, n, x, y, band);
          if (Math.abs(full.sd) < band) {
            inBand++;
            assert.equal(banded.sd, full.sd);
            assert.equal(banded.gx, full.gx);
            assert.equal(banded.gy, full.gy);
          } else {
            assert.ok(Math.abs(banded.sd) >= band, `outside the band stays outside (${full.sd} -> ${banded.sd})`);
          }
        }
      }
    }
    assert.ok(inBand > 150, `exercised the band (${inBand})`);
  });

  check('mask WGSL: constants interpolated from the packer (single source of truth)', () => {
    const src = W.MASK_WGSL;
    assert.ok(!src.includes('${'), 'no un-interpolated template');
    assert.ok(src.includes('fn mask_freeformEval(') && src.includes('fn computeMaskStack(') && src.includes('fn computeMaskStackAlpha('));
    // B10e: the mode ids the stack branches on come from the packer's table.
    for (const [mode, id] of Object.entries(MASK_MODE_ID)) if (mode !== 'intersect') assert.ok(src.includes(`mode == ${id})`), `mode ${mode}`);
    assert.ok(src.includes('>> 1u') && src.includes('& 1) == 1'), 'mode / invert decode');
    assert.ok(src.includes(`== ${FREEFORM_MASK_TYPE})`), 'freeform type id');
    assert.ok(src.includes('/ 0.25)))') && src.includes(', 1, 32)'), 'flatten tolerance + piece cap');
    assert.ok(src.includes('k * 7') && src.includes('k * 3'), 'bezier / polyline strides');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ mask-coverage harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
