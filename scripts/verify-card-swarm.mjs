// Acceptance harness for B81: the 3D card swarm. The pure layout (core/cardSwarm.ts) is seeded and
// frame-independent (same seed = byte-identical, different seed differs), respects the count, keeps every centre
// inside the volume and the min spacing (bounded attempts), and agent.addCardSwarm - run through the REAL
// window.__ffxAgent runtime on the real editor + history stores, bundled for node - lands as ONE undo step of
// 3D layers parented to one orbitChildren cluster group with the requested yaw keys; undo restores the
// composition byte-identically. The resolver composes the cluster yaw as a true 3D orbit (cardMatrix) and glues
// decals to their card's depth (sortMatrix), while 3D layers without the flags resolve exactly as before.
// GPU proof through the MCP: gpu:card-swarm.
//   node scripts/verify-card-swarm.mjs   (or: npm run verify:card-swarm)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Browser stand-ins: just enough for the stores + agent runtime to load in node (no rendering happens here).
globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {}, clearRect() {}, save() {}, restore() {}, scale() {}, translate() {} }; } };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, removeEventListener() {}, fonts: { add() {}, load: async () => [], check: () => true, ready: Promise.resolve() } };
globalThis.FontFace = class { constructor(family) { this.family = family; } load() { return Promise.resolve(this); } };

