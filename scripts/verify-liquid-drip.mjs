// Acceptance harness for B61 liquid drip / melt (core/effects/liquidDrip.ts): the CPU twin of the WGSL
// effect. Proves: length 0 is the identity, drips only run DOWN from bottom edges, a pixel within its
// column's drip length takes the origin colour (head fades over the last 20 %), beyond it nothing, lengths
// vary per column with variance and not without, the floor bends the flow sideways (outward by default,
// one side with flow), the original is composited over the drip (premultiplied and straight), the PCG hash
// is exact u32 maths (checked against BigInt), evaluation is pure, and the registry / WGSL / agent parser agree.
//   node scripts/verify-liquid-drip.mjs   (or: npm run verify:liquid-drip)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
const tmp = mkdtempSync(join(tmpdir(), 'liquid-drip-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({
    stdin: {
      contents: `
        export * from './src/core/effects/liquidDrip';
        export { EFFECT_TYPE, getEffectDef } from './src/core/effects/effectRegistry';
        export { parseAgentEffects } from './src/core/effects/layerEffects';
        export { validateComposition } from './src/project-system/services/validation';
        export { createComposition } from './src/core/factory';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { liquidDripAt, dripWalk, dripParams, dripLengthAt, dripPcg, dripHash, dripNoise, dripOver, LIQUID_DRIP_WGSL, LIQUID_DRIP_DEFAULTS, DRIP_MAX_STEPS, DRIP_HIT_ALPHA, EFFECT_TYPE, getEffectDef, parseAgentEffects, validateComposition, createComposition } = m;

  // A W x H texture of opaque white bars on transparent, sampled bilinearly like the GPU (texel centres at +0.5).
  const W = 400, H = 400;
  const makeTex = (rects) => {
    const px = new Float32Array(W * H * 4);
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const o = (y * W + x) * 4; px[o] = r.c[0]; px[o + 1] = r.c[1]; px[o + 2] = r.c[2]; px[o + 3] = 1;
    }
    const texel = (x, y) => { x = Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); const o = (y * W + x) * 4; return [px[o], px[o + 1], px[o + 2], px[o + 3]]; };
    return (x, y) => {
      const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const a = texel(x0, y0), b = texel(x0 + 1, y0), c = texel(x0, y0 + 1), d = texel(x0 + 1, y0 + 1);
      return [0, 1, 2, 3].map((i) => (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty);
    };
  };
  const bar = makeTex([{ x: 150, y: 60, w: 100, h: 30, c: [1, 0.8, 0.2] }]);
  const P = (over) => { const p = [...LIQUID_DRIP_DEFAULTS]; for (const [k, v] of Object.entries(over)) p[Number(k)] = v; return p; };

  check('length 0 is the identity on every pixel of a row', () => {
    for (let x = 0; x < W; x += 7) assert.deepEqual(liquidDripAt(bar, x + 0.5, 200.5, W, H, P({ 0: 0 }), true), bar(x + 0.5, 200.5));
  });
  check('a pixel below the bar within its drip length takes the bar colour; above the bar nothing', () => {
    const p = P({ 0: 200, 3: 0, 6: 0 }); // no sway, no variance: straight drips of exactly 200 px
    const below = liquidDripAt(bar, 200.5, 90 + 100.5, W, H, p, true);
    assert.ok(below[3] > 0.99 && Math.abs(below[0] - 1) < 1e-6 && Math.abs(below[1] - 0.8) < 1e-6, JSON.stringify(below));
    const above = liquidDripAt(bar, 200.5, 40.5, W, H, p, true);
    assert.deepEqual(above, [0, 0, 0, 0]);
    const side = liquidDripAt(bar, 120.5, 150.5, W, H, p, true);
    assert.deepEqual(side, [0, 0, 0, 0], 'no drip beside the bar');
  });
  check('beyond the drip length: nothing; in the last 20 %: the head fades', () => {
    const p = P({ 0: 200, 3: 0, 6: 0 });
    const L = dripLengthAt(200, dripParams(p));
    assert.equal(L, 200);
    const tip = liquidDripAt(bar, 200.5, 90 + 200 + 8.5, W, H, p, true);
    assert.equal(tip[3], 0, 'past the head');
    const head = liquidDripAt(bar, 200.5, 90 + 180.5, W, H, p, true);
    assert.ok(head[3] > 0.05 && head[3] < 0.95, `fading head alpha ${head[3]}`);
    const body = liquidDripAt(bar, 200.5, 90 + 120.5, W, H, p, true);
    assert.ok(body[3] > 0.999, 'body before 80 % is solid');
  });
  check('drips fall only from the lowest ink: a counter (a hole with ink below it) stays empty, the drip starts under the bottom stroke', () => {
    // An "o": a 100 x 100 frame with a 60 x 40 hole; the hole has the bottom stroke below it.
    const o = makeTex([{ x: 150, y: 60, w: 100, h: 20, c: [1, 1, 1] }, { x: 150, y: 120, w: 100, h: 40, c: [1, 1, 1] }, { x: 150, y: 80, w: 20, h: 40, c: [1, 1, 1] }, { x: 230, y: 80, w: 20, h: 40, c: [1, 1, 1] }]);
    const p = P({ 0: 200, 3: 0, 6: 0 });
    assert.deepEqual(liquidDripAt(o, 200.5, 100.5, W, H, p, true), [0, 0, 0, 0], 'inside the counter');
    assert.ok(liquidDripAt(o, 200.5, 200.5, W, H, p, true)[3] > 0.99, 'below the bottom stroke');
  });
  check('variance: drip lengths differ between columns; variance 0 gives one length', () => {
    const lens = [160, 180, 200, 220, 240].map((x) => dripLengthAt(x, dripParams(P({ 0: 200, 2: 20, 6: 0.8 }))));
    assert.ok(Math.max(...lens) - Math.min(...lens) > 20, lens.join(','));
    assert.ok(lens.every((l) => l >= 200 * 0.2 - 1e-9 && l <= 200 + 1e-9));
    const gappy = Array.from({ length: 200 }, (_, i) => dripLengthAt(i * 2, dripParams(P({ 0: 200, 2: 20, 6: 1 }))));
    assert.ok(gappy.some((l) => l === 0) && gappy.some((l) => l > 150), 'variance 1: some columns do not drip at all (separate drips)');
    const flat = [160, 200, 240].map((x) => dripLengthAt(x, dripParams(P({ 0: 200, 6: 0 }))));
    assert.deepEqual(flat, [200, 200, 200]);
  });
  check('sway: the stream wobbles sideways (the origin column differs from the pixel column)', () => {
    const w = dripWalk(bar, 200.5, 230.5, W, H, dripParams(P({ 0: 300, 3: 18, 6: 0 })));
    assert.ok(w, 'reached the bar');
    assert.ok(Math.abs(w.origin[0] - 200.5) > 1, `origin x ${w.origin[0]}`);
  });
  check('floor: the flow bends sideways along the floor (outward from the centre by default, one side with flow)', () => {
    const p = dripParams(P({ 0: 360, 1: 0.8, 3: 0, 6: 0 })); // floor at y 320
    // Right of the bar on the floor band: reached by the outward (right) flow from the bar's right half.
    const right = dripWalk(bar, 300.5, 322.5, W, H, p);
    assert.ok(right && right.origin[0] > 200, `right floor pixel origin ${right && right.origin}`);
    const left = dripWalk(bar, 100.5, 322.5, W, H, p);
    assert.ok(left && left.origin[0] < 200, `left floor pixel origin ${left && left.origin}`);
    const rightOnly = dripParams(P({ 0: 360, 1: 0.8, 3: 0, 5: 1, 6: 0 }));
    assert.ok(dripWalk(bar, 300.5, 322.5, W, H, rightOnly), 'flow > 0 reaches the right');
    assert.equal(dripWalk(bar, 100.5, 322.5, W, H, rightOnly), null, 'flow > 0 never reaches the left');
    assert.equal(dripWalk(bar, 300.5, 322.5, W, H, dripParams(P({ 0: 360, 1: 0, 3: 0, 6: 0 }))), null, 'no floor: no sideways flow');
  });
  check('compositing: the original sits over the drip (premultiplied and straight alpha)', () => {
    assert.deepEqual(dripOver([0.2, 0.2, 0.2, 1], [1, 0, 0, 1], 1, true), [0.2, 0.2, 0.2, 1]);
    assert.deepEqual(dripOver([0, 0, 0, 0], [0.5, 0.25, 0, 0.5], 0.5, true), [0.25, 0.125, 0, 0.25]);
    const st = dripOver([0, 0, 1, 0.5], [1, 0, 0, 1], 1, false);
    assert.ok(Math.abs(st[3] - 1) < 1e-12 && Math.abs(st[0] - 0.5) < 1e-12 && Math.abs(st[2] - 0.5) < 1e-12, JSON.stringify(st));
    const inside = liquidDripAt(bar, 200.5, 75.5, W, H, P({ 0: 200 }), true);
    assert.deepEqual(inside, bar(200.5, 75.5), 'opaque content is untouched');
  });
  check('streams are opaque in the origin colour even from a hairline (a semi-transparent origin sample)', () => {
    const hair = makeTex([]);
    const thin = (x, y) => (x >= 150 && x <= 250 && y >= 60 && y <= 63 ? [0.25, 0.2, 0.05, 0.5] : hair(x, y)); // premultiplied 50 % colour
    const d = liquidDripAt(thin, 200.5, 150.5, W, H, P({ 0: 200, 3: 0, 6: 0 }), true);
    assert.ok(Math.abs(d[3] - 1) < 1e-9 && Math.abs(d[0] - 0.5) < 1e-9 && Math.abs(d[1] - 0.4) < 1e-9, JSON.stringify(d));
  });
  check('PCG hash: exact u32 maths (BigInt reference), hash and noise in [0, 1), seeds differ', () => {
    const ref = (v) => {
      const M = (1n << 32n) - 1n;
      const s = (BigInt(v >>> 0) * 747796405n + 2891336453n) & M;
      const w = (((s >> ((s >> 28n) + 4n)) ^ s) * 277803737n) & M;
      return Number(((w >> 22n) ^ w) & M);
    };
    for (const v of [0, 1, 2, 7, 12345, 0x9e3779b9, 0xffffffff, -5 >>> 0]) assert.equal(dripPcg(v), ref(v), `pcg(${v})`);
    for (let i = -50; i < 50; i++) { const h = dripHash(i, 3); assert.ok(h >= 0 && h < 1); const n = dripNoise(i * 0.37, 3); assert.ok(n >= 0 && n < 1); }
    assert.notEqual(dripHash(4, 1), dripHash(4, 2));
  });
  check('pure: the same pixel twice is equal; a different seed moves the drips', () => {
    const p = P({ 0: 250, 1: 0.85, 6: 0.7 });
    for (const [x, y] of [[170.5, 200.5], [230.5, 300.5], [330.5, 345.5]]) assert.deepEqual(liquidDripAt(bar, x, y, W, H, p, true), liquidDripAt(bar, x, y, W, H, p, true));
    const a = [], b = [];
    for (let x = 150; x < 250; x += 3) { a.push(dripLengthAt(x, dripParams(P({ 0: 250, 4: 1 })))); b.push(dripLengthAt(x, dripParams(P({ 0: 250, 4: 2 })))); }
    assert.notDeepEqual(a, b);
  });
  check('registry, WGSL and the agent parser agree (type 315, 7 params, constants interpolated)', () => {
    assert.equal(EFFECT_TYPE.liquidDrip, 315);
    const def = getEffectDef('liquidDrip');
    assert.equal(def.klass, 'spatial');
    assert.equal(def.paramCount, 7);
    assert.deepEqual(def.defaults, [...LIQUID_DRIP_DEFAULTS]);
    assert.ok(LIQUID_DRIP_WGSL.includes(`i <= ${DRIP_MAX_STEPS}`) && LIQUID_DRIP_WGSL.includes(`s.a > ${DRIP_HIT_ALPHA}`));
    assert.ok(!LIQUID_DRIP_WGSL.includes('${'), 'no un-interpolated template');
    const [e] = parseAgentEffects([{ effect: 'liquidDrip', params: [300, 0.9] }]);
    assert.deepEqual(e.params, [300, 0.9, 14, 6, 1, 0, 0.9]);
  });

  check('save / load keeps the empty (transparent) background of a precomp; a missing background still gets the default', () => {
    const c = createComposition('pre', { width: 100, height: 100, frameRate: 30, durationFrames: 10, backgroundColor: [0, 0, 0, 1] });
    const back = validateComposition(JSON.parse(JSON.stringify({ ...c, background: { layers: [] } })));
    assert.deepEqual(back.background, { layers: [] }, 'reloaded precomp stays transparent (it used to gain an opaque navy box)');
    const { background: _drop, ...noBg } = c; void _drop;
    const def = validateComposition(JSON.parse(JSON.stringify(noBg)));
    assert.equal(def.background.layers.length, 1);
    assert.equal(def.background.layers[0].enabled, true);
  });

  console.log(`\nverify:liquid-drip - ${passed} checks passed`);
} catch (e) {
  console.error('\n✗ liquid-drip FAILED:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
