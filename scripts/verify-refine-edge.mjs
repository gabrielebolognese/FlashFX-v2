// Acceptance harness for Refine Edge (B10e): the pure colour-aware matte-edge pass (core/refineEdge.ts,
// the CPU twin of engine/refineWgsl.ts) driven by the real mask field (core/maskCoverage.ts
// maskStackField), plus the resolve + persistence wiring. Bundles the real TS with esbuild and asserts
// with node:assert. The GPU side (the image shader running the same pass) is `npm run gpu:masks`.
//   node scripts/verify-refine-edge.mjs   (or: npm run verify:refine-edge)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'refine-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b} (eps ${eps})`);

const K = 0.5523;
const bv = (p, hin, hout) => ({ position: p, handleIn: hin, handleOut: hout, vertexType: 'smooth' });
const circle = () => [
  bv([0.5, 0], [0, -0.5 * K], [0, 0.5 * K]),
  bv([0, 0.5], [0.5 * K, 0], [-0.5 * K, 0]),
  bv([-0.5, 0], [0, 0.5 * K], [0, -0.5 * K]),
  bv([0, -0.5], [-0.5 * K, 0], [0.5 * K, 0]),
];
const rm = (o) => ({ type: 'rectangle', centerX: 100, centerY: 100, sizeX: 100, sizeY: 100, rotation: 0, feather: 0, invert: false, opacity: 1, points: 5, innerRadius: 10, ...o });

