// Acceptance harness for the adjustment-layer apply-below composite (B11b-gpu): the pure CPU twin of
// the adjust-variant image shader's per-pixel maths + its pass plan (core/effects/adjustmentComposite),
// the corrected layer-Blur uniform packer + slot plan (core/effects/blurFxPack), and the resolve +
// persistence wiring (an adjustment's basic filters / Blur / Glow make it do work; filters survive
// validateComposition). Bundles the real TS with esbuild and asserts with node:assert. The WGSL itself
// is pixel-checked against this twin on a real GPU by `npm run gpu:adjustment` (not part of npm test).
//   node scripts/verify-adjustment-composite.mjs   (or: npm run verify:adjustment-composite)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'adjcomp-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b} (eps ${eps})`);
const nearV = (a, b, eps, msg) => a.forEach((v, i) => near(v, b[i], eps, `${msg ?? ''} [${i}]`));

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/effects/adjustmentComposite';
        export * from './src/core/effects/blurFxPack';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createAdjustmentLayer } from './src/core/factory';
        export { DEFAULT_BLUR, DEFAULT_GLOW } from './src/core/effectDefaults';
        export { EFFECT_TYPE } from './src/core/effects/effectRegistry';
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
    ADJUST_MODE, IDENTITY_FILTERS, resolveAdjustmentFilters, isIdentityFilters, adjustmentHasWork, adjustmentStrength,
    premultiply, unpremultiply, mixPremultiplied, applyBasicFilters, adjustPixel, planAdjustmentPasses,
    BLURFX_UNIFORM_FLOATS, BLURFX_MODE, packBlurFx, kawasePassCount, planBlurFxSlots,
  } = R;

  // ── adjustmentComposite ──
  check('filters: identity defaults fill a partial / missing / junk object (finite numbers only)', () => {
    assert.deepEqual(resolveAdjustmentFilters(undefined), IDENTITY_FILTERS);
    assert.deepEqual(resolveAdjustmentFilters({ brightness: 0.2 }), { ...IDENTITY_FILTERS, brightness: 0.2 });
    assert.deepEqual(resolveAdjustmentFilters({ contrast: NaN, gamma: Infinity, exposure: '2', saturation: null }), IDENTITY_FILTERS);
    assert.ok(resolveAdjustmentFilters(undefined) !== IDENTITY_FILTERS, 'a fresh copy, never the shared constant');
    assert.equal(isIdentityFilters(IDENTITY_FILTERS), true);
    assert.equal(isIdentityFilters({ ...IDENTITY_FILTERS, gamma: 1.2 }), false);
  });

  check('adjustmentHasWork: any stack effect, non-identity filter, Blur or Glow - else a no-op', () => {
    const none = { effectCount: 0, filters: IDENTITY_FILTERS, blur: false, glow: false };
    assert.equal(adjustmentHasWork(none), false);
    assert.equal(adjustmentHasWork({ ...none, effectCount: 1 }), true);
    assert.equal(adjustmentHasWork({ ...none, filters: { ...IDENTITY_FILTERS, saturation: -1 } }), true);
    assert.equal(adjustmentHasWork({ ...none, blur: true }), true);
    assert.equal(adjustmentHasWork({ ...none, glow: true }), true);
  });

  check('strength k = clamp(opacity x mask alpha, 0, 1); non-finite -> 0', () => {
    assert.equal(adjustmentStrength(1, 1), 1);
    near(adjustmentStrength(0.5, 0.5), 0.25, 1e-12);
    assert.equal(adjustmentStrength(2, 1), 1);
    assert.equal(adjustmentStrength(-1, 1), 0);
    assert.equal(adjustmentStrength(NaN, 1), 0);
  });

  check('premultiply / unpremultiply round-trip; (near-)transparent un-premultiplies to black like the WGSL select', () => {
    for (const c of [[0.2, 0.4, 0.8, 1], [0.6, 0.1, 0.3, 0.5], [1, 1, 1, 0.01]]) nearV(unpremultiply(premultiply(c)), c, 1e-12);
    assert.deepEqual(unpremultiply([0.00001, 0, 0, 0.00005]), [0, 0, 0, 0.00005]);
    assert.deepEqual(unpremultiply([0, 0, 0, 0]), [0, 0, 0, 0]);
  });

  const id = (c) => c;
  const invert = (c) => [1 - c[0], 1 - c[1], 1 - c[2], c[3]];
  check('adjustPixel: k = 0 returns the below EXACTLY; an identity stack at k = 1 returns it (opaque + partial alpha)', () => {
    for (const below of [[0.2, 0.4, 0.8, 1], [0.15, 0.05, 0.25, 0.5], [0, 0, 0, 0]]) {
      assert.deepEqual(adjustPixel(below, 0, invert), below, 'k = 0');
      nearV(adjustPixel(below, 1, id), below, 1e-12, 'identity');
    }
  });

  check('adjustPixel: colour effects run on STRAIGHT colour and are re-premultiplied (no alpha growth, no dark fringe)', () => {
    // straight (0.5, 0, 0) at 50% alpha: inverted straight (0.5, 1, 1) -> premultiplied (0.25, 0.5, 0.5, 0.5)
    nearV(adjustPixel([0.25, 0, 0, 0.5], 1, invert), [0.25, 0.5, 0.5, 0.5], 1e-12);
    // a transparent below stays transparent under a colour effect
    assert.deepEqual(adjustPixel([0, 0, 0, 0], 1, invert), [0, 0, 0, 0]);
    // the effected colour is clamped to [0, 1] before re-premultiplying
    nearV(adjustPixel([0.9, 0.9, 0.9, 1], 1, (c) => [c[0] + 0.5, c[1], c[2] - 2, c[3]]), [1, 0.9, 0, 1], 1e-12);
  });

  check('adjustPixel: k mixes premultiplied below and effected linearly (opacity / feathered mask)', () => {
    nearV(adjustPixel([0.2, 0.4, 0.8, 1], 0.25, invert), mixPremultiplied([0.2, 0.4, 0.8, 1], [0.8, 0.6, 0.2, 1], 0.25), 1e-12);
    nearV(adjustPixel([0.2, 0.4, 0.8, 1], 0.25, invert), [0.35, 0.45, 0.65, 1], 1e-12);
  });

  check('applyBasicFilters: identity, exposure, brightness, contrast, saturation, gamma (the shader order)', () => {
    nearV(applyBasicFilters([0.1, 0.5, 0.9], IDENTITY_FILTERS), [0.1, 0.5, 0.9], 1e-12);
    nearV(applyBasicFilters([0.1, 0.2, 0.3], { ...IDENTITY_FILTERS, exposure: 1 }), [0.2, 0.4, 0.6], 1e-12);
    nearV(applyBasicFilters([0.1, 0.2, 0.3], { ...IDENTITY_FILTERS, brightness: 0.25 }), [0.35, 0.45, 0.55], 1e-12);
    nearV(applyBasicFilters([0.25, 0.75, 0.5], { ...IDENTITY_FILTERS, contrast: 1 }), [0, 1, 0.5], 1e-12);
    const g = applyBasicFilters([1, 0, 0], { ...IDENTITY_FILTERS, saturation: -1 });
    nearV(g, [0.2126, 0.2126, 0.2126], 1e-12, 'saturation -1 = Rec.709 luma grey');
    nearV(applyBasicFilters([0.25, 0.64, 1], { ...IDENTITY_FILTERS, gamma: 2 }), [0.5, 0.8, 1], 1e-12);
    // exposure then brightness (order matters)
    nearV(applyBasicFilters([0.2, 0.2, 0.2], { ...IDENTITY_FILTERS, exposure: 1, brightness: 0.1 }), [0.5, 0.5, 0.5], 1e-12);
  });

  check('pass plan: one apply+mix slot, or apply-only + mix-only when a Blur or Glow runs; modes are distinct', () => {
    assert.deepEqual(planAdjustmentPasses({ blur: false, glow: false }), { split: false, blur: false, glow: false, slots: 1 });
    assert.deepEqual(planAdjustmentPasses({ blur: true, glow: false }), { split: true, blur: true, glow: false, slots: 2 });
    assert.deepEqual(planAdjustmentPasses({ blur: false, glow: true }), { split: true, blur: false, glow: true, slots: 2 });
    assert.deepEqual([ADJUST_MODE.applyMix, ADJUST_MODE.applyOnly, ADJUST_MODE.mixOnly], [1, 2, 3], 'nonzero: 0 = an ordinary image draw');
  });

  // ── blurFxPack ──
  check('packBlurFx: matches the WGSL BlurFxU layout (params vec4 at float 4, center at 8, extra at 10)', () => {
    const f = new Float32Array(2 * BLURFX_UNIFORM_FLOATS).fill(9);
    packBlurFx(f, BLURFX_UNIFORM_FLOATS, { type: 'directional', radius: 12, angle: 90, centerX: 0.3, centerY: 0.7, strength: 40, passes: 3 }, 1920, 1080, 2);
    assert.deepEqual(Array.from(f.slice(0, 12)), Array(12).fill(9), 'writes only its own 12 floats');
    const u = Array.from(f.slice(12));
    assert.deepEqual([u[0], u[1], u[2], u[3]], [1920, 1080, 0, 0], 'resolution + padding');
    near(u[4], 12, 1e-6, 'params.x radius'); near(u[5], Math.PI / 2, 1e-6, 'params.y angle (rad)');
    near(u[6], 40, 1e-6, 'params.z strength'); assert.equal(u[7], BLURFX_MODE.directional, 'params.w mode');
    near(u[8], 0.3, 1e-6); near(u[9], 0.7, 1e-6); assert.equal(u[10], 2, 'extra.x pass index'); assert.equal(u[11], 3);
    assert.deepEqual(BLURFX_MODE, { gaussian: 0, directional: 1, radial: 2, kawase: 3 });
  });

  check('packBlurFx(null): the passthrough uniform (radius = strength = 0, so the gaussian V entry copies)', () => {
    const f = new Float32Array(BLURFX_UNIFORM_FLOATS).fill(5);
    packBlurFx(f, 0, null, 640, 360);
    assert.deepEqual(Array.from(f), [640, 360, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  const G = { type: 'gaussian', passes: 1 }, D = { type: 'directional', passes: 1 }, KW = (n) => ({ type: 'kawase', passes: n });
  check('blur slot plan: gaussian-only needs no passthrough; each kawase pass gets its own slot (1..8 passes)', () => {
    assert.deepEqual(planBlurFxSlots([G, G], 512), { main: [0, 1], passthrough: -1, kawase: [[], []], total: 2 });
    const p = planBlurFxSlots([G, D, KW(3), KW(20)], 512);
    assert.deepEqual(p.main, [0, 1, 2, 3]);
    assert.equal(p.passthrough, 4);
    assert.deepEqual(p.kawase[2], [5, 6, 7]);
    assert.deepEqual(p.kawase[3], [8, 9, 10, 11, 12, 13, 14, 15], 'clamped to 8 passes');
    assert.equal(p.total, 16);
    const all = [...p.main, p.passthrough, ...p.kawase.flat()];
    assert.equal(new Set(all).size, all.length, 'no slot is shared (a shared slot would only hold its last write)');
    assert.equal(kawasePassCount(0), 1); assert.equal(kawasePassCount(NaN), 1); assert.equal(kawasePassCount(4.4), 4);
  });

  check('blur slot plan: over capacity the extra blurs are dropped (main -1), kawase keeps the passes that fit', () => {
    const p = planBlurFxSlots([G, G, G], 2);
    assert.deepEqual(p.main, [0, 1, -1]);
    assert.ok(p.total <= 2);
    const q = planBlurFxSlots([D, KW(4)], 5); // main 0, 1; passthrough 2; kawase gets slots 3, 4
    assert.deepEqual(q.kawase[1], [3, 4]);
    assert.equal(q.total, 5);
    const r = planBlurFxSlots([D, KW(4)], 3); // no room for any kawase pass
    assert.equal(r.main[1], -1);
    assert.deepEqual(r.kawase[1], []);
  });

  // ── resolve + persistence ──
  const W = 320, H = 180;
  const compWith = (adj) => {
    const comp = R.createComposition('adj', { width: W, height: H, frameRate: 30, durationFrames: 30 });
    comp.layers = [R.createRectangleLayer('r', W / 2, H / 2, 100, 60, [1, 0, 0, 1], 30), adj];
    return comp;
  };
  const resolvedAdj = (comp) => R.resolveFrame(comp, 0).layers.find((l) => l.layerType === 'adjustment');

  check('resolveFrame: basic filters resolve with identity defaults; filters / Blur / Glow alone make it do work', () => {
    const plain = R.createAdjustmentLayer('a', 30);
    const r0 = resolvedAdj(compWith(plain));
    assert.deepEqual(r0.adjustment.filters, IDENTITY_FILTERS);
    assert.equal(r0.adjustment.noOp, true, 'empty adjustment is a no-op');
    const filtered = Object.assign(R.createAdjustmentLayer('a', 30), { filters: { saturation: -1 } });
    const r1 = resolvedAdj(compWith(filtered));
    assert.deepEqual(r1.adjustment.filters, { ...IDENTITY_FILTERS, saturation: -1 });
    assert.equal(r1.adjustment.noOp, false);
    assert.deepEqual(r1.adjustment.coveredLayerIds.length, 1);
    const blurred = Object.assign(R.createAdjustmentLayer('a', 30), { blur: { ...R.DEFAULT_BLUR } });
    assert.equal(resolvedAdj(compWith(blurred)).adjustment.noOp, false, 'Blur-only adjustment');
    const glowing = Object.assign(R.createAdjustmentLayer('a', 30), { glow: { ...R.DEFAULT_GLOW } });
    assert.equal(resolvedAdj(compWith(glowing)).adjustment.noOp, false, 'Glow-only adjustment');
    const stacked = Object.assign(R.createAdjustmentLayer('a', 30), { effects: [{ type: R.EFFECT_TYPE.invert, enabled: true, params: [1] }] });
    const rs = resolvedAdj(compWith(stacked));
    assert.equal(rs.adjustment.noOp, false);
    assert.deepEqual(rs.adjustment.effects, [{ type: R.EFFECT_TYPE.invert, params: [1] }]);
  });

  check('resolveFrame: an adjustment with nothing below stays a no-op even with filters; master switch only gates the stack', () => {
    const comp = R.createComposition('adj', { width: W, height: H, frameRate: 30, durationFrames: 30 });
    const adj = Object.assign(R.createAdjustmentLayer('a', 30), { filters: { brightness: 0.3 } });
    comp.layers = [adj, R.createRectangleLayer('r', W / 2, H / 2, 100, 60, [1, 0, 0, 1], 30)];
    assert.equal(resolvedAdj(comp).adjustment.noOp, true, 'nothing below');
    const off = Object.assign(R.createAdjustmentLayer('a', 30), { effectsEnabled: false, effects: [{ type: R.EFFECT_TYPE.invert, enabled: true, params: [1] }] });
    assert.equal(resolvedAdj(compWith(off)).adjustment.noOp, true, 'stack switched off, identity filters');
    const offF = Object.assign(R.createAdjustmentLayer('a', 30), { effectsEnabled: false, filters: { contrast: 0.5 } });
    assert.equal(resolvedAdj(compWith(offF)).adjustment.noOp, false, 'filters are not part of the stack switch (like an image layer)');
  });

  check('persistence: an adjustment\'s filters survive validateComposition, sanitized to five finite numbers', () => {
    const adj = Object.assign(R.createAdjustmentLayer('a', 30), { filters: { brightness: 0.3, gamma: NaN } });
    const back = R.validateComposition(JSON.parse(JSON.stringify(compWith(adj))));
    const ba = back.layers.find((l) => l.type === 'adjustment');
    assert.deepEqual(ba.filters, { ...IDENTITY_FILTERS, brightness: 0.3 });
    const bare = R.validateComposition(JSON.parse(JSON.stringify(compWith(R.createAdjustmentLayer('b', 30)))));
    assert.equal(bare.layers.find((l) => l.type === 'adjustment').filters, undefined, 'no filters stays absent');
  });

  console.log(`\nverify:adjustment-composite - ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
