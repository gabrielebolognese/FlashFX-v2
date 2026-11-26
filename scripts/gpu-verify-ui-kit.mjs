// GPU harness for the B35 / B51 UI-mock kit (typing caret, agent cursor rig, UI-kit templates).
// Headless Chrome with WebGPU (scripts/lib/headless-gpu.mjs): NOT part of `npm test` (CI has no GPU).
// Run locally:  npm run gpu:ui-kit   (UI_KIT_SHEET=<png path> also writes an evidence contact sheet)
//
// Everything is built through the REAL agent runtime (window.__ffxAgent.run -> the real editor / history
// stores), then rendered by the REAL WebGPURenderer offscreen, with real font measurement. Proves:
//  1. Every shader module compiles; no GPU validation error on any frame.
//  2. Caret: the lime block caret renders on screen exactly where the resolver put it (its left edge
//     within 1.5 px of the CPU stamp) on every typing frame, just right of the rightmost white text
//     pixel (the last revealed glyph), moving right as the text types on.
//  3. Cursor: the drawn arrow tip sits at the start point before the move and at the target from the
//     arrival frame on; on the click frame the arrow is squashed (x 0.82 in height); the ripple ring
//     is drawn around the hotspot after the click; the icon swap shows the hand (a shorter icon) from
//     the swap frame. Every agent action is exactly one undo step; undo of the click removes the ring.