const tmp = mkdtempSync(join(tmpdir(), 'card-swarm-verify-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { useEditorStore } from './src/store/editor';
        export { useHistoryStore } from './src/store/history';
        export { installAgentRuntime } from './src/agent/runtime';
        export * from './src/core/cardSwarm';
        export { planCardSwarm } from './src/animation-templates/cardSwarm';
        export { resolveFrame, evaluateNumber } from './src/core/interpolation';
        export { transformPoint } from './src/core/mat4';
        export { createRectangleLayer, createProperty } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    loader: { '.wgsl': 'text', '.wasm': 'file', '.png': 'file', '.svg': 'file', '.css': 'empty' },
    define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"test"}' },
  });
  const m = await import(pathToFileURL(outfile).href);
  const {
    useEditorStore, useHistoryStore, installAgentRuntime, layoutCardSwarm, insideSwarmVolume, defaultMinSpacing, swarmWorldPoint,
    resolveFrame, evaluateNumber, transformPoint, createRectangleLayer, createProperty, validateComposition,
  } = m;
  installAgentRuntime();
  const agent = globalThis.__ffxAgent;
  const run = async (id, args) => { const r = await agent.run(id, args); return r; };
  const compJson = () => JSON.stringify(useEditorStore.getState().composition);

  console.log('verify:card-swarm');

  // ---------------------------------------------------------------- pure layout
  const box = { center: [960, 540, 540], size: [2100, 1150, 1080], shape: 'box' };
  const ell = { center: [960, 540, 600], size: [2000, 1100, 1200], shape: 'ellipsoid' };
  const kinds = [
    { kind: 'card', count: 16, width: [300, 440], aspect: [0.6, 0.78] },
    { kind: 'pill', count: 12, width: [300, 420], height: 58, depthRange: [0, 0.55] },
  ];
  const spec = { seed: 7, volume: box, kinds };
  const a1 = layoutCardSwarm(spec), a2 = layoutCardSwarm(structuredClone(spec));
  await check('determinism: the same seed gives a byte-identical layout (JSON), a different seed a different one, no Math.random', () => {
    assert.equal(JSON.stringify(a1), JSON.stringify(a2));
    const b = layoutCardSwarm({ ...spec, seed: 8 });
    assert.notEqual(JSON.stringify(a1), JSON.stringify(b));
    const saved = Math.random;
    Math.random = () => { throw new Error('Math.random used'); };
    try { assert.equal(JSON.stringify(layoutCardSwarm(spec)), JSON.stringify(a1)); } finally { Math.random = saved; }
  });
  await check(`count respected: ${a1.cards.length} items = 16 cards + 12 pills, indices 0..27, per-kind indices`, () => {
    assert.equal(a1.cards.length, 28);
    assert.equal(a1.cards.filter((c) => c.kind === 'card').length, 16);
    assert.equal(a1.cards.filter((c) => c.kind === 'pill').length, 12);
    a1.cards.forEach((c, i) => assert.equal(c.index, i));
    assert.deepEqual(a1.cards.filter((c) => c.kind === 'pill').map((c) => c.kindIndex), [...Array(12).keys()]);
  });
  for (const [label, vol] of [['box', box], ['ellipsoid', ell]]) {
    const L = layoutCardSwarm({ seed: 3, volume: vol, kinds });
    await check(`${label}: every centre inside the volume, pills in their depth band, min spacing ${L.minSpacing.toFixed(1)} px respected pairwise (closest ${L.minDistance.toFixed(1)}, relaxed ${L.relaxed})`, () => {
      for (const c of L.cards) assert.ok(insideSwarmVolume(vol, c.position, 0), `${c.index} outside: ${c.position}`);
      for (const c of L.cards.filter((x) => x.kind === 'pill')) assert.ok(c.position[2] <= -vol.size[2] / 2 + 0.55 * vol.size[2] + 1e-6, `pill ${c.index} too deep`);
      assert.equal(L.relaxed, 0);
      close(L.minSpacing, defaultMinSpacing(vol, 28), 1e-9, 'default spacing');
      for (let i = 0; i < L.cards.length; i++) for (let j = i + 1; j < L.cards.length; j++) {
        const p = L.cards[i].position, q = L.cards[j].position;
        assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) >= L.minSpacing, `pair ${i}-${j}`);
      }
    });
  }
  await check('sizes / tilt in range: widths in [min, max], aspect in range, pills at the fixed height, |rx|,|ry| <= tilt, |rz| <= 0.3 tilt', () => {
    const L = layoutCardSwarm({ seed: 11, volume: box, kinds, tilt: 12 });
    for (const c of L.cards) {
      const k = kinds.find((x) => x.kind === c.kind);
      assert.ok(c.width >= k.width[0] - 1e-3 && c.width <= k.width[1] + 1e-3);
      if (c.kind === 'pill') assert.equal(c.height, 58);
      else { const a = c.height / c.width; assert.ok(a >= 0.6 - 1e-3 && a <= 0.78 + 1e-3, `aspect ${a}`); }
      assert.ok(Math.abs(c.rotation[0]) <= 12 && Math.abs(c.rotation[1]) <= 12 && Math.abs(c.rotation[2]) <= 3.6 + 1e-9);
    }
  });
  await check('bounded attempts: an impossible spacing still terminates (best-candidate fallback, counted in relaxed), centres stay inside', () => {
    const L = layoutCardSwarm({ seed: 1, volume: box, kinds, minSpacing: 5000, maxAttempts: 10 });
    assert.equal(L.cards.length, 28);
    assert.equal(L.relaxed, 27);
    for (const c of L.cards) assert.ok(insideSwarmVolume(box, c.position, 0));
    assert.throws(() => layoutCardSwarm({ seed: 1, volume: { ...box, shape: 'sphere' }, kinds }), /box.*ellipsoid/);
    assert.throws(() => layoutCardSwarm({ seed: 1, volume: box, kinds: [{ kind: 'card', count: 500, width: [1, 2], aspect: [1, 1] }] }), /at most 200/);
  });
  await check('swarmWorldPoint = the cluster composeModel order (Ry . Rx): yaw 90 maps local +x to -z, pitch 90 maps +y to +z', () => {
    const p = swarmWorldPoint([0, 0, 0], [100, 0, 0], 90);
    close(p[0], 0, 1e-9, 'x'); close(p[2], -100, 1e-9, 'z');
    const q = swarmWorldPoint([10, 20, 30], [0, 100, 0], 0, 90);
    close(q[1], 20, 1e-9, 'y'); close(q[2], 130, 1e-9, 'z');
  });

  // ---------------------------------------------------------------- the agent action on the real stores
  const ed = () => useEditorStore.getState();
  // A fresh 1920 x 1080, 90-frame comp (the r10 S10 shot is 87 frames).
  ed()._setComposition({ ...ed().composition, layers: [], tracks: [], settings: { ...ed().composition.settings, width: 1920, height: 1080, frameRate: 30, durationFrames: 90 } });
  const plainBg = createRectangleLayer('bg', 960, 540, 1920, 1080, [0.04, 0.04, 0.05, 1], 90);
  ed().applyLayerEdits('bg', { add: [plainBg] });
  const before = compJson();
  const depth0 = useHistoryStore.getState().undoStack?.length ?? null;
  const args = { count: 16, seed: 42, volume: { center: [960, 540, 540], size: [2100, 1150, 1080] }, cluster: { yawFrom: -20, yawTo: 15, startFrame: 0, endFrame: 31, ease: [0.42, 0, 0.58, 1] }, options: { pills: 12 }, name: 'S10 swarm' };
  const res = await run('agent.addCardSwarm', args);
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 600));
  const out = res.result;
  const after = compJson();
  const layers = ed().composition.layers;
  const byId = new Map(layers.map((l) => [l.id, l]));
  const cluster = byId.get(out.clusterId);
  await check(`agent.addCardSwarm: ${out.cardIds.length} cards + pills (${out.layerCount} layers incl. decals) under one cluster, returned ids resolve`, () => {
    assert.equal(out.cardIds.length, 28);
    assert.equal(out.items.filter((i) => i.kind === 'card').length, 16);
    assert.equal(out.items.filter((i) => i.kind === 'pill').length, 12);
    assert.equal(out.layerCount, 1 + 16 * 4 + 12 * 2);
    assert.equal(layers.length, 1 + out.layerCount);
    for (const id of [out.clusterId, ...out.cardIds, ...out.items.flatMap((i) => i.partIds)]) assert.ok(byId.has(id), id);
    assert.equal(out.layout.relaxed, 0);
  });
  await check('layers are 3D: the cluster is a 3D group flagged orbitChildren, every card is 3D and parented to it, every decal is 3D, parented to its card and sortWithParent', () => {
    assert.equal(cluster.type, 'group');
    assert.equal(cluster.is3D, true);
    assert.equal(cluster.orbitChildren, true);
    close(evaluateNumber(cluster.transform.positionZ, 0), 540, 1e-9, 'cluster z');
    for (const it of out.items) {
      const c = byId.get(it.id);
      assert.equal(c.is3D, true); assert.equal(c.parentId, out.clusterId);
      assert.ok(c.transform.positionZ && c.transform.rotationX && c.transform.rotationY);
      close(evaluateNumber(c.transform.positionZ, 0), it.position[2], 1e-9, 'card z');
      for (const pid of it.partIds) { const d = byId.get(pid); assert.equal(d.is3D, true); assert.equal(d.parentId, it.id); assert.equal(d.sortWithParent, true); }
    }
    // Stack order: each decal sits ABOVE its card (it draws after it at the same sort depth).
    const order = ed().composition.tracks.slice().sort((x, y) => y.order - x.order).map((t) => t.id);
    const rank = (id) => order.indexOf(byId.get(id).trackId);
    for (const it of out.items) for (const pid of it.partIds) assert.ok(rank(pid) > rank(it.id), 'decal above card');
  });
  await check(`cluster yaw keys as requested: -20 deg at f0 -> 15 deg at f31 with the easeInOut bezier (returned ${JSON.stringify(out.cluster)})`, () => {
    const k = cluster.transform.rotationY.keyframes;
    assert.equal(k.length, 2);
    assert.deepEqual([k[0].frame, k[0].value, k[1].frame, k[1].value], [0, -20, 31, 15]);
    close(evaluateNumber(cluster.transform.rotationY, 0), -20, 1e-9, 'f0');
    close(evaluateNumber(cluster.transform.rotationY, 31), 15, 1e-9, 'f31');
    close(evaluateNumber(cluster.transform.rotationY, 15.5), -2.5, 0.05, 'symmetric ease midpoint');
    assert.ok(evaluateNumber(cluster.transform.rotationY, 4) < -20 + 35 * (4 / 31), 'eases in');
    assert.equal(out.cluster.yawAtStart, -20); assert.equal(out.cluster.yawAtEnd, 15);
  });
  await check('the action uses the pure layout: the returned local positions / tilts equal layoutCardSwarm(seed 42)', async () => {
    const L = layoutCardSwarm({ seed: 42, volume: { center: [960, 540, 540], size: [2100, 1150, 1080], shape: 'box' }, kinds: [
      { kind: 'card', count: 16, width: [300, 440], aspect: [0.6, 0.78], depthRange: [0, 1], lightShare: 0.5 },
      { kind: 'pill', count: 12, width: [300, 420], height: 58, depthRange: [0, 0.55] }] });
    assert.deepEqual(out.items.map((i) => i.position), L.cards.map((c) => c.position));
    assert.deepEqual(out.items.map((i) => i.rotation), L.cards.map((c) => c.rotation));
  });

  // Resolver: true 3D orbit + decal depth.
  const comp = ed().composition;
  const ctx = { getComposition: ed().getComposition };
  for (const f of [0, 15, 31]) {
    const rf = resolveFrame(comp, f, ctx);
    const yaw = evaluateNumber(cluster.transform.rotationY, f);
    let worst = 0, worstCorner = 0, decals = 0;
    for (const it of out.items) {
      const rl = rf.layers.find((l) => l.id === it.id);
      assert.ok(rl && rl.worldMatrix && rl.cardMatrix, `card ${it.id} resolves with world + card matrices`);
      const o = transformPoint(rl.worldMatrix, 0, 0, 0);
      const want = swarmWorldPoint([960, 540, 540], it.position, yaw, 0);
      worst = Math.max(worst, Math.hypot(o[0] - want[0], o[1] - want[1], o[2] - want[2]));
      // The renderer's quad corner (local scaled by the resolved scale) through cardMatrix = the RAW world corner.
      const sx = rl.transform.scaleX, sy = rl.transform.scaleY;
      for (const [px, py] of [[-it.width / 2, -it.height / 2], [it.width / 2, it.height / 2]]) {
        const a = transformPoint(rl.cardMatrix, px * sx, py * sy, 0), b = transformPoint(rl.worldMatrix, px, py, 0);
        worstCorner = Math.max(worstCorner, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
      for (const pid of it.partIds) {
        const d = rf.layers.find((l) => l.id === pid);
        assert.ok(d.sortMatrix, 'decal sortMatrix');
        assert.deepEqual(d.sortMatrix, rl.worldMatrix);
        decals++;
      }
    }
    await check(`f${f} (yaw ${yaw.toFixed(2)} deg): every card's world centre = the yaw ORBIT of its layout point about the volume centre (worst ${worst.toExponential(1)} px), cardMatrix corners = world corners (${worstCorner.toExponential(1)}), ${decals} decals sort at their card's depth`, () => {
      assert.ok(worst < 1e-6); assert.ok(worstCorner < 1e-6);
    });
  }
  await check('opt-in only: a 3D layer under a plain 3D parent (no orbitChildren) and a 3D layer without a parent get NO cardMatrix / sortMatrix (resolve unchanged)', () => {
    const parent = createRectangleLayer('p', 400, 300, 100, 100, [1, 1, 1, 1], 90);
    parent.is3D = true; parent.transform.rotationY = createProperty('Y', 'number', 30); parent.transform.positionZ = createProperty('Z', 'number', 0); parent.transform.rotationX = createProperty('X', 'number', 0);
    const child = createRectangleLayer('c', 50, 0, 40, 40, [1, 0, 0, 1], 90);
    child.is3D = true; child.parentId = parent.id; child.sortWithParent = false;
    const solo = createRectangleLayer('s', 700, 300, 40, 40, [0, 1, 0, 1], 90);
    solo.is3D = true;
    const c2 = { ...comp, layers: [parent, child, solo] };
    const rf = resolveFrame(c2, 0, ctx);
    for (const rl of rf.layers) { assert.ok(rl.worldMatrix); assert.equal(rl.cardMatrix, undefined); assert.equal(rl.sortMatrix, undefined); }
  });

  // Undo / redo: one step, byte-identical.
  const depth1 = useHistoryStore.getState().undoStack?.length ?? null;
  await check(`one undo step${depth0 === null ? '' : ` (history ${depth0} -> ${depth1})`}: undo restores the composition byte-identically, redo brings the same swarm back`, async () => {
    if (depth0 !== null) assert.equal(depth1, depth0 + 1);
    const u = await run('history.undo', {});
    assert.equal(u.ok, true);
    assert.equal(compJson(), before);
    await run('history.redo', {});
    assert.equal(compJson(), after);
    await run('history.undo', {});
    assert.equal(compJson(), before);
  });

  // Layer sources: two shapes cycled as cards, sized to the card width, hidden; undo restores them.
  const s1 = createRectangleLayer('src A', 300, 300, 400, 300, [1, 0, 0, 1], 90);
  const s2 = createRectangleLayer('src B', 600, 300, 200, 200, [0, 0, 1, 1], 90);
  ed().applyLayerEdits('sources', { add: [s1, s2] });
  const beforeSrc = compJson();
  const rs = await run('agent.addCardSwarm', { count: 5, seed: 3, sources: [s1.id, s2.id], options: { cardWidth: [320, 320], detail: 'plain' } });
  assert.equal(rs.ok, true, JSON.stringify(rs).slice(0, 600));
  await check(`sources: 5 cards cycle src A / src B (duplicated, scale = 320 / natural width, aspect kept), no pills, sources hidden (${rs.result.hiddenSourceIds.length})`, () => {
    const L = ed().composition.layers;
    const items = rs.result.items;
    assert.equal(items.length, 5);
    assert.deepEqual(items.map((i) => i.source), [s1.id, s2.id, s1.id, s2.id, s1.id]);
    for (const it of items) {
      const l = L.find((x) => x.id === it.id);
      assert.notEqual(l.id, it.source);
      const natW = it.source === s1.id ? 400 : 200;
      close(l.transform.scale.defaultValue[0], 320 / natW, 1e-4, 'scale');
      assert.equal(it.height, it.source === s1.id ? 240 : 320);
      assert.equal(l.shape.fillColor[it.source === s1.id ? 0 : 2], 1);
      assert.equal(l.is3D, true); assert.equal(l.parentId, rs.result.clusterId);
    }
    // Animatable ids are fresh on the copies.
    const srcIds = new Set([s1, s2].flatMap((s) => [s.transform.opacity.id, s.shape.width.id]));
    for (const it of items) { const l = L.find((x) => x.id === it.id); assert.ok(!srcIds.has(l.shape.width.id)); }
    assert.deepEqual(rs.result.hiddenSourceIds.sort(), [s1.id, s2.id].sort());
    assert.equal(L.find((x) => x.id === s1.id).visible, false);
  });
  await check('sources: undo restores the sources visible and the composition byte-identically', async () => {
    await run('history.undo', {});
    assert.equal(compJson(), beforeSrc);
  });

  await check('bad arguments throw with a hint and change nothing (volume shape, sources, both counts 0)', async () => {
    const snap = compJson();
    for (const bad of [{ volume: { shape: 'sphere' } }, { sources: ['nope'] }, { count: 0, options: { pills: 0 } }, { cluster: { yawFrom: 0, yawTo: 10, startFrame: 10, endFrame: 5 } }]) {
      const r = await run('agent.addCardSwarm', bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.ok(String(r.error).length > 10);
    }
    assert.equal(compJson(), snap);
  });

  await check('the same call again reproduces the swarm (positions, tilts, sizes, variants); save / load: validateComposition keeps the 3D cluster (orbitChildren, positionZ, yaw keys), the 3D cards and the decal flags', async () => {
    await run('history.redo', {});
    const c = ed().composition;
    const v = validateComposition(JSON.parse(JSON.stringify(c)));
    const comp2 = v.composition ?? v;
    const L2 = new Map(comp2.layers.map((l) => [l.id, l]));
    const g = L2.get(rs.result.clusterId);
    assert.equal(g.is3D, true); assert.equal(g.orbitChildren, true);
    for (const it of rs.result.items) { const l = L2.get(it.id); assert.equal(l.is3D, true); assert.equal(l.parentId, g.id); }
    // And the S10 swarm decals: redo the first swarm on top and round-trip it too.
    await run('history.undo', {});
    await run('history.undo', {});
    await run('history.redo', {});
    const r1 = await run('agent.addCardSwarm', args);
    assert.equal(r1.ok, true);
    // The same call again (new ids) reproduces the same swarm: positions, tilts, sizes, variants.
    const strip = (items) => items.map((i) => [i.kind, i.position, i.rotation, i.width, i.height, i.variant]);
    assert.deepEqual(strip(r1.result.items), strip(out.items));
    const c3 = validateComposition(JSON.parse(JSON.stringify(ed().composition)));
    const L3 = new Map((c3.composition ?? c3).layers.map((l) => [l.id, l]));
    const g3 = L3.get(r1.result.clusterId);
    assert.equal(g3.transform.rotationY.keyframes.length, 2);
    for (const it of r1.result.items) for (const pid of it.partIds) assert.equal(L3.get(pid).sortWithParent, true);
  });

  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks:`, e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
