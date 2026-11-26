// Acceptance harness for wave-1A agent animation features:
//   B46  per-keyframe eases in one call (core/keyframeSpecs.ts: buildKeyframesFromSpecs)
//   B33  colour keyframes (core/animProps.ts: evalAnimColor, linear-light mix, hold swaps)
//   B47  keyframable glow / shadow params      } resolved by core/interpolation.ts resolveFrame
//   B50  keyframable layer blur + effect params }   through layer.animProps
// Proves: the eases evaluate to the exact named / cubic-bezier curves, colour mixing is linear-light
// with exact holds, legacy layers (no animProps, or empty tracks) resolve byte-identically, every
// evaluation is frame-pure (scrub order does not matter), persistence sanitizes, and the friendly
// paths advertised in the agent manifest all map onto real override tracks.
//   node scripts/verify-anim-props.mjs   (or: npm run verify:anim-props)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'anim-props-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const SETTINGS = { width: 640, height: 360, frameRate: 30, durationFrames: 120, backgroundColor: [0, 0, 0, 1] };

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createAdjustmentLayer, uid } from './src/core/factory';
        export { DEFAULT_GLOW, DEFAULT_BLUR, DEFAULT_SHADOW } from './src/core/effectDefaults';
        export * from './src/core/animProps';
        export { buildKeyframesFromSpecs, CSS_EASES, EASING_NAMES, canonicalEase, easeSpecError, EASY_EASE } from './src/core/keyframeSpecs';
        export { defaultGlowFor } from './src/core/effectDefaults';
        export { createTextLayer } from './src/core/factory';
        export { pathFractionAtAngle } from './src/core/shapeModifiers';
        export { shapeToPathVertices } from './src/core/pathOps';
        export { applyEasing, cubicBezier } from './src/core/easings';
        export { smoothSelected, wiggleSelected } from './src/core/keyframeAssistants';
        export { ANIM_COLOR_PATHS, ANIM_FX_PATHS } from './src/agent/featureManifest';
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
  const m = await import(pathToFileURL(outfile).href);
  const {
    resolveFrame, createComposition, createRectangleLayer, createAdjustmentLayer,
    DEFAULT_GLOW, DEFAULT_BLUR, DEFAULT_SHADOW,
    canonicalKeyframePath, animPropTarget, createAnimProp, staticValueFor, evalAnimNumber, evalAnimColor, mixColorLinear,
    srgbToLinear, linearToSrgb, sanitizeAnimProps, hasAnimProps, ANIM_PROP_DEFS,
    buildKeyframesFromSpecs, CSS_EASES, EASING_NAMES, applyEasing, cubicBezier, smoothSelected, wiggleSelected,
    ANIM_COLOR_PATHS, ANIM_FX_PATHS,
    canonicalEase, easeSpecError, EASY_EASE, defaultGlowFor, createTextLayer, pathFractionAtAngle, shapeToPathVertices,
  } = m;

  const numProp = (keyframes) => ({ id: 'p', name: 'p', valueType: 'number', defaultValue: 0, keyframes });
  const colProp = (keyframes) => ({ id: 'c', name: 'c', valueType: 'color', defaultValue: [1, 1, 1, 1], keyframes });

  // ---------------------------------------------------------------- B46: per-segment eases
  console.log('B46 per-keyframe eases');
  const specs = [
    { frame: 0, value: 0, ease: 'cubicOut' },
    { frame: 30, value: 100, ease: [0.2, 0.8, 0.3, 1.15] },
    { frame: 60, value: 40, ease: 'hold' },
    { frame: 90, value: 70 },
  ];
  const kfs = buildKeyframesFromSpecs(specs);

  check('three different eases on three segments, in one call', () => {
    assert.equal(kfs.length, 4);
    assert.equal(kfs[0].easing, 'cubicOut');
    assert.equal(kfs[1].interpolation, 'bezier');
    assert.deepEqual(kfs[1].handleOut, [0.2, 0.8]);
    assert.deepEqual(kfs[2].handleIn, [0.3, 1.15]);
    assert.equal(kfs[2].interpolation, 'hold');
    assert.equal(kfs[3].interpolation, 'linear');
  });

  check('each segment evaluates to its exact curve (named / cubic-bezier with overshoot / hold)', () => {
    const p = numProp(kfs);
    for (let f = 0; f <= 30; f++) assert.ok(near(evalAnimNumber(p, 0, f), 100 * applyEasing('cubicOut', f / 30), 1e-9), `seg1 f${f}`);
    let overshoot = false;
    for (let f = 30; f <= 60; f++) {
      const want = 100 + (40 - 100) * cubicBezier((f - 30) / 30, 0.2, 0.8, 0.3, 1.15);
      const got = evalAnimNumber(p, 0, f);
      assert.ok(near(got, want, 1e-9), `seg2 f${f}: ${got} vs ${want}`);
      if (got < 40 - 1e-6) overshoot = true;
    }
    assert.ok(overshoot, 'y2 > 1 overshoots the target (a pop)');
    for (let f = 60; f < 90; f++) assert.equal(evalAnimNumber(p, 0, f), 40, `hold f${f}`);
    assert.equal(evalAnimNumber(p, 0, 90), 70);
  });

  check('CSS ease-out (0, 0, 0.58, 1) is not mistaken for an unset handle', () => {
    const k = buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: 'ease-out' }, { frame: 20, value: 1 }]);
    assert.deepEqual(CSS_EASES['ease-out'], [0, 0, 0.58, 1]);
    for (let f = 1; f < 20; f++) {
      const exact = cubicBezier(f / 20, 0, 0, 0.58, 1);
      assert.ok(near(evalAnimNumber(numProp(k), 0, f), exact, 1e-5), `f${f}`);
    }
  });

  check('every named ease is accepted; unknown eases / bad shapes / out-of-range x throw', () => {
    for (const name of EASING_NAMES) buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: name }, { frame: 5, value: 1 }]);
    assert.throws(() => buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: 'wobbly' }]), /unknown ease/);
    assert.throws(() => buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: [1.2, 0, 0.5, 1] }]), /x1 and x2/);
    assert.throws(() => buildKeyframesFromSpecs([{ frame: 0, value: [1, 2] }], { expected: 'number' }), /takes a number/);
    assert.throws(() => buildKeyframesFromSpecs([{ frame: 0, value: [1, 2, 3] }]), /value must be/);
    assert.throws(() => buildKeyframesFromSpecs([]), /non-empty/);
  });

  check('merge keeps other keys; replace drops them; duplicate frames: last spec wins; sorted', () => {
    const existing = buildKeyframesFromSpecs([{ frame: 0, value: 1 }, { frame: 50, value: 2 }]);
    const merged = buildKeyframesFromSpecs([{ frame: 25, value: 9 }, { frame: 25, value: 7 }], { existing, merge: true });
    assert.deepEqual(merged.map((k) => [k.frame, k.value]), [[0, 1], [25, 7], [50, 2]]);
    const replaced = buildKeyframesFromSpecs([{ frame: 25, value: 9 }], { existing });
    assert.deepEqual(replaced.map((k) => k.frame), [25]);
  });

  // ---------------------------------------------------------------- B33: colour keyframes
  console.log('B33 colour keyframes');
  check('sRGB transfer round-trips and mixes in LINEAR light (black/white midpoint = 0.7354)', () => {
    for (let i = 0; i <= 20; i++) assert.ok(near(linearToSrgb(srgbToLinear(i / 20)), i / 20, 1e-12));
    const mid = mixColorLinear([0, 0, 0, 0], [1, 1, 1, 1], 0.5);
    assert.ok(near(mid[0], linearToSrgb(0.5), 1e-12) && near(mid[0], 0.735356983, 1e-6));
    assert.ok(near(mid[3], 0.5, 1e-12), 'alpha mixes linearly');
    const over = mixColorLinear([0.2, 0.2, 0.2, 1], [1, 1, 1, 1], 1.3);
    assert.ok(over.every((c) => c >= 0 && c <= 1), 'overshooting eases stay in gamut');
  });

  const colKfs = buildKeyframesFromSpecs([
    { frame: 10, value: [0, 0, 0, 1], ease: 'linear' },
    { frame: 20, value: [1, 0, 0, 1], ease: 'hold' },
    { frame: 30, value: [0, 0.5, 1, 1] },
  ], { expected: 'color' });
  const STATIC = [0.5, 0.5, 0.5, 1];

  check('colour track: static before the first key, eased between keys, exact hold swap', () => {
    const p = colProp(colKfs);
    assert.deepEqual(evalAnimColor(p, STATIC, 5), [0, 0, 0, 1], 'before the first key = first key (2+ keys)');
    assert.deepEqual(evalAnimColor(colProp(colKfs.slice(0, 1)), STATIC, 5), STATIC, 'single key: static before it');
    const c15 = evalAnimColor(p, STATIC, 15);
    assert.ok(near(c15[0], linearToSrgb(0.5), 1e-9) && c15[1] === 0 && c15[2] === 0, 'linear-light mix');
    for (let f = 20; f < 30; f++) assert.deepEqual(evalAnimColor(p, STATIC, f), [1, 0, 0, 1], `hold f${f}`);
    assert.deepEqual(evalAnimColor(p, STATIC, 30), [0, 0.5, 1, 1]);
    assert.equal(evalAnimColor(undefined, STATIC, 15), STATIC, 'no track: the static object itself');
    assert.equal(evalAnimColor(colProp([]), STATIC, 15), STATIC, 'empty track: static');
  });

  check('keyframe assistants keep all 4 colour channels (no truncation to vec2)', () => {
    const k = buildKeyframesFromSpecs([{ frame: 0, value: [0, 0, 0, 1] }, { frame: 1, value: [1, 1, 1, 0] }, { frame: 2, value: [0, 0, 0, 1] }]);
    const sm = smoothSelected(k, new Set([0, 1, 2]));
    assert.deepEqual(sm[1].value, [0.5, 0.5, 0.5, 0.5]);
    const wg = wiggleSelected(k, new Set([0, 1, 2]), 0.1, 7);
    assert.equal(wg[1].value.length, 4);
  });

  // ---------------------------------------------------------------- resolveFrame integration
  console.log('resolveFrame integration (B33 shape colours, B47 glow / shadow, B50 blur + effect stack)');
  const mkComp = (layers) => { const c = createComposition('t', SETTINGS); c.layers = layers; return c; };
  const rect = () => {
    const r = createRectangleLayer('Box', 320, 180, 200, 100, [0.2, 0.4, 0.6, 1], 120);
    r.id = 'box';
    r.glow = { ...DEFAULT_GLOW, enabled: true, intensity: 0.5, radius: 10 };
    r.blur = { ...DEFAULT_BLUR, enabled: true, radius: 4 };
    r.shadow = { ...DEFAULT_SHADOW, enabled: true };
    return r;
  };
  const adj = () => {
    const a = createAdjustmentLayer('Adj', 120);
    a.id = 'adj';
    a.effects = [{ type: 170, enabled: true, params: [8, 0.5] }];
    return a;
  };
  const strip = (frame) => JSON.parse(JSON.stringify(frame));

  check('legacy byte-identity: no animProps == empty animProps tracks (every frame)', () => {
    const plain = mkComp([rect(), adj()]);
    const withEmpty = mkComp([rect(), adj()]);
    for (const l of withEmpty.layers) {
      l.animProps = { fillColor: colProp([]), glowIntensity: numProp([]), blurRadius: numProp([]), effectParams: { '170_0': numProp([]) } };
    }
    for (const f of [0, 7, 33, 60, 119]) assert.deepEqual(strip(resolveFrame(withEmpty, f).layers), strip(resolveFrame(plain, f).layers), `f${f}`);
  });

  const animated = () => {
    const r = rect();
    r.animProps = {
      fillColor: colProp(buildKeyframesFromSpecs([{ frame: 0, value: [0, 0, 0, 1], ease: 'cubicOut' }, { frame: 30, value: [1, 1, 1, 1], ease: 'hold' }, { frame: 60, value: [1, 0, 0, 1] }])),
      glowIntensity: numProp(buildKeyframesFromSpecs([{ frame: 0, value: 0 }, { frame: 40, value: 2 }])),
      glowColor: colProp(buildKeyframesFromSpecs([{ frame: 0, value: [1, 1, 0, 1] }, { frame: 1, value: [1, 1, 0, 1] }])),
      shadowDistance: numProp(buildKeyframesFromSpecs([{ frame: 0, value: 0 }, { frame: 20, value: 30 }])),
      blurRadius: numProp(buildKeyframesFromSpecs([{ frame: 0, value: 40, ease: 'expoOut' }, { frame: 20, value: 0 }])),
    };
    const a = adj();
    a.animProps = { effectParams: { '170_0': numProp(buildKeyframesFromSpecs([{ frame: 0, value: 64 }, { frame: 30, value: 2 }])) } };
    return mkComp([r, a]);
  };
  const byId = (frame, id) => frame.layers.find((l) => l.id === id);

  check('keyed fill colour, glow intensity + colour, shadow distance resolve per frame', () => {
    const comp = animated();
    const f15 = byId(resolveFrame(comp, 15), 'box');
    const p = applyEasing('cubicOut', 0.5);
    assert.ok(near(f15.shape.fillColor[0], linearToSrgb(p), 1e-9), 'fill R at f15');
    assert.deepEqual(byId(resolveFrame(comp, 45), 'box').shape.fillColor, [1, 1, 1, 1], 'hold');
    assert.deepEqual(byId(resolveFrame(comp, 60), 'box').shape.fillColor, [1, 0, 0, 1]);
    assert.ok(near(f15.glow.intensity, 2 * 15 / 40, 1e-12));
    assert.deepEqual(f15.glow.color, [1, 1, 0, 1]);
    assert.ok(near(f15.shadow.lightDistance, 30 * 15 / 20, 1e-12));
  });

  check('layer blur radius ramps (expoOut) and drops the blur pass at radius 0', () => {
    const comp = animated();
    const f5 = byId(resolveFrame(comp, 5), 'box');
    assert.ok(near(f5.blur.radius, 40 + (0 - 40) * applyEasing('expoOut', 5 / 20), 1e-9));
    assert.equal(byId(resolveFrame(comp, 20), 'box').blur, undefined, 'a keyed gaussian at radius 0 -> no blur pass');
  });

  check('effect-stack param (adjustment layer, type 170 param 0) keyframes; other params static', () => {
    const comp = animated();
    const e = (f) => byId(resolveFrame(comp, f), 'adj').adjustment.effects[0];
    assert.ok(near(e(15).params[0], 64 + (2 - 64) * 0.5, 1e-12));
    assert.equal(e(15).params[1], 0.5);
    assert.equal(e(30).params[0], 2);
  });

  check('frame purity: scrubbing in any order gives identical frames', () => {
    const comp = animated();
    const order = [59, 3, 44, 15, 0, 30, 21, 59, 15];
    const first = new Map();
    for (const f of [...Array(60).keys()]) first.set(f, JSON.stringify(resolveFrame(comp, f)));
    for (const f of order) assert.equal(JSON.stringify(resolveFrame(comp, f)), first.get(f), `f${f}`);
  });

  // ---------------------------------------------------------------- paths + persistence
  console.log('paths and persistence');
  check('every friendly path in the agent manifest maps to a real override track', () => {
    for (const path of [...ANIM_COLOR_PATHS, ...ANIM_FX_PATHS]) {
      const canon = canonicalKeyframePath(path);
      const t = animPropTarget(canon);
      assert.ok(t, `${path} -> ${canon}`);
      assert.equal(t.kind, ANIM_COLOR_PATHS.includes(path) ? 'color' : 'number', path);
    }
    assert.equal(canonicalKeyframePath('effect.170.0'), 'animProps.effectParams.170_0');
    assert.equal(canonicalKeyframePath('effects.12.params.3'), 'animProps.effectParams.12_3');
    assert.equal(canonicalKeyframePath('transform.position'), 'transform.position');
    assert.equal(canonicalKeyframePath(canonicalKeyframePath('glow.radius')), 'animProps.glowRadius', 'idempotent');
    assert.equal(ANIM_PROP_DEFS.length, ANIM_COLOR_PATHS.length + ANIM_FX_PATHS.length, 'manifest lists every override');
  });

  check('a new track is seeded from the static field (colour, glow number, effect param)', () => {
    const r = rect();
    const fill = createAnimProp(animPropTarget('animProps.fillColor'), staticValueFor(r, animPropTarget('animProps.fillColor')));
    assert.deepEqual(fill.defaultValue, [0.2, 0.4, 0.6, 1]);
    assert.equal(fill.valueType, 'color');
    const gi = animPropTarget('animProps.glowIntensity');
    assert.equal(createAnimProp(gi, staticValueFor(r, gi)).defaultValue, 0.5);
    const fx = animPropTarget('animProps.effectParams.170_1');
    assert.equal(staticValueFor(adj(), fx), 0.5);
  });

  check('persistence: sanitizeAnimProps keeps valid tracks, drops junk, survives JSON', () => {
    const comp = animated();
    const raw = JSON.parse(JSON.stringify(comp.layers[0].animProps));
    raw.bogus = { keyframes: [] };
    raw.fillColor.keyframes.push({ frame: 5, value: [1, 2] }); // wrong shape: dropped
    raw.glowRadius = 'nope';
    const clean = sanitizeAnimProps(raw);
    assert.equal(clean.bogus, undefined);
    assert.equal(clean.glowRadius, undefined);
    assert.equal(clean.fillColor.keyframes.length, 3);
    assert.deepEqual(clean.fillColor.keyframes, comp.layers[0].animProps.fillColor.keyframes);
    assert.ok(hasAnimProps(clean));
    assert.equal(sanitizeAnimProps(undefined), undefined);
    assert.equal(sanitizeAnimProps({ effectParams: { 'x_y': { keyframes: [] } } }), undefined);
    const fx = sanitizeAnimProps(JSON.parse(JSON.stringify(comp.layers[1].animProps)));
    assert.equal(fx.effectParams['170_0'].keyframes.length, 2);
  });

  // ---------------------------------------------------------------- B67: replica-friction ergonomics
  console.log('B67 agent authoring ergonomics');
  check('breakdown ease names resolve to the same curves as the canonical names', () => {
    const pairs = [
      ['easeOutCubic', 'cubicOut'], ['easeInOutCubic', 'cubicInOut'], ['easeInQuad', 'quadIn'], ['easeOutBack', 'backOut'],
      ['ease-out-expo', 'expoOut'], ['EaseInOutSine', 'sineInOut'], ['easeOutElastic', 'elasticOut'], ['cubic_out', 'cubicOut'],
      ['easeIn', 'ease-in'], ['easeOut', 'ease-out'], ['easeInOut', 'ease-in-out'], ['Ease In Out', 'ease-in-out'],
    ];
    for (const [alias, canon] of pairs) {
      assert.equal(easeSpecError(alias), null, alias);
      assert.equal(canonicalEase(alias), canon, alias);
      const a = buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: alias }, { frame: 30, value: 100 }]);
      const b = buildKeyframesFromSpecs([{ frame: 0, value: 0, ease: canon }, { frame: 30, value: 100 }]);
      assert.deepEqual(a, b, alias);
    }
    assert.deepEqual(canonicalEase('easyEase'), EASY_EASE);
    assert.notEqual(easeSpecError('easeSideways'), null);
    assert.equal(canonicalEase('cubicOut'), 'cubicOut');
    assert.deepEqual(canonicalEase([0.1, 0.2, 0.3, 1]), [0.1, 0.2, 0.3, 1]);
  });

  check('first-enable glow on text / shape glows in the layer colour from every pixel', () => {
    const t = createTextLayer('T', 100, 100, 'go', 60, [0, 0.784, 0.325, 1]); // #00c853
    const g = defaultGlowFor(t);
    assert.deepEqual(g.color, [0, 0.784, 0.325, 1]);
    assert.equal(g.threshold, 0);
    assert.equal(g.enabled, true);
    const r = createRectangleLayer('R', 0, 0, 100, 100, [1, 0, 0.5, 1]);
    assert.deepEqual(defaultGlowFor(r).color, [1, 0, 0.5, 1]);
    assert.deepEqual(defaultGlowFor(undefined), DEFAULT_GLOW);
    // the extract pass is smoothstep(threshold, threshold + 0.1, luminance): #00c853 is fully in at 0, fully out at 0.6
    const lum = 0.7152 * 0.784 + 0.0722 * 0.325;
    const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
    assert.equal(ss(0, 0.1, lum), 1);
    assert.equal(ss(0.6, 0.7, lum), 0);
  });

  check('trim start angle: clock angles map to the right arc-length fraction of a circle path', () => {
    const P = (v) => ({ id: 'r', name: 'r', valueType: 'number', defaultValue: v, keyframes: [] });
    const verts = shapeToPathVertices({ type: 'circle', radius: P(100), fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: P(0) }, 0);
    assert.ok(verts.length >= 4);
    const wrap = (x) => ((x % 1) + 1) % 1;
    const f0 = pathFractionAtAngle(verts, true, 0);
    const d90 = wrap(pathFractionAtAngle(verts, true, 90) - f0);
    const d180 = wrap(pathFractionAtAngle(verts, true, 180) - f0);
    assert.ok(Math.abs(Math.min(d90, 1 - d90) - 0.25) < 0.01, `quarter ${d90}`);
    assert.ok(Math.abs(d180 - 0.5) < 0.01, `half ${d180}`);
    assert.equal(pathFractionAtAngle(verts, true, 360), f0);
  });

  console.log(`\nverify:anim-props - ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
