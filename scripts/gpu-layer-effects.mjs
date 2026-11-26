// gpu:layer-effects (B57): effects on TEXT layers through the real MCP path (agent.applyLayerEffects ->
// precompose + the precomp effect stack -> render_frame on the WebGPU renderer):
//  - digitalGlitch on a title changes the title's pixels (RGB fringes, row slices that carry their coverage)
//    and leaves every row above / below it byte-identical (the layers behind are untouched);
//  - the text stays editable inside the precomp; a keyed effect param ("effect.245.0") is 0 at f0 (== no
//    effect) and full at f20;
//  - the positioned bulge (centre + radius) changes pixels only inside its circle.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:layer-effects
import assert from 'node:assert/strict';
import { startMcp, makeRenderer, idOf, diff, diffBox } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/fx';
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

/** Pixels in rect whose channels spread apart (colour fringes on white / grey text). */
function fringes(img, rect) {
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    const o = (y * img.width + x) * 4;
    const r = img.px[o], g = img.px[o + 1], b = img.px[o + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 80) n++;
  }
  return n;
}

console.log('gpu:layer-effects');
const mcp = await startMcp('gpu-layer-effects');
try {
  await mcp.call('create_project', { name: 'B57 layer effects', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
  // Behind the text: a full-frame dark backdrop and a striped band, which must stay byte-identical.
  idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: [0.06, 0.08, 0.16, 1], name: 'backdrop' } }));
  for (let i = 0; i < 6; i++) idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 160 + i * 320, y: 540, width: 140, height: 1080, fill: [0.2, 0.45, 0.9, 1], name: `stripe ${i}` } }));
  const batch = await mcp.actions([
    { actionId: 'editor.addText', args: { content: 'GLITCH' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 260 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
  ]);
  const textId = batch.results[0].activeLayerId;
  const render = makeRenderer(mcp, OUT);
  const ink = (await mcp.call('measure_text', { layerId: textId, frame: 10 })).result.ink;
  const pad = 40;
  const box = { x: Math.floor(ink.left - pad), y: Math.floor(ink.top - pad), width: Math.ceil(ink.width + 2 * pad), height: Math.ceil(ink.height + 2 * pad) };
  const base = await render('effects-base-f10', 10);

  // Step 1: wrap with an identity stack (glitch amount 0): precompose must not move or cover anything.
  const wrapped = await mcp.action('agent.applyLayerEffects', { layerId: textId, effects: [{ effect: 'digitalGlitch', params: [0] }] });
  const pre = wrapped.result.layerId;
  const same = await render('effects-wrapped-identity-f10', 10);
  const dSame = diff(same, base, null, 2);
  check(`precompose + identity stack renders the same frame (${dSame.n} px differ by > 2, max delta ${dSame.max})`, () => {
    assert.equal(wrapped.result.wrapped, true);
    assert.equal(dSame.n, 0);
  });
  // Step 2: the real glitch, straight on the precomp (direct route, replace).
  const applied = await mcp.action('agent.applyLayerEffects', { layerId: pre, effects: [{ effect: 'digitalGlitch', params: [0.9] }] });
  const glitched = await render('effects-glitch-f10', 10);
  const inside = diff(glitched, base, box, 8);
  const changed = diffBox(glitched, base, 2);
  check(`the glitch on the precomp changes the title (${inside.n} px, ${fringes(glitched, box)} fringe px vs ${fringes(base, box)} before)`, () => {
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.equal(applied.result.wrapped, false);
    assert.equal(applied.result.layerId, pre);
    assert.deepEqual(applied.result.effects.map((e) => e.effect), ['digitalGlitch']);
    assert.ok(inside.n > 2000, `the glitch barely changed the title (${inside.n})`);
    assert.ok(fringes(glitched, box) > fringes(base, box) + 500, 'no RGB fringes');
  });
  // The glitch slides whole rows of the layer sideways (and splits RGB a few px), so its pixels may leave
  // the ink box horizontally, but never vertically: every row above / below the title stays byte-identical.
  check(`layers behind are untouched: changes stay in the title's rows (changed y ${changed.top}-${changed.bottom} within ${box.y}-${box.y + box.height}; x ${changed.left}-${changed.right})`, () => {
    assert.ok(changed.n > 0);
    assert.ok(changed.top >= box.y && changed.bottom <= box.y + box.height, 'pixels above / below the title changed');
    assert.equal(diff(glitched, base, { x: 0, y: 0, width: 1920, height: box.y }, 0).n, 0, 'rows above the title changed');
    assert.equal(diff(glitched, base, { x: 0, y: box.y + box.height, width: 1920, height: 1080 - box.y - box.height }, 0).n, 0, 'rows below the title changed');
  });

  const st = await mcp.call('get_state');
  const preLayer = st.layers.find((l) => l.id === pre);
  await mcp.action('editor.enterPrecomp', { compositionId: wrapped.result.compositionId });
  const inner = await mcp.call('get_state');
  await mcp.action('editor.exitPrecomp', {});
  check('the text stays editable: the root has the precomp, the precomp holds the GLITCH text layer', () => {
    assert.ok(preLayer && preLayer.type === 'precomp');
    assert.ok(!st.layers.some((l) => l.id === textId), 'the text should now live inside the precomp');
    assert.ok(inner.layers.some((l) => l.type === 'text' && l.text === 'GLITCH'), JSON.stringify(inner.layers.map((l) => [l.type, l.text])));
  });

  const keyed = await mcp.action('editor.setKeyframes', { layerId: pre, propertyPath: 'effect.245.0', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 0.9 }] });
  const k0 = await render('effects-keyed-f0', 0);
  const base0 = await render('effects-keyed-base-ref-f10', 10);
  const k20 = await render('effects-keyed-f20', 20);
  const d0 = diff(k0, base, null, 2);
  check(`keyed glitch amount: f0 (amount 0) == the unaffected title (${d0.n} px differ), f20 glitched (${diff(k20, base, box, 8).n} px)`, () => {
    assert.equal(keyed.ok, true, JSON.stringify(keyed));
    assert.equal(d0.n, 0, `f0 should equal the plain render (max delta ${d0.max})`);
    assert.ok(diff(k20, base, box, 8).n > 2000);
    assert.ok(diff(base0, k20, box, 8).n >= 0);
  });

  // Positioned bulge on a second word: only its circle may change.
  const b2 = await mcp.actions([
    { actionId: 'editor.addText', args: { content: 'BULGE' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 150 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'transform.position.defaultValue', value: [1400, 260] } },
  ]);
  const bulgeText = b2.results[0].activeLayerId;
  const before = await render('effects-bulge-before-f10', 10);
  const R = 170;
  const bl = await mcp.action('agent.applyLayerEffects', { layerId: bulgeText, effects: [{ effect: 'bulge', params: [0.6, 1400 / 1920, 260 / 1080, R / 1080] }] });
  const after = await render('effects-bulge-f10', 10);
  const bd = diffBox(after, before, 2);
  check(`positioned bulge (centre 1400,260, r ${R}px): ${bd.n} px changed, all inside the circle box (x ${bd.left}-${bd.right}, y ${bd.top}-${bd.bottom})`, () => {
    assert.equal(bl.result.wrapped, true);
    assert.ok(bd.n > 1000, `the bulge changed too little (${bd.n})`);
    assert.ok(bd.left >= 1400 - R - 2 && bd.right <= 1400 + R + 2 && bd.top >= 260 - R - 2 && bd.bottom <= 260 + R + 2, 'pixels outside the bulge circle changed');
  });

  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
