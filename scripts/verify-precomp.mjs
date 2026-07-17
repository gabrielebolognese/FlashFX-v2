// Acceptance harness for the precomposition FOUNDATION (recursive resolve, time
// remap, cycle + depth guards, unified graph validation). No test runner in this
// repo (see CLAUDE.md), so this bundles the real TS with the installed esbuild and
// asserts with node:assert. Run: node scripts/verify-precomp.mjs (or npm run verify:precomp)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'precomp-verify-'));
const outfile = join(tmp, 'precomp.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createPrecompLayer } from './src/core/factory';
        export { validateCompositionGraph, precompLocalFrame, referencedCompositionIds, MAX_PRECOMP_DEPTH } from './src/core/precomp';
        export { buildPrecompose } from './src/core/precompose';
        export { serializeDocument, deserializeDocument } from './src/project-system/services/serialization';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });

  // interpolation → expressions spawns a Web Worker at load; Node has none. Stub it.
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  const m = await import(pathToFileURL(outfile).href);
  const { resolveFrame, createComposition, createRectangleLayer, createPrecompLayer, validateCompositionGraph, precompLocalFrame, referencedCompositionIds, MAX_PRECOMP_DEPTH, buildPrecompose, serializeDocument, deserializeDocument } = m;

  const registryCtx = (comps) => {
    const map = new Map(comps.map((c) => [c.id, c]));
    return { getComposition: (id) => map.get(id) };
  };

  console.log('Precomposition foundation — acceptance harness\n');

  // ── Recursive resolution ─────────────────────────────────────────────────────
  console.log('[recursive resolve]');
  check('a precomp layer resolves its sub-composition into a nested RenderFrame', () => {
    const sub = createComposition('sub', { ...SETTINGS });
    sub.layers = [createRectangleLayer('rect', 100, 100, 50, 50, [1, 0, 0, 1], 100)];
    const parent = createComposition('parent', { ...SETTINGS });
    const pre = createPrecompLayer('pre', sub.id, 100);
    parent.layers = [pre];

    const rf = resolveFrame(parent, 0, registryCtx([parent, sub]));
    const p = rf.layers.find((l) => l.layerType === 'precomp');
    assert.ok(p, 'precomp resolved layer present');
    assert.equal(p.precomp.compositionId, sub.id);
    assert.ok(p.precomp.renderFrame, 'nested renderFrame is non-null');
    assert.ok(p.precomp.renderFrame.layers.some((l) => l.layerType === 'shape'), 'nested contains the sub-comp shape');
    assert.equal(p.precomp.width, 1920);
  });
  check('no registry (no ctx) → precomp resolves to a null nested frame (renders nothing, no throw)', () => {
    const sub = createComposition('sub', { ...SETTINGS });
    const parent = createComposition('parent', { ...SETTINGS });
    parent.layers = [createPrecompLayer('pre', sub.id, 100)];
    const rf = resolveFrame(parent, 0); // no ctx
    const p = rf.layers.find((l) => l.layerType === 'precomp');
    assert.equal(p.precomp.renderFrame, null);
  });
  check('outer composition layout is unaffected by the recursive call (re-entrancy fix)', () => {
    // Two sibling layers in the parent around the precomp still resolve with correct
    // positions after the recursion clobbers+restores the module layout maps.
    const sub = createComposition('sub', { ...SETTINGS });
    sub.layers = [createRectangleLayer('subrect', 0, 0, 10, 10, [1, 1, 1, 1], 100)];
    const parent = createComposition('parent', { ...SETTINGS });
    const before = createRectangleLayer('before', 200, 300, 20, 20, [0, 1, 0, 1], 100);
    const after = createRectangleLayer('after', 400, 500, 20, 20, [0, 0, 1, 1], 100);
    parent.layers = [before, createPrecompLayer('pre', sub.id, 100), after];
    const rf = resolveFrame(parent, 0, registryCtx([parent, sub]));
    const a = rf.layers.find((l) => l.id === after.id);
    assert.ok(a, 'sibling after the precomp still resolved');
    assert.ok(Math.abs(a.transform.positionX - 400) < 1e-6 && Math.abs(a.transform.positionY - 500) < 1e-6, `after pos ${a.transform.positionX},${a.transform.positionY}`);
  });

  // ── Cycle + depth guards ─────────────────────────────────────────────────────
  console.log('[cycle + depth guards]');
  check('a reference cycle A→B→A terminates (bounded), does not infinite-loop', () => {
    const A = createComposition('A', { ...SETTINGS });
    const B = createComposition('B', { ...SETTINGS });
    A.layers = [createPrecompLayer('a-pre', B.id, 100)];
    B.layers = [createPrecompLayer('b-pre', A.id, 100)];
    const rf = resolveFrame(A, 0, registryCtx([A, B])); // must return, not hang
    const pa = rf.layers.find((l) => l.layerType === 'precomp');
    assert.ok(pa.precomp.renderFrame, 'A→B resolves one level');
    const pb = pa.precomp.renderFrame.layers.find((l) => l.layerType === 'precomp');
    assert.equal(pb.precomp.renderFrame, null, 'B→A stopped by the visited guard');
  });
  check('nesting is capped at MAX_PRECOMP_DEPTH even for a longer chain', () => {
    const comps = [];
    for (let i = 0; i <= MAX_PRECOMP_DEPTH + 1; i++) comps.push(createComposition(`c${i}`, { ...SETTINGS }));
    for (let i = 0; i < comps.length - 1; i++) comps[i].layers = [createPrecompLayer(`p${i}`, comps[i + 1].id, 100)];
    comps[comps.length - 1].layers = [createRectangleLayer('leaf', 0, 0, 5, 5, [1, 1, 1, 1], 100)];
    let frame = resolveFrame(comps[0], 0, registryCtx(comps));
    let depth = 0;
    while (true) {
      const p = frame.layers.find((l) => l.layerType === 'precomp');
      if (!p || !p.precomp.renderFrame) break;
      depth++;
      frame = p.precomp.renderFrame;
    }
    assert.equal(depth, MAX_PRECOMP_DEPTH, `nested ${depth}, expected cap ${MAX_PRECOMP_DEPTH}`);
  });

  // ── Time remap ───────────────────────────────────────────────────────────────
  console.log('[time remap]');
  check('precompLocalFrame: rebase by inPoint, fps rescale, timeStretch, startFrame, clamp', () => {
    const sub = createComposition('sub', { ...SETTINGS }); // fps 30, dur 100
    const mk = (over) => ({ ...createPrecompLayer('p', sub.id, 100), ...over });
    // identity: frame 10 → 10
    assert.equal(precompLocalFrame(mk({ inPoint: 0 }), 10, 30, sub), 10);
    // inPoint 4: frame 10 → 6
    assert.equal(precompLocalFrame(mk({ inPoint: 4 }), 10, 30, sub), 6);
    // timeStretch 2: frame 10 → 20
    assert.equal(precompLocalFrame(mk({ inPoint: 0, timeRemap: { startFrame: 0, timeStretch: 2 } }), 10, 30, sub), 20);
    // startFrame 5: frame 10 → 15
    assert.equal(precompLocalFrame(mk({ inPoint: 0, timeRemap: { startFrame: 5, timeStretch: 1 } }), 10, 30, sub), 15);
    // sub fps 60 vs parent 30 → ×2
    const sub60 = createComposition('sub60', { ...SETTINGS, frameRate: 60 });
    assert.equal(precompLocalFrame(mk({ inPoint: 0 }), 10, 30, sub60), 20);
    // clamp to [0, dur-1]
    assert.equal(precompLocalFrame(mk({ inPoint: 0, timeRemap: { startFrame: 0, timeStretch: 100 } }), 10, 30, sub), 99);
    assert.equal(precompLocalFrame(mk({ inPoint: 50 }), 0, 30, sub), 0); // negative → 0
  });

  // ── Unified graph validation ─────────────────────────────────────────────────
  console.log('[graph validation]');
  check('referencedCompositionIds collects BOTH precomp and cloner-composition edges', () => {
    const target1 = 'comp-1', target2 = 'comp-2';
    const comp = createComposition('c', { ...SETTINGS });
    comp.layers = [
      createPrecompLayer('pre', target1, 100),
      { id: 'cl', type: 'cloner', name: 'cl', sourceRef: { type: 'composition', compositionId: target2 } },
    ];
    const refs = referencedCompositionIds(comp);
    assert.ok(refs.includes(target1) && refs.includes(target2), JSON.stringify(refs));
  });
  check('validateCompositionGraph detects cycles and dangling refs, passes valid graphs', () => {
    const A = createComposition('A', { ...SETTINGS });
    const B = createComposition('B', { ...SETTINGS });
    A.layers = [createPrecompLayer('a', B.id, 100)];
    B.layers = [createPrecompLayer('b', A.id, 100)];
    const cyc = validateCompositionGraph(registryCtx([A, B]).getComposition, [A.id]);
    assert.ok(cyc.some((i) => i.kind === 'cycle'), 'cycle detected');

    const C = createComposition('C', { ...SETTINGS });
    C.layers = [createPrecompLayer('c', 'ghost', 100)];
    const dang = validateCompositionGraph(registryCtx([C]).getComposition, [C.id]);
    assert.ok(dang.some((i) => i.kind === 'dangling'), 'dangling detected');

    const D = createComposition('D', { ...SETTINGS });
    const E = createComposition('E', { ...SETTINGS });
    D.layers = [createPrecompLayer('d', E.id, 100)];
    E.layers = [createRectangleLayer('leaf', 0, 0, 5, 5, [1, 1, 1, 1], 100)];
    assert.deepEqual(validateCompositionGraph(registryCtx([D, E]).getComposition, [D.id]), []);
  });

  // ── Precompose (the "wrap selected layers into a sub-composition" transform) ──
  console.log('[precompose]');
  check('buildPrecompose moves selected layers into a sub-comp + inserts one precomp layer, preserving transforms', () => {
    const comp = createComposition('parent', { ...SETTINGS });
    const r1 = createRectangleLayer('r1', 100, 100, 50, 50, [1, 0, 0, 1], 100);
    const r2 = createRectangleLayer('r2', 200, 250, 50, 50, [0, 1, 0, 1], 100);
    const r3 = createRectangleLayer('r3', 300, 300, 50, 50, [0, 0, 1, 1], 100);
    comp.layers = [r1, r2, r3];
    const built = buildPrecompose(comp, [r1.id, r2.id], 'Precomp 1');
    assert.ok(built, 'result present');
    // sub-comp holds r1 + r2 with transforms preserved verbatim
    assert.equal(built.subComposition.layers.length, 2);
    const subIds = built.subComposition.layers.map((l) => l.id);
    assert.ok(subIds.includes(r1.id) && subIds.includes(r2.id));
    const subR2 = built.subComposition.layers.find((l) => l.id === r2.id);
    assert.deepEqual(subR2.transform.position.defaultValue, [200, 250], 'transform preserved');
    // parent: r3 survives, one precomp layer inserted at r1's position (index 0)
    assert.equal(built.parentLayers.length, 2);
    assert.equal(built.parentLayers[0].type, 'precomp');
    assert.equal(built.parentLayers[0].compositionId, built.subComposition.id);
    assert.ok(built.parentLayers.some((l) => l.id === r3.id));
    assert.ok(!built.parentLayers.some((l) => l.id === r1.id || l.id === r2.id), 'moved layers removed from parent');
    // precomp identity transform (children stay put) + spans moved time range
    assert.deepEqual(built.parentLayers[0].transform.position.defaultValue, [0, 0]);
  });
  check('buildPrecompose pulls descendants of a selected group along', () => {
    const comp = createComposition('parent', { ...SETTINGS });
    const parent = createRectangleLayer('grp', 0, 0, 10, 10, [1, 1, 1, 1], 100);
    const child = createRectangleLayer('child', 50, 50, 10, 10, [1, 1, 1, 1], 100);
    child.parentId = parent.id;
    comp.layers = [parent, child];
    const built = buildPrecompose(comp, [parent.id], 'Precomp'); // select only the parent
    assert.equal(built.subComposition.layers.length, 2, 'child pulled in via descendants');
    const subChild = built.subComposition.layers.find((l) => l.id === child.id);
    assert.equal(subChild.parentId, parent.id, 'parent link preserved within the moved set');
  });
  check('empty selection → null (no-op)', () => {
    const comp = createComposition('p', { ...SETTINGS });
    assert.equal(buildPrecompose(comp, [], 'x'), null);
  });

  // ── Persistence: multi-comp document + legacy migration ──
  console.log('[persistence]');
  check('legacy bare-composition scene migrates to a one-entry document', () => {
    const comp = createComposition('legacy', { ...SETTINGS });
    comp.layers = [createRectangleLayer('r', 0, 0, 10, 10, [1, 1, 1, 1], 100)];
    const doc = deserializeDocument(JSON.stringify(comp)); // old format = bare Composition JSON
    assert.equal(doc.rootCompositionId, comp.id);
    assert.equal(Object.keys(doc.compositions).length, 1);
    assert.ok(doc.compositions[comp.id], 'composition keyed by its id');
    assert.equal(doc.compositions[comp.id].layers.length, 1);
  });
  check('multi-composition document round-trips through serialize/deserialize', () => {
    const root = createComposition('root', { ...SETTINGS });
    const sub = createComposition('sub', { ...SETTINGS });
    root.layers = [createPrecompLayer('pre', sub.id, 100)];
    const doc = { version: 2, rootCompositionId: root.id, compositions: { [root.id]: root, [sub.id]: sub } };
    const round = deserializeDocument(serializeDocument(doc));
    assert.equal(round.rootCompositionId, root.id);
    assert.equal(Object.keys(round.compositions).length, 2);
    assert.ok(round.compositions[sub.id], 'sub-composition preserved');
    assert.equal(round.compositions[root.id].layers[0].type, 'precomp');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
