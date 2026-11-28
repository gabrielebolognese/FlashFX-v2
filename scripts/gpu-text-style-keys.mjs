// gpu:text-style-keys (B77): hold-keyed typeface switches render exactly the face of the key in force, through the
// real MCP path (agent.setTextStyleKeys -> render_frame; the keyed faces are loaded by the font walk): before the
// first key, after key 1 and after key 2 the frame is pixel-identical to the same layer styled by hand.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:text-style-keys
import assert from 'node:assert/strict';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/style-keys';
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('gpu:text-style-keys');
const mcp = await startMcp('gpu-text-style-keys');
try {
  await mcp.call('create_project', { name: 'B77 style keys', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const b = await mcp.actions([
    { actionId: 'editor.addText', args: { content: 'Typeface' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 200 } },
  ]);
  const id = b.results[0].activeLayerId;
  const render = makeRenderer(mcp, OUT);
  const set = await mcp.action('agent.setTextStyleKeys', { layerId: id, keys: [{ frame: 10, fontFamily: 'Instrument Serif', fontStyle: 'italic' }, { frame: 20, fontFamily: 'Playfair Display', fontWeight: 700, fontStyle: 'normal' }] });
  const k5 = await render('keys-f5', 5);
  const k15 = await render('keys-f15', 15);
  const k25 = await render('keys-f25', 25);
  check(`agent.setTextStyleKeys stores full faces (${set.result.styleKeys.keys.map((k) => `f${k.frame} ${k.fontFamily} ${k.fontWeight} ${k.fontStyle}`).join('; ')})`, () => {
    assert.equal(set.ok, true, JSON.stringify(set));
    assert.equal(set.result.styleKeys.keys.length, 2);
    assert.equal(set.result.styleKeys.keys[0].fontStyle, 'italic');
  });
  const base = (await mcp.call('get_layer', { layerId: id })).result.content.spans[0].style;
  await mcp.action('agent.setTextStyleKeys', { layerId: id, keys: null });
  const byHand = async (name, frame, face) => {
    for (const [k, v] of Object.entries(face)) await mcp.action('editor.updateLayerProperty', { layerId: id, path: `content.spans.0.style.${k}`, value: v });
    return render(name, frame);
  };
  const h5 = await byHand('hand-f5', 5, { fontFamily: base.fontFamily, fontWeight: base.fontWeight, fontStyle: base.fontStyle });
  const h15 = await byHand('hand-f15', 15, { fontFamily: 'Instrument Serif', fontWeight: base.fontWeight, fontStyle: 'italic' });
  const h25 = await byHand('hand-f25', 25, { fontFamily: 'Playfair Display', fontWeight: 700, fontStyle: 'normal' });
  const d5 = diff(k5, h5, null, 0), d15 = diff(k15, h15, null, 0), d25 = diff(k25, h25, null, 0);
  check(`keyed faces == the same faces set by hand, pixel for pixel (f5 ${d5.n}, f15 ${d15.n}, f25 ${d25.n} px differ)`, () => {
    assert.equal(d5.n, 0); assert.equal(d15.n, 0); assert.equal(d25.n, 0);
  });
  check(`the face really switches: f5 / f15 / f25 differ (${diff(k5, k15, null, 8).n} / ${diff(k15, k25, null, 8).n} px)`, () => {
    assert.ok(diff(k5, k15, null, 8).n > 2000 && diff(k15, k25, null, 8).n > 2000);
  });
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
