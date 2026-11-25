// In-browser proof of the kinetic-text features (mixed styles / accent word, kinetic presets incl.
// tracking burst, per-glyph motion blur) on the REAL app: spawns the FlashFX MCP server, builds a
// Bricks-style title only through whitelisted agent actions, and reads the WebGPU preview back:
//   - the accent word renders in its own colour (gold pixels appear on the canvas);
//   - mid-reveal, per-glyph motion blur visibly changes the frame vs the same frame with blur off,
//     while the settled frame is identical either way (blur only where glyphs move).
// B45 / B36 (wave 1B), rendered through render_frame (the exporter path, full resolution):
//   - create_project clipLength "comp": a new layer spans the whole composition;
//   - a two-line caption and a left-aligned fixedWidth box drawn as glyph stamps land on the plain text;
//   - a per-word animator runs across BOTH lines (line 2 empty, then partial, then full);
//   - type-on and blur-in draw nothing at (and before) their start frame, the first glyph included.
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:text-kinetic
// Env: FLASHFX_SERVER=dev|dist (default dev), FLASHFX_KINETIC_OUT=<dir for the PNGs>.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = process.env.FLASHFX_KINETIC_OUT ?? join(tmpdir(), 'flashfx-text-kinetic');
mkdirSync(OUT_DIR, { recursive: true });
const shotPath = (name) => join(OUT_DIR, `${name}.png`);

/** Minimal PNG decoder (8-bit RGB / RGBA, non-interlaced: what Chrome's captureScreenshot writes). */
function decodePng(buf) {
  let off = 8;
  let width = 0; let height = 0; let colorType = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (f === 1) add = a; else if (f === 2) add = b; else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      px[o] = line[x * bpp]; px[o + 1] = line[x * bpp + 1]; px[o + 2] = line[x * bpp + 2]; px[o + 3] = 255;
    }
    prev = line;
  }
  return { width, height, px };
}

/** Inside `rect`: fraction of gold-ish pixels, and (vs `other`) the fraction that changed. */
function stats(img, rect, other) {
  const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.floor(rect.x + rect.width)); const y1 = Math.min(img.height, Math.floor(rect.y + rect.height));
  let n = 0; let gold = 0; let white = 0; let changed = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4;
    const r = img.px[o]; const g = img.px[o + 1]; const b = img.px[o + 2];
    n++;
    if (r > 150 && g > 100 && b < 90 && r - b > 90) gold++;
    if (r > 200 && g > 200 && b > 200) white++;
    if (other) {
      const d = Math.max(Math.abs(r - other.px[o]), Math.abs(g - other.px[o + 1]), Math.abs(b - other.px[o + 2]));
      if (d > 24) changed++;
    }
  }
  return { gold: gold / n, white: white / n, changed: changed / n };
}

