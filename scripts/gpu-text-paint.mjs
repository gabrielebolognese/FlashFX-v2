// In-browser proof of B64 (text paint) and the runtime half of B67 (agent ergonomics) on the REAL app,
// through the FlashFX MCP server and render_frame (the exporter path, full resolution):
//   B64: a linear gradient fill at 180 deg keeps every glyph (coverage = the solid twin), 90 / 270 ramp
//        top -> bottom / bottom -> top; stroke-only text (transparent fill + span strokeColor / strokeWidth)
//        draws its outline.
//   B67: agent.placeText lands the rendered ink centre / the baseline on y; the first glow on saturated
//        green text is visible; agent.setTrimStartAngle starts a ring draw-on at 12 o'clock.
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:text-paint
// Env: FLASHFX_SERVER=dev|dist (default dev), FLASHFX_TEXT_PAINT_OUT=<dir for the PNGs>.


import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = process.env.FLASHFX_TEXT_PAINT_OUT ?? join(tmpdir(), 'flashfx-text-paint');
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

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// Pixels that differ from the background colour (sampled at the frame corner), inside a rect.
function ink(img, rect, bg) {
  const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.floor(rect.x + rect.width)); const y1 = Math.min(img.height, Math.floor(rect.y + rect.height));
  let n = 0; let top = Infinity; let bottom = -Infinity; const sum = [0, 0, 0];
  const rows = new Map();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4;
    const d = Math.max(Math.abs(img.px[o] - bg[0]), Math.abs(img.px[o + 1] - bg[1]), Math.abs(img.px[o + 2] - bg[2]));
    if (d > 40) {
      n++; top = Math.min(top, y); bottom = Math.max(bottom, y);
      sum[0] += img.px[o]; sum[1] += img.px[o + 1]; sum[2] += img.px[o + 2];
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
  }
  return { n, top, bottom, mean: n ? sum.map((v) => v / n) : [0, 0, 0], rows };
}
const meanIn = (img, y0, y1, x0, x1, bg) => ink(img, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, bg).mean;
const idOf = (r) => (typeof r?.result === 'string' ? r.result : r?.activeLayerId);
const fmt = (v) => v.map(Math.round).join(',');

