// Acceptance harness for B66: motion blur from parent transforms. A layer moved / zoomed / turned by a parent
// (or grand-parent) null must get the same motion-blur descriptor as an unparented twin whose OWN keys produce
// the same world motion, because the renderer's blur pass only sees that descriptor. Also covers the three
// parent-chain gaps B66 closed: the child's first frame (blur samples before the in-point), a parent's own
// motion path, and a parent's own expressions (the chain used to evaluate them with the child's context).
// Pure node (esbuild bundle of the real TS); the GPU proof is gpu:parent-blur (render_frame via the MCP).
//   node scripts/verify-parent-blur.mjs   (or: npm run verify:parent-blur)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Expression worker stand-in: evaluates the code with `value` / `frame` / `time` in scope and answers on the
// next macrotask, like the real worker. Lets the harness drive the real ExpressionManager + resolver glue.
globalThis.Worker = class {
  constructor() { this.listeners = []; }
  addEventListener(type, fn) { if (type === 'message') this.listeners.push(fn); }
  removeEventListener() {}
  terminate() {}
  postMessage(msg) {
    if (msg.type !== 'eval') return;
    const { value, frame, time } = msg.context;
    const out = new Function('value', 'frame', 'time', `return (${msg.code});`)(value, frame, time);
    setTimeout(() => { for (const fn of this.listeners) fn({ data: { type: 'eval-result', id: msg.id, value: out } }); }, 0);
  }
};
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'parent-blur-verify-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1080, height: 1920, frameRate: 60, durationFrames: 120, backgroundColor: [0, 0, 0, 1] };
const tick = () => new Promise((r) => setTimeout(r, 5));

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createKeyframe, createProperty } from './src/core/factory';
        export { useExpressionStore } from './src/expressions/store';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { resolveFrame, createComposition, createRectangleLayer, createKeyframe, createProperty, useExpressionStore } = await import(pathToFileURL(outfile).href);

  console.log('verify:parent-blur');
  const CLEAR = [0, 0, 0, 0]; const RED = [1, 0, 0, 1];
  const rect = (id, x, y, w = 200, h = 80, color = RED) => { const l = createRectangleLayer(id, x, y, w, h, color, SETTINGS.durationFrames); l.id = id; l.inPoint = 0; return l; };
  const nul = (id, x, y) => rect(id, x, y, 4, 4, CLEAR);
  const keys = (prop, list) => { prop.keyframes = list.map(([f, v]) => createKeyframe(f, v)); };
  const at = (comp, f, id) => resolveFrame(comp, f).layers.find((l) => l.id === id);
  const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
  const sameBlur = (a, b, eps, label) => {
    assert.ok(a && b, `${label}: both blurred (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
    for (const k of ['shutter', 'phase', 'pivotX', 'pivotY', 'vx', 'vy', 'omega', 'scaleRateX', 'scaleRateY']) near(a[k], b[k], eps, `${label}.${k}`);
  };
  /** A twin keyed on EVERY frame with the child's resolved world transform (linear keys): same world motion, no parent. */
  const perFrameTwin = (comp, childId, frames) => {
    const tw = rect('twin', 0, 0); tw.motionBlur = true;
    const pos = []; const sc = []; const rot = [];
    for (const f of frames) {
      const t = at(comp, f, childId).transform;
      pos.push([f, [t.positionX, t.positionY]]); sc.push([f, [t.scaleX, t.scaleY]]); rot.push([f, t.rotation]);
    }
    keys(tw.transform.position, pos); keys(tw.transform.scale, sc); keys(tw.transform.rotation, rot);
    return tw;
  };

  await check('1. zoom from a parent null = the same zoom keyed on the layer (r02 S1 rig: exit > slide > zoom > text)', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const exitN = nul('exit', 548, 900);
    const slideN = nul('slide', 0, 0); slideN.parentId = 'exit'; slideN.transform.position.defaultValue = [-15, 0];
    const zoomN = nul('zoom', 0, 0); zoomN.parentId = 'slide';
    keys(zoomN.transform.scale, [[5, [5.2, 5.2]], [60, [1, 1]]]);
    const child = rect('child', 0, 0); child.parentId = 'zoom'; child.motionBlur = true; child.inPoint = 5;
    const twin = rect('twin', 533, 900); twin.motionBlur = true; twin.inPoint = 5;
    keys(twin.transform.scale, [[5, [5.2, 5.2]], [60, [1, 1]]]);
    comp.layers = [exitN, slideN, zoomN, child, twin];
    let blurred = 0;
    for (let f = 6; f <= 30; f++) {
      const a = at(comp, f, 'child'); const b = at(comp, f, 'twin');
      assert.deepEqual(a.transform, b.transform, `f${f} transform`);
      assert.deepEqual(a.motionBlur, b.motionBlur, `f${f} blur`);
      if (a.motionBlur) blurred++;
    }
    assert.equal(blurred, 25, 'every zoom frame blurs');
    assert.ok(at(comp, 6, 'child').motionBlur.scaleRateX < -0.01, 'f6 zoom smear is a real scale rate');
  });

  await check('2. offset child under a parent that moves, scales and turns = per-frame twin (blur from world motion)', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const p = nul('p', 540, 960);
    keys(p.transform.position, [[0, [300, 900]], [40, [800, 1000]]]);
    keys(p.transform.scale, [[0, [2, 2]], [40, [0.8, 0.8]]]);
    keys(p.transform.rotation, [[0, -30], [40, 45]]);
    const child = rect('child', 0, 0); child.parentId = 'p'; child.transform.position.defaultValue = [150, -60]; child.motionBlur = true;
    comp.layers = [p, child];
    const twin = perFrameTwin(comp, 'child', Array.from({ length: 41 }, (_, i) => i));
    comp.layers = [p, child, twin];
    for (const f of [1, 5, 12, 20, 33, 40]) {
      const a = at(comp, f, 'child'); const b = at(comp, f, 'twin');
      sameBlur(a.motionBlur, b.motionBlur, 1e-6, `f${f}`);
      assert.ok(Math.abs(a.motionBlur.omega) > 1e-3 && Math.abs(a.motionBlur.vx) > 1, `f${f} the child inherits the turn and the travel`);
    }
  });

  await check('3. only the grand-parent moves: the grandchild still blurs, identical to its twin', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const g = nul('g', 540, 960); keys(g.transform.position, [[10, [100, 960]], [20, [1000, 960]]]);
    const p = nul('p', 0, 0); p.parentId = 'g'; p.transform.scale.defaultValue = [1.5, 1.5];
    const child = rect('child', 0, 0); child.parentId = 'p'; child.transform.position.defaultValue = [40, 0]; child.motionBlur = true;
    comp.layers = [g, p, child];
    const twin = perFrameTwin(comp, 'child', Array.from({ length: 31 }, (_, i) => i));
    comp.layers = [g, p, child, twin];
    const a = at(comp, 15, 'child'); const b = at(comp, 15, 'twin');
    sameBlur(a.motionBlur, b.motionBlur, 1e-6, 'f15');
    near(a.motionBlur.vx, 90, 1e-6, 'whip velocity (900 px over 10 frames)');
    assert.equal(at(comp, 25, 'child').motionBlur, undefined, 'still after the move: zero-cost path');
  });

  await check('4. first frame: a child that enters while its parent is mid-move smears on its first frame (was sharp)', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const p = nul('p', 540, 960); keys(p.transform.position, [[0, [0, 960]], [30, [1080, 960]]]);
    const child = rect('child', 0, 0); child.parentId = 'p'; child.motionBlur = true; child.inPoint = 10;
    const own = rect('own', 0, 960); own.motionBlur = true; own.inPoint = 10; keys(own.transform.position, [[0, [0, 960]], [30, [1080, 960]]]);
    const still = rect('still', 300, 300); still.motionBlur = true; still.inPoint = 10;
    const keyedAtIn = rect('keyedAtIn', 0, 500); keyedAtIn.motionBlur = true; keyedAtIn.inPoint = 10; keys(keyedAtIn.transform.position, [[10, [0, 500]], [20, [500, 500]]]);
    comp.layers = [p, child, own, still, keyedAtIn];
    const a = at(comp, 10, 'child');
    assert.ok(a.motionBlur, 'child blurs on its first frame');
    near(a.motionBlur.vx, 36, 1e-9, 'first-frame velocity = the parent velocity');
    assert.deepEqual(a.motionBlur, at(comp, 10, 'own').motionBlur, 'same as the same motion keyed on the layer');
    assert.equal(at(comp, 10, 'still').motionBlur, undefined, 'a still layer stays sharp on its first frame');
    assert.equal(at(comp, 10, 'keyedAtIn').motionBlur, undefined, 'motion that starts at the in-point: first frame still sharp');
    assert.ok(at(comp, 11, 'keyedAtIn').motionBlur, '... and blurs from the next frame');
    assert.equal(at(comp, 0, 'own') ? at(comp, 0, 'own').motionBlur : undefined, undefined, 'comp frame 0 has no earlier sample');
  });

  await check('5. a parent on a motion path carries its children (position and blur); orient-to-path turns them', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const p = nul('p', 540, 960);
    const progress = createProperty('Progress', 'number', 0); keys(progress, [[0, 0], [40, 100]]);
    const node = (id, x, y) => ({ id, position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
    comp.motionPaths = [{ id: 'mp', layerId: 'p', nodes: [node('a', 100, 400), node('b', 900, 400)], closed: false, anchor: 'center', customAnchor: [0, 0], orientToPath: false, loop: 'none', progress }];
    const child = rect('child', 0, 0); child.parentId = 'p'; child.transform.position.defaultValue = [0, 100]; child.motionBlur = true;
    comp.layers = [p, child];
    const pw = at(comp, 20, 'p').transform;
    near(pw.positionX, 500, 1e-6, 'parent on its path (x)'); near(pw.positionY, 400, 1e-6, 'parent on its path (y)');
    const c = at(comp, 20, 'child');
    near(c.transform.positionX, 500, 1e-6, 'child follows the path (x)'); near(c.transform.positionY, 500, 1e-6, 'child keeps its offset (y)');
    const pPrev = at(comp, 19, 'p').transform;
    near(c.motionBlur.vx, pw.positionX - pPrev.positionX, 1e-9, 'child blur = the parent path velocity');
    assert.ok(c.motionBlur.vx > 10, 'a real streak');
    comp.motionPaths[0].nodes = [node('a', 100, 400), node('b', 100, 1200)]; comp.motionPaths[0].orientToPath = true;
    const o = at(comp, 20, 'child');
    near(o.transform.rotation, 90, 1e-6, 'orient-to-path turns the child with the parent');
    near(o.transform.positionX, 0, 1e-6, 'the offset turns with the parent (x)');
  });

  await check('6. a parent\'s own expression drives the child; the child\'s expression no longer leaks onto the parent', async () => {
    const comp = createComposition('c', { ...SETTINGS });
    const p = rect('p', 500, 500, 10, 10);
    const child = rect('child', 0, 0); child.parentId = 'p';
    comp.layers = [p, child];
    const store = useExpressionStore.getState();
    store.setExpression('p', 'Position', '[value[0] + 100, value[1]]');
    store.setExpression('child', 'Position', '[value[0], value[1] + 7]');
    try {
    // The real ExpressionManager is asynchronous: the first resolve posts the evaluations, the next one reads them.
    for (let i = 0; i < 4; i++) { resolveFrame(comp, 5); await tick(); }
    const pw = at(comp, 5, 'p').transform; const cw = at(comp, 5, 'child').transform;
    near(pw.positionX, 600, 1e-9, 'parent renders with its expression');
    near(pw.positionY, 500, 1e-9, 'parent y untouched');
    near(cw.positionX, 600, 1e-9, 'child follows the parent\'s expression (was 500: the parent expression was ignored)');
    near(cw.positionY, 507, 1e-9, 'child gets its own +7 once (was 14: applied to the parent too)');
    } finally { store.removeExpression('p', 'Position'); store.removeExpression('child', 'Position'); }
  });

  await check('7. blur off: no descriptor anywhere and transforms unchanged by the blur sampler', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const p = nul('p', 540, 960); keys(p.transform.position, [[0, [0, 960]], [30, [1080, 960]]]);
    const child = rect('child', 0, 0); child.parentId = 'p'; child.inPoint = 10;
    comp.layers = [p, child];
    for (const f of [10, 11, 20]) assert.equal(at(comp, f, 'child').motionBlur, undefined, `f${f}`);
    child.motionBlur = true; const withBlur = at(comp, 15, 'child').transform; child.motionBlur = false;
    assert.deepEqual(at(comp, 15, 'child').transform, withBlur, 'turning blur on does not move the layer');
  });

  await check('8. comp shutter + layer shutter scale parent-driven blur the same way as own motion', () => {
    const comp = createComposition('c', { ...SETTINGS, shutterAngle: 360, shutterPhase: -90 });
    const p = nul('p', 540, 960); keys(p.transform.position, [[0, [0, 960]], [30, [1080, 960]]]);
    const child = rect('child', 0, 0); child.parentId = 'p'; child.motionBlur = true; child.motionBlurShutter = 90;
    const own = rect('own', 0, 960); own.motionBlur = true; own.motionBlurShutter = 90; keys(own.transform.position, [[0, [0, 960]], [30, [1080, 960]]]);
    comp.layers = [p, child, own];
    const a = at(comp, 12, 'child').motionBlur;
    assert.deepEqual(a, at(comp, 12, 'own').motionBlur);
    near(a.shutter, 180, 1e-9, '360 comp x 90/180 layer'); near(a.phase, -0.5, 1e-9, 'phase -90 of 180');
  });

  console.log(`\n✓ verify:parent-blur - ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
