// gpu:cloner-sources (B60): a cloner with several sources renders instance i as sources[i mod n] on the WebGPU
// renderer, through the real MCP path (editor.addCloner -> agent.setClonerSources -> render_frame): a row of
// red / green / blue tiles plus an imported image, the listed sources hidden, one undo step back to one source.
// Follow-up checks (5-8): a seeded random source order renders the returned picks; photos of different resolutions
// scaled to one tile size keep that size inside the cloner (an extra source's own scale is kept relative to the
// main source); data-bound copies (agent.setClonerData) draw their own text; one undo removes the binding.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:cloner-sources
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { startMcp, makeRenderer, idOf, ink } from './lib/mcp-pixels.mjs';
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
  // ---- follow-up 1: seeded random order (same project: red / green / blue tiles) ----
  const rnd = await mcp.action('agent.setClonerSources', { layerId: cl.id, sources: [red, green, blue], order: 'random', seed: 3 });
  const rndImg = await render('cloner-random-order', 5);
  const rndKinds = xs.map((x) => kind(px(rndImg, x, 540)));
  const byId = { [red]: 'red', [green]: 'green', [blue]: 'blue' };
  check(`order "random" seed 3: every copy draws the source the action returned (${rndKinds.join(' ')})`, () => {
    assert.equal(rnd.ok, true, JSON.stringify(rnd));
    const picks = rnd.result.picks.slice(0, 8).map((id) => byId[id]);
    assert.deepEqual(rndKinds, picks);
    assert.notDeepEqual(rndKinds, ['red', 'green', 'blue', 'red', 'green', 'blue', 'red', 'green'], 'the random order is not the cycle');
    assert.equal(rnd.result.order, 'random');
  });

  // ---- follow-up 2: two photos of different resolutions, scaled to one tile size ----
  await mcp.call('create_project', { name: 'B60 mixed sizes', format: 'long', durationFrames: 30, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const small = (await mcp.call('import_image', { path: join(ROOT, 'public/flashfx-mark.svg'), rasterSize: 120, x: 0, y: 0 })).activeLayerId;
  const big = (await mcp.call('import_image', { path: join(ROOT, 'public/flashfx-mark.svg'), rasterSize: 240, x: 0, y: 0 })).activeLayerId;
  await mcp.action('editor.updateLayerProperty', { layerId: big, path: 'transform.scale.defaultValue', value: [0.5, 0.5] });
  await mcp.actions([{ actionId: 'editor.selectLayer', args: [small] }, { actionId: 'editor.addCloner', args: [] }]);
  const cl2 = (await mcp.call('get_state')).layers.find((l) => l.type === 'cloner');
  await mcp.action('editor.updateLayerProperty', { layerId: cl2.id, path: 'distribution', value: { type: 'grid', countX: 4, countY: 1, countZ: 1, spacing: { x: 300, y: 0, z: 0 }, origin: { x: 510, y: 540, z: 0 }, rowOffset: 0 } });
  await mcp.action('editor.updateLayerProperty', { layerId: cl2.id, path: 'transform.position.defaultValue', value: [0, 0] });
  await mcp.action('agent.setClonerSources', { layerId: cl2.id, sources: [small, big] });
  const sizes = await render('cloner-mixed-sizes', 5);
  const bg2 = px(sizes, 20, 20);
  const boxes = [0, 1, 2, 3].map((i) => ink(sizes, { x: 510 + i * 300 - 140, y: 400, width: 280, height: 280 }, bg2));
  const widths = boxes.map((b) => b.right - b.left + 1);
  check(`a 240 px photo scaled 0.5 draws its copies at the 120 px photo's size (widths ${widths.join(' / ')} px)`, () => {
    assert.ok(boxes.every((b) => b.n > 2000), `ink ${boxes.map((b) => b.n)}`);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 4, `widths ${widths}`);
    assert.ok(widths.every((w) => w > 100 && w < 140), `widths ${widths} (expected about 120)`);
    assert.ok(boxes.every((b, i) => Math.abs(b.cx - (510 + i * 300)) < 6), `centres ${boxes.map((b) => b.cx.toFixed(1))}`);
  });

  // ---- follow-up 3: data-bound copies draw their own text ----
  await mcp.call('create_project', { name: 'B60 data binding', format: 'long', durationFrames: 30, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const tb = await mcp.actions([
    { actionId: 'editor.addText', args: { content: 'W' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 80 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'transform.position.defaultValue', value: [0, 0] } },
  ]);
  const word = tb.results[0].activeLayerId;
  await mcp.actions([{ actionId: 'editor.selectLayer', args: [word] }, { actionId: 'editor.addCloner', args: [] }]);
  const cl3 = (await mcp.call('get_state')).layers.find((l) => l.type === 'cloner');
  await mcp.action('editor.updateLayerProperty', { layerId: cl3.id, path: 'distribution', value: { type: 'grid', countX: 4, countY: 1, countZ: 1, spacing: { x: 480, y: 0, z: 0 }, origin: { x: 240, y: 540, z: 0 }, rowOffset: 0 } });
  await mcp.action('editor.updateLayerProperty', { layerId: cl3.id, path: 'transform.position.defaultValue', value: [0, 0] });
  const tx = [0, 1, 2, 3].map((i) => 240 + i * 480);
  const widthsOf = (img) => { const bg = px(img, 20, 20); return tx.map((x) => { const b = ink(img, { x: x - 230, y: 400, width: 460, height: 280 }, bg); return b.n ? b.right - b.left + 1 : 0; }); };
  const plainW = widthsOf(await render('cloner-data-unbound', 5));
  const bound = await mcp.action('agent.setClonerData', { layerId: cl3.id, data: [{ w: 'I' }, { w: 'WWWW' }], bindings: [{ propertyPath: 'content.spans.0.text', dataKey: 'w' }] });
  const boundW = widthsOf(await render('cloner-data-bound', 5));
  check(`data rows [I, WWWW]: copies 0 / 2 draw "I", copies 1 / 3 draw "WWWW" (ink widths ${boundW.join(' / ')} px; unbound ${plainW.join(' / ')})`, () => {
    assert.equal(bound.ok, true, JSON.stringify(bound));
    assert.ok(plainW.every((w) => w > 40 && Math.abs(w - plainW[0]) <= 2), `unbound ${plainW}`);
    assert.ok(boundW[1] > 3 * boundW[0] && boundW[3] > 3 * boundW[2], `bound ${boundW}`);
    assert.ok(Math.abs(boundW[0] - boundW[2]) <= 2 && Math.abs(boundW[1] - boundW[3]) <= 2, `bound ${boundW}`);
    assert.ok(boundW[0] < plainW[0] && boundW[1] > plainW[1] * 3, `bound ${boundW} vs unbound ${plainW}`);
  });
  const undo2 = await mcp.call('undo');
  const backW = widthsOf(await render('cloner-data-after-undo', 5));
  check('one undo removes the data binding (every copy is the source text again)', () => {
    assert.equal(undo2.ok, true);
    assert.ok(backW.every((w, i) => Math.abs(w - plainW[i]) <= 1), `after undo ${backW} vs ${plainW}`);
  });
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