import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { bundleEntry, makeTempDir, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = String.raw`
import { installAgentRuntime } from '@/agent/runtime';
import { useEditorStore } from '@/store/editor';
import { useHistoryStore } from '@/store/history';
import { WebGPURenderer } from '@/engine/renderer';
import { resolveFrame } from '@/core/interpolation';
installAgentRuntime();

const W = 640, H = 360;

async function newRenderer(modules) {
  const r = new WebGPURenderer();
  const orig = GPUDevice.prototype.createShaderModule;
  if (modules) GPUDevice.prototype.createShaderModule = function (desc) { const m = orig.call(this, desc); modules.push(m); return m; };
  let ok;
  try { ok = await r.initializeOffscreen(W, H); } finally { GPUDevice.prototype.createShaderModule = orig; }
  if (!ok) throw new Error('initializeOffscreen failed');
  return r;
}
async function readPixels(r) {
  const c2 = new OffscreenCanvas(W, H);
  const g = c2.getContext('2d');
  g.drawImage(r.getOffscreenCanvas(), 0, 0);
  return g.getImageData(0, 0, W, H).data;
}
async function render(r, comp, frame) {
  const dev = r.offscreenGpu.device;
  dev.pushErrorScope('validation');
  await r.renderFrameAsync(resolveFrame(comp, frame), 'offscreen');
  const err = await dev.popErrorScope();
  // Text rasterizes asynchronously on a cache miss: render again until two passes agree.
  let px = await readPixels(r);
  for (let i = 0; i < 6; i++) {
    await new Promise((res) => setTimeout(res, 30));
    await r.renderFrameAsync(resolveFrame(comp, frame), 'offscreen');
    const again = await readPixels(r);
    if (again.every((v, k) => v === px[k])) break;
    px = again;
  }
  return { px, err: err ? err.message : null };
}
/** Bounding box of the pixels matching pred(r, g, b), or null. */
function bbox(px, pred) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (pred(px[i], px[i + 1], px[i + 2])) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return n ? { x0, y0, x1, y1, n } : null;
}
const isLime = (r, g, b) => g > 150 && r > 90 && r < 200 && b < 90;
const isWhite = (r, g, b) => r > 170 && g > 170 && b > 170;
const isCyan = (r, g, b) => r < 90 && g > 170 && b > 170;

function compOf(ids) {
  const comp = structuredClone(useEditorStore.getState().composition);
  comp.layers = comp.layers.filter((l) => ids.includes(l.id) || ids.includes(l.parentId));
  for (const b of comp.background.layers) for (const st of b.stops) st.color = [0, 0, 0];
  return comp;
}

window.__uiKitGpu = async () => {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) return { noAdapter: true };
  const a = window.__ffxAgent;
  const run = async (id, args) => { const r = await a.run(id, args); if (!r.ok) throw new Error(id + ': ' + r.error); return r; };
  const undoDepth = () => useHistoryStore.getState().undoStack.length;
  const layers = () => useEditorStore.getState().composition.layers;
  const out = { undo: {}, caret: [], cursor: {}, errors: [] };

  await run('editor.setCompositionSize', { width: W, height: H });
  await run('editor.setCompositionSetting', { key: 'durationFrames', value: 90 });

  // ── B35 caret: "TYPE ME" types on over f0..20 behind a lime block caret ──
  const T = (await run('editor.createQuickText', { x: 320, y: 120, text: 'TYPE ME' })).result;
  await run('editor.updateLayerProperty', { layerId: T, path: 'animOverrides.fontSize.defaultValue', value: 64 });
  await run('agent.applyTextAnimatorPreset', { layerId: T, presetId: 'type-on', startFrame: 0, durationFrames: 20 });
  let d0 = undoDepth();
  const caret = (await run('agent.setTextCaret', { layerId: T, caret: { style: 'block', color: [0.6, 0.85, 0.16, 1], blinkRate: 0 } })).result;
  out.undo.setTextCaret = undoDepth() - d0;
  out.caretStored = caret;
  out.badCaret = (await a.run('agent.setTextCaret', { layerId: T, caret: 5 })).ok;

  // ── B51 cursor: cyan arrow at (100, 280), moves to (500, 100) over f5..15, clicks at 20, hand at 30 ──
  d0 = undoDepth();
  const add = (await run('agent.addCursor', { icon: 'arrow', x: 100, y: 280, frame: 0, color: [0, 1, 1, 1], size: 40 })).result;
  out.undo.addCursor = undoDepth() - d0;
  const C = add.cursorId;
  out.cursor.icons = Object.keys(add.icons).sort();
  d0 = undoDepth();
  out.cursor.move = (await run('agent.cursorMoveTo', { cursorId: C, frame: 5, x: 500, y: 100, durationFrames: 10 })).result;
  out.undo.cursorMoveTo = undoDepth() - d0;
  d0 = undoDepth();
  const click = (await run('agent.cursorClick', { cursorId: C, frame: 20 })).result;
  out.undo.cursorClick = undoDepth() - d0;
  out.cursor.click = click;
  d0 = undoDepth();
  out.cursor.icon = (await run('agent.cursorIcon', { cursorId: C, frame: 30, icon: 'hand' })).result;
  out.undo.cursorIcon = undoDepth() - d0;
  out.cursor.badIcon = (await a.run('agent.cursorIcon', { cursorId: C, frame: 40, icon: 'razor' })).ok;
  out.cursor.notCursor = (await a.run('agent.cursorMoveTo', { cursorId: T, frame: 0, x: 0, y: 0 })).ok;

  // ── rendering ──
  const modules = [];
  const R = await newRenderer(modules);
  for (const m of modules) { const info = await m.getCompilationInfo(); for (const msg of info.messages) if (msg.type === 'error') out.errors.push('compile: ' + msg.message); }
  out.modules = modules.length;

  const textComp = compOf([T]);
  for (const f of [0, 4, 8, 12, 16, 20, 24]) {
    const { px, err } = await render(R, textComp, f);
    if (err) out.errors.push('caret f' + f + ': ' + err);
    const stamp = resolveFrame(textComp, f).layers.find((l) => l.id === T + '#caret');
    out.caret.push({
      f,
      lime: bbox(px, isLime),
      white: bbox(px, isWhite),
      cpuLeft: stamp ? stamp.transform.positionX - stamp.shape.width / 2 : null,
      cpuTop: stamp ? stamp.transform.positionY - stamp.shape.height / 2 : null,
      cpuW: stamp ? stamp.shape.width : null,
    });
  }

  const cursorComp = compOf([C, click.rippleId]);
  for (const f of [3, 15, 18, 20, 26, 29, 31]) {
    const { px, err } = await render(R, cursorComp, f);
    if (err) out.errors.push('cursor f' + f + ': ' + err);
    out.cursor['f' + f] = { cyan: bbox(px, isCyan), ring: bbox(px, isWhite) };
  }

  // Undo the click: the ring layer goes, the squash keys go.
  d0 = undoDepth();
  await run('history.undo'); // icon
  await run('history.undo'); // click
  out.cursor.rippleAfterUndo = layers().some((l) => l.id === click.rippleId);
  out.cursor.scaleKeysAfterUndo = layers().find((l) => l.id === C).transform.scale.keyframes.length;
  await run('history.redo');
  await run('history.redo');
  out.cursor.rippleAfterRedo = layers().some((l) => l.id === click.rippleId);

  // Optional evidence sheet: the two scenes + the four UI-kit templates through agent.renderStrip.
  if (window.__wantSheet) {
    const sheets = {};
    sheets.agent = (await run('agent.renderStrip', { frames: [0, 6, 10, 15, 20, 24, 31, 40], columns: 4, tileWidth: 320 })).result;
    await run('editor.removeLayers', { ids: layers().map((l) => l.id) });
    await run('editor.setCompositionSize', { width: 1920, height: 1080 });
    for (const id of ['search-bar-typing', 'toggle-switch', 'chat-bubbles', 'notification-banner']) {
      await run('editor.removeLayers', { ids: layers().map((l) => l.id) });
      await run('editor.insertAnimationTemplate', { id });
      const frames = id === 'search-bar-typing' ? [0, 10, 22, 40, 60, 80, 100, 115] : id === 'toggle-switch' ? [0, 10, 20, 28, 32, 40, 60, 80] : [0, 8, 20, 40, 55, 75, 90, 105];
      sheets[id] = (await run('agent.renderStrip', { frames, columns: 4, tileWidth: 480 })).result;
      if (id === 'search-bar-typing') sheets[id + '-f60'] = (await run('agent.renderFrame', { frame: 60 })).result;
    }
    out.sheets = {};
    for (const [k, s] of Object.entries(sheets)) out.sheets[k] = (await a.readExport(s.exportId, 0, s.bytes)).base64;
  }
  return out;
};
window.__ready = true;
`;

const dir = makeTempDir('ffx-ui-kit-');
try {
  await bundleEntry(ENTRY, dir);
  const r = await withHeadlessPage({ dir, timeoutMs: 300000 }, async (page) => {
    await page.evaluate("import('/bundle.js').then(() => true)");
    for (let i = 0; i < 100 && !(await page.evaluate('window.__ready === true')); i++) await new Promise((res) => setTimeout(res, 100));
    if (!(await page.evaluate('window.__ready === true'))) throw new Error(`bundle failed to load:\n${page.logs.join('\n')}`);
    if (process.env.UI_KIT_SHEET) await page.evaluate('window.__wantSheet = true');
    try {
      return await page.evaluate('window.__uiKitGpu()');
    } catch (e) {
      throw new Error(`${e.message}\n${page.logs.slice(-30).join('\n')}`);
    }
  });
  if (r.noAdapter) { console.log('SKIP: no WebGPU adapter in headless Chrome on this machine'); process.exit(0); }
  if (r.sheets && process.env.UI_KIT_SHEET) {
    for (const [k, b64] of Object.entries(r.sheets)) {
      const file = process.env.UI_KIT_SHEET.replace(/\.png$/i, '') + `-${k}.png`;
      writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`evidence sheet: ${file}`);
    }
    delete r.sheets;
  }
  let passed = 0;
  const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
  console.log(JSON.stringify({ undo: r.undo, caret: r.caret, cursor: r.cursor }, null, 1));

  check(`all ${r.modules} shader modules compile; no GPU validation errors on any frame`, () => assert.deepEqual(r.errors, []));
  check('every agent action is ONE undo step; bad caret / icon / non-cursor ids are rejected', () => {
    assert.deepEqual(r.undo, { setTextCaret: 1, addCursor: 1, cursorMoveTo: 1, cursorClick: 1, cursorIcon: 1 });
    assert.equal(r.caretStored.style, 'block');
    assert.equal(r.badCaret, false);
    assert.equal(r.cursor.badIcon, false);
    assert.equal(r.cursor.notCursor, false);
    assert.deepEqual(r.cursor.icons, ['arrow', 'hand', 'ibeam']);
  });

  check('caret renders where the resolver put it (left edge within 1.5 px) on every frame, right of the typed text', () => {
    let prev = -1;
    for (const c of r.caret) {
      assert.ok(c.lime, `f${c.f}: lime caret visible`);
      assert.ok(Math.abs(c.lime.x0 - c.cpuLeft) <= 1.5, `f${c.f}: drawn left ${c.lime.x0} vs resolver ${c.cpuLeft}`);
      assert.ok(Math.abs(c.lime.x1 + 1 - (c.cpuLeft + c.cpuW)) <= 1.5, `f${c.f}: drawn right ${c.lime.x1} vs ${c.cpuLeft + c.cpuW}`);
      if (c.white) {
        assert.ok(c.white.x1 < c.lime.x0, `f${c.f}: text (right ${c.white.x1}) ends before the caret (${c.lime.x0})`);
        // Gap = the caret gap + side bearing (+ one space advance right after a word).
        assert.ok(c.lime.x0 - c.white.x1 <= 64 * 0.5, `f${c.f}: the caret hugs the last glyph (gap ${c.lime.x0 - c.white.x1})`);
        // The block covers the glyph cell vertically (overlaps the text rows).
        assert.ok(c.lime.y0 <= c.white.y1 && c.lime.y1 >= c.white.y0, `f${c.f}: caret overlaps the text line`);
      }
      assert.ok(c.lime.x0 >= prev, `f${c.f}: the caret never moves left`);
      prev = c.lime.x0;
    }
    assert.ok(r.caret.at(-1).lime.x0 - r.caret[0].lime.x0 > 150, 'it travelled across the word');
  });

  check('cursor tip at the start before the move, exactly at the target from the arrival frame', () => {
    const c3 = r.cursor.f3.cyan, c15 = r.cursor.f15.cyan, c18 = r.cursor.f18.cyan;
    // The fill starts a few px inside the hotspot (dark 2 px outline x scale 2 + the sharp tip).
    assert.ok(c3.x0 - 100 >= 0 && c3.x0 - 100 <= 4 && c3.y0 - 280 >= 0 && c3.y0 - 280 <= 7, `f3 tip ${c3.x0}, ${c3.y0}`);
    assert.deepEqual([c15.x0 - c3.x0, c15.y0 - c3.y0], [400, -180], 'moved by exactly the target delta');
    assert.deepEqual([c18.x0, c18.y0], [c15.x0, c15.y0], 'it stays');
    assert.deepEqual(r.cursor.move.to, [500, 100]);
    assert.equal(r.cursor.move.endFrame, 15);
  });
  check('click: the arrow is squashed on the click frame (~0.82 of its height) and a ripple ring is drawn after it', () => {
    const h = (f) => r.cursor[f].cyan.y1 - r.cursor[f].cyan.y0 + 1;
    const ratio = h('f20') / h('f18');
    assert.ok(Math.abs(ratio - 0.82) < 0.06, `height ratio ${ratio.toFixed(3)}`);
    assert.equal(r.cursor.f18.ring, null, 'no ring before the click');
    const ring = r.cursor.f26.ring;
    assert.ok(ring && ring.x0 < 500 && ring.x1 > 500 && ring.y0 < 100 && ring.y1 > 100, `ring around the hotspot at f26: ${JSON.stringify(ring)}`);
    assert.equal(r.cursor.click.responseFrame, 22);
    assert.equal(r.cursor.rippleAfterUndo, false);
    assert.equal(r.cursor.scaleKeysAfterUndo, 0);
    assert.equal(r.cursor.rippleAfterRedo, true);
  });
  check('icon swap: the arrow (taller) shows until the swap frame, the hand (shorter) from it', () => {
    const h = (f) => r.cursor[f].cyan.y1 - r.cursor[f].cyan.y0 + 1;
    // Cyan fill heights (the dark outline excluded): arrow ~31 px, hand ~24 px at size 40.
    assert.ok(h('f29') >= 28 && h('f31') <= 26 && h('f29') - h('f31') >= 5, `arrow ${h('f29')} vs hand ${h('f31')}`);
    assert.equal(r.cursor.icon.from, 'arrow');
  });

  console.log(`\ngpu:ui-kit - ${passed} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
