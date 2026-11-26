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

  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