// Synthetic footage: a red disc of radius 40 at (100, 100) on blue. `soft` widens the transition
// (a fuzzy, hair-like edge) to `soft` px; otherwise a 1 px anti-aliased edge.
const RED = [1, 0, 0], BLUE = [0, 0, 1];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const discT = (r, soft) => (soft ? smooth(40 - soft / 2, 40 + soft / 2, r) : Math.min(1, Math.max(0, r - 40 + 0.5)));
const disc = (soft = 0) => (x, y) => {
  const t = discT(Math.hypot(x - 100, y - 100), soft);
  return [RED[0] * (1 - t) + BLUE[0] * t, RED[1] * (1 - t) + BLUE[1] * t, RED[2] * (1 - t) + BLUE[2] * t];
};
const at = (r, ang = 0.4) => [100 + r * Math.cos(ang), 100 + r * Math.sin(ang)];

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/refineEdge';
        export { packMaskSlots, maskStackField, MASK_BLOCK_FLOATS } from './src/core/maskCoverage';
        export { REFINE_WGSL } from './src/engine/refineWgsl';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createImageLayer, createVideoLayer, createMask, createKeyframe } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'entry.ts',
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  const R = await import(pathToFileURL(outfile).href);
  const {
    refineEdgeAt, classifyAlpha, contrastAlpha, refineConfidence, bandWeight, decontaminatedColor,
    clampRefineEdge, sanitizeRefineEdge, resolveRefineEdge, packRefineEdge, DEFAULT_REFINE_EDGE,
    REFINE_RADIUS_MIN, REFINE_RADIUS_MAX, packMaskSlots, maskStackField, MASK_BLOCK_FLOATS, REFINE_WGSL,
  } = R;

  const fieldOf = (masks, band = Infinity) => {
    const b = new Float32Array(MASK_BLOCK_FLOATS);
    const n = packMaskSlots(masks, b, 0);
    return (x, y) => maskStackField(b, 0, n, x, y, band);
  };
  const refineWith = (masks, img, params) => {
    const p = { radius: 10, contrast: 0, decontaminate: 1, ...params };
    const f = fieldOf(masks, p.radius); // the shader's band: the field is exact where the refine reads it
    return (x, y) => refineEdgeAt(x, y, f(x, y), p, img);
  };

  check('classifyAlpha: projects C onto the B -> F line (1 at F, 0 at B, linear between, clamped)', () => {
    assert.equal(classifyAlpha(RED, RED, BLUE), 1);
    assert.equal(classifyAlpha(BLUE, RED, BLUE), 0);
    near(classifyAlpha([0.5, 0, 0.5], RED, BLUE), 0.5, 1e-12);
    near(classifyAlpha([0.75, 0, 0.25], RED, BLUE), 0.75, 1e-12);
    assert.equal(classifyAlpha([2, 0, -1], RED, BLUE), 1, 'clamped above');
    assert.equal(classifyAlpha([0, 0, 2], RED, BLUE), 0, 'clamped below');
    assert.ok(Number.isFinite(classifyAlpha([0.3, 0.3, 0.3], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])), 'F == B never divides by zero');
  });

  check('contrastAlpha: 0 is the identity, 1 steepens x5 about 0.5, always clamped', () => {
    for (const a of [0, 0.1, 0.37, 0.5, 0.9, 1]) near(contrastAlpha(a, 0), a, 1e-12);
    assert.equal(contrastAlpha(0.5, 1), 0.5);
    near(contrastAlpha(0.55, 1), 0.75, 1e-12);
    assert.equal(contrastAlpha(0.7, 1), 1);
    assert.equal(contrastAlpha(0.3, 1), 0);
  });

  check('refineConfidence + bandWeight: no trust when F ~ B; full weight at the edge fading to 0 at the radius', () => {
    assert.equal(refineConfidence([0.5, 0.5, 0.5], [0.52, 0.5, 0.5]), 0);
    assert.equal(refineConfidence(RED, BLUE), 1);
    assert.equal(bandWeight(0, 10), 1);
    assert.equal(bandWeight(5.9, 10), 1);
    assert.equal(bandWeight(10, 10), 0);
    assert.equal(bandWeight(-10, 10), 0);
    let prev = 1;
    for (let d = 0; d <= 10; d += 0.25) { const w = bandWeight(d, 10); assert.ok(w <= prev + 1e-12); prev = w; }
  });

  check('decontaminatedColor: solves C = aF + (1 - a)B for F at confident alpha; falls back to the sampled F at low alpha', () => {
    const B = [0.1, 0.8, 0.2], F = [0.9, 0.3, 0.4];
    const a = 0.7;
    const C = F.map((f, i) => a * f + (1 - a) * B[i]);
    const fe = decontaminatedColor(C, [0.5, 0.5, 0.5], B, a); // sampled F deliberately wrong: the solve wins
    fe.forEach((v, i) => near(v, F[i], 1e-9));
    const low = decontaminatedColor([0.12, 0.79, 0.2], F, B, 0.02);
    low.forEach((v, i) => near(v, F[i], 1e-12));
  });

  check('refineEdgeAt: identity outside the band, without a normal, or with radius 0', () => {
    const img = disc();
    const inside = { alpha: 0.7, sd: -15, gx: 1, gy: 0 };
    assert.deepEqual(refineEdgeAt(100, 100, inside, { radius: 10, contrast: 0.5, decontaminate: 1 }, img), { alpha: 0.7, delta: [0, 0, 0] });
    assert.deepEqual(refineEdgeAt(100, 100, { alpha: 0.3, sd: 1, gx: 0, gy: 0 }, { radius: 10, contrast: 0, decontaminate: 1 }, img), { alpha: 0.3, delta: [0, 0, 0] });
    assert.deepEqual(refineEdgeAt(100, 100, { alpha: 0.3, sd: 1, gx: 1, gy: 0 }, { radius: 0, contrast: 0, decontaminate: 1 }, img), { alpha: 0.3, delta: [0, 0, 0] });
  });

  check('a roto that is 6 px TOO BIG snaps in to the subject edge (background inside the roto is cut away)', () => {
    const ref = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' })], disc());
    for (const ang of [0, 0.9, 2.2, 4]) {
      near(ref(...at(43.5, ang)).alpha, 0, 1e-6, `bg inside the roto @${ang}`);
      near(ref(...at(40, ang)).alpha, 0.5, 0.02, `half at the true edge @${ang}`);
      near(ref(...at(37, ang)).alpha, 1, 1e-6, `subject @${ang}`);
      near(ref(...at(30, ang)).alpha, 1, 0, `deep inside keeps the mask alpha @${ang}`);
      near(ref(...at(60, ang)).alpha, 0, 0, `far outside keeps the mask alpha @${ang}`);
    }
  });

  check('a roto that is 6 px TOO SMALL grows out to the subject edge (parametric ellipse roto)', () => {
    const ref = refineWith([rm({ type: 'ellipse', sizeX: 68, sizeY: 68, mode: 'add' })], disc());
    for (const ang of [0.2, 1.7, 3.3, 5.1]) {
      near(ref(...at(38, ang)).alpha, 1, 1e-6, `subject outside the roto @${ang}`);
      near(ref(...at(40, ang)).alpha, 0.5, 0.03, `half at the true edge @${ang}`);
      near(ref(...at(42.5, ang)).alpha, 0, 1e-6, `background @${ang}`);
    }
  });

  check('a soft (hair-like) 12 px transition keeps its partial alpha instead of a hard scissor cut', () => {
    const img = disc(12);
    const ref = refineWith([rm({ vertices: circle(), sizeX: 80, sizeY: 80, mode: 'add' })], img);
    for (let r = 35; r <= 45; r += 0.5) {
      const want = 1 - discT(r, 12);
      near(ref(...at(r)).alpha, want, 0.02, `r = ${r}`);
    }
  });

  check('contrast hardens the classified edge without moving it', () => {
    const img = disc(12);
    const masks = [rm({ vertices: circle(), sizeX: 80, sizeY: 80, mode: 'add' })];
    const soft = refineWith(masks, img, { contrast: 0 }), hard = refineWith(masks, img, { contrast: 1 });
    near(hard(...at(40)).alpha, 0.5, 0.01, 'edge stays put');
    assert.ok(hard(...at(38)).alpha > soft(...at(38)).alpha + 0.1, 'more opaque just inside');
    assert.ok(hard(...at(42)).alpha < soft(...at(42)).alpha - 0.1, 'more transparent just outside');
  });

  check('decontamination: an edge pixel loses the background colour (blue fringe -> red), only as strong as asked', () => {
    const ref1 = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' })], disc(), { decontaminate: 1 });
    const p = at(40);
    const r1 = ref1(...p);
    const C = disc()(...p);
    const out = C.map((c, i) => c + r1.delta[i]);
    near(out[0], 1, 0.03, 'red restored');
    near(out[2], 0, 0.03, 'blue removed');
    const half = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' })], disc(), { decontaminate: 0.5 })(...p);
    half.delta.forEach((d, i) => near(d, r1.delta[i] * 0.5, 1e-9));
    const off = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' })], disc(), { decontaminate: 0 })(...p);
    assert.deepEqual(off.delta.map((d) => Math.abs(d)), [0, 0, 0]);
    // Deep in the subject there is nothing to decontaminate.
    assert.deepEqual(ref1(...at(30)).delta, [0, 0, 0]);
  });

  check('no colour contrast between subject and background -> the mask alpha is kept (graceful fallback)', () => {
    const grey = () => [0.4, 0.4, 0.4];
    const masks = [rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add', feather: 2 })];
    const f = fieldOf(masks);
    const ref = refineWith(masks, grey);
    for (const r of [44, 46, 48]) {
      const p = at(r);
      near(ref(...p).alpha, f(...p).alpha, 1e-12, `r = ${r}`);
      assert.deepEqual(ref(...p).delta.map((d) => Math.abs(d)), [0, 0, 0]);
    }
  });

  check('works on a mask STACK (subtract hole) and an inverted mask: refines whichever edge is nearest', () => {
    // Keep a big rect minus a hole around the disc: the subject is the hole's surroundings... here the
    // kept region is OUTSIDE the hole, so the "subject" colour is blue and the hole edge must snap to
    // the disc edge from the other side.
    const masks = [rm({ type: 'rectangle', sizeX: 400, sizeY: 400, mode: 'add' }), rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'subtract' })];
    const ref = refineWith(masks, disc());
    near(ref(...at(43.5)).alpha, 1, 1e-6, 'blue background inside the (too big) hole is kept');
    near(ref(...at(37)).alpha, 0, 1e-6, 'the red disc is cut away');
    const inv = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add', invert: true })], disc());
    near(inv(...at(43.5)).alpha, 1, 1e-6, 'inverted: same snap');
    near(inv(...at(37)).alpha, 0, 1e-6);
  });

  check('alpha is continuous across the band boundary (no seam at |sd| = radius)', () => {
    const img = disc(30); // a very soft edge so the classified alpha differs from the hard mask there
    const masks = [rm({ vertices: circle(), sizeX: 80, sizeY: 80, mode: 'add' })];
    const ref = refineWith(masks, img, { radius: 8 });
    let prev = ref(...at(40 - 9)).alpha;
    for (let r = 40 - 9; r <= 40 + 9; r += 0.05) {
      const a = ref(...at(r)).alpha;
      assert.ok(Math.abs(a - prev) < 0.06, `jump ${prev} -> ${a} at r = ${r.toFixed(2)}`);
      prev = a;
    }
  });

  check('the banded field (what the shader computes) refines exactly like the full field', () => {
    const masks = [rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' }), rm({ type: 'rectangle', centerX: 160, centerY: 40, sizeX: 50, sizeY: 30, mode: 'add' })];
    const img = disc(4);
    const fullF = fieldOf(masks), bandF = fieldOf(masks, 10);
    const params = { radius: 10, contrast: 0.3, decontaminate: 0.6 };
    for (let y = 0; y < 200; y += 3) for (let x = 0; x < 200; x += 3) {
      assert.deepEqual(refineEdgeAt(x, y, bandF(x, y), params, img), refineEdgeAt(x, y, fullF(x, y), params, img), `${x},${y}`);
    }
  });

  check('frame-pure: the same inputs always give byte-identical output', () => {
    const ref = refineWith([rm({ vertices: circle(), sizeX: 92, sizeY: 92, mode: 'add' })], disc(5));
    for (let k = 0; k < 50; k++) {
      const p = at(30 + k * 0.4, k);
      assert.deepEqual(ref(...p), ref(...p));
    }
  });

  check('params: clamp / sanitize / resolve / pack (radius 1..64, 0..1 sliders, off unless enabled with masks)', () => {
    assert.deepEqual(clampRefineEdge({ enabled: true, radius: 500, contrast: -1, decontaminate: 9 }), { enabled: true, radius: REFINE_RADIUS_MAX, contrast: 0, decontaminate: 1 });
    assert.equal(clampRefineEdge({ enabled: true, radius: 0, contrast: 0, decontaminate: 0 }).radius, REFINE_RADIUS_MIN);
    assert.deepEqual(sanitizeRefineEdge({ enabled: true, radius: 'x', contrast: NaN }), { ...DEFAULT_REFINE_EDGE });
    assert.equal(sanitizeRefineEdge(null), undefined);
    assert.equal(sanitizeRefineEdge([1, 2]), undefined);
    assert.equal(sanitizeRefineEdge({ enabled: 'yes' }).enabled, false, 'only literal true enables');
    assert.equal(resolveRefineEdge(undefined, 3), undefined);
    assert.equal(resolveRefineEdge({ ...DEFAULT_REFINE_EDGE, enabled: false }, 3), undefined);
    assert.equal(resolveRefineEdge(DEFAULT_REFINE_EDGE, 0), undefined, 'no masks -> no edge to refine');
    assert.deepEqual(resolveRefineEdge({ ...DEFAULT_REFINE_EDGE, radius: 100 }, 1), { ...DEFAULT_REFINE_EDGE, radius: 64 });
    assert.deepEqual(packRefineEdge(undefined), [0, 0, 0]);
    assert.deepEqual(packRefineEdge({ enabled: true, radius: 6, contrast: 0.2, decontaminate: 0.9 }), [6, 0.2, 0.9]);
  });

  check('resolveFrame: image + video layers carry refineEdge (clamped) only when enabled with masks; masks carry mode + keyframed expansion', () => {
    const comp = R.createComposition('c', { width: 320, height: 180, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] });
    const img = R.createImageLayer('img', 160, 90, 'a1', 320, 180, 'png', 0, 60);
    const m = R.createMask('ellipse', 160, 90, 100, 80);
    assert.equal(m.mode, 'add', 'new masks default to Add');
    m.expansion = { ...m.expansion, keyframes: [R.createKeyframe(0, 0), R.createKeyframe(10, 20)] };
    const legacy = R.createMask('rectangle', 160, 90, 200, 100);
    delete legacy.mode; delete legacy.expansion;
    img.masks = [m, legacy];
    img.refineEdge = { enabled: true, radius: 200, contrast: 0.3, decontaminate: 0.4 };
    const vid = R.createVideoLayer('vid', 160, 90, 'v1', 320, 180, 2, 30, 60);
    vid.refineEdge = { ...DEFAULT_REFINE_EDGE };
    const bare = R.createImageLayer('bare', 160, 90, 'a2', 320, 180, 'png', 0, 60);
    bare.refineEdge = { ...DEFAULT_REFINE_EDGE };
    const off = R.createImageLayer('off', 160, 90, 'a3', 320, 180, 'png', 0, 60);
    off.masks = [R.createMask('rectangle', 160, 90, 100, 100)];
    off.refineEdge = { ...DEFAULT_REFINE_EDGE, enabled: false };
    comp.layers = [img, vid, bare, off];
    const f5 = R.resolveFrame(comp, 5);
    const ri = f5.layers.find((l) => l.id === img.id);
    assert.deepEqual(ri.refineEdge, { enabled: true, radius: 64, contrast: 0.3, decontaminate: 0.4 });
    assert.equal(ri.masks[0].mode, 'add');
    near(ri.masks[0].expansion, 10, 1e-9, 'keyframed expansion at frame 5');
    assert.equal(ri.masks[1].mode, undefined, 'legacy mask resolves without a mode');
    assert.equal(ri.masks[1].expansion, undefined);
    assert.equal(R.resolveFrame(comp, 0).layers.find((l) => l.id === img.id).masks[0].expansion, undefined, 'zero expansion resolves to absent');
    const rv = f5.layers.find((l) => l.id === vid.id);
    assert.ok(rv, 'the video layer resolves');
    assert.equal(rv.refineEdge, undefined, 'video without masks: no refine');
    assert.equal(f5.layers.find((l) => l.id === bare.id).refineEdge, undefined, 'image without masks: no refine');
    assert.equal(f5.layers.find((l) => l.id === off.id).refineEdge, undefined, 'disabled: no refine');
    vid.masks = [R.createMask('ellipse', 160, 90, 100, 80)];
    const rv2 = R.resolveFrame(comp, 5).layers.find((l) => l.id === vid.id);
    assert.ok(rv2, 'the masked video layer resolves');
    assert.deepEqual(rv2.refineEdge, { ...DEFAULT_REFINE_EDGE });
  });

  check('persistence: mode / expansion / refineEdge survive validateComposition; junk is dropped or clamped', () => {
    const comp = R.createComposition('c', { width: 320, height: 180, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] });
    const img = R.createImageLayer('img', 160, 90, 'a1', 320, 180, 'png', 0, 60);
    const m = R.createMask('ellipse', 160, 90, 100, 80);
    m.mode = 'subtract';
    m.expansion = { ...m.expansion, defaultValue: -4, keyframes: [R.createKeyframe(3, 7)] };
    const junk = R.createMask('rectangle', 0, 0, 10, 10);
    junk.mode = 'explode';
    junk.expansion = 'big';
    img.masks = [m, junk];
    img.refineEdge = { enabled: true, radius: 12, contrast: 2, decontaminate: 0.25 };
    const vid = R.createVideoLayer('vid', 160, 90, 'v1', 320, 180, 2, 30, 60);
    vid.refineEdge = { enabled: true, radius: 3, contrast: 0.1, decontaminate: 0.9 };
    comp.layers = [img, vid];
    const back = R.validateComposition(JSON.parse(JSON.stringify(comp)));
    const bi = back.layers.find((l) => l.id === img.id);
    assert.equal(bi.masks[0].mode, 'subtract');
    assert.equal(bi.masks[0].expansion.defaultValue, -4);
    assert.equal(bi.masks[0].expansion.keyframes.length, 1);
    assert.equal(bi.masks[1].mode, undefined, 'unknown mode dropped (legacy intersect)');
    assert.equal(bi.masks[1].expansion, undefined, 'non-object expansion dropped');
    assert.deepEqual(bi.refineEdge, { enabled: true, radius: 12, contrast: 1, decontaminate: 0.25 });
    assert.deepEqual(back.layers.find((l) => l.id === vid.id).refineEdge, { enabled: true, radius: 3, contrast: 0.1, decontaminate: 0.9 });
  });

  check('refine WGSL: constants interpolated from the CPU twin (single source of truth)', () => {
    assert.ok(!REFINE_WGSL.includes('${'), 'no un-interpolated template');
    assert.ok(REFINE_WGSL.includes('fn refineEdgeAt(') && REFINE_WGSL.includes('refine_sample('));
    for (const c of [R.REFINE_CONF_LO, R.REFINE_CONF_HI, R.REFINE_BAND_FADE, R.REFINE_SOLVE_LO, R.REFINE_SOLVE_HI, R.REFINE_SOLVE_MIN_ALPHA]) {
      assert.ok(REFINE_WGSL.includes(String(c)), `constant ${c}`);
    }
    assert.ok(REFINE_WGSL.includes(`${R.REFINE_CONTRAST_GAIN}.0 * contrast`));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ refine-edge harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
