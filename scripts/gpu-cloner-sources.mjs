// gpu:cloner-sources (B60): a cloner with several sources renders instance i as sources[i mod n] on the WebGPU
// renderer, through the real MCP path (editor.addCloner -> agent.setClonerSources -> render_frame): a row of
// red / green / blue tiles plus an imported image, the listed sources hidden, one undo step back to one source.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:cloner-sources
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { startMcp, makeRenderer, idOf } from './lib/mcp-pixels.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/cloner';
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const px = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const kind = ([r, g, b]) => (r > 180 && g < 80 && b < 80 ? 'red' : g > 180 && r < 80 && b < 80 ? 'green' : b > 180 && r < 80 && g < 80 ? 'blue' : r + g + b < 60 ? 'bg' : 'other');

console.log('gpu:cloner-sources');
const mcp = await startMcp('gpu-cloner-sources');
try {
  await mcp.call('create_project', { name: 'B60 cloner sources', format: 'long', durationFrames: 30, clipLength: 'comp', uiMode: 'pro' }, 400000);
  // Sources at the comp origin: the cloner adds the source's own position to every instance.
  const red = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 0, y: 0, width: 120, height: 120, fill: [1, 0, 0, 1], name: 'red' } }));
  const green = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 0, y: 0, width: 120, height: 120, fill: [0, 1, 0, 1], name: 'green' } }));
  const blue = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 0, y: 0, width: 120, height: 120, fill: [0, 0, 1, 1], name: 'blue' } }));
  const img = await mcp.call('import_image', { path: join(ROOT, 'public/flashfx-mark.svg'), rasterSize: 120, x: 0, y: 0 });
  const imgId = img.activeLayerId;
  await mcp.actions([{ actionId: 'editor.selectLayer', args: [red] }, { actionId: 'editor.addCloner', args: [] }]);
  const st0 = await mcp.call('get_state');
  const cl = st0.layers.find((l) => l.type === 'cloner');
  assert.ok(cl, 'no cloner created');
  await mcp.action('editor.updateLayerProperty', { layerId: cl.id, path: 'distribution', value: { type: 'grid', countX: 8, countY: 1, countZ: 1, spacing: { x: 200, y: 0, z: 0 }, origin: { x: 260, y: 540, z: 0 }, rowOffset: 0 } });
  await mcp.action('editor.updateLayerProperty', { layerId: cl.id, path: 'transform.position.defaultValue', value: [0, 0] });
  const render = makeRenderer(mcp, OUT);
  const xs = Array.from({ length: 8 }, (_, i) => 260 + i * 200);
  const one = await render('cloner-one-source', 5);
  const oneKinds = xs.map((x) => kind(px(one, x, 540)));

  const set = await mcp.action('agent.setClonerSources', { layerId: cl.id, sources: [red, green, blue, imgId] });
  const many = await render('cloner-four-sources', 5);
  // Tiles: sample the centre; the logo image (yellow rounded square, black bolt in the middle): its left edge.
  const yellow = ([r, g, b]) => r > 200 && g > 140 && b < 90;
  const kinds = xs.map((x, i) => (i % 4 === 3 ? (yellow(px(many, x - 45, 540)) ? 'image' : kind(px(many, x - 45, 540))) : kind(px(many, x, 540))));
  check(`one source: every copy is the red tile (${oneKinds.join(' ')})`, () => {
    assert.ok(oneKinds.every((k) => k === 'red'), oneKinds.join(','));
  });
  check(`sources [red, green, blue, image]: copy i draws source i mod 4 (${kinds.join(' ')})`, () => {
    assert.equal(set.ok, true, JSON.stringify(set));
    assert.deepEqual(kinds, ['red', 'green', 'blue', 'image', 'red', 'green', 'blue', 'image']);
  });
  check('the listed sources are hidden: their own spot (comp origin) shows the background; with one source the unlisted ones still draw there', () => {
    assert.deepEqual(px(many, 30, 30), px(many, 30, 1000));
    assert.notDeepEqual(px(one, 30, 30), px(one, 30, 1000));
  });
  const undo = await mcp.call('undo');
  const back = await render('cloner-after-undo', 5);
  check('one undo step returns to the single source', () => {
    assert.equal(undo.ok, true);
    assert.ok(xs.every((x) => kind(px(back, x, 540)) === 'red'));
  });
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
