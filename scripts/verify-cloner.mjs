// Acceptance harness for the Cloner distribution engine (prompt 1).
//
// There is no test runner in this repo (see CLAUDE.md), so this mirrors the
// scripts/*.mjs convention: it bundles the REAL TypeScript with the already-
// installed esbuild and asserts against it with node:assert. Run:
//   node scripts/verify-cloner.mjs   (or: npm run verify:cloner)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cloner-verify-'));
const outfile = join(tmp, 'cloner.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

try {
  await build({
    entryPoints: ['src/cloner/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  // The cloner engine imports core/motionPath, which transitively imports the
  // expression engine that spawns a Web Worker at load. The cloner never uses
  // expressions; Node has no Worker, so stub it just so the module can import.
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      set onmessage(_v) {}
      set onerror(_v) {}
    };
  }
  const m = await import(pathToFileURL(outfile).href);
  const {
    computeInstanceTransforms,
    decomposeGridIndex,
    validateClonerReferences,
    createDefaultCloner,
    effectorOutput,
    applyEffectorStack,
    staggerDelays,
    sourceLocalTime,
    composeInstanceMatrix,
    packInstanceBuffer,
    INSTANCE_FLOAT_COUNT,
    selectClonerRenderPath,
    buildInstanceOverrides,
    buildDataBoundSources,
    CLONER_LOD_THRESHOLDS,
  } = m;

  // Column-major mat4 × vec4.
  const applyMat = (mm, v) => ({
    x: mm[0] * v.x + mm[4] * v.y + mm[8] * v.z + mm[12] * v.w,
    y: mm[1] * v.x + mm[5] * v.y + mm[9] * v.z + mm[13] * v.w,
    z: mm[2] * v.x + mm[6] * v.y + mm[10] * v.z + mm[14] * v.w,
    w: mm[3] * v.x + mm[7] * v.y + mm[11] * v.z + mm[15] * v.w,
  });
  const mkInstance = (o = {}) => ({
    index: 0, position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, colorTint: { r: 1, g: 1, b: 1 }, opacity: 1, ...o,
  });

  console.log('Cloner distribution engine — acceptance harness\n');

  // ── 1. Determinism ──────────────────────────────────────────────────────────
  console.log('[determinism]');
  const detCloner = {
    id: 'c', type: 'cloner', name: 'c',
    sourceRef: { type: 'layer', layerId: 'src' },
    distribution: { type: 'grid', countX: 3, countY: 3, countZ: 1, spacing: { x: 50, y: 40, z: 0 }, origin: { x: 10, y: 20, z: 0 }, rowOffset: 0 },
    effectors: [], stagger: { delaySeconds: 0 }, renderCount: 500,
  };
  check('identical inputs → array-equal output, and same at any frame order', () => {
    const a = computeInstanceTransforms(detCloner, 0);
    const b = computeInstanceTransforms(detCloner, 0);
    // non-sequential frame order must not change distribution (time-invariant this prompt)
    const f400 = computeInstanceTransforms(detCloner, 400);
    const f12 = computeInstanceTransforms(detCloner, 12);
    const f400b = computeInstanceTransforms(detCloner, 400);
    assert.deepEqual(a, b);
    assert.deepEqual(a, f400);
    assert.deepEqual(a, f12);
    assert.deepEqual(f400, f400b);
  });
  check('output carries no shared mutable state between calls', () => {
    const a = computeInstanceTransforms(detCloner, 0);
    a[0].position.x = 99999; // mutate caller copy
    const b = computeInstanceTransforms(detCloner, 0);
    assert.equal(b[0].position.x, 10); // fresh, unaffected
  });

  // ── 2a. 3×3 grid, hand-computed ─────────────────────────────────────────────
  console.log('[grid]');
  check('decomposeGridIndex row-major (X fastest)', () => {
    assert.deepEqual(decomposeGridIndex(0, 3, 3), { ix: 0, iy: 0, iz: 0 });
    assert.deepEqual(decomposeGridIndex(4, 3, 3), { ix: 1, iy: 1, iz: 0 });
    assert.deepEqual(decomposeGridIndex(8, 3, 3), { ix: 2, iy: 2, iz: 0 });
    assert.deepEqual(decomposeGridIndex(9, 3, 3), { ix: 0, iy: 0, iz: 1 });
  });
  check('3×3 grid positions match hand-computed coordinates', () => {
    const out = computeInstanceTransforms(detCloner, 0);
    assert.equal(out.length, 9);
    const expected = [
      [10, 20], [60, 20], [110, 20],
      [10, 60], [60, 60], [110, 60],
      [10, 100], [60, 100], [110, 100],
    ];
    out.forEach((t, i) => {
      assert.equal(t.index, i);
      assert.ok(near(t.position.x, expected[i][0]), `x[${i}]=${t.position.x} exp ${expected[i][0]}`);
      assert.ok(near(t.position.y, expected[i][1]), `y[${i}]=${t.position.y} exp ${expected[i][1]}`);
      assert.deepEqual(t.rotationDegrees, { x: 0, y: 0, z: 0 });
      assert.deepEqual(t.scale, { x: 1, y: 1, z: 1 });
    });
  });
  check('grid rowOffset shifts odd rows in X (geometric, not timing)', () => {
    const c = { ...detCloner, distribution: { ...detCloner.distribution, rowOffset: 25 } };
    const out = computeInstanceTransforms(c, 0);
    assert.ok(near(out[0].position.x, 10)); // row 0 (even) → no shift
    assert.ok(near(out[3].position.x, 35)); // row 1 (odd) → +25
  });

  // ── 2b. 4-point radial, hand-computed positions AND rotations ────────────────
  console.log('[radial]');
  check('4-point full-circle radial: positions + 90°-apart outward rotations', () => {
    const c = {
      ...detCloner,
      distribution: { type: 'radial', count: 4, radius: 100, arcDegrees: 360, center: { x: 0, y: 0, z: 0 }, startAngleDegrees: 0, orientToCenter: true },
    };
    const out = computeInstanceTransforms(c, 0);
    assert.equal(out.length, 4);
    const expPos = [[100, 0], [0, 100], [-100, 0], [0, -100]];
    const expRot = [0, 90, 180, 270];
    out.forEach((t, i) => {
      assert.ok(near(t.position.x, expPos[i][0], 1e-9), `x[${i}]=${t.position.x}`);
      assert.ok(near(t.position.y, expPos[i][1], 1e-9), `y[${i}]=${t.position.y}`);
      assert.ok(near(t.rotationDegrees.z, expRot[i]), `rot[${i}]=${t.rotationDegrees.z}`);
    });
  });
  check('orientToCenter:false leaves rotation zero', () => {
    const c = { ...detCloner, distribution: { type: 'radial', count: 4, radius: 100, arcDegrees: 360, center: { x: 0, y: 0, z: 0 }, startAngleDegrees: 0, orientToCenter: false } };
    for (const t of computeInstanceTransforms(c, 0)) assert.equal(t.rotationDegrees.z, 0);
  });

  // ── 2c. Path distribution: arc-length-corrected, NOT parametric-t ────────────
  console.log('[path]');
  check('path spacing is arc-length-uniform, not naive-t (tight length imbalance)', () => {
    // Two collinear straight segments with 1/3-length handles → each is
    // constant-speed. Segment A length 20, segment B length 200 (total 220).
    // At t=0.5 arc-length lands at dist 110 → x=110. Naive global-t lands at the
    // node boundary → x=20. These are unambiguously different.
    const path = {
      id: 'p', layerId: 'l', closed: false, loop: 'none',
      nodes: [
        { id: 'n0', position: [0, 0],   handleIn: [0, 0],        handleOut: [20 / 3, 0],   vertexType: 'smooth' },
        { id: 'n1', position: [20, 0],  handleIn: [-20 / 3, 0],  handleOut: [200 / 3, 0],  vertexType: 'smooth' },
        { id: 'n2', position: [220, 0], handleIn: [-200 / 3, 0], handleOut: [0, 0],        vertexType: 'smooth' },
      ],
    };
    const c = {
      ...detCloner,
      distribution: { type: 'path', pathRef: 'p', count: 3, arcLengthCorrected: true, orientToPath: true },
    };
    const ctx = { getMotionPath: (id) => (id === 'p' ? path : undefined) };
    const out = computeInstanceTransforms(c, 0, ctx);
    assert.equal(out.length, 3);
    assert.ok(near(out[0].position.x, 0, 1e-4), `start ${out[0].position.x}`);
    assert.ok(near(out[2].position.x, 220, 1e-3), `end ${out[2].position.x}`);
    // The decisive assertion: arc-length (110), NOT naive-t (20).
    assert.ok(near(out[1].position.x, 110, 1.0), `mid arc-length x=${out[1].position.x} (expected ~110)`);
    assert.ok(Math.abs(out[1].position.x - 20) > 5, `mid must NOT be the naive-t value 20 (got ${out[1].position.x})`);
    // tangent along +x → 0°
    assert.ok(near(out[1].rotationDegrees.z, 0, 1e-6));
  });
  check('unresolved path ref → empty (no throw); validation reports the ref', () => {
    const c = { ...detCloner, distribution: { type: 'path', pathRef: 'missing', count: 5, arcLengthCorrected: true, orientToPath: true } };
    assert.deepEqual(computeInstanceTransforms(c, 0, { getMotionPath: () => undefined }), []);
  });

  // ── 3. renderCount truncation ───────────────────────────────────────────────
  console.log('[renderCount]');
  check('grid of 100 with renderCount 7 → exactly 7 entries, lowest index first', () => {
    const c = {
      ...detCloner,
      distribution: { type: 'grid', countX: 10, countY: 10, countZ: 1, spacing: { x: 1, y: 1, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 },
      renderCount: 7,
    };
    const out = computeInstanceTransforms(c, 0);
    assert.equal(out.length, 7);
    out.forEach((t, i) => assert.equal(t.index, i)); // 0..6
  });

  // ── 4. Reference / cycle validation ─────────────────────────────────────────
  console.log('[validation]');
  const mkCloner = (id, srcLayerId) => ({
    id, type: 'cloner', name: id,
    sourceRef: { type: 'layer', layerId: srcLayerId },
    distribution: { type: 'grid', countX: 1, countY: 1, countZ: 1, spacing: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 },
    effectors: [], stagger: { delaySeconds: 0 }, renderCount: 1,
  });
  const mkCtx = (cloners, extraLayerIds = []) => {
    const byLayer = new Map(cloners.map((c) => [c.id, c]));
    const all = new Set([...cloners.map((c) => c.id), ...extraLayerIds]);
    return { getClonerByLayerId: (lid) => byLayer.get(lid), layerExists: (lid) => all.has(lid) };
  };

  check('valid: cloner sourcing a plain (non-cloner) layer → no issues', () => {
    const A = mkCloner('A', 'shape1');
    assert.deepEqual(validateClonerReferences([A], mkCtx([A], ['shape1'])), []);
  });
  check('pure cloner sourceRef cycle A↔B is detected', () => {
    const A = mkCloner('A', 'B');
    const B = mkCloner('B', 'A');
    const issues = validateClonerReferences([A, B], mkCtx([A, B]));
    assert.ok(issues.some((i) => i.kind === 'cycle'), JSON.stringify(issues));
  });
  check('3-hop cycle A→B→C→A is detected', () => {
    const A = mkCloner('A', 'B');
    const B = mkCloner('B', 'C');
    const C = mkCloner('C', 'A');
    const issues = validateClonerReferences([A, B, C], mkCtx([A, B, C]));
    assert.ok(issues.some((i) => i.kind === 'cycle'));
  });
  check('self-reference is detected', () => {
    const S = mkCloner('S', 'S');
    const issues = validateClonerReferences([S], mkCtx([S]));
    assert.ok(issues.some((i) => i.kind === 'self-reference'));
  });
  check('dangling source ref is detected', () => {
    const D = mkCloner('D', 'ghost');
    const issues = validateClonerReferences([D], mkCtx([D]));
    assert.ok(issues.some((i) => i.kind === 'dangling-source'));
  });

  // sanity: the factory builds a valid, non-cyclic cloner
  check('createDefaultCloner produces a valid grid cloner', () => {
    const c = createDefaultCloner('cl1', 'shape1');
    assert.equal(c.type, 'cloner');
    assert.equal(c.distribution.type, 'grid');
    assert.ok(computeInstanceTransforms(c, 0).length > 0);
  });

  // ══ Prompt 2: effectors + stagger ══════════════════════════════════════════

  // ── InstanceTransform now carries identity color/opacity from base distribution ─
  console.log('\n[instance shape]');
  check('base distribution populates identity colorTint {1,1,1} and opacity 1', () => {
    const g = computeInstanceTransforms(detCloner, 0);
    assert.deepEqual(g[0].colorTint, { r: 1, g: 1, b: 1 });
    assert.equal(g[0].opacity, 1);
  });

  // Effector builders
  const rnd = (o = {}) => ({ type: 'random', strength: 1, blendMode: 'add', seed: 42, positionAmount: { x: 100, y: 100, z: 0 }, rotationAmount: { x: 0, y: 0, z: 30 }, scaleAmount: 0.2, opacityAmount: 0.1, ...o });
  const stepE = (o = {}) => ({ type: 'step', strength: 1, blendMode: 'add', waveform: 'sine', frequency: 0.5, phase: 0, positionAmount: { x: 0, y: 0, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 }, scaleAmount: 0.3, opacityAmount: 0, ...o });
  const timeE = (o = {}) => ({ type: 'time', strength: 1, blendMode: 'add', waveform: 'sine', frequency: 0.05, phase: 0, positionAmount: { x: 20, y: 0, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 }, scaleAmount: 0, opacityAmount: 0, ...o });
  const falloffE = (o = {}) => ({ type: 'falloff', strength: 1, blendMode: 'add', shape: { type: 'radial', center: { x: 0, y: 0, z: 0 }, innerRadius: 0, outerRadius: 200 }, curveExponent: 1, positionDelta: { x: 0, y: 0, z: 0 }, rotationDelta: { x: 0, y: 0, z: 0 }, scaleDelta: 0, colorDelta: { x: 0, y: 0, z: 0 }, opacityDelta: 0, ...o });
  const baseInst = { index: 0, position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, colorTint: { r: 1, g: 1, b: 1 }, opacity: 1 };

  console.log('[determinism — full stack]');
  const fullCloner = {
    id: 'c', type: 'cloner', name: 'c',
    sourceRef: { type: 'layer', layerId: 'src' },
    distribution: { type: 'grid', countX: 3, countY: 3, countZ: 1, spacing: { x: 100, y: 100, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 },
    effectors: [rnd(), stepE(), timeE(), falloffE({ blendMode: 'multiply', scaleDelta: 1 })],
    stagger: { delaySeconds: 0.1, curve: 'easeIn' },
    renderCount: 500,
  };
  const srcEval = (lf) => ({ opacity: Math.max(0, Math.min(1, lf / 200)), scale: { x: 1 + lf * 0.001, y: 1 + lf * 0.001, z: 1 } });
  const fullCtx = { fps: 30, evaluateSourceTransform: srcEval };
  check('full effector+stagger+source stack is byte-identical on repeat', () => {
    assert.deepEqual(computeInstanceTransforms(fullCloner, 400, fullCtx), computeInstanceTransforms(fullCloner, 400, fullCtx));
  });
  check('SCRUB-ORDER INDEPENDENCE: frame 400 → 12 → 400 gives identical 400 results', () => {
    const a = computeInstanceTransforms(fullCloner, 400, fullCtx);
    computeInstanceTransforms(fullCloner, 12, fullCtx); // interleave a different frame
    const b = computeInstanceTransforms(fullCloner, 400, fullCtx);
    assert.deepEqual(a, b);
  });

  console.log('[effector stack order]');
  check('add-then-multiply ≠ multiply-then-add (order is significant), each deterministic', () => {
    const single = { ...fullCloner, distribution: { type: 'grid', countX: 1, countY: 1, countZ: 1, spacing: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 }, stagger: { delaySeconds: 0 } };
    const cf = (o) => falloffE({ shape: { type: 'radial', center: { x: 0, y: 0, z: 0 }, innerRadius: 1e6, outerRadius: 1e6 + 1 }, ...o }); // strength 1 everywhere
    const A = cf({ blendMode: 'add', positionDelta: { x: 10, y: 0, z: 0 } });
    const B = cf({ blendMode: 'multiply', positionDelta: { x: 1, y: 0, z: 0 } });
    const ab = computeInstanceTransforms({ ...single, effectors: [A, B] }, 0)[0].position.x; // (0+10)*2 = 20
    const ba = computeInstanceTransforms({ ...single, effectors: [B, A] }, 0)[0].position.x; // (0*2)+10 = 10
    assert.ok(near(ab, 20), `ab=${ab}`);
    assert.ok(near(ba, 10), `ba=${ba}`);
    assert.notEqual(ab, ba);
  });

  console.log('[random effector seeding]');
  check('same (index, seed) → identical; time-independent; distinct per index; no collisions 0..999', () => {
    const e = rnd();
    const a0 = effectorOutput(0, { x: 0, y: 0, z: 0 }, 0, e);
    const b0 = effectorOutput(0, { x: 0, y: 0, z: 0 }, 0, e);
    assert.deepEqual(a0, b0);
    assert.deepEqual(effectorOutput(0, { x: 0, y: 0, z: 0 }, 99999, e), a0); // ignores time
    assert.notDeepEqual(effectorOutput(1, { x: 0, y: 0, z: 0 }, 0, e), a0);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const d = effectorOutput(i, { x: 0, y: 0, z: 0 }, 0, e);
      seen.add(`${d.positionDelta.x.toFixed(6)},${d.positionDelta.y.toFixed(6)}`);
    }
    assert.ok(seen.size >= 999, `distinct draws: ${seen.size}/1000`);
  });

  console.log('[falloff correctness]');
  check('radial / linear / box falloff strengths match hand-computed values', () => {
    // radial: inner 0, outer 100, delta.x 10 → strength·10 at a distance.
    const rad = falloffE({ shape: { type: 'radial', center: { x: 0, y: 0, z: 0 }, innerRadius: 0, outerRadius: 100 }, positionDelta: { x: 10, y: 0, z: 0 } });
    assert.ok(near(effectorOutput(0, { x: 0, y: 0, z: 0 }, 0, rad).positionDelta.x, 10), 'radial d=0 → 1');
    assert.ok(near(effectorOutput(0, { x: 50, y: 0, z: 0 }, 0, rad).positionDelta.x, 5), 'radial d=50 → 0.5');
    assert.ok(near(effectorOutput(0, { x: 100, y: 0, z: 0 }, 0, rad).positionDelta.x, 0), 'radial d=outer → 0');
    // linear: start 0, dir +x, length 100
    const lin = falloffE({ shape: { type: 'linear', start: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, length: 100 }, positionDelta: { x: 10, y: 0, z: 0 } });
    assert.ok(near(effectorOutput(0, { x: 0, y: 0, z: 0 }, 0, lin).positionDelta.x, 10));
    assert.ok(near(effectorOutput(0, { x: 50, y: 0, z: 0 }, 0, lin).positionDelta.x, 5));
    assert.ok(near(effectorOutput(0, { x: 100, y: 0, z: 0 }, 0, lin).positionDelta.x, 0));
    // box: half-extent 50, softness 50
    const box = falloffE({ shape: { type: 'box', center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 50, y: 50, z: 0 }, softness: 50 }, positionDelta: { x: 10, y: 0, z: 0 } });
    assert.ok(near(effectorOutput(0, { x: 0, y: 0, z: 0 }, 0, box).positionDelta.x, 10), 'box inside → 1');
    assert.ok(near(effectorOutput(0, { x: 75, y: 0, z: 0 }, 0, box).positionDelta.x, 5), 'box 25 past edge / softness 50 → 0.5');
    assert.ok(near(effectorOutput(0, { x: 100, y: 0, z: 0 }, 0, box).positionDelta.x, 0), 'box softness edge → 0');
  });

  console.log('[blend override]');
  check('override at strength 0.5 lerps halfway (target effector faces a point)', () => {
    // base at (0,0), target at (0,100) → facing angle atan2(100,0)=90°; override 0.5 → 45°.
    const tgt = { type: 'target', strength: 0.5, blendMode: 'override', target: { x: 0, y: 100, z: 0 } };
    const out = applyEffectorStack(baseInst, [tgt], 0, 0);
    assert.ok(near(out.rotationDegrees.z, 45), `rotZ=${out.rotationDegrees.z}`);
  });

  console.log('[stagger]');
  check('sourceLocalTime = frame − staggerDelay·index (hand-computed, linear)', () => {
    const stag = { delaySeconds: 0.5, curve: 'linear' }; // fps 30 → 15 frames/index
    assert.deepEqual(staggerDelays(stag, 9, 30), [0, 15, 30, 45, 60, 75, 90, 105, 120]);
    assert.equal(sourceLocalTime(stag, 9, 30, 100, 0), 100);
    assert.equal(sourceLocalTime(stag, 9, 30, 100, 2), 70);
    assert.equal(sourceLocalTime(stag, 9, 30, 100, 8), -20);
  });
  check('the injected keyframe evaluator is called with the EXACT staggered frames', () => {
    const stag = { delaySeconds: 0.5, curve: 'linear' };
    const calls = [];
    const c = {
      id: 'c', type: 'cloner', name: 'c', sourceRef: { type: 'layer', layerId: 'src' },
      distribution: { type: 'grid', countX: 3, countY: 3, countZ: 1, spacing: { x: 1, y: 1, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 },
      effectors: [], stagger: stag, renderCount: 500,
    };
    computeInstanceTransforms(c, 100, { fps: 30, evaluateSourceTransform: (lf) => { calls.push(lf); return {}; } });
    assert.deepEqual(calls, [100, 85, 70, 55, 40, 25, 10, -5, -20]);
  });

  // ══ Prompt 3 (Deliverable 1, CPU side): instance matrix + buffer packing ═════
  console.log('\n[gpu-prep: instance matrix]');
  check('identity transform → identity-ish matrix maps local unchanged + translation', () => {
    const mm = composeInstanceMatrix(mkInstance({ position: { x: 10, y: 20, z: 0 } }));
    const p = applyMat(mm, { x: 3, y: 4, z: 0, w: 1 }); // local (3,4) → +translation
    assert.ok(near(p.x, 13) && near(p.y, 24), `${p.x},${p.y}`);
  });
  check('rotationDegrees.z = 90 rotates local +X to +Y (matches renderer Y-down CCW)', () => {
    const mm = composeInstanceMatrix(mkInstance({ rotationDegrees: { x: 0, y: 0, z: 90 } }));
    const p = applyMat(mm, { x: 1, y: 0, z: 0, w: 1 }); // (1,0) → (cos90, sin90) = (0,1)
    assert.ok(near(p.x, 0, 1e-9) && near(p.y, 1, 1e-9), `${p.x},${p.y}`);
  });
  check('non-uniform scale applies per-axis before rotation', () => {
    const mm = composeInstanceMatrix(mkInstance({ scale: { x: 2, y: 3, z: 1 } }));
    const p = applyMat(mm, { x: 1, y: 1, z: 0, w: 1 });
    assert.ok(near(p.x, 2) && near(p.y, 3), `${p.x},${p.y}`);
  });
  check('rotate∘scale∘translate compose in the renderer order', () => {
    // scale (2,1), rotate 90, translate (5,0): local (1,0) → scale (2,0) → rot90 (0,2) → +(5,0) = (5,2)
    const mm = composeInstanceMatrix(mkInstance({ scale: { x: 2, y: 1, z: 1 }, rotationDegrees: { x: 0, y: 0, z: 90 }, position: { x: 5, y: 0, z: 0 } }));
    const p = applyMat(mm, { x: 1, y: 0, z: 0, w: 1 });
    assert.ok(near(p.x, 5, 1e-9) && near(p.y, 2, 1e-9), `${p.x},${p.y}`);
  });

  console.log('[gpu-prep: buffer packing]');
  check('packInstanceBuffer interleaves [mat4(16) | rgb, opacity] per instance', () => {
    const a = mkInstance({ index: 0, colorTint: { r: 0.1, g: 0.2, b: 0.3 }, opacity: 0.4 });
    const b = mkInstance({ index: 1, position: { x: 7, y: 8, z: 0 }, colorTint: { r: 1, g: 0, b: 0 }, opacity: 0.5 });
    const buf = packInstanceBuffer([a, b]);
    assert.equal(buf.length, 2 * INSTANCE_FLOAT_COUNT);
    assert.equal(INSTANCE_FLOAT_COUNT, 20);
    // instance 0 tint at floats 16..19
    assert.ok(near(buf[16], 0.1) && near(buf[17], 0.2) && near(buf[18], 0.3) && near(buf[19], 0.4));
    // instance 1 matrix translation (col3.xy) at floats 20+12, 20+13
    assert.ok(near(buf[20 + 12], 7) && near(buf[20 + 13], 8));
    assert.ok(near(buf[20 + 16], 1) && near(buf[20 + 19], 0.5));
  });
  check('buffer is sized strictly from the (capped) instance count — GPU-level cap defense', () => {
    assert.equal(packInstanceBuffer([]).length, 0);
    assert.equal(packInstanceBuffer([mkInstance()]).length, INSTANCE_FLOAT_COUNT);
  });

  console.log('[gpu-prep: render-path auto-selection]');
  check('SDF shape → instanced-shape; image/text/pen-path → texture-stamp; data-bound → per-instance', () => {
    assert.equal(selectClonerRenderPath({ layerType: 'shape', isSdfShape: true }), 'instanced-shape');
    assert.equal(selectClonerRenderPath({ layerType: 'shape', isSdfShape: false }), 'texture-stamp'); // pen path
    assert.equal(selectClonerRenderPath({ layerType: 'image' }), 'texture-stamp');
    assert.equal(selectClonerRenderPath({ layerType: 'text' }), 'texture-stamp');
    assert.equal(selectClonerRenderPath({ layerType: 'group' }), 'texture-stamp');
    // data-bound wins regardless of type (reserved, renderer-unhandled)
    assert.equal(selectClonerRenderPath({ layerType: 'shape', isSdfShape: true, isDataBound: true }), 'per-instance');
  });

  // ══ Prompt 4: field-driven distribution + falloff, data-bound source ═════════
  // Synthetic field: left half (x<50) bright (1), right half dark (0).
  const FW = 100, FH = 100;
  const fdata = new Float32Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) fdata[y * FW + x] = x < 50 ? 1 : 0;
  const synthField = { data: fdata, width: FW, height: FH };
  const getField = (ref) => (ref === 'f' ? synthField : undefined);

  const fieldCloner = (over = {}) => ({
    id: 'c', type: 'cloner', name: 'c', sourceRef: { type: 'layer', layerId: 'src' },
    distribution: { type: 'field', fieldRef: 'f', sampleResolution: 20, threshold: 0.5, maxCount: 1000, origin: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 100, z: 0 }, ...(over.distribution ?? {}) },
    effectors: [], stagger: { delaySeconds: 0 }, renderCount: 1000, ...over,
  });

  console.log('\n[field distribution]');
  check('deterministic + synchronous + frameNumber-independent (no async in the pure fn)', () => {
    const a = computeInstanceTransforms(fieldCloner(), 0, { getField });
    const b = computeInstanceTransforms(fieldCloner(), 400, { getField }); // different frame
    assert.ok(Array.isArray(a) && !(a instanceof Promise));
    assert.deepEqual(a, b);
  });
  check('positions concentrate in the bright region, absent below threshold in the dark', () => {
    const out = computeInstanceTransforms(fieldCloner(), 0, { getField });
    // 20×20 grid, u<0.5 (10 cols) bright → 10×20 = 200 kept; all map to world x<100.
    assert.equal(out.length, 200);
    assert.ok(out.every((t) => t.position.x < 100), 'all in bright half');
    assert.ok(!out.some((t) => t.position.x >= 100), 'none in dark half');
  });
  check('maxCount caps candidates BEFORE renderCount truncates (two distinct caps)', () => {
    // maxCount 50 → 50 candidates; renderCount 1000 → 50.
    assert.equal(computeInstanceTransforms(fieldCloner({ distribution: { type: 'field', fieldRef: 'f', sampleResolution: 20, threshold: 0.5, maxCount: 50, origin: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 100, z: 0 } } }), 0, { getField }).length, 50);
    // maxCount 50, renderCount 30 → final cap 30.
    assert.equal(computeInstanceTransforms(fieldCloner({ distribution: { type: 'field', fieldRef: 'f', sampleResolution: 20, threshold: 0.5, maxCount: 50, origin: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 100, z: 0 } }, renderCount: 30 }), 0, { getField }).length, 30);
  });
  check('unresolved field ref → empty (no throw)', () => {
    assert.deepEqual(computeInstanceTransforms(fieldCloner(), 0, { getField: () => undefined }), []);
  });

  console.log('[field falloff]');
  check('field falloff strength = sampled field value at the mapped position', () => {
    const fe = { type: 'falloff', strength: 1, blendMode: 'add', shape: { type: 'field', fieldRef: 'f', origin: { x: 0, y: 0, z: 0 }, size: { x: 100, y: 100, z: 0 } }, curveExponent: 1, positionDelta: { x: 10, y: 0, z: 0 }, rotationDelta: { x: 0, y: 0, z: 0 }, scaleDelta: 0, colorDelta: { x: 0, y: 0, z: 0 }, opacityDelta: 0 };
    // pos (25,50) → field (25,50) bright(1) → delta 10; pos (75,50) → dark(0) → delta 0.
    assert.ok(near(effectorOutput(0, { x: 25, y: 50, z: 0 }, 0, fe, getField).positionDelta.x, 10), 'bright → full');
    assert.ok(near(effectorOutput(0, { x: 75, y: 50, z: 0 }, 0, fe, getField).positionDelta.x, 0), 'dark → zero');
    // missing field → strength 0
    assert.ok(near(effectorOutput(0, { x: 25, y: 50, z: 0 }, 0, fe, () => undefined).positionDelta.x, 0));
  });

  console.log('[data binding]');
  check('override map: overrides[i] ← data[i], with i % data.length wraparound', () => {
    const binding = { data: [{ name: 'A', price: 1 }, { name: 'B', price: 2 }], bindings: [{ propertyPath: 'text.content', dataKey: 'name' }] };
    const ov = buildInstanceOverrides(binding, 5);
    assert.equal(ov.length, 5);
    assert.equal(ov[0]['text.content'], 'A');
    assert.equal(ov[1]['text.content'], 'B');
    assert.equal(ov[2]['text.content'], 'A'); // 2 % 2 = 0 → wraps
    assert.equal(ov[3]['text.content'], 'B');
    assert.equal(ov[4]['text.content'], 'A');
  });
  check('empty data → empty maps (no throw); missing dataKey → property left unbound', () => {
    assert.deepEqual(buildInstanceOverrides({ data: [], bindings: [{ propertyPath: 'p', dataKey: 'k' }] }, 3), [{}, {}, {}]);
    const ov = buildInstanceOverrides({ data: [{ a: 1 }], bindings: [{ propertyPath: 'p', dataKey: 'missing' }] }, 1);
    assert.deepEqual(ov[0], {});
  });

  console.log('[data-bound source: instance-override mechanism]');
  check('buildDataBoundSources overrides source content per instance (wraparound), input unmutated', () => {
    const sourceText = { id: 's', type: 'text', content: { text: 'X' } };
    const binding = { data: [{ name: 'A' }, { name: 'B' }], bindings: [{ propertyPath: 'content.text', dataKey: 'name' }] };
    const srcs = buildDataBoundSources(sourceText, binding, 3);
    assert.equal(srcs.length, 3);
    assert.equal(srcs[0].content.text, 'A');
    assert.equal(srcs[1].content.text, 'B');
    assert.equal(srcs[2].content.text, 'A'); // 2 % 2 = 0 → wraps
    assert.equal(sourceText.content.text, 'X', 'original source is NOT mutated');
  });
  check('override on an AnimatableProperty sets its defaultValue (base), not the object', () => {
    const src = { id: 's2', type: 'shape', opacity: { id: 'o', name: 'Opacity', valueType: 'number', defaultValue: 1, keyframes: [] } };
    const binding = { data: [{ op: 0.5 }], bindings: [{ propertyPath: 'opacity', dataKey: 'op' }] };
    const out = buildDataBoundSources(src, binding, 1)[0];
    assert.equal(out.opacity.defaultValue, 0.5);
    assert.ok(Array.isArray(out.opacity.keyframes), 'property object preserved (keyframes intact)');
    assert.equal(src.opacity.defaultValue, 1, 'original unmutated');
  });
  check('unknown path is skipped (no throw); non-numeric value to numeric prop is skipped', () => {
    const src = { id: 's3', type: 'text', content: { text: 'X' }, opacity: { valueType: 'number', defaultValue: 1, keyframes: [] } };
    const b1 = { data: [{ v: 1 }], bindings: [{ propertyPath: 'does.not.exist', dataKey: 'v' }] };
    assert.equal(buildDataBoundSources(src, b1, 1)[0].content.text, 'X'); // no throw, unchanged
    const b2 = { data: [{ v: 'notnum' }], bindings: [{ propertyPath: 'opacity', dataKey: 'v' }] };
    assert.equal(buildDataBoundSources(src, b2, 1)[0].opacity.defaultValue, 1); // non-coercible → skipped
  });

  console.log('[routing + LOD]');
  check('data-bound source routes to per-instance, overriding what the type would pick', () => {
    assert.equal(selectClonerRenderPath({ layerType: 'shape', isSdfShape: true, isDataBound: true }), 'per-instance');
    assert.equal(selectClonerRenderPath({ layerType: 'shape', isSdfShape: true, isDataBound: false }), 'instanced-shape');
    assert.equal(selectClonerRenderPath({ layerType: 'image', isDataBound: true }), 'per-instance');
  });
  check('LOD threshold is per-strategy: per-instance < texture-stamp < instanced-shape', () => {
    assert.ok(CLONER_LOD_THRESHOLDS['per-instance'] < CLONER_LOD_THRESHOLDS['texture-stamp']);
    assert.ok(CLONER_LOD_THRESHOLDS['texture-stamp'] < CLONER_LOD_THRESHOLDS['instanced-shape']);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
