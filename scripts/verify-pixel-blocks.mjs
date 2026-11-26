// Acceptance harness for B54: the seeded pixel-block dissolve / build-on mask (core/pixelBlocks.ts +
// the blocks run in core/maskCoverage.ts, the CPU twin of engine/maskWgsl.ts mask_blocksEval) and the
// "8-bit sparkle" generator (animation-templates/pixelSparkle.ts). The real-GPU proofs are gpu:masks
// (WGSL == this twin) and gpu:generators (render_frame through the MCP).
//   node scripts/verify-pixel-blocks.mjs   (or: npm run verify:pixel-blocks)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// interpolation.ts pulls in the expression engine, which references Worker at load - stub it.
globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };

const tmp = mkdtempSync(join(tmpdir(), 'pixel-blocks-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/pixelBlocks';
        export { packMaskSlots, maskStackCoverage, MASK_BLOCK_FLOATS, MASK_SLOT_FLOATS } from './src/core/maskCoverage';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createMask } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
        export { buildPixelBlockMask } from './src/animation-templates/pixelBlockReveal';
        export { planPixelSparkle, buildPixelSparkle, sparkleRingCells } from './src/animation-templates/pixelSparkle';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const {
    pixelBlockHash, pixelBlockThreshold, pixelBlockShown, pixelBlockShownFraction, pixelBlockProgressKeys, normalizeBlockParams,
    BLOCKS_MASK_TYPE, packMaskSlots, maskStackCoverage, MASK_BLOCK_FLOATS, MASK_SLOT_FLOATS,
    resolveFrame, createComposition, createRectangleLayer, createMask, validateComposition, buildPixelBlockMask,
    planPixelSparkle, buildPixelSparkle, sparkleRingCells,
  } = m;

  console.log('Pixel blocks + 8-bit sparkle (B54) - acceptance\n');

  const rb = (o = {}) => ({ size: 16, seed: 7, order: 'random', angle: 0, jitter: 0.35, direction: 'in', progress: 0.5, ...o });
  const rmask = (blocks, o = {}) => ({ type: 'rectangle', centerX: 200, centerY: 150, sizeX: 320, sizeY: 192, rotation: 0, feather: 0, invert: false, opacity: 1, points: 5, innerRadius: 0, mode: 'intersect', blocks, ...o });
  const pack = (masks) => { const b = new Float32Array(MASK_BLOCK_FLOATS); const n = packMaskSlots(masks, b, 0); return { b, n }; };
  const params = (o = {}) => ({ seed: 7, orderId: 0, dirX: 1, dirY: 0, jitter: 0.35, hx: 160, hy: 96, size: 16, ...o });

  // ---- the hash
  check('hash: deterministic, in [0, 1), 24-bit quantized, roughly uniform, seed-sensitive', () => {
    let sum = 0; let n = 0; let diff = 0;
    for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) {
      const h = pixelBlockHash(12345, x, y);
      assert.equal(h, pixelBlockHash(12345, x, y));
      assert.ok(h >= 0 && h < 1);
      assert.equal(h * 16777216, Math.round(h * 16777216), 'exact in an f32');
      sum += h; n++;
      if (pixelBlockHash(12346, x, y) !== h) diff++;
    }
    assert.ok(Math.abs(sum / n - 0.5) < 0.03, `mean ${sum / n}`);
    assert.ok(diff > n * 0.99, 'a different seed gives a different pattern');
  });

  // ---- packing
  check('packing: a blocks mask is a 2-slot run (type 6, block size, region, seed | progress, order, dir, jitter, out)', () => {
    const { b, n } = pack([rmask(rb({ order: 'directional', angle: 90, direction: 'out', progress: 0.25 }), { opacity: 0.8, invert: true })]);
    assert.equal(n, 2);
    assert.equal(b[0], BLOCKS_MASK_TYPE);
    assert.equal(b[1], 1 + 2 * 0, 'invert + 2 * intersect');
    assert.ok(Math.abs(b[2] - 0.8) < 1e-6);
    assert.deepEqual([b[3], b[4], b[5], b[6], b[7], b[9], b[10]], [16, 200, 150, 160, 96, 7, 2]);
    const d = MASK_SLOT_FLOATS;
    assert.equal(b[d], 0.25); assert.equal(b[d + 1], 1);
    assert.ok(Math.abs(b[d + 2]) < 1e-6 && Math.abs(b[d + 3] - 1) < 1e-6, 'angle 90 = top to bottom');
    assert.ok(Math.abs(b[d + 4] - 0.35) < 1e-6); assert.equal(b[d + 5], 1);
  });

  check('packing: a blocks mask that no longer fits (7 parametric before it) is dropped; parametric stacks are unchanged', () => {
    const rects = Array.from({ length: 7 }, () => rmask(undefined, { blocks: undefined, sizeX: 50, sizeY: 50 }));
    const { b, n } = pack([...rects, rmask(rb())]);
    assert.equal(n, 7);
    for (let i = 0; i < 7; i++) assert.equal(b[i * MASK_SLOT_FLOATS], 1);
    const plain = pack(rects).b;
    assert.deepEqual(Array.from(b), Array.from(plain));
  });

  // ---- coverage follows the seeded schedule
  check('coverage: every block centre shows exactly when its seeded threshold < progress (CPU twin of the shader)', () => {
    for (const order of ['random', 'directional', 'center']) {
      for (const progress of [0.1, 0.5, 0.9]) {
        const blocks = rb({ order, progress, angle: 30 });
        const { b, n } = pack([rmask(blocks)]);
        const p = params({ orderId: { random: 0, directional: 1, center: 2 }[order], dirX: Math.cos(Math.PI / 6), dirY: Math.sin(Math.PI / 6) });
        for (let iy = 0; iy < 12; iy++) for (let ix = 0; ix < 20; ix++) {
          const x = 200 - 160 + (ix + 0.5) * 16, y = 150 - 96 + (iy + 0.5) * 16;
          const want = pixelBlockShown(pixelBlockThreshold(p, ix, iy), progress, false) ? 1 : 0;
          assert.equal(maskStackCoverage(b, 0, n, x, y), want, `${order} p=${progress} block ${ix},${iy}`);
        }
      }
    }
  });

  check('coverage: a block is uniform (every pixel of a block reads the same), so the dissolve is in whole squares', () => {
    const { b, n } = pack([rmask(rb({ progress: 0.5 }))]);
    for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 6; ix++) {
      const x0 = 40 + ix * 16, y0 = 54 + iy * 16;
      const ref = maskStackCoverage(b, 0, n, x0 + 0.5, y0 + 0.5);
      for (let dy = 0; dy < 16; dy += 3) for (let dx = 0; dx < 16; dx += 3) assert.equal(maskStackCoverage(b, 0, n, x0 + dx + 0.5, y0 + dy + 0.5), ref);
    }
  });

  check('schedule: random order shows ~progress of the blocks, monotonically (a block never flickers back)', () => {
    const p = params({ hx: 480, hy: 270 });
    let prev = null;
    for (let k = 0; k <= 20; k++) {
      const prog = k / 20;
      const { shown, total } = pixelBlockShownFraction(p, prog, false);
      assert.ok(Math.abs(shown / total - prog) < 0.04, `p=${prog}: ${shown}/${total}`);
      const set = [];
      for (let iy = 0; iy < 34; iy++) for (let ix = 0; ix < 60; ix++) set.push(pixelBlockShown(pixelBlockThreshold(p, ix, iy), prog, false));
      if (prev) prev.forEach((v, i) => { if (v) assert.ok(set[i], 'a shown block stays shown'); });
      prev = set;
    }
  });

  check('schedule: progress 0 shows nothing and 1 shows everything ("in"); "out" is the exact complement', () => {
    for (const order of [0, 1, 2]) {
      const p = params({ orderId: order, jitter: 0.5 });
      assert.equal(pixelBlockShownFraction(p, 0, false).shown, 0);
      const all = pixelBlockShownFraction(p, 1, false);
      assert.equal(all.shown, all.total);
      for (const prog of [0.3, 0.7]) {
        const a = pixelBlockShownFraction(p, prog, false), o = pixelBlockShownFraction(p, prog, true);
        assert.equal(a.shown + o.shown, a.total);
      }
    }
  });

  check('schedule: directional (jitter 0, angle 0) builds left to right; angle 180 right to left', () => {
    const p = params({ orderId: 1, jitter: 0 });
    const shownCols = (pp, prog) => { const cols = new Set(); for (let iy = 0; iy < 12; iy++) for (let ix = 0; ix < 20; ix++) if (pixelBlockShown(pixelBlockThreshold(pp, ix, iy), prog, false)) cols.add(ix); return [...cols].sort((a, b) => a - b); };
    assert.deepEqual(shownCols(p, 0.5), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(shownCols({ ...p, dirX: -1 }, 0.5), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  check('schedule: centre order (jitter 0) grows out from the middle', () => {
    const p = params({ orderId: 2, jitter: 0 });
    const at = (ix, iy, prog) => pixelBlockShown(pixelBlockThreshold(p, ix, iy), prog, false);
    assert.ok(at(9, 5, 0.15) && at(10, 6, 0.15), 'centre blocks first');
    assert.ok(!at(0, 0, 0.6) && !at(19, 11, 0.6), 'corners last');
    assert.ok(at(0, 0, 0.999) || at(0, 0, 1));
  });

  check('rotated region: the block grid rotates with the mask (block index taken in the region frame)', () => {
    const { b, n } = pack([rmask(rb({ progress: 0.5 }), { rotation: 90 })]);
    const p = params();
    // Local block (ix, iy) centre -> comp: rotate by +90 deg (x, y) -> (-y, x) about the region centre.
    for (let iy = 0; iy < 12; iy += 3) for (let ix = 0; ix < 20; ix += 4) {
      const lx = (ix + 0.5) * 16 - 160, ly = (iy + 0.5) * 16 - 96;
      const want = pixelBlockShown(pixelBlockThreshold(p, ix, iy), 0.5, false) ? 1 : 0;
      assert.equal(maskStackCoverage(b, 0, n, 200 - ly, 150 + lx), want);
    }
  });

  check('mask modes: inverted / 50% opacity / stacked under an ellipse combine like any other mask', () => {
    const inv = pack([rmask(rb(), { invert: true })]);
    const plain = pack([rmask(rb())]);
    const half = pack([rmask(rb(), { opacity: 0.5 })]);
    for (const [x, y] of [[48, 62], [64, 62], [80, 78], [200, 150], [330, 230]]) {
      const c = maskStackCoverage(plain.b, 0, plain.n, x, y);
      assert.equal(maskStackCoverage(inv.b, 0, inv.n, x, y), 1 - c);
      assert.ok(Math.abs(maskStackCoverage(half.b, 0, half.n, x, y) - (c ? 1 : 0.5)) < 1e-6);
    }
    const ell = { ...rmask(undefined), blocks: undefined, type: 'ellipse', sizeX: 1000, sizeY: 1000, mode: 'add', feather: 0 };
    const st = pack([ell, rmask(rb())]);
    assert.equal(st.n, 3);
    for (const [x, y] of [[48, 62], [200, 150]]) assert.equal(maskStackCoverage(st.b, 0, st.n, x, y), maskStackCoverage(plain.b, 0, plain.n, x, y));
  });

  // ---- the agent builder + resolve per frame
  const comp = createComposition('blocks', { width: 640, height: 360, frameRate: 30, durationFrames: 120, backgroundColor: [0, 0, 0, 1] });
  const card = createRectangleLayer('Card', 320, 180, 320, 192, [1, 1, 1, 1], 120);
  const mask = buildPixelBlockMask({ region: { x: 160, y: 84, width: 320, height: 192 }, direction: 'out', startFrame: 30, durationFrames: 16, blockSize: 16, seed: 9 });
  card.masks = [mask];
  comp.layers = [card];

  check('builder: one intersect rectangle mask over the region with blocks params + linear progress keys 0 -> 1', () => {
    assert.equal(mask.type, 'rectangle'); assert.equal(mask.mode, 'intersect');
    assert.deepEqual(mask.position.defaultValue, [320, 180]); assert.deepEqual(mask.size.defaultValue, [320, 192]);
    assert.deepEqual({ ...mask.blocks, progress: undefined }, { size: 16, seed: 9, order: 'random', angle: 0, jitter: 0.35, direction: 'out', progress: undefined });
    assert.deepEqual(mask.blocks.progress.keyframes.map((k) => [k.frame, k.value, k.interpolation]), [[30, 0, 'linear'], [46, 1, 'linear']]);
  });

  check('builder: stepFrames 2 = hold keys every 2 frames (8-bit stepping)', () => {
    const keys = pixelBlockProgressKeys({ startFrame: 10, durationFrames: 8, stepFrames: 2 });
    assert.deepEqual(keys.map((k) => [k.frame, k.value, k.hold]), [[10, 0, true], [12, 0.25, true], [14, 0.5, true], [16, 0.75, true], [18, 1, true]]);
  });

  const maskAt = (f) => resolveFrame(comp, f).layers.find((l) => l.id === card.id).masks[0];
  check('resolveFrame: the progress follows the keys per frame (0 before, linear through, 1 after)', () => {
    assert.equal(maskAt(0).blocks.progress, 0);
    assert.equal(maskAt(30).blocks.progress, 0);
    assert.equal(maskAt(38).blocks.progress, 0.5);
    assert.equal(maskAt(46).blocks.progress, 1);
    assert.equal(maskAt(100).blocks.progress, 1);
    assert.equal(maskAt(38).blocks.direction, 'out');
  });

  check('dissolve schedule on the resolved layer: visible fraction of the card = 1 - progress (+-5%) per frame', () => {
    for (let f = 30; f <= 46; f += 2) {
      const { b, n } = pack([maskAt(f)]);
      let vis = 0, tot = 0;
      for (let y = 84 + 8; y < 276; y += 16) for (let x = 160 + 8; x < 480; x += 16) { vis += maskStackCoverage(b, 0, n, x, y); tot++; }
      const want = 1 - (f - 30) / 16;
      assert.ok(Math.abs(vis / tot - want) < 0.05, `f${f}: ${vis}/${tot} vs ${want}`);
    }
  });

  check('scrub is byte-identical: packed blocks + coverage raster of a frame do not depend on visit order', () => {
    const raster = (f) => { const { b, n } = pack([maskAt(f)]); const out = []; for (let y = 84; y < 276; y += 4) for (let x = 160; x < 480; x += 4) out.push(maskStackCoverage(b, 0, n, x + 0.5, y + 0.5)); return { b: Array.from(b), out }; };
    const ref = raster(37);
    for (const f of [45, 3, 31, 90, 37, 12]) raster(f);
    assert.deepEqual(raster(37), ref);
  });

  check('persistence: validateComposition keeps the blocks params + keyed progress, and sanitizes junk', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(comp)));
    const bm = back.layers[0].masks[0];
    assert.deepEqual(bm.blocks, mask.blocks);
    const junk = normalizeBlockParams({ size: -3, seed: 1e12, order: 'zigzag', jitter: 7, direction: 'sideways', angle: NaN });
    assert.deepEqual(junk, { size: 1, seed: 16777215, order: 'random', angle: 0, jitter: 1, direction: 'in' });
    const plain = createComposition('p', { width: 100, height: 100, frameRate: 30, durationFrames: 10, backgroundColor: [0, 0, 0, 1] });
    const r = createRectangleLayer('r', 50, 50, 20, 20, [1, 0, 0, 1], 10); r.masks = [createMask('ellipse', 50, 50, 40, 40)]; plain.layers = [r];
    assert.equal(validateComposition(JSON.parse(JSON.stringify(plain))).layers[0].masks[0].blocks, undefined, 'ordinary masks stay ordinary');
  });

  // ---- 8-bit sparkle
  const box = { x: 400, y: 300, width: 280, height: 90 };
  const sOpts = { box, color: [0.55, 0.85, 0.02, 1], count: 14, blockSize: 16, margin: 48, startFrame: 5, durationFrames: 50, stepFrames: 2, seed: 3 };
  check('sparkle ring: grid-aligned cells around the box, none overlapping it, all within the margin', () => {
    const cells = sparkleRingCells(box, 16, 48);
    assert.ok(cells.length > 50);
    for (const [cx, cy] of cells) {
      const x0 = cx - 8, y0 = cy - 8;
      assert.ok(Math.abs((x0 - box.x) % 16) === 0 && Math.abs((y0 - box.y) % 16) === 0, 'grid-aligned');
      assert.ok(!(x0 < box.x + box.width && x0 + 16 > box.x && y0 < box.y + box.height && y0 + 16 > box.y), 'outside the box');
      assert.ok(x0 >= box.x - 48 && x0 + 16 <= box.x + box.width + 48 + 16 && y0 >= box.y - 48 && y0 + 16 <= box.y + box.height + 48 + 16, 'inside the margin');
    }
  });

  check('sparkle plan: frame-pure (same options = same plan), steps every stepFrames, density ~ on fraction, crawls to neighbours', () => {
    const a = planPixelSparkle(sOpts), b2 = planPixelSparkle(sOpts);
    assert.deepEqual(a, b2);
    assert.notDeepEqual(planPixelSparkle({ ...sOpts, seed: 4 }).squares, a.squares, 'seed changes the pattern');
    assert.equal(a.squares.length, 14);
    let on = 0, tot = 0, adj = 0, moves = 0;
    for (const steps of a.squares) {
      assert.deepEqual(steps.map((s) => s.frame), Array.from({ length: 25 }, (_, i) => 5 + i * 2));
      let prev = null;
      for (const s of steps) {
        tot++;
        if (!s.at) continue;
        on++;
        assert.ok(a.cells.some((c) => c[0] === s.at[0] && c[1] === s.at[1]), 'on a ring cell');
        if (prev) { moves++; if (Math.max(Math.abs(prev[0] - s.at[0]), Math.abs(prev[1] - s.at[1])) <= 16) adj++; }
        prev = s.at;
      }
    }
    assert.ok(Math.abs(on / tot - 0.6) < 0.08, `on fraction ${on / tot}`);
    assert.ok(adj / moves > 0.5, `wander: ${adj}/${moves} moves to a neighbour`);
  });

  check('sparkle layers: a group at the box centre + one square per sparkle, hold keys, rendered where the plan says', () => {
    const { group, squares, plan } = buildPixelSparkle(sOpts);
    assert.deepEqual(group.transform.position.defaultValue, [540, 345]);
    assert.equal(squares.length, 14);
    for (const sq of squares) {
      assert.equal(sq.parentId, group.id);
      assert.ok([...sq.transform.position.keyframes, ...sq.transform.opacity.keyframes].every((k) => k.interpolation === 'hold'));
      assert.equal(sq.shape.width.defaultValue, 16);
      assert.equal(sq.shape.strokeWidth.defaultValue, 0);
    }
    const c2 = createComposition('sp', { width: 1080, height: 720, frameRate: 30, durationFrames: 80, backgroundColor: [0, 0, 0, 1] });
    c2.layers = [group, ...squares];
    for (const f of [5, 6, 17, 30, 54]) {
      const rf = resolveFrame(c2, f);
      const step = Math.floor((f - 5) / 2);
      plan.squares.forEach((steps, k) => {
        const rl = rf.layers.find((l) => l.id === squares[k].id);
        const st = steps[step];
        assert.equal(rl.transform.opacity, st.at ? 1 : 0, `square ${k} f${f}`);
        if (st.at) { assert.ok(Math.abs(rl.transform.positionX - st.at[0]) < 1e-6 && Math.abs(rl.transform.positionY - st.at[1]) < 1e-6); }
      });
    }
    const before = resolveFrame(c2, 2).layers.filter((l) => squares.some((s) => s.id === l.id));
    assert.equal(before.length, 0, 'nothing before startFrame (clip in-point)');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
