// In-browser proof of the B67 authoring-ergonomics follow-up on the REAL app, through the FlashFX MCP server
// (run_action / measure_text / render_frame, the exporter path at full resolution):
//   errors   "did you mean" on mistyped action ids / argument names; a wrong layer id on an editor.* action fails
//            loudly (it returned ok and changed nothing before), a layer NAME passed as an id names the id.
//   B72      a span lineHeight write changes the rendered line spacing; measure_text glyphInk hugs the rendered
//            VT323 letters while `ink` stays the (taller) line box.
//   B70      agent.addCursor added after a later shot's ground draws ABOVE it (placement "fit", the old drop,
//            lands under it); renamed icons keep working; the hand's fingertip is the hotspot; the click
//            ripple stacks under the cursor.
//   stack    agent.bringToFront raises a buried layer in one undo step (editor.reorderLayers does not).
//   path     agent.setMotionPath moves a layer through its nodes on time (start / middle / end frames).
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:authoring-ergonomics
// Env: FLASHFX_SERVER=dev|dist (default dev), FLASHFX_GPU_OUT=<dir for the PNGs and results.json>.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { idOf, ink, makeRenderer, startMcp } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? join(tmpdir(), 'flashfx-authoring-ergonomics');
mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0;
const check = async (name, fn) => {
  try { const info = await fn(); passed++; results.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? `  ${JSON.stringify(info)}` : ''}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); throw e; }
};
const W = 1920; const H = 1080;
const FULL = { x: 0, y: 0, width: W, height: H };

