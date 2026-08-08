// Acceptance harness for the 2.5D camera + 3D-layer world-matrix math (M1). Pure → verifiable here.
//   node scripts/verify-camera3d.mjs   (or: npm run verify:camera3d)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cam3d-verify-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// Project a world point through a resolved camera → NDC (after perspective divide).
function projectNDC(cam, x, y, z, transformPoint) {
  const c = transformPoint(cam.viewProjection, x, y, z);
  return [c[0] / c[3], c[1] / c[3], c[2] / c[3], c[3]];
}

try {
  await build({ entryPoints: ['src/core/camera3d.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const m = await import(pathToFileURL(outfile).href);
  // Re-bundle mat4 separately for transformPoint (camera3d only re-exports its own API).
  const mfile = join(tmp, 'mat4bundle.mjs');
  await build({ entryPoints: ['src/core/mat4.ts'], bundle: true, format: 'esm', platform: 'node', outfile: mfile, logLevel: 'silent' });
  const { transformPoint } = await import(pathToFileURL(mfile).href);

  const { defaultCamera, cameraFromParams, fovYForZoom, zoomForFovY, localModelMatrix, composeWorldMatrix, forwardVector, mvp, cameraSpaceDepth, painterOrder } = m;

  console.log('2.5D camera + world-matrix core — acceptance\n');

  const W = 1920, H = 1080;

  check('default camera frames the comp 1:1 at z=0 (top/side edges → NDC ±1)', () => {
    const cam = defaultCamera(W, H);
    // top-center edge of the comp plane
    const top = projectNDC(cam, W / 2, H / 2 + H / 2, 0, transformPoint);
    assert.ok(near(top[0], 0, 1e-4), 'centered in x');
    assert.ok(near(Math.abs(top[1]), 1, 1e-4), `top edge maps to |ndc.y|=1 (got ${top[1]})`);
    // right-center edge
    const right = projectNDC(cam, W / 2 + W / 2, H / 2, 0, transformPoint);
    assert.ok(near(Math.abs(right[0]), 1, 1e-4), `right edge maps to |ndc.x|=1 (got ${right[0]})`);
  });

  check('default camera is 1:1 for ANY zoom (parity — no jump when a lone layer goes 3D)', () => {
    for (const zoom of [400, H, 2500, 6000]) {
      const cam = cameraFromParams({ eye: [W / 2, H / 2, -zoom], target: [W / 2, H / 2, 0], zoom, compW: W, compH: H });
      const top = projectNDC(cam, W / 2, H, 0, transformPoint);
      assert.ok(near(Math.abs(top[1]), 1, 1e-4), `zoom=${zoom} keeps top edge at |ndc.y|=1`);
    }
  });

  check('a card pushed to +Z projects smaller (perspective foreshortening)', () => {
    const cam = defaultCamera(W, H);
    const atZero = projectNDC(cam, W / 2 + W / 2, H / 2, 0, transformPoint);
    const farther = projectNDC(cam, W / 2 + W / 2, H / 2, H, transformPoint); // z = +H (farther)
    assert.ok(Math.abs(farther[0]) < Math.abs(atZero[0]), 'farther card is nearer to center (smaller)');
    // and a card pulled toward the camera (−Z) projects larger
    const closer = projectNDC(cam, W / 2 + W / 2, H / 2, -H / 2, transformPoint);
    assert.ok(Math.abs(closer[0]) > Math.abs(atZero[0]), 'closer card is larger');
  });

  check('fovYForZoom / zoomForFovY are inverses', () => {
    const fov = fovYForZoom(H, H);
    assert.ok(near(zoomForFovY(fov, H), H, 1e-6));
    assert.ok(near(fovYForZoom(zoomForFovY(0.8, H), H), 0.8, 1e-9));
  });

  check('two-node camera looks at its Point of Interest (POI → screen center)', () => {
    const poi = [300, 800, 0];
    const cam = cameraFromParams({ eye: [1000, 200, -1500], target: poi, zoom: H, compW: W, compH: H });
    const c = projectNDC(cam, poi[0], poi[1], poi[2], transformPoint);
    assert.ok(near(c[0], 0, 1e-4) && near(c[1], 0, 1e-4), 'POI is centered in the frame');
  });

  check('one-node forward vector: identity orientation looks down +Z', () => {
    const f = forwardVector(0, 0, 0);
    assert.ok(near(f[0], 0) && near(f[1], 0) && near(f[2], 1), 'forward = +Z');
    // 90° yaw (Y rotation) turns the look direction toward +X
    const y90 = forwardVector(0, 90, 0);
    assert.ok(near(Math.abs(y90[0]), 1, 1e-9) && near(y90[2], 0, 1e-9), 'yaw 90° → look along X');
  });

  check('localModelMatrix places an anchored card: anchor maps to position', () => {
    const t = { positionX: 500, positionY: 300, positionZ: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, anchorX: 50, anchorY: 20, opacity: 1 };
    const world = localModelMatrix(t);
    const p = transformPoint(world, 50, 20, 0); // the anchor point
    assert.ok(near(p[0], 500, 1e-9) && near(p[1], 300, 1e-9), 'anchor lands on position');
  });

  check('world matrix composes down the parent chain (child inherits parent Z translate)', () => {
    const ident = { positionX: 0, positionY: 0, positionZ: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 };
    const parent = localModelMatrix({ ...ident, positionZ: 100 });
    const child = localModelMatrix({ ...ident, positionX: 40 });
    const world = composeWorldMatrix([parent, child]); // root → leaf
    const p = transformPoint(world, 0, 0, 0);
    assert.ok(near(p[0], 40, 1e-9) && near(p[2], 100, 1e-9), 'child sits at parent Z + own X');
  });

  check('composeWorldMatrix of a single node equals its local matrix', () => {
    const t = { positionX: 12, positionY: -7, positionZ: 3, rotation: 30, rotationX: 0, rotationY: 0, scaleX: 2, scaleY: 2, anchorX: 0, anchorY: 0, opacity: 1 };
    const a = localModelMatrix(t);
    const b = composeWorldMatrix([a]);
    assert.ok(a.every((v, i) => near(v, b[i], 1e-12)));
  });

  // ---- M2: MVP + painter's depth sort ----
  const ident16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  check('mvp(camera, identity) equals the camera viewProjection', () => {
    const cam = defaultCamera(W, H);
    const got = mvp(cam, ident16);
    assert.ok(got.every((v, i) => near(v, cam.viewProjection[i], 1e-9)));
  });

  check('cameraSpaceDepth: farther card (+Z) is more negative than a nearer one', () => {
    const cam = defaultCamera(W, H);
    const near0 = cameraSpaceDepth(cam, localModelMatrix({ positionX: W / 2, positionY: H / 2, positionZ: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 }));
    const far = cameraSpaceDepth(cam, localModelMatrix({ positionX: W / 2, positionY: H / 2, positionZ: 500, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 }));
    assert.ok(far < near0, `farther is more negative (near=${near0}, far=${far})`);
  });

  check('painterOrder sorts a pure-3D run far→near', () => {
    // depths: index0 near(-100), 1 far(-900), 2 mid(-500) → order far,mid,near = [1,2,0]
    const order = painterOrder([
      { is3D: true, depth: -100 },
      { is3D: true, depth: -900 },
      { is3D: true, depth: -500 },
    ]);
    assert.deepEqual(order, [1, 2, 0]);
  });

  check('painterOrder: 2D layers pin position and split 3D runs (AE model)', () => {
    // [3D -100, 2D, 3D -500, 3D -900] → run0=[0] stays; 2D at 1 pinned; run1=[2,3] far→near = [3,2]
    const order = painterOrder([
      { is3D: true, depth: -100 },
      { is3D: false, depth: 0 },
      { is3D: true, depth: -500 },
      { is3D: true, depth: -900 },
    ]);
    assert.deepEqual(order, [0, 1, 3, 2]);
  });

  check('painterOrder is stable for equal depths and identity for all-2D', () => {
    assert.deepEqual(painterOrder([{ is3D: true, depth: -5 }, { is3D: true, depth: -5 }]), [0, 1]);
    assert.deepEqual(painterOrder([{ is3D: false, depth: 0 }, { is3D: false, depth: 0 }, { is3D: false, depth: 0 }]), [0, 1, 2]);
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
