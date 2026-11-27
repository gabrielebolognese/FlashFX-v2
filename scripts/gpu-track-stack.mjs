// gpu:track-stack (B84): a layer built for a later shot renders ON TOP of that shot's ground, through the MCP and
// the real store (4-second default clips, type-segregated tracks, agent.setClipTiming), on real WebGPU pixels.
// The r07 / r09 trap, rebuilt with shapes and text:
//   1  text "late" (f0-120 -> timed f200-230): the first text track.
//   2  shot-2 ground, a full-frame blue rect (f0-120 -> timed f150-270): a shape track above the text track.
//   3  text "VISIBLE" (f0-120, joins the free text track) -> timed f150-200.
// Before B84 step 3 kept the old text track, under the ground: f175 showed only blue. Now the jump re-drops the text
// on top of what is visible at f150-200.
//   checks: the text ink shows at f175 over the ground; setClipTiming reports restacked; one undo puts it back;
//   export_project -> import_project keeps the stack (same pixels).
// TRACK_STACK_ROOT=<other checkout> runs the same build on that checkout's engine and only logs (before evidence).
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:track-stack
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_ROOT = process.env.TRACK_STACK_ROOT;
const MODE = BASE_ROOT ? 'before' : 'after';
const lib = await import(BASE_ROOT ? pathToFileURL(join(BASE_ROOT, 'scripts/lib/mcp-pixels.mjs')).href : './lib/mcp-pixels.mjs');
const { startMcp, makeRenderer, idOf, ink, diff } = lib;
const OUT = join(process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/session-2026-11-27/track-stack', MODE);
mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0;
const check = (name, fn) => {
  try { const info = fn(); passed++; results.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? `  ${JSON.stringify(info)}` : ''}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); if (MODE === 'after') throw e; }
};
const CENTRE = { x: 560, y: 440, width: 800, height: 200 };
const BLUE = [26, 51, 204];

console.log(`gpu:track-stack (${MODE})`);
const mcp = await startMcp('gpu-track-stack');
try {
  await mcp.call('create_project', { name: `B84 track stack ${MODE}`, format: 'long', frameRate: 30, durationFrames: 300, uiMode: 'pro' }, 400000);
  const set = (layerId, path, value) => mcp.action('editor.updateLayerProperty', { layerId, path, value });
  const text = async (x, y, content, size) => {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x, y, text: content } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
    ]);
    return idOf(r.results[0]);
  };
  const timing = (layerId, startFrame, endFrame) => mcp.action('agent.setClipTiming', { layerId, timing: { startFrame, endFrame } });
  const render = makeRenderer(mcp, OUT);

  const late = await text(300, 950, 'late', 60);
  await timing(late, 200, 230);
  const ground = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: [0.1, 0.2, 0.8, 1], name: 'shot-2 ground' } }));
  await timing(ground, 150, 270);
  const vis = await text(960, 540, 'VISIBLE', 160);
  const before = (await mcp.call('get_state')).layers.find((l) => l.id === vis);
  const t = await timing(vis, 150, 200);
  const st = await mcp.call('get_state');
  const trackOf = (id) => st.layers.find((l) => l.id === id)?.trackId;
  const tracks = st.tracks ?? [];
  const orderOf = (id) => tracks.find((tr) => tr.id === trackOf(id))?.order;
  console.log(`  layers: late ${trackOf(late)} (order ${orderOf(late)}), ground ${trackOf(ground)} (order ${orderOf(ground)}), VISIBLE ${trackOf(vis)} (order ${orderOf(vis)}, was ${before?.trackId}); setClipTiming -> ${JSON.stringify(t.result ?? t)}`);

  const f175 = await render('f175', 175);
  const k = ink(f175, CENTRE, BLUE, 60);
  check('the shot-2 text renders over the shot-2 ground at f175 (white ink in the centre)', () => {
    assert.ok(k.n > 3000, `text ink ${k.n} px`);
    return { inkPx: k.n };
  });
  check('agent.setClipTiming reports the re-drop (restacked: true) and the text sits on a track above the ground', () => {
    assert.equal(t.result?.restacked, true, JSON.stringify(t.result));
    assert.ok(orderOf(vis) < orderOf(ground), `text order ${orderOf(vis)} vs ground ${orderOf(ground)}`);
  });
  const u = await mcp.call('undo');
  const afterUndo = (await mcp.call('get_state')).layers.find((l) => l.id === vis);
  check('one undo puts the text back on its old track at f0-120', () => {
    assert.equal(u.ok, true);
    assert.equal(afterUndo.trackId, before.trackId);
    assert.deepEqual([afterUndo.inPoint, afterUndo.outPoint], [before.inPoint, before.outPoint]);
  });
  await mcp.call('redo');
  const ffx = join(OUT, 'track-stack.ffx');
  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx });
  const reloaded = await render('f175-reloaded', 175);
  check('export_project -> import_project keeps the stack (f175 pixel-identical)', () => {
    const d = diff(reloaded, f175, null, 0);
    assert.equal(d.n, 0, `differs in ${d.n} px`);
  });

  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ mode: MODE, passed, results, textInkPx: k.n }, null, 2));
  console.log(`\n${MODE === 'after' ? '✓' : '·'} gpu:track-stack (${MODE}) - ${passed}/${results.length} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