try {
  console.log('gpu:text-paint (B64 text paint + B67 runtime ergonomics)');
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gpu-text-paint', version: '1' } });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  await call('create_project', { name: 'Text paint proof', format: 'long', durationFrames: 60, uiMode: 'pro', clipLength: 'comp' }, 400000);
  const render = async (name, frame = 10) => {
    await call('render_frame', { frame, path: shotPath(name), inline: false });
    return decodePng(readFileSync(shotPath(name)));
  };
  const addText = async (content, size, color) => {
    const r = await call('run_actions', { actions: [
      { actionId: 'editor.createQuickText', args: { x: 960, y: 540, text: content } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: color } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 700 } },
    ] });
    return idOf(r.results[0]);
  };
  const set = (layerId, path, value) => call('run_action', { actionId: 'editor.updateLayerProperty', args: { layerId, path, value } });
  const FULL = { x: 0, y: 0, width: 1920, height: 1080 };

  const empty = await render('00-empty');
  const bg = [empty.px[0], empty.px[1], empty.px[2]];

  // ---- B64.1 gradient fill angles keep every glyph stroke and ramp the right way
  const t1 = await addText('THE fifth', 220, [1, 1, 1, 1]);
  const solid = ink(await render('01-solid'), FULL, bg);
  const grad = (angle) => ({ kind: 'linear', angle, stops: [{ color: [1, 0.85, 0.2], position: 0, opacity: 1 }, { color: [0.2, 0.5, 1], position: 1, opacity: 1 }] });
  await set(t1, 'content.spans.0.style.fill', grad(180));
  const g180img = await render('02-grad-180');
  const g180 = ink(g180img, FULL, bg);
  check(`linear gradient at 180 deg keeps the glyph coverage (${g180.n} vs solid ${solid.n} px)`, () => {
    assert.ok(solid.n > 2000, 'solid text drew');
    assert.ok(Math.abs(g180.n - solid.n) / solid.n < 0.03, `coverage ratio ${(g180.n / solid.n).toFixed(3)}`);
  });
  check('angle 180 ramps right -> left (start colour on the right)', () => {
    const L = meanIn(g180img, solid.top, solid.bottom + 1, 0, 800, bg);
    const R = meanIn(g180img, solid.top, solid.bottom + 1, 1120, 1920, bg);
    assert.ok(L[2] > L[0] && R[0] > R[2], `left ${fmt(L)} right ${fmt(R)}`);
  });
  const mid = Math.round((solid.top + solid.bottom) / 2);
  await set(t1, 'content.spans.0.style.fill', grad(90));
  const g90img = await render('03-grad-90');
  const g90 = ink(g90img, FULL, bg);
  check(`angle 90 ramps top -> bottom (coverage ${g90.n})`, () => {
    const T = meanIn(g90img, solid.top, mid - 10, 0, 1920, bg);
    const B = meanIn(g90img, mid + 10, solid.bottom + 1, 0, 1920, bg);
    assert.ok(Math.abs(g90.n - solid.n) / solid.n < 0.03, `coverage ratio ${(g90.n / solid.n).toFixed(3)}`);
    assert.ok(T[0] - T[2] > B[0] - B[2] + 40, `top ${fmt(T)} bottom ${fmt(B)}`);
  });
  await set(t1, 'content.spans.0.style.fill', grad(270));
  const g270img = await render('04-grad-270');
  check('angle 270 ramps bottom -> top', () => {
    const T = meanIn(g270img, solid.top, mid - 10, 0, 1920, bg);
    const B = meanIn(g270img, mid + 10, solid.bottom + 1, 0, 1920, bg);
    assert.ok(B[0] - B[2] > T[0] - T[2] + 40, `top ${fmt(T)} bottom ${fmt(B)}`);
  });
  // The same text forced through the per-glyph stamp path (a no-op animator: blur-in / type-on titles
  // render this way). The gradient must still span the whole line, not restart in every glyph box.
  const noop = { enabled: true, splitMode: 'character', selector: { start: 0, end: 1, offset: 0, shape: 'square', easeHigh: 0, easeLow: 0, amount: 0, randomizeOrder: false, seed: 1 }, delta: { position: [0, 0] } };
  await set(t1, 'animators', [noop]);
  await set(t1, 'content.spans.0.style.fill', grad(180));
  const s180img = await render('04b-stamps-grad-180');
  const s180 = ink(s180img, FULL, bg);
  check(`glyph stamps: 180 deg keeps the coverage (${s180.n} vs ${solid.n}) and ramps across the line`, () => {
    assert.ok(Math.abs(s180.n - solid.n) / solid.n < 0.03, `coverage ratio ${(s180.n / solid.n).toFixed(3)}`);
    const L = meanIn(s180img, solid.top, solid.bottom + 1, 0, 800, bg);
    const R = meanIn(s180img, solid.top, solid.bottom + 1, 1120, 1920, bg);
    assert.ok(L[2] > L[0] && R[0] > R[2], `left ${fmt(L)} right ${fmt(R)}`);
  });
  await set(t1, 'content.spans.0.style.fill', grad(90));
  const s90img = await render('04c-stamps-grad-90');
  check('glyph stamps: 90 deg ramps top -> bottom', () => {
    const T = meanIn(s90img, solid.top, mid - 10, 0, 1920, bg);
    const B = meanIn(s90img, mid + 10, solid.bottom + 1, 0, 1920, bg);
    assert.ok(T[0] - T[2] > B[0] - B[2] + 40, `top ${fmt(T)} bottom ${fmt(B)}`);
  });
  await set(t1, 'visible', false);

  // ---- B64.2 outline-only text: transparent fill + span stroke draws the stroke
  const t2 = await addText('???', 300, [0, 0, 0, 0]);
  const none = ink(await render('05-transparent'), FULL, bg);
  await set(t2, 'content.spans.0.style.strokeColor', [0.78, 0.92, 0.76, 1]);
  await set(t2, 'content.spans.0.style.strokeWidth', 6);
  const outline = ink(await render('06-outline-only'), FULL, bg);
  await set(t2, 'content.spans.0.style.color', [0.78, 0.92, 0.76, 1]);
  const filled = ink(await render('07-filled'), FULL, bg);
  check(`stroke-only text renders its outline (${outline.n} px; transparent without stroke ${none.n}; filled ${filled.n})`, () => {
    assert.equal(none.n, 0);
    assert.ok(outline.n > 1500, 'outline drew');
    assert.ok(outline.n < filled.n * 0.8, 'an outline, not a fill');
  });
  await set(t2, 'visible', false);

  // ---- B67 agent.placeText: the rendered ink centre / baseline land on y
  const t3 = await addText('Mixed case', 180, [1, 1, 1, 1]);
  const before = ink(await render('08-before-place'), FULL, bg);
  const placed = await call('run_action', { actionId: 'agent.placeText', args: { layerId: t3, y: 540, anchor: 'inkCenter' } });
  const after = ink(await render('09-ink-centre'), FULL, bg);
  const centre = (after.top + after.bottom + 1) / 2;
  check(`placeText inkCenter puts the rendered ink centre on y=540 (now ${centre.toFixed(1)}, was ${((before.top + before.bottom + 1) / 2).toFixed(1)}; moved ${JSON.stringify(placed.result?.moved ?? placed.moved)})`, () => {
    assert.ok(Math.abs(centre - 540) <= 2, `ink centre ${centre}`);
  });
  await call('run_action', { actionId: 'agent.placeText', args: { layerId: t3, y: 600, anchor: 'baseline' } });
  const rowsB = ink(await render('10-baseline'), FULL, bg).rows;
  const above = rowsB.get(597) ?? 0; const below = rowsB.get(603) ?? 0;
  check(`placeText baseline sits on y=600 (row 597: ${above} px, row 603: ${below} px of descender)`, () => {
    assert.ok(above > 3 * Math.max(1, below), 'dense above the baseline, sparse below');
  });
  await set(t3, 'visible', false);

  // ---- B67 colour-matched first glow on saturated green text
  const t4 = await addText('glow', 200, [0, 0.784, 0.325, 1]);
  const a = ink(await render('11-green-no-glow'), FULL, bg).n;
  await call('run_action', { actionId: 'editor.enableLayerEffect', args: { layerId: t4, kind: 'glow' } });
  const b = ink(await render('12-green-glow'), FULL, bg).n;
  check(`first glow on #00c853 text is visible (lit px ${a} -> ${b})`, () => { assert.ok(b > a * 1.15, 'the glow adds a halo'); });
  await set(t4, 'visible', false);

  // ---- B67 trim start angle: a 0 -> 25% ring draw-on starts at 12 o'clock
  const ring = await call('run_actions', { actions: [
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'circle', x: 960, y: 540, width: 400, height: 400, fill: [0, 0, 0, 0], stroke: [1, 1, 1, 1], strokeWidth: 12 } } },
  ] });
  const ringId = idOf(ring.results[0]);
  await call('run_actions', { actions: [
    { actionId: 'editor.convertShapeToPath', args: { layerId: ringId } },
    { actionId: 'editor.addShapeModifier', args: { layerId: ringId, type: 'trim' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: ringId, path: 'modifiers.0.end.defaultValue', value: 0.25 } },
    { actionId: 'agent.setTrimStartAngle', args: { layerId: ringId, angle: 0 } },
  ] });
  const arc = await render('13-trim-12-oclock');
  const quad = (x0, y0) => ink(arc, { x: x0, y: y0, width: 240, height: 240 }, bg).n;
  const tl = quad(720, 300); const tr = quad(960, 300); const bl = quad(720, 540); const br = quad(960, 540);
  check(`trim 0-25% from 12 o'clock fills one top quadrant (TL ${tl}, TR ${tr}, BL ${bl}, BR ${br})`, () => {
    assert.equal([tl, tr, bl, br].filter((n) => n > 500).length, 1, 'one quadrant');
    assert.ok(tl > 500 || tr > 500, 'a top quadrant');
  });

  console.log(`\n${passed} checks passed. PNGs: ${OUT_DIR}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.message}\n--- server stderr ---\n${stderr.join('').slice(-4000)}`);
  process.exitCode = 1;
} finally {
  server.stdin.end();
  await new Promise((r) => { const t = setTimeout(() => { server.kill(); r(); }, 15000); server.on('exit', () => { clearTimeout(t); r(); }); });
}
