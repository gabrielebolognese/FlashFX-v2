// gpu:text-counter (B75): a counter on a styled text layer renders exactly the text it formats, through the real
// MCP path (agent.setTextCounter -> render_frame on the WebGPU renderer): the counter frame at the start / middle /
// end is pixel-identical to the same layer typed with that value by hand, and the value moves in between.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:text-counter
import assert from 'node:assert/strict';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/counter';
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('gpu:text-counter');
const mcp = await startMcp('gpu-text-counter');
try {
  await mcp.call('create_project', { name: 'B75 counter', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const b = await mcp.actions([
    { actionId: 'editor.addText', args: { content: '0' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 220 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.fontStyle', value: 'italic' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.fontFamily', value: 'Instrument Serif' } },
  ]);
  const id = b.results[0].activeLayerId;
  const render = makeRenderer(mcp, OUT);
  const set = await mcp.action('agent.setTextCounter', { layerId: id, counter: { from: 10000, to: 1200000, startFrame: 0, endFrame: 30, compact: true, prefix: '+', suffix: ' views', ease: 'linear' } });
  const c0 = await render('counter-f0', 0);
  const c15 = await render('counter-f15', 15);
  const c30 = await render('counter-f30', 30);
  check(`agent.setTextCounter formats the samples (${JSON.stringify(set.result.sampleText)})`, () => {
    assert.equal(set.ok, true, JSON.stringify(set));
    assert.deepEqual(set.result.sampleText, { start: '+10K views', middle: '+605K views', end: '+1.2M views' });
  });

  // The same layer, typed by hand (counter off).
  await mcp.action('agent.setTextCounter', { layerId: id, counter: null });
  const typed = {};
  for (const [f, s] of [[0, '+10K views'], [15, '+605K views'], [30, '+1.2M views']]) {
    await mcp.action('agent.setTextContent', { layerId: id, text: s });
    typed[f] = await render(`typed-f${f}`, f);
  }
  const d0 = diff(c0, typed[0], null, 0), d15 = diff(c15, typed[15], null, 0), d30 = diff(c30, typed[30], null, 0);
  check(`counter frames == the hand-typed text, pixel for pixel (f0 ${d0.n} px, f15 ${d15.n} px, f30 ${d30.n} px differ)`, () => {
    assert.equal(d0.n, 0); assert.equal(d15.n, 0); assert.equal(d30.n, 0);
  });
  check(`the value moves: f0, f15 and f30 all differ (${diff(c0, c15, null, 8).n} / ${diff(c15, c30, null, 8).n} px)`, () => {
    assert.ok(diff(c0, c15, null, 8).n > 1000 && diff(c15, c30, null, 8).n > 1000);
  });
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