// ----- MCP client over the server's stdio -----
const env = { ...process.env, FLASHFX_SERVER: process.env.FLASHFX_SERVER ?? 'dev' };
const server = spawn(process.execPath, [join(ROOT, 'mcp/flashfx-mcp.mjs')], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
const stderr = [];
server.stderr.on('data', (d) => { stderr.push(String(d)); });
const pending = new Map();
let nextId = 1;
createInterface({ input: server.stdout }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const request = (method, params, timeoutMs = 300000) => new Promise((res, rej) => {
  const id = nextId++;
  const timer = setTimeout(() => rej(new Error(`${method} timed out\n${stderr.join('')}`)), timeoutMs);
  pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
async function call(name, args = {}, timeoutMs) {
  const r = await request('tools/call', { name, arguments: args }, timeoutMs);
  if (r.isError) throw new Error(`${name} -> ${r.content.map((c) => c.text).join('\n')}`);
  return JSON.parse(r.content[0].text);
}
async function shotAt(frame, name) {
  await call('seek', { frame });
  // Text rasters upload asynchronously: let one frame settle before the real capture.
  await call('screenshot', { path: shotPath(name), inline: false });
  const s = await call('screenshot', { path: shotPath(name), inline: false });
  return { img: decodePng(readFileSync(shotPath(name))), rect: s.canvasRect };
}

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const GOLD = [0.95, 0.72, 0.18, 1];

try {
  console.log('gpu:text-kinetic');
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gpu-text-kinetic', version: '1' } });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  await call('create_project', { name: 'Kinetic text proof', format: 'long', durationFrames: 180, uiMode: 'pro', clipLength: 'comp' }, 400000);

  const batch = await call('run_actions', {
    actions: [
      { actionId: 'editor.addText', args: { content: 'make it smooth' } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 190 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
    ],
  });
  const layerId = batch.results[0].activeLayerId;
  const plain = await shotAt(50, 'plain-whole-layer');
  // The same text forced through the per-glyph stamp path by a no-op animator (amount 0).
  const noop = { enabled: true, splitMode: 'character', selector: { start: 0, end: 1, offset: 0, shape: 'square', easeHigh: 0, easeLow: 0, amount: 0, randomizeOrder: false, seed: 1 }, delta: { position: [0, 0] } };
  await call('run_action', { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'animators', value: [noop] } });
  const stamped = await shotAt(50, 'plain-glyph-stamps');
  const align = stats(stamped.img, stamped.rect, plain.img);
  const plainInk = stats(plain.img, plain.rect).white;
  check(`glyph stamps land exactly on the whole-layer text (${(align.changed * 100).toFixed(3)}% px differ; text covers ${(plainInk * 100).toFixed(2)}%)`, () => {
    assert.ok(plainInk > 0.005, `the plain text did not render (${plainInk})`);
    assert.ok(align.changed < plainInk * 0.15, `stamped text is misplaced (${align.changed} of the canvas differs vs ${plainInk} ink)`);
  });

  const styled = await call('run_actions', {
    actions: [
      { actionId: 'editor.styleTextWord', args: { layerId, wordIndex: 2, style: { fontFamily: 'Playfair Display', fontStyle: 'italic', color: GOLD }, exclusive: true } },
      { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'motionBlur', value: true } },
      { actionId: 'agent.applyTextAnimatorPreset', args: { layerId, presetId: 'tracking-burst', startFrame: 0, durationFrames: 30, replace: true } },
    ],
  });
  check('the title is built only through whitelisted agent actions (accent word, motion blur, tracking burst)', () => {
    assert.equal(styled.ok, true, JSON.stringify(styled));
    assert.equal(styled.ran, 3);
  });

  const state = await call('get_state');
  check('state: the text keeps its words after the accent split it into styled spans', () => {
    const l = state.layers.find((x) => x.id === layerId);
    assert.ok(l, 'layer in state');
    assert.equal(l.text, 'make it smooth');
  });

  const settledBlur = await shotAt(50, 'settled-blur-on');
  check(`settled frame: the accent word renders gold on the WebGPU canvas (${(stats(settledBlur.img, settledBlur.rect).gold * 100).toFixed(2)}% gold, ${(stats(settledBlur.img, settledBlur.rect).white * 100).toFixed(2)}% white)`, () => {
    const s = stats(settledBlur.img, settledBlur.rect);
    assert.ok(s.gold > 0.001, `no gold accent pixels (${s.gold})`);
    assert.ok(s.white > 0.001, `no white base-text pixels (${s.white})`);
  });

  const midBlur = await shotAt(12, 'mid-blur-on');
  await call('run_action', { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'motionBlur', value: false } });
  const midSharp = await shotAt(12, 'mid-blur-off');
  const settledSharp = await shotAt(50, 'settled-blur-off');
  const midDiff = stats(midBlur.img, midBlur.rect, midSharp.img).changed;
  const restDiff = stats(settledBlur.img, settledBlur.rect, settledSharp.img).changed;
  check(`per-glyph motion blur: mid-reveal frame differs with blur on vs off (${(midDiff * 100).toFixed(3)}% px), settled frame does not (${(restDiff * 100).toFixed(3)}% px)`, () => {
    assert.ok(midDiff > 0.0005, `motion blur did not change the moving glyphs (${midDiff})`);
    assert.ok(restDiff < midDiff / 4, `settled frame changed too much (${restDiff} vs ${midDiff})`);
  });

  // ----- B45 / B36 (wave 1B) -----
  const titleLayer = (await call('get_layer', { layerId })).result;
  check(`clipLength "comp": the new layer spans the whole 180-frame comp (outPoint ${titleLayer.outPoint}, a 4 s clip would end at 120)`, () => {
    assert.equal(titleLayer.inPoint, 0);
    assert.equal(titleLayer.outPoint, 180);
  });
  await call('run_action', { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'visible', value: false } });

  const render = async (frame, name) => {
    await call('render_frame', { frame, path: shotPath(name), inline: false });
    return decodePng(readFileSync(shotPath(name)));
  };
  const FULL = { x: 0, y: 0, width: 1920, height: 1080 };
  const cap = await call('run_actions', {
    actions: [
      { actionId: 'editor.addText', args: { content: 'students and\nstaff alike' } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 120 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
    ],
  });
  const capId = cap.results[0].activeLayerId;
  const setAnimators = (value) => call('run_action', { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'animators', value } });
  const placement = async (label, name) => {
    await setAnimators([]);
    const plainImg = await render(50, `${name}-plain`);
    await setAnimators([noop]);
    const stampImg = await render(50, `${name}-stamps`);
    const ink = stats(plainImg, FULL).white;
    const moved = stats(stampImg, FULL, plainImg).changed;
    check(`${label}: glyph stamps land on the plain text (${(moved * 100).toFixed(3)}% px differ; text covers ${(ink * 100).toFixed(2)}%)`, () => {
      assert.ok(ink > 0.005, `the plain text did not render (${ink})`);
      assert.ok(moved < ink * 0.15, `stamped text is misplaced (${moved} differs vs ${ink} ink)`);
    });
  };
  await placement('two-line caption (centred)', 'multiline');
  await call('run_actions', {
    actions: [
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'layoutConfig.boundingBox', value: { type: 'fixedWidth', width: 1400 } } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'layoutConfig.horizontalAlign', value: 'left' } },
      // A fixedWidth box is 200 px tall and its raster clips there; stamps skip only lines that START
      // below the box, so keep both lines inside it (2 x 84 px).
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'animOverrides.fontSize.defaultValue', value: 70 } },
    ],
  });
  await placement('fixedWidth box, left-aligned, two lines', 'fixedwidth-left');
  await call('run_actions', {
    actions: [
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'layoutConfig.boundingBox', value: { type: 'auto' } } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'layoutConfig.horizontalAlign', value: 'center' } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: capId, path: 'animOverrides.fontSize.defaultValue', value: 120 } },
    ],
  });

  // Per-word animation across both lines: 4 words, line 2 = words 3 and 4.
  const m = (await call('measure_text', { layerId: capId, frame: 50 })).result;
  const top = m.box.top + 2;
  const band = (li) => ({ x: 0, width: 1920, y: top + li * m.lineHeightPx + 4, height: m.lineHeightPx * 0.85 });
  await call('run_action', { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: capId, presetId: 'rise-fade-word', startFrame: 0, durationFrames: 30, replace: true } });
  const restImg = await render(40, 'perword-rest');
  const earlyImg = await render(12, 'perword-f12');
  const laterImg = await render(22, 'perword-f22');
  const l1 = (img) => stats(img, band(0)).white;
  const l2 = (img) => stats(img, band(1)).white;
  check(`multi-line per-word reveal: line 1 shows first (${(l1(earlyImg) / l1(restImg) * 100).toFixed(0)}% of its ink at f12), line 2 empty at f12 (${(l2(earlyImg) / l2(restImg) * 100).toFixed(0)}%), partial at f22 (${(l2(laterImg) / l2(restImg) * 100).toFixed(0)}%), full at rest`, () => {
    assert.ok(l1(restImg) > 0.01 && l2(restImg) > 0.01, `both lines drawn at rest (${l1(restImg)}, ${l2(restImg)})`);
    assert.ok(l1(earlyImg) > l1(restImg) * 0.5, 'line 1 mostly in by f12');
    assert.ok(l2(earlyImg) < l2(restImg) * 0.1, 'line 2 still hidden at f12');
    assert.ok(l2(laterImg) > l2(restImg) * 0.15 && l2(laterImg) < l2(restImg) * 0.9, 'line 2 word by word at f22');
  });

  // No early first glyph: nothing drawn at or before the start frame.
  for (const presetId of ['type-on', 'blur-in']) {
    await call('run_action', { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: capId, presetId, startFrame: 20, durationFrames: 20, replace: true } });
    const before = await render(19, `${presetId}-f19`);
    const atStart = await render(20, `${presetId}-f20`);
    const after = await render(45, `${presetId}-f45`);
    const box = { x: m.box.left - 40, y: m.box.top - 40, width: m.box.width + 80, height: m.box.height + 80 };
    check(`${presetId}: no glyph before or at its start frame (ink f19 ${(stats(before, box).white * 100).toFixed(3)}%, f20 ${(stats(atStart, box).white * 100).toFixed(3)}%, f45 ${(stats(after, box).white * 100).toFixed(2)}%)`, () => {
      assert.equal(stats(before, box).white, 0, 'f19 is empty');
      assert.equal(stats(atStart, box).white, 0, 'f20 (start) is empty');
      assert.ok(stats(after, box).white > 0.01, 'fully typed afterwards');
    });
  }

  console.log(`\n${passed} checks passed. PNGs: ${OUT_DIR}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.message}\n--- server stderr ---\n${stderr.join('').slice(-4000)}`);
  process.exitCode = 1;
} finally {
  server.stdin.end();
  await new Promise((r) => { const t = setTimeout(() => { server.kill(); r(); }, 15000); server.on('exit', () => { clearTimeout(t); r(); }); });
}
