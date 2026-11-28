// Acceptance harness for B83 arbitrary shape morph: SVG path poses (core/svgPath.ts, core/shapeOutline
// svgOutline), path points with bezier handles + extra contours, multi-contour morph evaluation
// (core/shapeModifiers evalPathKeyframes / evalPathHoles / pairContours) and the even-odd contour fill
// in the tessellator (engine/pathTessellation contourFill: islands + nested holes).
// Proves: the parser matches the SVG semantics (absolute == relative, arcs on the circle, Q raised
// exactly, S / T reflection, packed arc flags), svg outlines centre + fit, poses return their own
// contours exactly, paired contours morph, unpaired ones shrink to / grow from their centre, holes
// never pair with islands, morphs WITHOUT contours are byte-identical to the B62 path, the common
// glyph case tessellates byte-identically to plain earcut while islands and nested holes now fill
// even-odd, save / load keeps pose contours, evaluation is frame-pure.
//   node scripts/verify-shape-contours.mjs   (or: npm run verify:shape-contours)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };

const tmp = mkdtempSync(join(tmpdir(), 'shape-contours-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({
    stdin: {
      contents: `
        export * from './src/core/shapeOutline';
        export { parseSvgPath, arcToCubics } from './src/core/svgPath';
        export { evalPathKeyframes, evalPathHoles, morphPaths, pairContours, contourDepths } from './src/core/shapeModifiers';
        export { evalCubic } from './src/core/bend';
        export { tessellatePath, flattenPath } from './src/engine/pathTessellation';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createPolygonLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
        export { default as earcut } from 'earcut';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { parseSvgPath, arcToCubics, svgOutline, outlineFromSpec, ellipseOutline, rectangleOutline, starOutline, evalPathKeyframes, evalPathHoles, morphPaths, contourDepths, evalCubic, tessellatePath, flattenPath, earcut, resolveFrame, createComposition, createPolygonLayer, validateComposition } = m;

  const flatten = (vs, closed = true, per = 32) => {
    const pts = [];
    const n = vs.length, segs = closed ? n : n - 1;
    for (let s = 0; s < segs; s++) for (let k = 0; k < per; k++) pts.push(evalCubic(vs[s], vs[(s + 1) % n], k / per));
    return pts;
  };
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  const bbox = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const near = (a, b, e, msg = '') => assert.ok(Math.abs(a - b) <= e, `${msg} ${a} vs ${b} (eps ${e})`);
  const corner = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
  const triArea = (data) => { // tessellated fill triangles: 6 floats per vertex
    let a = 0;
    for (let i = 0; i + 17 < data.length; i += 18) {
      const ax = data[i], ay = data[i + 1], bx = data[i + 6], by = data[i + 7], cx = data[i + 12], cy = data[i + 13];
      a += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    }
    return a;
  };
  const fillOf = (vertices, holes) => tessellatePath({ vertices, closed: true, holes, fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, lineCap: 'butt', lineJoin: 'miter' });

  console.log('svg path parser');
  check('absolute and relative commands give the same contour; H / V / L / Z', () => {
    const a = parseSvgPath('M10 10 L110 10 H110 V60 L10 60 Z');
    const r = parseSvgPath('m10 10 l100 0 h0 v50 l-100 0 z');
    assert.equal(a.length, 1);
    assert.equal(a[0].closed, true);
    assert.deepEqual(a[0].vertices.map((v) => v.position), r[0].vertices.map((v) => v.position));
    assert.deepEqual(bbox(a[0].vertices.map((v) => v.position)), [10, 10, 110, 60]);
  });
  check('arcs: a full circle from two arcs lies on the circle (< 0.03% radial error)', () => {
    const [c] = parseSvgPath('M150 100 A50 50 0 1 1 50 100 A50 50 0 1 1 150 100 Z');
    for (const [x, y] of flatten(c.vertices)) near(Math.hypot(x - 100, y - 100), 50, 0.015, 'radius');
  });
  check('arc flags packed without separators ("a25 25 0 01 50 0") parse like the spaced form', () => {
    const p = parseSvgPath('M0 0 a25 25 0 01 50 0');
    const q = parseSvgPath('M0 0 a25 25 0 0 1 50 0');
    assert.deepEqual(p[0].vertices.map((v) => v.position), q[0].vertices.map((v) => v.position));
    const cubics = arcToCubics([0, 0], 25, 25, 0, 0, 1, [50, 0]);
    assert.equal(cubics.length, 2, 'a half circle splits into two <= 90 deg cubics');
  });
  check('Q is raised to a cubic exactly; S / T reflect the previous control point', () => {
    const [q] = parseSvgPath('M0 0 Q50 100 100 0');
    const mid = evalCubic(q.vertices[0], q.vertices[1], 0.5);
    near(mid[0], 50, 1e-9); near(mid[1], 50, 1e-9); // quadratic midpoint = (P0 + 2C + P2) / 4
    const [t] = parseSvgPath('M0 0 Q25 50 50 0 T100 0');
    const m2 = evalCubic(t.vertices[1], t.vertices[2], 0.5);
    near(m2[1], -25, 1e-9, 'T reflects the control below the axis');
    const [sC] = parseSvgPath('M0 0 C0 50 50 50 50 0 S100 -50 100 0');
    near(sC.vertices[1].handleOut[1], -50, 1e-9, 'S reflects c2 (50, 50) about the pen (50, 0)');
  });
  check('several subpaths become several contours; bad input names the problem', () => {
    const cs = parseSvgPath('M0 0 h10 v10 h-10 z M20 0 h10 v10 h-10 z');
    assert.equal(cs.length, 2);
    assert.throws(() => parseSvgPath('M0 0 L10'), /needs 2 numbers/);
    assert.throws(() => parseSvgPath('hello'), /unexpected|must start/);
    assert.throws(() => parseSvgPath(''), /non-empty/);
  });

  console.log('outline specs');
  check('svg outline: largest subpath is the main contour, the rest extra contours; centred and fitted (contain)', () => {
    const ring = 'M0 50 A50 50 0 1 1 100 50 A50 50 0 1 1 0 50 Z M30 50 A20 20 0 1 0 70 50 A20 20 0 1 0 30 50 Z';
    const o = svgOutline(ring, 400, 200);
    assert.equal(o.holes.length, 1);
    const b = bbox(flatten(o.vertices));
    near(b[0], -100, 0.05); near(b[2], 100, 0.05); near(b[1], -100, 0.05); near(b[3], 100, 0.05); // contain: 200 px square
    near(area(flatten(o.vertices)), Math.PI * 100 * 100, 40, 'outer area');
    near(area(flatten(o.holes[0])), Math.PI * 40 * 40, 10, 'hole area');
    const st = svgOutline('M0 0 h100 v50 h-100 z', 300, 300, 'stretch');
    assert.deepEqual(bbox(st.vertices.map((v) => v.position)), [-150, -150, 150, 150]);
    const row = svgOutline('M0 0 h10 v10 h-10 z M20 0 h10 v10 h-10 z M40 0 h10 v10 h-10 z');
    assert.deepEqual(bbox(row.vertices.map((v) => v.position)), [-5, -5, 5, 5], 'equal islands: the centre one is the main contour');
    const none = svgOutline('M0 0 h100 v50 h-100 z', 300, 300, 'none');
    assert.deepEqual(bbox(none.vertices.map((v) => v.position)), [-50, -25, 50, 25]);
  });
  check('path spec: { x, y, in, out } handles (relative) and holes; old [x, y] form unchanged', () => {
    const o = outlineFromSpec({ type: 'path', points: [{ x: 0, y: -50, in: [-27, 0], out: [27, 0] }, [50, 50], [-50, 50]], holes: [[[0, 0], [10, 20], [-10, 20]]] });
    assert.deepEqual(o.vertices[0].handleOut, [27, 0]);
    assert.equal(o.vertices[0].vertexType, 'smooth');
    assert.equal(o.holes.length, 1);
    const old = outlineFromSpec({ type: 'path', points: [[0, 0], [10, 0], [5, 8]] });
    assert.equal(old.holes, undefined);
    assert.deepEqual(old.vertices.map((v) => v.handleIn), [[0, 0], [0, 0], [0, 0]]);
    assert.throws(() => outlineFromSpec({ type: 'path', points: [[0, 0], [1, 1]], holes: [[[0, 0]]] }), /at least 3 points/);
    assert.throws(() => outlineFromSpec({ type: 'svg', d: 'M0 0 h1 v1 z', fit: 'cover' }), /fit/);
  });

  console.log('multi-contour morph');
  const sq = rectangleOutline(200, 200);
  const disc = ellipseOutline(200, 200);
  const hole = (r, cx = 0, cy = 0) => ellipseOutline(r * 2, r * 2).map((v) => ({ ...v, position: [v.position[0] + cx, v.position[1] + cy] }));
  check('no pose has contours: no holes key and the main contour is exactly the B62 morph (byte-identical)', () => {
    const kfs = [{ frame: 0, vertices: sq, closed: true, align: 'auto' }, { frame: 10, vertices: disc, closed: true }];
    for (const f of [0, 3, 5, 7, 10]) {
      const e = evalPathKeyframes(kfs, f);
      assert.equal('holes' in e, false);
      if (f > 0 && f < 10) assert.deepEqual(e.vertices, morphPaths(sq, true, disc, true, f / 10, true).vertices);
    }
  });
  check('at a pose: that pose\'s own contours, bezier intact; between: paired contours morph', () => {
    const kfs = [{ frame: 0, vertices: sq, closed: true, align: 'auto', holes: [hole(40)] }, { frame: 10, vertices: disc, closed: true, holes: [hole(60)] }];
    assert.deepEqual(evalPathKeyframes(kfs, 0).holes, [hole(40)]);
    assert.deepEqual(evalPathKeyframes(kfs, 10).holes, [hole(60)]);
    const mid = evalPathHoles(kfs, 5);
    assert.equal(mid.length, 1);
    near(area(mid[0].map((v) => v.position)), Math.PI * 50 * 50, 60, 'mid hole ~ r 50');
  });
  check('unpaired contours shrink into / grow out of their own centre on the pose ease', () => {
    const kfs = [{ frame: 0, vertices: sq, closed: true, holes: [hole(30, 40, 0)] }, { frame: 10, vertices: disc, closed: true, holes: [] }];
    const h5 = evalPathHoles(kfs, 5);
    assert.equal(h5.length, 1);
    near(area(flatten(h5[0])), Math.PI * 15 * 15, 2, 'scale 0.5 -> area 0.25');
    const c = h5[0].reduce((a, v) => [a[0] + v.position[0] / h5[0].length, a[1] + v.position[1] / h5[0].length], [0, 0]);
    near(c[0], 40, 1e-6); near(c[1], 0, 1e-6);
    const grow = [{ frame: 0, vertices: disc, closed: true, holes: [] }, { frame: 10, vertices: sq, closed: true, holes: [hole(30, -40, 0)] }];
    near(area(flatten(evalPathHoles(grow, 2)[0])), Math.PI * 6 * 6, 0.5, 'scale 0.2');
    const eased = [{ frame: 0, vertices: sq, closed: true, holes: [hole(30)], ease: 'cubicIn' }, { frame: 10, vertices: disc, closed: true, holes: [] }];
    near(area(flatten(evalPathHoles(eased, 5)[0])), Math.PI * (30 * 0.875) ** 2, 2, 'cubicIn progress 0.125');
  });
  check('holes pair with holes and islands with islands (never across): the fill never flips mid-morph', () => {
    // Pose A: hole at the left, island far right. Pose B: island at the left, hole at the right.
    const big = rectangleOutline(400, 200);
    const A = [{ frame: 0, vertices: big, closed: true, holes: [hole(30, -100, 0), hole(20, 400, 0)] }, { frame: 10, vertices: big, closed: true, holes: [hole(20, -400, 0), hole(30, 100, 0)] }];
    const depths = contourDepths([flatten(big), flatten(hole(30, -100, 0)), flatten(hole(20, 400, 0))]);
    assert.deepEqual(depths, [0, 1, 0]);
    const mid = evalPathHoles(A, 5);
    assert.equal(mid.length, 2, 'two pairs, nothing shrinking');
    const cx = (h) => h.reduce((a, v) => a + v.position[0], 0) / h.length;
    near(cx(mid[0]), 0, 1, 'the hole moves -100 -> 100');
    near(cx(mid[1]), 0, 1, 'the island moves 400 -> -400');
  });
  check('align "vertices" with matching contour counts lerps each contour vertex for vertex', () => {
    const a = [corner(-10, -10), corner(10, -10), corner(0, 10)];
    const b = [corner(-20, -20), corner(20, -20), corner(0, 30)];
    const kfs = [{ frame: 0, vertices: sq, closed: true, align: 'vertices', holes: [a] }, { frame: 4, vertices: sq, closed: true, holes: [b] }];
    assert.deepEqual(evalPathHoles(kfs, 2)[0].map((v) => v.position), [[-15, -15], [15, -15], [0, 20]]);
  });
  check('frame-pure: the same frame twice is deep-equal, and hold freezes the contours', () => {
    const kfs = [{ frame: 0, vertices: sq, closed: true, holes: [hole(40)] }, { frame: 10, vertices: starOutline(200, 200, 5), closed: true, holes: [hole(20, 0, 30), hole(10, 0, -30)] }];
    assert.deepEqual(evalPathKeyframes(kfs, 6), evalPathKeyframes(kfs, 6));
    const held = [{ ...kfs[0], interpolation: 'hold' }, kfs[1]];
    assert.deepEqual(evalPathHoles(held, 7), [hole(40)]);
  });

  console.log('even-odd contour fill (tessellator)');
  check('glyph case (counters inside the outer) is byte-identical to the old single earcut fill', () => {
    for (const holes of [[hole(40)], [hole(30, -50, 0), hole(30, 50, 0)]]) {
      const t = fillOf(sq, holes);
      // The pre-B83 code path: earcut(outer, holes) on the same flattened rings, one triangle per 3 indices.
      const outer = flattenPath(sq, true);
      const hp = holes.map((h) => flattenPath(h, true));
      const coords = []; const idxs = [];
      for (const p of outer) coords.push(p[0], p[1]);
      for (const h of hp) { idxs.push(coords.length / 2); for (const p of h) coords.push(p[0], p[1]); }
      const ix = earcut(coords, idxs, 2);
      const ref = new Float32Array(ix.length * 6);
      ix.forEach((k, n) => { ref.set([coords[k * 2], coords[k * 2 + 1], 1, 1, 1, 1], n * 6); });
      assert.deepEqual(t.data, ref);
    }
  });
  check('an island outside the outer (the dot of an "i") is filled, not carved', () => {
    const stem = [corner(-10, -20), corner(10, -20), corner(10, 60), corner(-10, 60)];
    const dot = [corner(-10, -60), corner(10, -60), corner(10, -40), corner(-10, -40)];
    near(triArea(fillOf(stem, [dot]).data), 20 * 80 + 20 * 20, 1e-6, 'stem + dot');
    // Repro of the pre-B83 path: one earcut call with the island passed as a hole drops it (B80).
    const c = [...flattenPath(stem, true), ...flattenPath(dot, true)].flat();
    const ix = earcut(c, [flattenPath(stem, true).length], 2);
    let old = 0;
    for (let i = 0; i < ix.length; i += 3) { const [p, q, r] = [ix[i], ix[i + 1], ix[i + 2]].map((k) => [c[2 * k], c[2 * k + 1]]); old += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2; }
    near(old, 20 * 80, 1e-6, 'the old single earcut lost the dot');
    const dotFirst = triArea(fillOf(dot, [stem]).data);
    near(dotFirst, 20 * 80 + 20 * 20, 1e-6, 'either contour order');
  });
  check('nested contours: outer - hole + island inside the hole (even-odd)', () => {
    const outer = rectangleOutline(300, 300);
    const h = rectangleOutline(200, 200);
    const island = rectangleOutline(100, 100);
    near(triArea(fillOf(outer, [h, island]).data), 300 * 300 - 200 * 200 + 100 * 100, 1e-6);
  });

  console.log('resolver + persistence');
  check('resolveFrame: contoured poses drive the layer holes; contour-less layers keep their static holes', () => {
    const comp = createComposition('c', { width: 800, height: 800, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
    const lay = createPolygonLayer('o', 400, 400, sq, true, [1, 1, 1, 1], 30);
    lay.shape.holes = [hole(50)];
    const plain = resolveFrame({ ...comp, layers: [lay] }, 5).layers[0];
    assert.deepEqual(plain.shape.holes, [hole(50)]);
    const lay2 = createPolygonLayer('o2', 400, 400, sq, true, [1, 1, 1, 1], 30);
    lay2.shape.holes = [hole(50)];
    lay2.shape.pathKeyframes = [{ frame: 0, vertices: sq, closed: true, holes: [hole(50)] }, { frame: 10, vertices: disc, closed: true, holes: [] }];
    const r5 = resolveFrame({ ...comp, layers: [lay2] }, 5).layers[0];
    near(area(flatten(r5.shape.holes[0])), Math.PI * 25 * 25, 3);
    const r10 = resolveFrame({ ...comp, layers: [lay2] }, 10).layers[0];
    assert.equal(r10.shape.holes, undefined, 'no contours at the last pose');
  });
  check('save / load keeps per-pose contours, including an empty list', () => {
    const comp = createComposition('c', { width: 800, height: 800, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
    const lay = createPolygonLayer('o', 400, 400, sq, true, [1, 1, 1, 1], 30);
    lay.shape.pathKeyframes = [{ frame: 0, vertices: sq, closed: true, holes: [hole(50)] }, { frame: 10, vertices: disc, closed: true, holes: [] }];
    const back = validateComposition(JSON.parse(JSON.stringify({ ...comp, layers: [lay] })));
    assert.deepEqual(back.layers[0].shape.pathKeyframes[0].holes, JSON.parse(JSON.stringify([hole(50)])));
    assert.deepEqual(back.layers[0].shape.pathKeyframes[1].holes, []);
    const old = createPolygonLayer('p', 0, 0, sq, true, [1, 1, 1, 1], 30);
    old.shape.pathKeyframes = [{ frame: 0, vertices: sq, closed: true }, { frame: 10, vertices: disc, closed: true }];
    const back2 = validateComposition(JSON.parse(JSON.stringify({ ...comp, layers: [old] })));
    assert.equal('holes' in back2.layers[0].shape.pathKeyframes[0], false, 'old projects gain nothing');
  });

  console.log(`\nverify:shape-contours - ${passed} checks passed`);
} catch (e) {
  console.error('\n✗ shape-contours FAILED:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
