// Acceptance harness for the B67 authoring-ergonomics follow-up (B70, B72, the motion-path gap B66 found,
// the r06 hand hotspot, clearer agent errors). Pure node: an esbuild bundle of the real TS modules.
// The browser proof (real store, real renderer, render_frame pixels through the MCP) is gpu:authoring-ergonomics.
//   node scripts/verify-authoring-ergonomics.mjs   (or: npm run verify:authoring-ergonomics)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Browser stand-ins the resolver's imports touch at load (no expressions or real text raster run here).
globalThis.Worker = class { addEventListener() {} removeEventListener() {} terminate() {} postMessage() {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, alphabeticBaseline: -8 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'authoring-ergonomics-verify-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { suggestNames, didYouMean, missingLayerMessage } from './src/agent/suggest';
        export { mirrorSpanLineHeight } from './src/core/textLineHeight';
        export { buildAgentCursor, findCursorRig, cursorIconKindByGeometry, AGENT_HAND_OFFSET } from './src/animation-templates/cursorRig';
        export { placeOnNewTracks, renderOrder } from './src/core/trackPlacement';
        export { planAgentMotionPath } from './src/core/agentMotionPath';
        export { evaluateMotionPathAtFrame } from './src/core/motionPath';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createTextLayer, createRectangleLayer, createKeyframe, uid } from './src/core/factory';
        export { AGENT_ACTIONS } from './src/agent/featureManifest';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  console.log('verify:authoring-ergonomics');

  // ---------------------------------------------------------------- clearer errors
  await check('did-you-mean: mistyped action ids, argument names and enum values get the intended name', () => {
    const ids = m.AGENT_ACTIONS.map((a) => a.id);
    assert.deepEqual(m.suggestNames('agent.setKeyframes', ids).slice(0, 1), ['editor.setKeyframes']);
    assert.deepEqual(m.suggestNames('editor.setKeyframe', ids).slice(0, 1), ['editor.setKeyframes']);
    assert.deepEqual(m.suggestNames('agent.placetext', ids), ['agent.placeText']);
    assert.deepEqual(m.suggestNames('layerID', ['layerId', 'propertyPath', 'keyframes']), ['layerId']);
    assert.deepEqual(m.suggestNames('propertypath', ['layerId', 'propertyPath', 'keyframes']), ['propertyPath']);
    assert.deepEqual(m.suggestNames('pingpong', ['none', 'loop', 'pingPong']), ['pingPong']);
    assert.deepEqual(m.suggestNames('banana', ['layerId', 'propertyPath', 'keyframes']), [], 'nothing close = no hint');
    assert.equal(m.didYouMean('layerID', ['layerId']), ' (did you mean "layerId"?)');
    assert.equal(m.didYouMean('zzz', ['layerId']), '');
  });

  await check('a wrong layer id names the near ids, and a layer NAME passed as an id points at its id', () => {
    const layers = [{ id: 'k3f9a2', name: 'Title' }, { id: 'p0q1r2', name: 'Card' }];
    const byName = m.missingLayerMessage('Title', layers);
    assert.match(byName, /that is a layer NAME: use its id "k3f9a2"/);
    const typo = m.missingLayerMessage('k3f9a3', layers);
    assert.match(typo, /no layer with id "k3f9a3" in the open composition \(2 layers/);
    assert.match(typo, /did you mean "k3f9a2"/);
    // The runtime runs this check up front for every editor.* action whose first param is layerId (these
    // returned ok: true and changed nothing before). Count them so a manifest change shows up here.
    const guarded = m.AGENT_ACTIONS.filter((a) => a.store === 'editor' && a.params[0]?.name === 'layerId').map((a) => a.id);
    assert.ok(guarded.includes('editor.updateLayerProperty') && guarded.includes('editor.setKeyframes') && guarded.includes('editor.addMask'), guarded.join(','));
    assert.ok(guarded.length >= 40, `editor actions guarded: ${guarded.length}`);
  });

  // ---------------------------------------------------------------- B72 lineHeight
  await check('B72: a span lineHeight write reaches the animOverrides.lineHeight the renderer reads (dotted + bracketed)', () => {
    const SET = { width: 1080, height: 1080, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] };
    const t = m.createTextLayer('Grid', 540, 540, SET.durationFrames);
    assert.equal(t.animOverrides.lineHeight.defaultValue, 1.2);
    const a = m.mirrorSpanLineHeight(t, 'content.spans.0.style.lineHeight', 0.9);
    assert.equal(a.animOverrides.lineHeight.defaultValue, 0.9);
    const b = m.mirrorSpanLineHeight(t, 'content.spans[0].style.lineHeight', 1.5);
    assert.equal(b.animOverrides.lineHeight.defaultValue, 1.5);
    // The resolver (the renderer's input) now lays out with it.
    const comp = m.createComposition('c', SET);
    comp.layers = [a];
    const r = m.resolveFrame(comp, 0).layers.find((l) => l.id === t.id);
    assert.equal(r.text.lineHeight, 0.9);
  });

  await check('B72: keyed lineHeight overrides, other paths, other spans and non-text layers are left alone', () => {
    const t = m.createTextLayer('T', 0, 0, 60);
    const keyed = { ...t, animOverrides: { ...t.animOverrides, lineHeight: { ...t.animOverrides.lineHeight, keyframes: [m.createKeyframe(0, 1), m.createKeyframe(30, 2)] } } };
    assert.equal(m.mirrorSpanLineHeight(keyed, 'content.spans.0.style.lineHeight', 0.8), keyed);
    assert.equal(m.mirrorSpanLineHeight(t, 'content.spans.1.style.lineHeight', 0.8), t);
    assert.equal(m.mirrorSpanLineHeight(t, 'content.spans.0.style.fontSize', 80), t);
    assert.equal(m.mirrorSpanLineHeight(t, 'content.spans.0.style.lineHeight', -1), t);
    assert.equal(m.mirrorSpanLineHeight(t, 'content.spans.0.style.lineHeight', 1.2), t, 'same value = no new object');
    const rect = m.createRectangleLayer('R', 0, 0, 10, 10, [1, 1, 1, 1], 60);
    assert.equal(m.mirrorSpanLineHeight(rect, 'content.spans.0.style.lineHeight', 0.8), rect);
  });

  // ---------------------------------------------------------------- B70 cursor rig
  const rig = () => m.buildAgentCursor({ x: 300, y: 400, frame: 10, endFrame: 120 });
  await check('B70: renamed icons are still found (by outline); an unrelated child shape is not taken for an icon', () => {
    const layers = rig();
    const [group, ...icons] = layers;
    const renamed = layers.map((l, i) => (i === 0 ? l : { ...l, name: `Icon ${i}` }));
    const ref = m.findCursorRig(renamed, group.id);
    assert.deepEqual(Object.keys(ref.icons).sort(), ['arrow', 'hand', 'ibeam']);
    for (const kind of ['arrow', 'hand', 'ibeam']) assert.equal(ref.icons[kind].id, icons.find((l) => l.name === kind).id, kind);
    // Found from an icon id too, and a stray child rectangle is ignored.
    const stray = { ...m.createRectangleLayer('hand', 0, 0, 12, 12, [1, 0, 0, 1], 120), parentId: group.id, name: 'Badge' };
    const ref2 = m.findCursorRig([...renamed, stray], icons[0].id);
    assert.equal(ref2.group.id, group.id);
    assert.equal(m.cursorIconKindByGeometry(stray), null);
    // Name still wins when both exist (the original rig names).
    assert.equal(m.findCursorRig(layers, group.id).icons.hand.id, icons.find((l) => l.name === 'hand').id);
  });

  await check('r06 friction: the agent rig hand puts its fingertip on the hotspot (group origin)', () => {
    const hand = rig().find((l) => l.name === 'hand');
    assert.deepEqual(hand.transform.position.defaultValue, m.AGENT_HAND_OFFSET);
    // The fingertip is the top of the index finger: vertices (3, 0) - (6, 0) of the outline.
    const tip = hand.shape.vertices.filter((v) => v.position[1] === 0).map((v) => v.position[0]);
    const tipX = (Math.min(...tip) + Math.max(...tip)) / 2 + hand.transform.position.defaultValue[0];
    const tipY = 0 + hand.transform.position.defaultValue[1];
    assert.deepEqual([tipX, tipY], [0, 0]);
    // The arrow tip and the I-beam centre were already on the origin.
    assert.deepEqual(rig().find((l) => l.name === 'arrow').transform.position.defaultValue, [0, 0]);
  });

  await check('B70: placeOnNewTracks "top" stacks new layers above every track; "below" slots a ripple under its cursor', () => {
    let n = 0;
    const makeTrack = (name, type, order) => ({ id: `t${n++}`, name, type, order, visible: true, locked: false, muted: false, solo: false });
    const bg = { ...m.createRectangleLayer('bg', 0, 0, 10, 10, [1, 1, 1, 1], 120), id: 'bg', trackId: 'T0' };
    const late = { ...m.createRectangleLayer('late bg', 0, 0, 10, 10, [1, 1, 1, 1], 120), id: 'late', trackId: 'T1', inPoint: 60 };
    const tracks = [{ id: 'T0', name: 'a', type: 'shape', order: 1, compressed: true }, { id: 'T1', name: 'b', type: 'shape', order: 0 }];
    const cursor = rig();
    const comp = { layers: [bg, late, ...cursor], tracks, motionPaths: [] };
    const top = m.placeOnNewTracks(comp, cursor.map((l) => l.id), { top: true }, makeTrack, () => 'shape');
    const order = m.renderOrder(top.layers, top.tracks).map((l) => l.id);
    const lastContent = Math.max(order.indexOf('bg'), order.indexOf('late'));
    for (const l of cursor) assert.ok(order.indexOf(l.id) > lastContent, `${l.name} above every content layer: ${order.join(' > ')}`);
    // A click ripple slots between the content and the cursor.
    const ring = { ...m.createRectangleLayer('ripple', 0, 0, 4, 4, [1, 1, 1, 1], 120), id: 'ring' };
    const withRing = m.placeOnNewTracks({ ...top, layers: [...top.layers, ring] }, ['ring'], { belowLayerIds: cursor.map((l) => l.id) }, makeTrack, () => 'shape');
    const o2 = m.renderOrder(withRing.layers, withRing.tracks).map((l) => l.id);
    assert.ok(o2.indexOf('ring') > o2.indexOf('late') && o2.indexOf('ring') < Math.min(...cursor.map((l) => o2.indexOf(l.id))), o2.join(' > '));
    // A magnetic track a layer leaves turns absolute; unknown ids are skipped.
    const moved = m.placeOnNewTracks(comp, ['bg', 'nope'], { top: true }, makeTrack, () => 'shape');
    assert.equal(moved.tracks.find((t) => t.id === 'T0').compressed, false);
    assert.equal(moved.layers.find((l) => l.id === 'bg').inPoint, bg.inPoint);
  });

  // ---------------------------------------------------------------- motion path
  const layer = { id: 'plane', inPoint: 0, outPoint: 91 };
  await check('setMotionPath plan: nodes, auto-smooth, timing; the resolved layer starts on node 0 and lands on the last node', () => {
    const plan = m.planAgentMotionPath(layer, [[100, 800], [540, 300], [980, 800]], { orientToPath: true }, m.uid);
    assert.equal(plan.path.layerId, 'plane');
    assert.equal(plan.path.nodes.length, 3);
    assert.ok(plan.path.nodes.every((nd) => nd.vertexType === 'smooth'), 'auto-smoothed');
    assert.deepEqual([plan.startFrame, plan.endFrame], [0, 90]);
    assert.ok(plan.length > 1300, `length ${plan.length}`);
    const s = m.evaluateMotionPathAtFrame(plan.path, 0).position;
    const e = m.evaluateMotionPathAtFrame(plan.path, 90).position;
    assert.deepEqual(s.map(Math.round), [100, 800]);
    assert.deepEqual(e.map(Math.round), [980, 800]);
    // Through the real resolver: the path position replaces the layer position, orient sets rotation.
    const SET = { width: 1080, height: 1080, frameRate: 30, durationFrames: 91, backgroundColor: [0, 0, 0, 1] };
    const comp = m.createComposition('c', SET);
    const r = { ...m.createRectangleLayer('plane', 0, 0, 40, 20, [1, 1, 1, 1], 91), id: 'plane' };
    comp.layers = [r];
    comp.motionPaths = [plan.path];
    const mid = m.resolveFrame(comp, 45).layers.find((l) => l.id === 'plane').transform;
    assert.ok(Math.abs(mid.positionX - 540) < 2 && Math.abs(mid.positionY - 300) < 40, `mid ${mid.positionX}, ${mid.positionY}`);
    const early = m.resolveFrame(comp, 10).layers.find((l) => l.id === 'plane').transform;
    assert.ok(early.rotation < -10, `orientToPath climbs: ${early.rotation}`);
  });

  await check('setMotionPath plan: explicit handles kept, smooth:false = corners, ease alias, re-run keeps the path id', () => {
    const plan = m.planAgentMotionPath(layer, [{ x: 0, y: 0, out: [100, 0] }, { x: 200, y: 200, in: [0, -100] }, [400, 0]], { ease: 'easeInOutCubic', startFrame: 10, endFrame: 40, loop: 'pingPong' }, m.uid);
    assert.deepEqual(plan.path.nodes[0].handleOut, [100, 0]);
    assert.deepEqual(plan.path.nodes[1].handleIn, [0, -100]);
    assert.equal(plan.path.nodes[2].vertexType, 'corner', 'mixed list: handle-less nodes stay as written unless smooth: true');
    assert.equal(plan.path.loop, 'pingPong');
    assert.deepEqual(plan.path.progress.keyframes.map((k) => [k.frame, k.value]), [[10, 0], [40, 100]]);
    assert.equal(plan.path.progress.keyframes[0].easing, 'cubicInOut');
    const corners = m.planAgentMotionPath(layer, [[0, 0], [100, 100]], { smooth: false }, m.uid);
    assert.ok(corners.path.nodes.every((nd) => nd.vertexType === 'corner'));
    const again = m.planAgentMotionPath(layer, [[5, 5], [6, 6]], undefined, m.uid, plan.path);
    assert.equal(again.path.id, plan.path.id);
  });

  await check('setMotionPath plan: bad input fails with the exact field', () => {
    const bad = (nodes, opts, re) => assert.throws(() => m.planAgentMotionPath(layer, nodes, opts, m.uid), re);
    bad([[0, 0]], undefined, /at least 2 nodes/);
    bad('x', undefined, /"nodes" must be an array/);
    bad([[0, 0], { x: 1 }], undefined, /nodes\[1\] needs x and y/);
    bad([[0, 0], { x: 1, y: 2, in: 5 }], undefined, /nodes\[1\]\.in must be \[dx, dy\]/);
    bad([[0, 0], [1, 1]], { loop: 'forever' }, /"loop" must be one of none, loop, pingPong/);
    bad([[0, 0], [1, 1]], { ease: 'wobbly' }, /"ease": unknown ease/);
    bad([[0, 0], [1, 1]], { startFrame: 30, endFrame: 30 }, /must be after startFrame/);
    bad([[0, 0], [1, 1]], { orient: true }, /unknown option\(s\) orient/);
  });

  console.log(`\n${passed} checks passed.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
