// gpu:pixel-blocks (B54): the WGSL blocks mask (engine/maskWgsl.ts mask_blocksEval) renders exactly the CPU twin's
// seeded schedule (core/pixelBlocks.ts), block by block, through the real MCP path (agent.pixelBlockReveal ->
// render_frame), and the 8-bit sparkle lands its squares in the ring around the box, never on it.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:pixel-blocks
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, makeRenderer, idOf } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/gen';
const tmp = mkdtempSync(join(tmpdir(), 'gpu-pixel-blocks-'));
await build({ entryPoints: ['src/core/pixelBlocks.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'pb.mjs'), logLevel: 'silent' });
const PB = await import(pathToFileURL(join(tmp, 'pb.mjs')).href);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const px = (img, x, y) => { const o = (y * img.width + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const isWhite = (c) => c[0] > 200 && c[1] > 200 && c[2] > 200;

const REGION = { x: 560, y: 140, width: 800, height: 800 };
const SIZE = 40;
const SEED = 4242;
const START = 10;
const DUR = 20;

console.log('gpu:pixel-blocks');
const mcp = await startMcp('gpu-pixel-blocks');
try {
  await mcp.call('create_project', { name: 'B54 pixel blocks', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const rect = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 960, y: 540, width: 800, height: 800, fill: [1, 1, 1, 1], name: 'card' } }));
  assert.ok(rect, 'no rect id');
  const rev = await mcp.action('agent.pixelBlockReveal', { layerId: rect, options: { direction: 'out', startFrame: START, durationFrames: DUR, region: REGION, blockSize: SIZE, order: 'random', seed: SEED } });
  check(`agent.pixelBlockReveal adds one blocks mask (${JSON.stringify(rev.result.keys)})`, () => {
    assert.equal(rev.ok, true, JSON.stringify(rev));
    assert.equal(rev.result.maskIndex, 0);
    assert.equal(rev.result.blockSize, SIZE);
  });
  const render = makeRenderer(mcp, OUT);

  const params = { seed: SEED, orderId: 0, dirX: 1, dirY: 0, jitter: 0.35, hx: 400, hy: 400, size: SIZE };
  const grid = REGION.width / SIZE;
  const schedule = async (frame, progress) => {
    const img = await render(`pixel-blocks-f${frame}`, frame);
    let agree = 0; let shown = 0; let uniform = 0; const bad = [];
    for (let iy = 0; iy < grid; iy++) for (let ix = 0; ix < grid; ix++) {
      const want = PB.pixelBlockShown(PB.pixelBlockThreshold(params, ix, iy), progress, true);
      const x0 = REGION.x + ix * SIZE; const y0 = REGION.y + iy * SIZE;
      const got = isWhite(px(img, x0 + SIZE / 2, y0 + SIZE / 2));
      if (got) shown++;
      if (got === want) agree++; else if (bad.length < 5) bad.push([ix, iy, want, got]);
      // Uniform block: every pixel 3 px inside the block edges reads the same state as the centre.
      let same = true;
      for (let y = y0 + 3; y < y0 + SIZE - 3 && same; y += 4) for (let x = x0 + 3; x < x0 + SIZE - 3; x += 4) if (isWhite(px(img, x, y)) !== got) { same = false; break; }
      if (same) uniform++;
    }
    return { agree, shown, uniform, total: grid * grid, bad };
  };

  const f5 = await schedule(5, 0);
  const f20 = await schedule(20, (20 - START) / DUR);
  const f26 = await schedule(26, (26 - START) / DUR);
  const f35 = await schedule(35, 1);
  check(`GPU blocks == CPU twin, block by block (f5 ${f5.agree}/${f5.total}, f20 ${f20.agree}/${f20.total}, f26 ${f26.agree}/${f26.total}, f35 ${f35.agree}/${f35.total})`, () => {
    for (const s of [f5, f20, f26, f35]) assert.equal(s.agree, s.total, `mismatched blocks ${JSON.stringify(s.bad)}`);
  });
  check(`dissolve schedule: shown blocks ${f5.shown} -> ${f20.shown} -> ${f26.shown} -> ${f35.shown} of ${f5.total}`, () => {
    assert.equal(f5.shown, f5.total);
    assert.ok(Math.abs(f20.shown / f20.total - 0.5) < 0.08, `f20 shown ${f20.shown}`);
    assert.ok(f26.shown < f20.shown);
    assert.equal(f35.shown, 0);
  });
  check(`whole squares: every block is uniform inside (f20 ${f20.uniform}/${f20.total}, f26 ${f26.uniform}/${f26.total})`, () => {
    assert.equal(f20.uniform, f20.total);
    assert.equal(f26.uniform, f26.total);
  });
  const again = await schedule(20, (20 - START) / DUR);
  check('scrubbing back to f20 renders the identical block set', () => {
    assert.deepEqual([again.agree, again.shown], [f20.agree, f20.shown]);
  });

  // 8-bit sparkle around a box (r07 lime squares around a word).
  const BOX = { x: 160, y: 460, width: 240, height: 120 };
  const sp = await mcp.action('agent.pixelSparkle', { options: { box: BOX, color: [0.72, 1, 0.18, 1], startFrame: 0, durationFrames: 40, count: 14, blockSize: 16, seed: 7 } });
  const img = await render('pixel-sparkle-f12', 12);
  const isLime = (c) => c[1] > 200 && c[0] > 120 && c[0] < 230 && c[2] < 120;
  let inBox = 0; let ring = 0;
  const M = 3 * 16;
  for (let y = BOX.y - M; y < BOX.y + BOX.height + M; y++) for (let x = BOX.x - M; x < BOX.x + BOX.width + M; x++) {
    if (!isLime(px(img, x, y))) continue;
    const inside = x >= BOX.x && x < BOX.x + BOX.width && y >= BOX.y && y < BOX.y + BOX.height;
    if (inside) inBox++; else ring++;
  }
  check(`agent.pixelSparkle: ${sp.result.squareIds.length} squares over ${sp.result.cells} ring cells; f12 has ${ring} lime px in the ring and ${inBox} on the box`, () => {
    assert.equal(sp.ok, true);
    assert.equal(sp.result.squareIds.length, 14);
    assert.ok(ring > 16 * 16 * 3, `too few sparkle pixels (${ring})`);
    assert.equal(inBox, 0);
  });

  // Build-on (direction "in") with the two ordered sweeps: a directional sweep at 30 deg stepped on twos
  // (stepFrames 2 = hold keys, the 8-bit look) and a centre-out sweep, side by side, block by block vs the twin.
  await mcp.call('create_project', { name: 'B54 build-on', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const cases = [
    { name: 'directional', cx: 480, size: 32, seed: 99, order: 'directional', angle: 30, stepFrames: 2 },
    { name: 'center', cx: 1440, size: 40, seed: 5, order: 'center', angle: 0, stepFrames: 1 },
  ];
  const SIDE = 640;
  for (const c of cases) {
    c.region = { x: c.cx - SIDE / 2, y: 540 - SIDE / 2, width: SIDE, height: SIDE };
    c.id = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: c.cx, y: 540, width: SIDE, height: SIDE, fill: [1, 1, 1, 1], name: `card ${c.name}` } }));
    c.rev = await mcp.action('agent.pixelBlockReveal', { layerId: c.id, options: { direction: 'in', startFrame: START, durationFrames: DUR, region: c.region, blockSize: c.size, order: c.order, angle: c.angle, seed: c.seed, stepFrames: c.stepFrames } });
    const [dirX, dirY] = PB.pixelBlockDirection(c.angle);
    c.params = { seed: c.seed, orderId: PB.PIXEL_BLOCK_ORDER_ID[c.order], dirX, dirY, jitter: 0.35, hx: SIDE / 2, hy: SIDE / 2, size: c.size };
    c.keys = PB.pixelBlockProgressKeys({ startFrame: START, durationFrames: DUR, stepFrames: c.stepFrames });
  }
  /** Progress at `frame` from the twin's keys (linear between two keys, or held on stepped keys). */
  const progressAt = (keys, frame) => {
    if (frame <= keys[0].frame) return keys[0].value;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (frame >= keys[i].frame) {
        const k = keys[i]; const n = keys[i + 1];
        if (!n || k.hold) return k.value;
        return k.value + ((frame - k.frame) / (n.frame - k.frame)) * (n.value - k.value);
      }
    }
    return 0;
  };
  const buildRows = [];
  const counts = {};
  for (const frame of [9, 15, 16, 17, 21, 27, 31]) {
    const img = await render(`pixel-buildon-f${frame}`, frame);
    for (const c of cases) {
      const progress = progressAt(c.keys, frame);
      const g = SIDE / c.size;
      let agree = 0; let shown = 0; let uniform = 0; const bad = []; const sig = [];
      for (let iy = 0; iy < g; iy++) for (let ix = 0; ix < g; ix++) {
        const want = PB.pixelBlockShown(PB.pixelBlockThreshold(c.params, ix, iy), progress, false);
        const x0 = c.region.x + ix * c.size; const y0 = c.region.y + iy * c.size;
        const got = isWhite(px(img, x0 + c.size / 2, y0 + c.size / 2));
        if (got) shown++;
        sig.push(got ? 1 : 0);
        if (got === want) agree++; else if (bad.length < 5) bad.push([ix, iy, want, got]);
        let same = true;
        for (let y = y0 + 3; y < y0 + c.size - 3 && same; y += 4) for (let x = x0 + 3; x < x0 + c.size - 3; x += 4) if (isWhite(px(img, x, y)) !== got) { same = false; break; }
        if (same) uniform++;
      }
      counts[`${c.name}@${frame}`] = { agree, shown, uniform, total: g * g, bad, sig: sig.join(''), progress };
      buildRows.push(`${c.name} f${frame} p${progress.toFixed(2)} ${shown}/${g * g}`);
    }
  }
  console.log(`  build-on: ${buildRows.join(' | ')}`);
  check('build-on (direction "in"): GPU blocks == CPU twin block by block for the directional and centre-out sweeps at 7 frames', () => {
    for (const c of cases) assert.equal(c.rev.ok, true, JSON.stringify(c.rev));
    for (const [k, s] of Object.entries(counts)) {
      assert.equal(s.agree, s.total, `${k}: mismatched blocks ${JSON.stringify(s.bad)}`);
      assert.equal(s.uniform, s.total, `${k}: blocks not uniform inside`);
    }
  });
  check('build-on schedule: nothing before the start, blocks only ever get added, all shown at the end', () => {
    for (const c of cases) {
      const seq = [9, 15, 16, 17, 21, 27, 31].map((f) => counts[`${c.name}@${f}`]);
      assert.equal(seq[0].shown, 0, `${c.name}: blocks before the start`);
      assert.equal(seq[seq.length - 1].shown, seq[0].total, `${c.name}: not all shown at the end`);
      for (let i = 1; i < seq.length; i++) {
        assert.ok(seq[i].shown >= seq[i - 1].shown, `${c.name}: shown count went down`);
        for (let b = 0; b < seq[i].sig.length; b++) if (seq[i - 1].sig[b] === '1') assert.equal(seq[i].sig[b], '1', `${c.name}: a shown block disappeared`);
      }
    }
  });
  check('ordered sweeps: the directional build-on starts on the sweep side, the centre-out one in the middle; stepFrames 2 holds on odd frames', () => {
    const d = counts['directional@15']; const g = SIDE / 32;
    let first = 0; let last = 0;
    for (let iy = 0; iy < g; iy++) for (let ix = 0; ix < g; ix++) if (d.sig[iy * g + ix] === '1') { if (ix < g / 2) first++; else last++; }
    assert.ok(first > last * 2, `30 deg sweep should fill the left half first (${first} vs ${last})`);
    assert.equal(counts['directional@16'].sig, counts['directional@17'].sig, 'stepped on twos: f17 holds f16');
    assert.notEqual(counts['directional@15'].sig, counts['directional@16'].sig, 'a new batch on the next step');
    const cc = counts['center@15']; const gc = SIDE / 40;
    let mid = 0; let edge = 0;
    for (let iy = 0; iy < gc; iy++) for (let ix = 0; ix < gc; ix++) if (cc.sig[iy * gc + ix] === '1') { const r = Math.hypot(ix + 0.5 - gc / 2, iy + 0.5 - gc / 2); if (r < gc / 4) mid++; else edge++; }
    assert.ok(mid > edge, `centre-out should fill the middle first (${mid} vs ${edge})`);
  });

  // The two recipes end to end through apply_recipe: pixel-dissolve on a small card between the two
  // above, and pixel-sparkle around a box at the top.
  const CARD = { x: 840, y: 420, width: 240, height: 240 };
  const card = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 960, y: 540, width: 240, height: 240, fill: [1, 1, 1, 1], name: 'recipe card' } }));
  const pd = await mcp.call('apply_recipe', { id: 'pixel-dissolve', params: { layerId: card, direction: 'out', blockSize: 24, rx: CARD.x, ry: CARD.y, rw: CARD.width, rh: CARD.height }, startFrame: 36, endFrame: 56 });
  const whiteIn = (img, r) => { let n = 0; for (let y = r.y + 2; y < r.y + r.height - 2; y++) for (let x = r.x + 2; x < r.x + r.width - 2; x++) if (isWhite(px(img, x, y))) n++; return n; };
  const cardArea = (CARD.width - 4) * (CARD.height - 4);
  const d35 = whiteIn(await render('pixel-recipe-dissolve-f35', 35), CARD);
  const d46 = whiteIn(await render('pixel-recipe-dissolve-f46', 46), CARD);
  const d57 = whiteIn(await render('pixel-recipe-dissolve-f57', 57), CARD);
  check(`pixel-dissolve recipe via apply_recipe: card white px ${d35} -> ${d46} -> ${d57} of ${cardArea}`, () => {
    assert.ok(pd.ok !== false, JSON.stringify(pd));
    assert.equal(d35, cardArea);
    assert.ok(d46 > 0 && d46 < cardArea, `mid-dissolve ${d46}`);
    assert.equal(d57, 0);
  });
  const SBOX = { x: 860, y: 60, width: 200, height: 60 };
  const sr = await mcp.call('apply_recipe', { id: 'pixel-sparkle', params: { x: SBOX.x, y: SBOX.y, width: SBOX.width, height: SBOX.height }, startFrame: 0, endFrame: 40 });
  const simg = await render('pixel-recipe-sparkle-f12', 12);
  const lime = (c) => c[1] > 200 && c[0] > 120 && c[0] < 230 && c[2] < 120;
  let sIn = 0; let sRing = 0;
  for (let y = 0; y < SBOX.y + SBOX.height + 60; y++) for (let x = SBOX.x - 60; x < SBOX.x + SBOX.width + 60; x++) {
    if (!lime(px(simg, x, y))) continue;
    if (x >= SBOX.x && x < SBOX.x + SBOX.width && y >= SBOX.y && y < SBOX.y + SBOX.height) sIn++; else sRing++;
  }
  check(`pixel-sparkle recipe via apply_recipe: f12 has ${sRing} lime px around the box and ${sIn} on it`, () => {
    assert.ok(sr.ok !== false, JSON.stringify(sr));
    assert.ok(sRing > 200, `too few sparkle px (${sRing})`);
    assert.equal(sIn, 0);
  });

  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
