// Acceptance harness for B57: effect stacks on precomp layers (how text / shape layers get effects) and the
// positionable bulge warp. Pure node (esbuild bundle of the real TS):
//  - parseAgentEffects / layerEffectsRoute (core/effects/layerEffects.ts), the agent helper's input side;
//  - bulgeWarpUV, the CPU twin of the WGSL bulge case (old 1-param stacks map exactly as before);
//  - resolveFrame: a precomp's stack resolves into precomp.effects (B50 keyed params evaluated per frame),
//    absent / disabled stacks add no field (old projects resolve byte-identically);
//  - validation keeps the precomp stack through save / load.
// The real-GPU proof is gpu:layer-effects (render_frame through the MCP).
//   node scripts/verify-layer-effects.mjs   (or: npm run verify:layer-effects)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };

const tmp = mkdtempSync(join(tmpdir(), 'layer-effects-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/effects/layerEffects';
        export { EFFECT_TYPE } from './src/core/effects/effectRegistry';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createPrecompLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { parseAgentEffects, layerEffectsRoute, bulgeWarpUV, bulgeParamsForComp, EFFECT_TYPE, resolveFrame, createComposition, createRectangleLayer, createPrecompLayer, validateComposition } = m;

  console.log('verify:layer-effects');

  check('parseAgentEffects: registry ids -> type ids, defaults filled, extra params kept up to 7 slots', () => {
    const s = parseAgentEffects([{ effect: 'digitalGlitch', params: [0.6] }, { effect: 'bulge', params: [0.4, 0.3, 0.6, 0.2] }, { type: EFFECT_TYPE.rgbSplit }]);
    assert.deepEqual(s.map((e) => e.type), [EFFECT_TYPE.digitalGlitch, EFFECT_TYPE.bulge, EFFECT_TYPE.rgbSplit]);
    assert.deepEqual(s[0].params, [0.6]);
    assert.deepEqual(s[1].params, [0.4, 0.3, 0.6, 0.2]);
    assert.deepEqual(s[2].params, [0]);
    assert.ok(s.every((e) => e.enabled === true));
    assert.equal(parseAgentEffects([{ effect: 'wave', params: [1, 2, 3, 4, 5, 6, 7, 8, 9] }])[0].params.length, 7);
  });
  check('parseAgentEffects: unknown ids, non-numeric params and empty lists are refused', () => {
    assert.throws(() => parseAgentEffects([{ effect: 'nope' }]), /unknown effect/);
    assert.throws(() => parseAgentEffects([{ effect: 'bulge', params: ['x'] }]), /must be numbers/);
    assert.throws(() => parseAgentEffects([]), /non-empty/);
  });
  check('layerEffectsRoute: image / adjustment / precomp direct; text / shape / video / lottie wrapped; group / audio refused', () => {
    assert.deepEqual(['image', 'adjustment', 'precomp'].map(layerEffectsRoute), ['direct', 'direct', 'direct']);
    assert.deepEqual(['text', 'shape', 'video', 'lottieIcon'].map(layerEffectsRoute), ['wrap', 'wrap', 'wrap', 'wrap']);
    assert.deepEqual(['group', 'audio', 'camera'].map(layerEffectsRoute), [null, null, null]);
  });

  // The original WGSL bulge (before B57), transcribed: centred at 0.5, radius 0.5.
  const oldBulge = (uv, aspect, p0) => {
    const ca = [(uv[0] - 0.5) * aspect, uv[1] - 0.5];
    const r = Math.hypot(ca[0], ca[1]);
    if (!(r < 0.5 && r > 1e-5)) return uv;
    const k = (Math.pow(r / 0.5, 1 - p0) * 0.5) / r;
    return [(ca[0] * k) / aspect + 0.5, ca[1] * k + 0.5];
  };
  check('bulge twin: a 1-param (old) bulge maps every UV exactly like the original centred bulge', () => {
    let maxErr = 0;
    for (let y = 0; y <= 20; y++) for (let x = 0; x <= 20; x++) {
      const uv = [x / 20, y / 20];
      for (const p0 of [-0.6, 0.3, 0.8]) {
        const a = bulgeWarpUV(uv, 16 / 9, [p0]); const b = oldBulge(uv, 16 / 9, p0);
        maxErr = Math.max(maxErr, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      }
    }
    assert.ok(maxErr < 1e-12, `max error ${maxErr}`);
  });
  check('bulge twin: a positioned bulge warps only inside its radius around its own centre', () => {
    const p = bulgeParamsForComp(0.7, [1400, 300], 150, 1920, 1080);
    const at = (x, y) => bulgeWarpUV([x / 1920, y / 1080], 1920 / 1080, p);
    assert.deepEqual(at(1400, 300).map((v) => +v.toFixed(9)), [1400 / 1920, 300 / 1080].map((v) => +v.toFixed(9)), 'the centre maps to itself');
    assert.deepEqual(at(960, 540), [960 / 1920, 540 / 1080], 'outside the radius: untouched');
    assert.deepEqual(at(1400, 300 + 151), [1400 / 1920, 451 / 1080], 'just outside the radius: untouched');
    const inside = at(1400 + 60, 300);
    // Same sign convention as the original shader: amount > 0 samples radially outward (pow(r, 1 - amount) > r).
    assert.ok(inside[0] > 1460 / 1920 && inside[0] < 1550 / 1920, `inside: the sample moves radially outward (${inside[0] * 1920})`);
    assert.ok(Math.abs(inside[1] - 300 / 1080) < 1e-12, 'inside: on the horizontal through the centre the sample stays on it');
    assert.deepEqual(bulgeWarpUV([0.3, 0.4], 1.5, [0, 0.5, 0.5, 0.3]).map((v) => +v.toFixed(12)), [0.3, 0.4], 'amount 0 = identity');
  });

  const sub = createComposition('sub', { ...SETTINGS });
  sub.layers = [createRectangleLayer('word', 900, 500, 400, 120, [1, 1, 1, 1], 100)];
  const parent = createComposition('parent', { ...SETTINGS });
  const ctx = () => ({ getComposition: (id) => (id === sub.id ? sub : id === parent.id ? parent : undefined) });
  const pre = createPrecompLayer('pre', sub.id, 100);
  parent.layers = [pre];

  check('resolveFrame: a precomp without a stack resolves with no effects field (old projects unchanged)', () => {
    const p = resolveFrame(parent, 10, ctx()).layers.find((l) => l.layerType === 'precomp');
    assert.ok(p && p.precomp);
    assert.equal('effects' in p.precomp, false);
  });
  check('resolveFrame: the precomp stack resolves in order; effectsEnabled false or a disabled effect drops it', () => {
    pre.effects = parseAgentEffects([{ effect: 'digitalGlitch', params: [0.5] }, { effect: 'bulge', params: [0.4, 0.47, 0.46, 0.2] }]);
    const p = resolveFrame(parent, 10, ctx()).layers.find((l) => l.layerType === 'precomp');
    assert.deepEqual(p.precomp.effects, [{ type: EFFECT_TYPE.digitalGlitch, params: [0.5] }, { type: EFFECT_TYPE.bulge, params: [0.4, 0.47, 0.46, 0.2] }]);
    pre.effectsEnabled = false;
    assert.equal('effects' in resolveFrame(parent, 10, ctx()).layers.find((l) => l.layerType === 'precomp').precomp, false);
    pre.effectsEnabled = true;
    pre.effects[0].enabled = false;
    assert.deepEqual(resolveFrame(parent, 10, ctx()).layers.find((l) => l.layerType === 'precomp').precomp.effects.map((e) => e.type), [EFFECT_TYPE.bulge]);
    pre.effects[0].enabled = true;
  });
  check('resolveFrame: a keyed effect param (B50 animProps "effect.245.0") is evaluated per frame on the precomp', () => {
    const key = (frame, value) => ({ id: `k${frame}`, frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });
    pre.animProps = { effectParams: { [`${EFFECT_TYPE.digitalGlitch}_0`]: { id: 'fx', name: 'glitch', valueType: 'number', defaultValue: 0.5, keyframes: [key(0, 0), key(20, 1)] } } };
    const at = (f) => resolveFrame(parent, f, ctx()).layers.find((l) => l.layerType === 'precomp').precomp.effects[0].params[0];
    assert.equal(at(0), 0);
    assert.ok(Math.abs(at(10) - 0.5) < 1e-9, `f10 ${at(10)}`);
    assert.equal(at(30), 1);
    delete pre.animProps;
  });
  check('validation keeps the precomp effect stack through save / load', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(parent)));
    const p = back.layers.find((l) => l.type === 'precomp');
    assert.deepEqual(p.effects, pre.effects);
  });

  console.log(`\nlayer-effects: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
