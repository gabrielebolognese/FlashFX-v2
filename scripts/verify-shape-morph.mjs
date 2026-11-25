// Acceptance harness for B62 agent shape morph: parametric outlines (core/shapeOutline.ts), eased +
// auto-aligned morph evaluation (core/shapeModifiers.ts evalPathKeyframes / morphPaths / alignRing).
// Proves: outlines are geometrically right, legacy (no ease / align) morphs are byte-identical to B8b,
// the per-pose ease drives progress exactly, auto-alignment removes the start-point twist, poses are
// returned exactly at their frames, evaluation is frame-pure.
//   node scripts/verify-shape-morph.mjs   (or: npm run verify:shape-morph)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'shape-morph-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({
    stdin: {
      contents: `
        export * from './src/core/shapeOutline';
        export { evalPathKeyframes, morphPaths, alignRing, morphProgress } from './src/core/shapeModifiers';
        export { evalCubic } from './src/core/bend';
        export { applyEasing, cubicBezier } from './src/core/easings';
        export { tessellatePath, cleanFillRing } from './src/engine/pathTessellation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { rectangleOutline, ellipseOutline, starOutline, polygonOutline, outlineFromSpec, evalPathKeyframes, morphPaths, alignRing, morphProgress, evalCubic, applyEasing, cubicBezier, tessellatePath, cleanFillRing } = m;

  const flatten = (vs, closed = true, per = 32) => {
    const pts = [];
    const n = vs.length, segs = closed ? n : n - 1;
    for (let s = 0; s < segs; s++) for (let k = 0; k < per; k++) pts.push(evalCubic(vs[s], vs[(s + 1) % n], k / per));
    return pts;
  };
  const bbox = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const near = (a, b, e) => Math.abs(a - b) <= e;

  console.log('outlines');
  check('rectangle: exact box, starts top-middle, clockwise; rounded corners lie on the arcs', () => {
    const r = rectangleOutline(200, 100);
    assert.deepEqual(r[0].position, [0, -50]);
    assert.deepEqual(bbox(flatten(r)), [-100, -50, 100, 50]);
    assert.ok(r[1].position[0] > 0, 'clockwise: second vertex to the right');
    const rr = rectangleOutline(200, 100, 30);
    for (const [x, y] of flatten(rr)) {
      const cx = Math.sign(x) * 70, cy = Math.sign(y) * 20;
      if (Math.abs(x) > 70 && Math.abs(y) > 20) assert.ok(near(Math.hypot(x - cx, y - cy), 30, 0.03), `corner point ${x},${y}`);
    }
    assert.deepEqual(bbox(flatten(rr)).map((v) => Math.round(v * 1e6) / 1e6), [-100, -50, 100, 50]);
    assert.equal(rectangleOutline(40, 20, 999).length, 9, 'radius clamps to the short side');
  });
  check('ellipse: four cubic arcs within 0.03% of the true ellipse', () => {
    for (const [x, y] of flatten(ellipseOutline(300, 120), true, 64)) {
      const e = Math.sqrt((x / 150) ** 2 + (y / 60) ** 2);
      assert.ok(near(e, 1, 3e-4), `off the ellipse: ${e}`);
    }
  });
  check('star / polygon: tip and side counts, top-first, inside the box', () => {
    const st = starOutline(100, 100, 5, 0.4);
    assert.equal(st.length, 10);
    assert.ok(near(st[0].position[0], 0, 1e-9) && near(st[0].position[1], -50, 1e-9));
    assert.ok(near(Math.hypot(...st[1].position), 20, 1e-9));
    const hx = polygonOutline(100, 80, 6);
    assert.equal(hx.length, 6);
    const b = bbox(hx.map((v) => v.position));
    assert.ok(b[0] >= -50 - 1e-9 && b[2] <= 50 + 1e-9 && near(b[1], -40, 1e-9));
  });
  check('outlineFromSpec validates (unknown type, NaN, short path) and builds free paths', () => {
    assert.throws(() => outlineFromSpec({ type: 'blob', width: 1, height: 1 }), /shape.type/);
    assert.throws(() => outlineFromSpec({ type: 'rectangle', width: NaN, height: 1 }), /width/);
    assert.throws(() => outlineFromSpec({ type: 'path', points: [[0, 0]] }), /at least 2/);
    const p = outlineFromSpec({ type: 'path', points: [[0, 0], [10, 0], [10, 10]], closed: false });
    assert.equal(p.closed, false);
    assert.equal(p.vertices.length, 3);
  });

  console.log('morph evaluation');
  const sq = rectangleOutline(200, 200);
  const circ = ellipseOutline(200, 200);
  const legacyPoses = [{ frame: 0, vertices: sq, closed: true }, { frame: 30, vertices: circ, closed: true }];

  check('legacy poses (no ease, no align) are byte-identical to the B8b linear morph', () => {
    for (const f of [1, 9, 15, 22, 29]) assert.deepEqual(evalPathKeyframes(legacyPoses, f), morphPaths(sq, true, circ, true, f / 30));
  });
  check('poses are returned exactly (beziers intact) at and beyond their frames', () => {
    const poses = [{ frame: 0, vertices: sq, closed: true, ease: 'cubicOut', align: 'auto' }, { frame: 30, vertices: circ, closed: true }];
    assert.deepEqual(evalPathKeyframes(poses, 0).vertices, sq);
    assert.deepEqual(evalPathKeyframes(poses, 30).vertices, circ);
    assert.deepEqual(evalPathKeyframes(poses, 99).vertices, circ);
  });
  check('per-pose ease drives the morph progress (named and cubic-bezier, incl. overshoot)', () => {
    const named = [{ frame: 0, vertices: sq, closed: true, ease: 'expoOut' }, { frame: 30, vertices: circ, closed: true }];
    assert.deepEqual(evalPathKeyframes(named, 10), morphPaths(sq, true, circ, true, applyEasing('expoOut', 10 / 30)));
    const quad = [{ frame: 0, vertices: sq, closed: true, ease: [0.2, 1.4, 0.4, 1] }, { frame: 30, vertices: circ, closed: true }];
    assert.deepEqual(evalPathKeyframes(quad, 12), morphPaths(sq, true, circ, true, cubicBezier(12 / 30, 0.2, 1.4, 0.4, 1)));
    assert.ok(morphProgress([0.2, 1.4, 0.4, 1], 0.5) > 1, 'the quad overshoots');
    assert.equal(morphProgress(undefined, 0.37), 0.37);
  });
  check('hold pose freezes until the next pose', () => {
    const held = [{ frame: 0, vertices: sq, closed: true, interpolation: 'hold' }, { frame: 30, vertices: circ, closed: true }];
    for (const f of [1, 15, 29]) assert.deepEqual(evalPathKeyframes(held, f).vertices, sq);
  });
  check('auto-align removes the start-point twist: a rotated start re-indexes to the identity', () => {
    const A = flatten(ellipseOutline(200, 200), true, 16); // 64 points
    const shift = 23;
    const B = A.map((_, i) => A[(i + shift) % A.length]);
    assert.deepEqual(alignRing(A, B), A, 'forward shift recovered');
    const R = [...A].reverse();
    assert.deepEqual(alignRing(A, R), A, 'reversed winding recovered');
  });
  check('auto-aligned square -> rotated-start circle travels less than the index-0 morph (no twist)', () => {
    const rotated = [...circ.slice(2), ...circ.slice(0, 2)]; // the circle starting at its bottom point
    const travel = (alignFlag) => {
      const a = morphPaths(sq, true, rotated, true, 0, alignFlag).vertices;
      const b = morphPaths(sq, true, rotated, true, 1, alignFlag).vertices;
      return a.reduce((s, v, i) => s + Math.hypot(v.position[0] - b[i].position[0], v.position[1] - b[i].position[1]), 0) / a.length;
    };
    const plain = travel(false), aligned = travel(true);
    assert.ok(aligned < plain * 0.4, `aligned ${aligned.toFixed(2)} vs plain ${plain.toFixed(2)}`);
    assert.ok(aligned < 30, `points move about the square-to-circle gap only (${aligned.toFixed(2)} px)`);
  });
  check('frame purity: any scrub order gives the same outline', () => {
    const poses = [
      { frame: 0, vertices: sq, closed: true, ease: 'cubicInOut', align: 'auto' },
      { frame: 20, vertices: starOutline(220, 220, 5, 0.45), closed: true, ease: [0.34, 1.56, 0.64, 1], align: 'auto' },
      { frame: 45, vertices: circ, closed: true },
    ];
    const first = new Map();
    for (let f = 0; f <= 45; f++) first.set(f, JSON.stringify(evalPathKeyframes(poses, f)));
    for (const f of [44, 3, 20, 31, 0, 12, 44]) assert.equal(JSON.stringify(evalPathKeyframes(poses, f)), first.get(f));
  });

  console.log('fill tessellation (renderer)');
  const fillArea = (vertices, closed = true) => {
    const t = tessellatePath({ vertices, closed, fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, lineCap: 'butt', lineJoin: 'miter' });
    let area = 0;
    for (let i = 0; i < t.vertexCount; i += 3) {
      const p = (k) => [t.data[(i + k) * 6], t.data[(i + k) * 6 + 1]];
      const [a, b, c] = [p(0), p(1), p(2)];
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    return area;
  };
  check('a ring with a collinear start point fills completely (was half a square: the ear clipper stalled)', () => {
    assert.equal(fillArea(rectangleOutline(100, 100)), 10000);
    assert.deepEqual(cleanFillRing([[0, -50], [50, -50], [50, 50], [-50, 50], [-50, -50], [0, -50]]), [[50, -50], [50, 50], [-50, 50], [-50, -50]]);
  });
  check('every morph frame square -> circle fills its full outline area (resampled rings are full of collinear points)', () => {
    const poses = [{ frame: 0, vertices: sq, closed: true, align: 'auto' }, { frame: 30, vertices: circ, closed: true }];
    const shoelace = (pts) => Math.abs(pts.reduce((s2, p, i) => { const q = pts[(i + 1) % pts.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    for (const f of [5, 10, 15, 20, 25, 29]) {
      const o = evalPathKeyframes(poses, f);
      const ring = o.vertices.map((x) => x.position);
      const area = fillArea(o.vertices, o.closed);
      assert.ok(Math.abs(area - shoelace(ring)) < 1e-6 * shoelace(ring), `f${f}: filled ${area} vs outline ${shoelace(ring)}`);
      assert.ok(area > 31000 && area <= 40000 + 1e-6, `f${f}: area ${area}`);
    }
  });

  console.log(`\nverify:shape-morph - ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
