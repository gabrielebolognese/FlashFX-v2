// Acceptance harness for the pure anchor-point / pivot math (src/core/anchor.ts). Bundles the real
// TS with esbuild + asserts with node:assert. Run: node scripts/verify-anchor.mjs
//
// The load-bearing guarantees: (1) anchor [0,0] is byte-identical to the pre-anchor behaviour, and
// (2) the compensated pair fed to the FIXED render affine reproduces the After Effects pivot
// `world = position + R·S·(u − a)` - rotation AND scale about the anchor, anchor sitting at position.

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'anchor-verify-'));
const outfile = join(tmp, 'anchor.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  [pass] ${name}`); }

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);
const rad = (d) => (d * Math.PI) / 180;
// The AE target world position of a local (centre-relative, unscaled) point u.
function aeWorld(u, pos, a, sx, sy, rotDeg) {
  const r = rad(rotDeg);
  const c = Math.cos(r), s = Math.sin(r);
  const px = sx * (u[0] - a[0]);          // S·(u − a)
  const py = sy * (u[1] - a[1]);
  return [pos[0] + (px * c - py * s), pos[1] + (px * s + py * c)]; // pos + R·S·(u − a)
}
// The FIXED render/overlay affine, fed a compensated transform: world = pos_in + R·(S·u − anc_in) + anc_in.
function shaderWorld(u, t) {
  const r = rad(t.rotation);
  const c = Math.cos(r), s = Math.sin(r);
  const relx = t.scaleX * u[0] - t.anchorX;
  const rely = t.scaleY * u[1] - t.anchorY;
  return [
    (relx * c - rely * s) + t.anchorX + t.positionX,
    (relx * s + rely * c) + t.anchorY + t.positionY,
  ];
}
const baseT = (over) => ({
  positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1,
  anchorX: 0, anchorY: 0, opacity: 1, positionZ: 0, rotationX: 0, rotationY: 0, ...over,
});

try {
  await build({ entryPoints: ['src/core/anchor.ts'], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  const { applyPivotCompensation, contentCenterOffset, compensatePosition, compDeltaToAnchorDelta } =
    await import(pathToFileURL(outfile).href);

  check('anchor [0,0] is a pass-through (byte-identical to pre-anchor behaviour)', () => {
    const t = baseT({ positionX: 640, positionY: 360, rotation: 30, scaleX: 2, scaleY: 0.5 });
    const out = applyPivotCompensation(t);
    assert.equal(out, t); // same reference - no allocation, no change
  });

  check('compensated pair is anchor_in = S·a, position_in = position − S·a', () => {
    const t = baseT({ positionX: 100, positionY: 200, scaleX: 2, scaleY: 3, anchorX: 10, anchorY: -4 });
    const out = applyPivotCompensation(t);
    near(out.anchorX, 20); near(out.anchorY, -12);          // S·a
    near(out.positionX, 80); near(out.positionY, 212);      // position − S·a
    // rotation / scale / opacity untouched
    near(out.scaleX, 2); near(out.scaleY, 3); near(out.rotation, 0);
  });

  check('render parity: compensated affine == AE pivot world for many (u, rot, scale, a)', () => {
    const cases = [
      { pos: [640, 360], a: [0, 0], sx: 1, sy: 1, rot: 0 },
      { pos: [640, 360], a: [50, -30], sx: 1, sy: 1, rot: 0 },
      { pos: [100, 100], a: [-80, 40], sx: 2, sy: 0.5, rot: 37 },
      { pos: [0, 0], a: [12, 34], sx: -1.5, sy: 2, rot: -90 },
      { pos: [300, 50], a: [100, 100], sx: 3, sy: 3, rot: 180 },
    ];
    const us = [[0, 0], [100, 0], [-40, 60], [12.5, -7.25]];
    for (const cse of cases) {
      const comp = applyPivotCompensation(baseT({
        positionX: cse.pos[0], positionY: cse.pos[1], scaleX: cse.sx, scaleY: cse.sy,
        rotation: cse.rot, anchorX: cse.a[0], anchorY: cse.a[1],
      }));
      for (const u of us) {
        const want = aeWorld(u, cse.pos, cse.a, cse.sx, cse.sy, cse.rot);
        const got = shaderWorld(u, comp);
        near(got[0], want[0], 1e-6); near(got[1], want[1], 1e-6);
      }
    }
  });

  check('the anchor point (u = a) always renders exactly at position', () => {
    const cse = { pos: [321, 123], a: [45, -67], sx: 1.7, sy: 0.3, rot: 19 };
    const comp = applyPivotCompensation(baseT({
      positionX: cse.pos[0], positionY: cse.pos[1], scaleX: cse.sx, scaleY: cse.sy,
      rotation: cse.rot, anchorX: cse.a[0], anchorY: cse.a[1],
    }));
    const got = shaderWorld(cse.a, comp); // u === a ⇒ world === position
    near(got[0], cse.pos[0], 1e-6); near(got[1], cse.pos[1], 1e-6);
  });

  check('contentCenterOffset: position − offset renders the centre (u=0); [0,0] at anchor 0', () => {
    assert.deepEqual(contentCenterOffset(2, 3, 0, 0, 45), [0, 0]);
    const cse = { pos: [640, 360], a: [60, -20], sx: 2, sy: 1.5, rot: 25 };
    const comp = applyPivotCompensation(baseT({
      positionX: cse.pos[0], positionY: cse.pos[1], scaleX: cse.sx, scaleY: cse.sy,
      rotation: cse.rot, anchorX: cse.a[0], anchorY: cse.a[1],
    }));
    const [ox, oy] = contentCenterOffset(cse.sx, cse.sy, cse.a[0], cse.a[1], cse.rot);
    const center = shaderWorld([0, 0], comp);           // where the centre renders
    near(center[0], cse.pos[0] - ox, 1e-6);
    near(center[1], cse.pos[1] - oy, 1e-6);
  });

  check('compensatePosition keeps the content fixed when the anchor moves', () => {
    const sx = 2, sy = 1.5, rot = 33;
    const pos0 = [500, 250], a0 = [0, 0], a1 = [120, -80];
    const pos1 = compensatePosition(pos0, a0, a1, sx, sy, rot);
    // Content-fixed invariant: the centre (u=0) renders at the same comp point before and after.
    const c0 = shaderWorld([0, 0], applyPivotCompensation(baseT({ positionX: pos0[0], positionY: pos0[1], scaleX: sx, scaleY: sy, rotation: rot, anchorX: a0[0], anchorY: a0[1] })));
    const c1 = shaderWorld([0, 0], applyPivotCompensation(baseT({ positionX: pos1[0], positionY: pos1[1], scaleX: sx, scaleY: sy, rotation: rot, anchorX: a1[0], anchorY: a1[1] })));
    near(c0[0], c1[0], 1e-6); near(c0[1], c1[1], 1e-6);
  });

  check('compDeltaToAnchorDelta inverts the rotate·scale map (round trip)', () => {
    const sx = 2.5, sy = 0.4, rot = 51;
    const anchorDelta = [37, -12];
    // forward: anchor delta -> comp delta is R·S·(Δa); inverse must recover Δa.
    const r = rad(rot), c = Math.cos(r), s = Math.sin(r);
    const fx = sx * anchorDelta[0], fy = sy * anchorDelta[1];
    const compDelta = [fx * c - fy * s, fx * s + fy * c];
    const back = compDeltaToAnchorDelta(compDelta[0], compDelta[1], sx, sy, rot);
    near(back[0], anchorDelta[0], 1e-6); near(back[1], anchorDelta[1], 1e-6);
  });

  console.log(`\nanchor: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
