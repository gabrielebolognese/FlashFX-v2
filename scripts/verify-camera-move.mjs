// Acceptance harness for the B53 agent camera helpers (pure). The real-renderer proof is
// gpu:camera-cards (local, needs a GPU).
//   node scripts/verify-camera-move.mjs   (or: npm run verify:camera-move)
//
// Proves: (1) a fresh camera layer (createCameraLayer / editor.addCameraLayer) frames the comp exactly
// like the default camera (the B53 factory fix: it used to sit at -compH with a 50mm zoom, a ~2.5x
// punch-in the moment a camera was added); (2) planCameraMove keys a beat: start key = the evaluated
// pose at `frame` carrying the ease, end key = the target, keys inside the span dropped, others kept,
// the eased midpoint follows the ease; (3) position z / point-of-interest z / zoom / one-node
// orientation reach the resolved camera; (4) invalid input throws and never mutates the layer.

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };

const tmp = mkdtempSync(join(tmpdir(), 'cammove-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

try {
  const mv = await bundle('src/core/cameraMove.ts');
  const interp = await bundle('src/core/interpolation.ts');
  const factory = await bundle('src/core/factory.ts');
  const cam3d = await bundle('src/core/camera3d.ts');
  const { planCameraMove } = mv;
  const { resolveFrame, evaluateVec2, evaluateNumber } = interp;
  const { createComposition, createCameraLayer, createRectangleLayer } = factory;
  const evalProp = (p, f) => (p.valueType === 'vec2' ? evaluateVec2(p, f) : evaluateNumber(p, f));

  console.log('Agent camera moves (B53) - acceptance\n');
  const W = 1920, H = 1080;
  const compWith = (cam) => { const c = createComposition('c', { width: W, height: H, frameRate: 30, durationFrames: 120, backgroundColor: [0, 0, 0, 1] }); c.layers = [createRectangleLayer('r', 960, 540, 100, 100, [1, 1, 1, 1], 120), cam]; return c; };

  check('a fresh camera layer frames z = 0 at 1:1 (same projection as the default camera)', () => {
    const cam = createCameraLayer('Camera 1', W, H, 120);
    assert.ok(near(cam.transform.positionZ.defaultValue, -cam.camera.zoom.defaultValue), 'eye sits at -zoom');
    const rc = resolveFrame(compWith(cam), 0).camera;
    const dc = cam3d.defaultCamera(W, H);
    // Project comp-plane points through both: identical pixels.
    for (const [x, y] of [[0, 0], [W, H], [300, 700], [W / 2, H / 2]]) {
      const pr = (c) => { const v = c.viewProjection; const cx = v[0] * x + v[4] * y + v[12], cy = v[1] * x + v[5] * y + v[13], cw = v[3] * x + v[7] * y + v[15]; return [cx / cw, cy / cw]; };
      const a = pr(rc), b = pr(dc);
      assert.ok(near(a[0], b[0], 1e-9) && near(a[1], b[1], 1e-9), `${x},${y}: ${a} vs ${b}`);
    }
  });

  check('a beat with a duration: start key = current pose (carries the ease), end key = target', () => {
    const cam = createCameraLayer('c', W, H, 120);
    const z0 = cam.transform.positionZ.defaultValue;
    const { layer, paths } = planCameraMove(cam, 10, { position: [1100, 500, -1500], zoom: 3000 }, 20, 'cubicOut', evalProp);
    assert.deepEqual(paths, ['transform.position', 'transform.positionZ', 'camera.zoom']);
    const pk = layer.transform.position.keyframes;
    assert.deepEqual(pk.map((k) => k.frame), [10, 30]);
    assert.deepEqual(pk[0].value, [960, 540]);
    assert.deepEqual(pk[1].value, [1100, 500]);
    assert.equal(pk[0].interpolation, 'bezier');
    assert.equal(pk[0].easing, 'cubicOut');
    assert.deepEqual(layer.transform.positionZ.keyframes.map((k) => k.value), [z0, -1500]);
    assert.deepEqual(layer.camera.zoom.keyframes.map((k) => k.value), [cam.camera.zoom.defaultValue, 3000]);
    // eased: past the linear midpoint at the half-way frame (cubicOut front-loads).
    const mid = evaluateNumber(layer.transform.positionZ, 20);
    const lin = z0 + (-1500 - z0) * 0.5;
    assert.ok(Math.abs(mid - z0) > Math.abs(lin - z0), `cubicOut runs ahead of linear at the midpoint (${mid} vs ${lin})`);
    assert.deepEqual(cam.transform.position.keyframes, [], 'input layer not mutated');
  });

  check('chained beats: the second starts from where the first ended; keys inside a span are dropped, others kept', () => {
    let cam = createCameraLayer('c', W, H, 120);
    cam = planCameraMove(cam, 0, { position: [800, 540] }, 30, 'linear', evalProp).layer;
    cam = planCameraMove(cam, 40, { position: [1200, 540] }, 30, [0.42, 0, 0.58, 1], evalProp).layer;
    assert.deepEqual(cam.transform.position.keyframes.map((k) => [k.frame, k.value[0]]), [[0, 960], [30, 800], [40, 800], [70, 1200]]);
    // A new move over 20..50 replaces the keys at 30 and 40 inside it.
    cam = planCameraMove(cam, 20, { position: [500, 540] }, 30, undefined, evalProp).layer;
    assert.deepEqual(cam.transform.position.keyframes.map((k) => k.frame), [0, 20, 50, 70]);
    assert.ok(near(cam.transform.position.keyframes[1].value[0], evaluateVec2(planCameraMove(createCameraLayer('c', W, H, 120), 0, { position: [800, 540] }, 30, 'linear', evalProp).layer.transform.position, 20)[0]));
  });

  check('durationFrames 0 = one key at the frame (a cut-in pose)', () => {
    const cam = createCameraLayer('c', W, H, 120);
    const { layer } = planCameraMove(cam, 45, { zoom: 2000 }, 0, undefined, evalProp);
    assert.deepEqual(layer.camera.zoom.keyframes.map((k) => [k.frame, k.value]), [[45, 2000]]);
  });

  check('point of interest (two-node) and orientation (one-node) reach the resolved camera', () => {
    const cam = createCameraLayer('c', W, H, 120);
    const moved = planCameraMove(cam, 0, { position: [960, 540, -1800], pointOfInterest: [1200, 600, 100] }, 0, undefined, evalProp).layer;
    const rc = resolveFrame(compWith(moved), 0).camera;
    assert.deepEqual(rc.eye, [960, 540, -1800]);
    assert.deepEqual(rc.target, [1200, 600, 100]);
    const one = createCameraLayer('c', W, H, 120);
    one.camera.mode = 'one-node';
    const aimed = planCameraMove(one, 0, { orientation: [0, 20, 0] }, 0, undefined, evalProp).layer;
    const r1 = resolveFrame(compWith(aimed), 0).camera;
    const d = [r1.target[0] - r1.eye[0], r1.target[2] - r1.eye[2]];
    assert.ok(near(Math.atan2(d[0], d[1]) * 180 / Math.PI, 20, 1e-6), 'one-node aim yaw 20 deg');
  });

  check('invalid input throws and applies nothing', () => {
    const cam = createCameraLayer('c', W, H, 120);
    const before = JSON.stringify(cam);
    const bad = [
      [cam, 0, {}, 10, undefined],
      [cam, 0, { position: [1, 2, 3, 4] }, 10, undefined],
      [cam, 0, { zoom: -5 }, 10, undefined],
      [cam, 0, { orientation: [0, 10, 0] }, 10, undefined], // two-node camera
      [cam, 0, { position: [1, 2] }, -3, undefined],
      [cam, 0, { position: [1, 2] }, 10, 'wobble'],
      [cam, 0, { pan: [1, 2] }, 10, undefined],
      [cam, NaN, { position: [1, 2] }, 10, undefined],
      [createRectangleLayer('r', 0, 0, 10, 10, [1, 1, 1, 1], 30), 0, { zoom: 100 }, 0, undefined],
    ];
    for (const args of bad) assert.throws(() => planCameraMove(...args, evalProp), undefined, JSON.stringify(args.slice(1)));
    const one = createCameraLayer('c', W, H, 120); one.camera.mode = 'one-node';
    assert.throws(() => planCameraMove(one, 0, { pointOfInterest: [1, 2] }, 0, undefined, evalProp), /two-node/);
    assert.equal(JSON.stringify(cam), before);
  });

  console.log(`\n✅ ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