const mcp = await startMcp('gpu-authoring-ergonomics');
try {
  console.log('gpu:authoring-ergonomics');
  await mcp.call('create_project', { name: 'Authoring ergonomics proof', format: 'long', frameRate: 30, durationFrames: 120, uiMode: 'pro', clipLength: 'comp' }, 400000);
  const render = makeRenderer(mcp, OUT);
  const set = (layerId, path, value) => mcp.action('editor.updateLayerProperty', { layerId, path, value });
  const span = async (id, a, b) => { await set(id, 'inPoint', a); await set(id, 'outPoint', b); };
  const rect = async (x, y, w, h, fill, name) => idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x, y, width: w, height: h, fill, name } }));
  const fails = async (actionId, args) => {
    try { await mcp.action(actionId, args); } catch (e) { return e.message; }
    throw new Error(`${actionId} unexpectedly succeeded`);
  };
  const text = async (content, size, family = 'Inter') => {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x: 960, y: 540, text: content } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontFamily', value: family } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
    ]);
    return idOf(r.results[0]);
  };
  const hideAll = async () => { for (const l of (await mcp.call('get_state')).layers) await set(l.id, 'visible', false); };

  const empty = await render('00-empty', 10);
  const bg = [empty.px[0], empty.px[1], empty.px[2]];

  // ------------------------------------------------------------------ clearer errors
  await check('errors: a mistyped action id and argument name come back with the intended name', async () => {
    const a = await fails('agent.placetext', { layerId: 'x', y: 1 });
    assert.match(a, /did you mean "agent\.placeText"/, a);
    const b = await fails('agent.setKeyframes', {});
    assert.match(b, /did you mean "editor\.setKeyframes"/, b);
    const t = await text('probe', 40);
    const c = await fails('editor.updateLayerProperty', { layerID: t, path: 'visible', value: false });
    assert.match(c, /unknown argument\(s\) layerID \(did you mean "layerId"\?\)/, c);
    await mcp.action('editor.renameLayer', { id: t, name: 'Probe title' });
    return { action: a.split(' (see')[0], arg: c.split(';')[0] };
  });

  await check('errors: editor.* on a missing layer id fails (it returned ok and changed nothing); a NAME passed as id names the id', async () => {
    const state = await mcp.call('get_state');
    const probe = state.layers.find((l) => l.name === 'Probe title');
    const wrong = await fails('editor.updateLayerProperty', { layerId: `${probe.id}x`, path: 'visible', value: false });
    assert.match(wrong, /no layer with id ".*" in the open composition/, wrong);
    assert.match(wrong, new RegExp(`did you mean "${probe.id}"`), wrong);
    const byName = await fails('editor.setKeyframes', { layerId: 'Probe title', propertyPath: 'transform.opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] });
    assert.match(byName, new RegExp(`that is a layer NAME: use its id "${probe.id}"`), byName);
    await set(probe.id, 'visible', false);
    return { wrongId: wrong.slice(0, 90), name: byName };
  });

  // ------------------------------------------------------------------ B72 lineHeight + glyph ink
  await check('B72: a span lineHeight write changes the rendered line spacing (it was ignored)', async () => {
    const t = await text('MMMM\nMMMM\nMMMM', 100);
    const before = ink(await render('01-lineheight-1.2', 10), FULL, bg);
    await set(t, 'content.spans.0.style.lineHeight', 0.8);
    const layer = (await mcp.call('get_layer', { layerId: t })).result;
    const after = ink(await render('02-lineheight-0.8', 10), FULL, bg);
    const hb = before.bottom - before.top; const ha = after.bottom - after.top;
    assert.equal(layer.animOverrides.lineHeight.defaultValue, 0.8, 'mirrored into the override');
    // Two line gaps shrink by (1.2 - 0.8) x 100 px each = 80 px.
    assert.ok(Math.abs((hb - ha) - 80) <= 4, `ink height ${hb} -> ${ha} (expected -80)`);
    await set(t, 'visible', false);
    return { inkHeight: [hb, ha] };
  });

  await check('B72: measure_text glyphInk hugs the rendered VT323 letters; ink (line box) is taller', async () => {
    const t = await text('HELLO 404', 200, 'VT323');
    await set(t, 'transform.scale.defaultValue', [1.5, 1.5]);
    const m = (await mcp.call('measure_text', { layerId: t, frame: 10 })).result;
    const r = ink(await render('03-vt323-glyph-ink', 10), FULL, bg);
    const g = m.glyphInk;
    const edges = { left: g.left - r.left, right: g.right - (r.right + 1), top: g.top - r.top, bottom: g.bottom - (r.bottom + 1) };
    for (const [k, v] of Object.entries(edges)) assert.ok(Math.abs(v) <= 4, `glyphInk.${k} off by ${v.toFixed(1)} px (${JSON.stringify(g)} vs rendered ${JSON.stringify(r)})`);
    assert.ok(m.ink.height > g.height / 1.5 + 20, `line box ${m.ink.height} (unscaled) vs glyph height ${g.height} (scaled x1.5)`);
    await set(t, 'visible', false);
    return { glyphInk: [g.left, g.top, g.right, g.bottom].map(Math.round), rendered: [r.left, r.top, r.right + 1, r.bottom + 1], lineBoxHeight: Math.round(m.ink.height) };
  });

  // ------------------------------------------------------------------ B70 cursor rig
  // The r03 situation: shot 1 has a ground (track A) and a card (new track B above); shot 2's ground is dropped
  // onto the top-most track with room (B). A cursor added later for shot 2 used to take the first free track
  // from the top: A, under shot 2's ground.
  const g1 = await rect(960, 540, W, H, [0.1, 0.1, 0.12, 1], 'Shot 1 ground'); await span(g1, 0, 60);
  const card = await rect(960, 540, 600, 400, [0.3, 0.3, 0.35, 1], 'Shot 1 card'); await span(card, 0, 60);
  const g2 = await rect(960, 540, W, H, [0.15, 0.35, 0.8, 1], 'Shot 2 ground'); await span(g2, 60, 120);
  const ground = await render('04-shot2-ground', 80);
  const blue = [ground.px[0], ground.px[1], ground.px[2]];
  const cursorAt = async (x, y, opts) => (await mcp.action('agent.addCursor', { x, y, frame: 60, size: 72, ...opts })).result;
  await check('B70: a cursor added after shot 2 draws above its ground; placement "fit" (the old drop) lands under it', async () => {
    const top = await cursorAt(600, 540, { name: 'Top cursor' });
    const fit = await cursorAt(1300, 540, { name: 'Fit cursor', placement: 'fit' });
    const img = await render('05-cursor-top-vs-fit', 80);
    const topInk = ink(img, { x: 560, y: 500, width: 120, height: 140 }, blue);
    const fitInk = ink(img, { x: 1260, y: 500, width: 120, height: 140 }, blue);
    assert.equal(top.placement, 'top');
    assert.ok(topInk.n > 300, `top cursor visible: ${topInk.n} px`);
    assert.equal(fitInk.n, 0, `fit cursor hidden under shot 2's ground (the B70 bug, kept as the opt-in old behaviour): ${fitInk.n} px`);
    await mcp.action('agent.bringToFront', { layerIds: [fit.cursorId] });
    const raised = ink(await render('06-fit-cursor-raised', 80), { x: 1260, y: 500, width: 120, height: 140 }, blue);
    assert.ok(raised.n > 300, `agent.bringToFront lifts the whole rig: ${raised.n} px`);
    await mcp.call('run_action', { actionId: 'history.undo' });
    const undone = ink(await render('07-raise-undone', 80), { x: 1260, y: 500, width: 120, height: 140 }, blue);
    assert.equal(undone.n, 0, 'one undo step puts it back');
    globalThis.topCursor = top;
    return { topPx: topInk.n, fitPx: fitInk.n, raisedPx: raised.n };
  });

  await check('B70: renamed icons keep working (cursorIcon + cursorMoveTo); the hand fingertip sits on the hotspot', async () => {
    const top = globalThis.topCursor;
    for (const [kind, id] of Object.entries(top.icons)) await mcp.action('editor.renameLayer', { id, name: `My ${kind}` });
    await mcp.action('agent.cursorIcon', { cursorId: top.cursorId, frame: 61, icon: 'hand' });
    await mcp.action('agent.cursorMoveTo', { cursorId: top.cursorId, frame: 62, x: 900, y: 700, durationFrames: 8 });
    const img = await render('08-hand-hotspot', 80);
    const hand = ink(img, { x: 800, y: 640, width: 200, height: 160 }, blue);
    // The fingertip = the top-most ink row: its centre must be on the hotspot (900, 700).
    let x0 = Infinity; let x1 = -Infinity;
    for (let x = 800; x < 1000; x++) {
      const o = (hand.top * img.width + x) * 4;
      if (Math.max(Math.abs(img.px[o] - blue[0]), Math.abs(img.px[o + 1] - blue[1]), Math.abs(img.px[o + 2] - blue[2])) > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    }
    const tip = [(x0 + x1 + 1) / 2, hand.top];
    assert.ok(hand.n > 300, `hand drew: ${hand.n}`);
    assert.ok(Math.abs(tip[0] - 900) <= 4 && Math.abs(tip[1] - 700) <= 4, `fingertip at ${tip} vs hotspot 900,700 (old rig: about +23, +7 at this size)`);
    return { fingertip: tip, hotspot: [900, 700] };
  });

  await check('B70: the click ripple draws under the cursor and above the shot', async () => {
    const top = globalThis.topCursor;
    await mcp.action('agent.cursorIcon', { cursorId: top.cursorId, frame: 85, icon: 'arrow' });
    const r = (await mcp.action('agent.cursorClick', { cursorId: top.cursorId, frame: 90, rippleColor: [1, 0.2, 0.2, 1] })).result;
    assert.ok(r.rippleId, 'ripple added');
    // Red ring pixels (red channel high, blue low) inside the click area.
    const reds = (img) => { let n = 0; for (let y = 560; y < 840; y++) for (let x = 760; x < 1040; x++) { const o = (y * img.width + x) * 4; if (img.px[o] > 150 && img.px[o + 2] < 140) n++; } return n; };
    const withCursor = reds(await render('09-click-ripple', 96));
    for (const id of Object.values(top.icons)) await set(id, 'visible', false);
    const noCursor = reds(await render('09b-click-ripple-no-cursor', 96));
    for (const id of Object.values(top.icons)) await set(id, 'visible', true);
    assert.ok(withCursor > 200, `ripple visible over the shot (it is above shot 2's ground): ${withCursor}`);
    // The cursor covers part of the ring, so hiding it reveals more ring: the ring is UNDER the cursor.
    assert.ok(noCursor > withCursor + 20, `ring under the cursor: ${withCursor} red px with the cursor, ${noCursor} without`);
    return { ringPxWithCursor: withCursor, ringPxWithoutCursor: noCursor };
  });

  // ------------------------------------------------------------------ stacking + motion path
  await hideAll();
  await check('agent.bringToFront raises a buried layer; editor.reorderLayers only reorders the list', async () => {
    const small = await rect(960, 540, 200, 200, [1, 0.1, 0.1, 1], 'Buried'); await span(small, 0, 120);
    const cover = await rect(960, 540, W, H, [0.1, 0.8, 0.3, 1], 'Cover'); await span(cover, 0, 120);
    const green = await render('10-buried', 30);
    const gbg = [green.px[0], green.px[1], green.px[2]];
    assert.equal(ink(green, { x: 860, y: 440, width: 200, height: 200 }, gbg).n, 0, 'buried under the cover');
    await mcp.action('editor.reorderLayers', { sourceIds: [small], targetIndex: 0 });
    const reordered = ink(await render('11-reorderLayers', 30), { x: 860, y: 440, width: 200, height: 200 }, gbg).n;
    await mcp.action('agent.bringToFront', { layerIds: [small] });
    const raised = ink(await render('12-bringToFront', 30), { x: 860, y: 440, width: 200, height: 200 }, gbg).n;
    assert.ok(raised > 35000, `raised: ${raised} px of the 40000 px square`);
    await set(small, 'visible', false); await set(cover, 'visible', false);
    return { reorderLayersPx: reordered, bringToFrontPx: raised };
  });

  await check('agent.setMotionPath: the layer starts on node 0, passes node 1 mid-way and lands on the last node', async () => {
    const dot = await rect(100, 100, 60, 60, [1, 1, 1, 1], 'Comet'); await span(dot, 0, 120);
    const r = (await mcp.action('agent.setMotionPath', { layerId: dot, nodes: [[300, 800], [960, 250], [1620, 800]], options: { startFrame: 10, endFrame: 70 } })).result;
    assert.equal(r.nodes, 3);
    const at = async (f) => { const i = ink(await render(`13-path-f${f}`, f), FULL, bg); return [i.cx, i.cy]; };
    const p0 = await at(10); const p1 = await at(40); const p2 = await at(70);
    const near = (p, q, tol, label) => assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol, `${label}: ${p.map(Math.round)} vs ${q}`);
    near(p0, [300, 800], 3, 'start'); near(p1, [960, 250], 6, 'middle'); near(p2, [1620, 800], 3, 'end');
    const removed = (await mcp.action('agent.setMotionPath', { layerId: dot, nodes: [] })).result;
    assert.equal(removed.removed, 1);
    near(await at(40), [100, 100], 3, 'path removed: back at its own position');
    return { lengthPx: r.lengthPx, f10: p0.map(Math.round), f40: p1.map(Math.round), f70: p2.map(Math.round) };
  });

  console.log(`\n${passed} checks passed.`);
} finally {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ passed, results }, null, 2));
  await mcp.close();
}
