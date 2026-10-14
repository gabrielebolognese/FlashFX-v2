// Acceptance harness for freeform path masks: resolution (B10c) + the local frame, animation and
// edit operations the path-mask authoring UI uses (B10d-mask). Bundles the pure core/maskPath.ts
// (which reuses B8b evalPathKeyframes and the shared pathVertexOps) and asserts with node:assert.
// The coverage the shader draws from these outlines is proven by verify:mask-coverage (CPU twin) and
// npm run gpu:masks (real GPU).
//   node scripts/verify-mask-path.mjs   (or: npm run verify:mask-path)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'maskpath-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const cv = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const square = () => [cv(0, 0), cv(20, 0), cv(20, 20), cv(0, 20)];
const big = () => [cv(-10, -10), cv(30, -10), cv(30, 30), cv(-10, 30)];
const tri = () => [cv(0, 0), cv(10, 0), cv(5, 8)];
const kf = (frame, verts, extra = {}) => ({ frame, vertices: verts, closed: true, ...extra });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps);

try {
  const M = await bundle('src/core/maskPath.ts', 'maskPath.mjs');
  const {
    resolveMaskVertices, resolveMaskFeathers, evalMaskPathKeyframes, isPathMask,
    maskLocalToComp, maskCompToLocal, maskVecToComp, maskVecToLocal, maskPathToComp, pathMaskFromComp, closedPathBounds,
    maskPathAt, maskPathEditableAt, writeMaskPathAt, toggleMaskPathKeyframe, insertMaskVertex, deleteMaskVertex,
    setMaskVertexType, setMaskVertexFeather,
  } = M;

  // ── B10c resolution ──
  check('static path (no keyframes) → the vertices unchanged', () => {
    const v = square();
    const r = resolveMaskVertices(v, undefined, 10);
    assert.equal(r.length, 4);
    assert.deepEqual(r[0].position, [0, 0]);
  });

  check('no vertices and no keyframes → empty outline', () => {
    assert.deepEqual(resolveMaskVertices(undefined, undefined, 0), []);
  });

  check('animated path: AT a pose returns its original vertices (via evalPathKeyframes)', () => {
    const kfs = [kf(0, square()), kf(10, big())];
    assert.equal(resolveMaskVertices(undefined, kfs, 0).length, 4);
    assert.equal(resolveMaskVertices(undefined, kfs, 10).length, 4);
  });

  // B10d-mask: equal-count poses now interpolate vertex-for-vertex (AE mask-path interpolation) - the
  // B10c version asserted the resampled (denser) morph here.
  check('animated path: BETWEEN equal-count poses interpolates vertex-for-vertex (beziers intact)', () => {
    const a = square();
    const b = big();
    b[1] = { ...b[1], handleOut: [4, 2], handleIn: [-2, -2], vertexType: 'smooth' };
    const mid = resolveMaskVertices(undefined, [kf(0, a), kf(10, b)], 5);
    assert.equal(mid.length, 4, 'count preserved');
    assert.ok(nearV(mid[0].position, [-5, -5]) && nearV(mid[2].position, [25, 25]));
    assert.ok(nearV(mid[1].handleOut, [2, 1]) && nearV(mid[1].handleIn, [-1, -1]), 'handles interpolate too');
  });

  check('animated path: BETWEEN poses with different counts falls back to the resampled morph', () => {
    const mid = resolveMaskVertices(undefined, [kf(0, square()), kf(10, tri())], 5);
    assert.ok(mid.length > 4, 'morph is a denser polyline');
  });

  check('animated path: a hold pose freezes until the next pose', () => {
    const mid = evalMaskPathKeyframes([kf(0, square(), { interpolation: 'hold' }), kf(10, big())], 7);
    assert.deepEqual(mid.map((v) => v.position), square().map((v) => v.position));
  });

  check('feathers: absent → a uniform fallback array of the vertex count', () => {
    assert.deepEqual(resolveMaskFeathers(undefined, 4, 3), [3, 3, 3, 3]);
    assert.deepEqual(resolveMaskFeathers([], 3, 5), [5, 5, 5]);
  });

  check('feathers: per-vertex values, clamped ≥0 and padded to the vertex count with the fallback', () => {
    assert.deepEqual(resolveMaskFeathers([2, -4, 8], 4, 1), [2, 0, 8, 1]); // -4→0, missing 4th→fallback 1
  });

  check('feathers: negative fallback clamps to 0; NaN entries use the fallback', () => {
    assert.deepEqual(resolveMaskFeathers(undefined, 2, -9), [0, 0]);
    assert.deepEqual(resolveMaskFeathers([NaN, 3], 2, 1.5), [1.5, 3]);
  });

  // ── B10d-mask: local frame ──
  const F = { cx: 100, cy: 50, sx: 200, sy: 80, rotation: 30 };
  check('local → comp: [-0.5, 0.5] spans the size, rotated about the position', () => {
    assert.deepEqual(maskLocalToComp([0, 0], F), [100, 50]);
    const p = maskLocalToComp([0.5, 0], { ...F, rotation: 90 });
    assert.ok(nearV(p, [100, 150]), `+x local maps to +y comp at 90 deg (Y-down clockwise): ${p}`);
    const q = maskLocalToComp([0.5, 0.5], { ...F, rotation: 0 });
    assert.ok(nearV(q, [200, 90]));
  });

  check('comp → local inverts local → comp (points and handle vectors)', () => {
    for (const p of [[0.3, -0.2], [-0.5, 0.5], [0.1, 0.45]]) {
      assert.ok(nearV(maskCompToLocal(maskLocalToComp(p, F), F), p, 1e-9));
      assert.ok(nearV(maskVecToLocal(maskVecToComp(p, F), F), p, 1e-9));
    }
  });

  check('a ~zero size axis keeps the inverse finite (reveal wipes collapse the mask)', () => {
    const l = maskCompToLocal([150, 60], { ...F, sx: 0, rotation: 0 });
    assert.ok(Number.isFinite(l[0]) && Number.isFinite(l[1]));
  });

  check('pathMaskFromComp: frame = outline bounds, local outline round-trips to the drawn one', () => {
    const drawn = [cv(60, 160), { ...cv(160, 20), handleIn: [-30, 0], handleOut: [30, 0], vertexType: 'smooth' }, cv(270, 150)];
    const { center, size, vertices } = pathMaskFromComp(drawn);
    const b = closedPathBounds(drawn);
    assert.ok(nearV(center, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]));
    assert.ok(nearV(size, [b.maxX - b.minX, b.maxY - b.minY]));
    const back = maskPathToComp(vertices, { cx: center[0], cy: center[1], sx: size[0], sy: size[1], rotation: 0 });
    back.forEach((v, i) => {
      assert.ok(nearV(v.position, drawn[i].position, 1e-9));
      assert.ok(nearV(v.handleIn, drawn[i].handleIn, 1e-9) && nearV(v.handleOut, drawn[i].handleOut, 1e-9));
    });
    for (const v of vertices) assert.ok(Math.abs(v.position[0]) <= 0.5 + 1e-9 && Math.abs(v.position[1]) <= 0.5 + 1e-9);
  });

  check('pathMaskFromComp: a degenerate (flat) outline still gets a ≥1px frame', () => {
    const { size } = pathMaskFromComp([cv(0, 10), cv(50, 10), cv(100, 10)]);
    assert.equal(size[1], 1);
  });

  // ── B10d-mask: edits ──
  check('isPathMask: vertices or path keyframes make a path mask; parametric masks are not', () => {
    assert.equal(isPathMask({}), false);
    assert.equal(isPathMask({ vertices: [] }), false);
    assert.equal(isPathMask({ vertices: tri() }), true);
    assert.equal(isPathMask({ pathKeyframes: [kf(0, tri())] }), true);
  });

  check('writeMaskPathAt: static path replaces vertices; animated path sets / inserts the pose (sorted)', () => {
    assert.deepEqual(writeMaskPathAt({ vertices: square() }, tri(), 5), { vertices: tri() });
    const m = { pathKeyframes: [kf(0, square()), kf(20, square())] };
    const replaced = writeMaskPathAt(m, big(), 20).pathKeyframes;
    assert.equal(replaced.length, 2);
    assert.deepEqual(replaced[1].vertices, big());
    const inserted = writeMaskPathAt(m, big(), 10).pathKeyframes;
    assert.deepEqual(inserted.map((k) => k.frame), [0, 10, 20]);
    assert.equal(m.pathKeyframes.length, 2, 'input not mutated');
  });

  check('toggleMaskPathKeyframe: static → first key; add at playhead; remove; last removal → static', () => {
    const s0 = { vertices: square() };
    const s1 = toggleMaskPathKeyframe(s0, 0);
    assert.equal(s1.pathKeyframes.length, 1);
    assert.deepEqual(s1.pathKeyframes[0].vertices.map((v) => v.position), square().map((v) => v.position));
    const m1 = { ...s0, ...s1 };
    const s2 = toggleMaskPathKeyframe(m1, 12);
    assert.deepEqual(s2.pathKeyframes.map((k) => k.frame), [0, 12]);
    const m2 = { ...m1, ...s2 };
    const s3 = toggleMaskPathKeyframe(m2, 12);
    assert.deepEqual(s3.pathKeyframes.map((k) => k.frame), [0]);
    const s4 = toggleMaskPathKeyframe({ ...m2, ...s3 }, 0);
    assert.ok('pathKeyframes' in s4 && s4.pathKeyframes === undefined, 'animation removed');
    assert.equal(s4.vertices.length, 4);
  });

  check('insertMaskVertex: splits the segment in the static path AND every pose; outline unchanged', () => {
    const curved = square();
    curved[0] = { ...curved[0], handleOut: [5, -5] };
    curved[1] = { ...curved[1], handleIn: [-5, -5] };
    const m = { vertices: curved, pathKeyframes: [kf(0, curved), kf(10, big())], feathers: [0, 10, 2, 2] };
    const p = insertMaskVertex(m, 0, 0.5);
    assert.equal(p.vertices.length, 5);
    assert.ok(p.pathKeyframes.every((k) => k.vertices.length === 5), 'pose counts stay equal');
    assert.ok(nearV(p.vertices[1].position, [10, -3.75]), `curved split point ${p.vertices[1].position}`);
    assert.ok(nearV(p.pathKeyframes[1].vertices[1].position, [10, -10]), 'straight segment split at its midpoint');
    assert.deepEqual(p.feathers, [0, 5, 10, 2, 2]);
  });

  check('deleteMaskVertex: removes the index everywhere; refuses to go below 3', () => {
    const m = { vertices: square(), pathKeyframes: [kf(0, square()), kf(5, big())], feathers: [1, 2, 3, 4] };
    const p = deleteMaskVertex(m, 1);
    assert.equal(p.vertices.length, 3);
    assert.ok(p.pathKeyframes.every((k) => k.vertices.length === 3));
    assert.deepEqual(p.feathers, [1, 3, 4]);
    assert.equal(deleteMaskVertex({ vertices: tri() }, 0), null);
    assert.equal(deleteMaskVertex({ vertices: square() }, 7), null);
  });

  check('setMaskVertexType: corner → smooth synthesizes collinear handles; smooth → corner clears them', () => {
    const p = setMaskVertexType({ vertices: square() }, 1, 'smooth', 0);
    const v = p.vertices[1];
    assert.equal(v.vertexType, 'smooth');
    const cross = v.handleIn[0] * v.handleOut[1] - v.handleIn[1] * v.handleOut[0];
    assert.ok(Math.abs(cross) < 1e-9 && (v.handleIn[0] !== 0 || v.handleIn[1] !== 0), 'G1 handles');
    const back = setMaskVertexType({ vertices: p.vertices }, 1, 'corner', 0).vertices[1];
    assert.deepEqual([back.handleIn, back.handleOut], [[0, 0], [0, 0]]);
  });

  check('setMaskVertexFeather: first edit materializes the array from the single feather', () => {
    assert.deepEqual(setMaskVertexFeather({}, 2, 9, 4, 3).feathers, [3, 3, 9, 3]);
    assert.deepEqual(setMaskVertexFeather({ feathers: [1, 2, 3, 4] }, 0, -5, 4, 0).feathers, [0, 2, 3, 4]);
    assert.equal(setMaskVertexFeather({}, 4, 1, 4, 0), null);
  });

  check('maskPathEditableAt: only a morph between poses of DIFFERENT counts is read-only', () => {
    const m = { pathKeyframes: [kf(0, square()), kf(10, big()), kf(20, tri())] };
    assert.equal(maskPathEditableAt(m, 5), true);
    assert.equal(maskPathEditableAt(m, 10), true);
    assert.equal(maskPathEditableAt(m, 15), false);
    assert.equal(maskPathEditableAt({ vertices: square() }, 15), true);
    assert.equal(maskPathAt(m, 15).length > 4, true);
  });

  check('frame-pure: the same (mask, frame) always resolves to an identical outline', () => {
    const kfs = [kf(0, square()), kf(10, tri())];
    assert.deepEqual(resolveMaskVertices(undefined, kfs, 6.5), resolveMaskVertices(undefined, kfs, 6.5));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ mask-path harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
