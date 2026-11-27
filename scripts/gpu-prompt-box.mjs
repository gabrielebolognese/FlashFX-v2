// gpu:prompt-box (B82): the typing prompt box renders what it claims, through the real MCP path
// (agent.addPromptBox -> render_frame on the WebGPU renderer, real fonts), on two reference builds:
//   - r10 S11: a dark #241e21 radius-36 box slides in from the right and widens as it lands, then
//     "Add user authentication with login and signup" types in 25 frames; each new glyph arrives pink
//     (#e780f6) and turns white (#f3eeed) over 4 frames; a blue -> pink gradient caret rides the head; the
//     send button is pressed 35 frames after the box appears (f462 - f427 in the reference) and the box
//     flashes a gradient, then the fill wipes back from the left;
//   - r10 S7: a light card with a "+ / Attach / Themes" chip row types "Build me a fitness tracking app"
//     (31 chars in 19 frames) behind a gradient caret.
// Pixel assertions: newest glyph pink / older glyphs white; the caret's top pixels are blue and its bottom
// pixels pink; the drawn caret sits within ~2 px of the rendered text's right ink edge and within 1.5 px of
// the resolver's caret; the typed ink width per frame == the measured prefix; the box covers the expected
// rect (and widens while landing); send squash + flash + wipe; one undo is byte-identical; export_project ->
// import_project renders byte-identically. Writes PNGs, a contact sheet of the typing and results.json.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:prompt-box
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/prompt-box';
mkdirSync(OUT, { recursive: true });
const ffx = join(mkdtempSync(join(tmpdir(), 'gpu-prompt-box-')), 'prompt-box.ffx');
const results = { checks: [], measurements: {} };
let passed = 0;
const check = (name, fn) => { fn(); passed++; results.checks.push(name); console.log(`  ✓ ${name}`); };

const BG = [0xf6, 0xee, 0xe8];
const DARK = [0x24, 0x1e, 0x21];
const S11 = 'Add user authentication with login and signup';
const S7 = 'Build me a fitness tracking app';
const at = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const near = (c, ref, tol) => c.every((v, i) => Math.abs(v - ref[i]) <= tol);
const isPink = ([r, g, b]) => Math.max(r, g, b) > 140 && g < 0.8 * r && b > g + 40;
const isWhiteInk = ([r, g, b]) => Math.max(r, g, b) > 140 && g > 0.9 * r && b > 0.88 * r;
const isDark = ([r, g, b]) => Math.max(r, g, b) < 70;
/** Pixels of `img` in a rect matching pred. */
function collect(img, x0, y0, x1, y1, pred) {
  const out = [];
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(img.height - 1, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(img.width - 1, Math.round(x1)); x++) { const c = at(img, x, y); if (pred(c, x, y)) out.push({ x, y, c }); }
  }
  return out;
}
/** Pixels that differ between two frames (by > tol) inside a rect. */
function changed(a, b, x0, y0, x1, y1, tol = 30) {
  return collect(a, x0, y0, x1, y1, (c, x, y) => { const d = at(b, x, y); return Math.max(Math.abs(c[0] - d[0]), Math.abs(c[1] - d[1]), Math.abs(c[2] - d[2])) > tol; });
}
const mean = (px) => [0, 1, 2].map((i) => px.reduce((s, p) => s + p.c[i], 0) / Math.max(1, px.length));
/** Extent of the box along one row: everything that is not the cream ground (box fill, text, send button). */
function darkExtent(img, y, x0 = 0, x1 = img.width - 1) {
  let left = -1, right = -1;
  for (let x = x0; x <= x1; x++) if (!near(at(img, x, y), BG, 40)) { if (left < 0) left = x; right = x; }
  return { left, right, width: left < 0 ? 0 : right - left + 1 };
}
const visibleCount = (frames, f) => frames.filter((a) => a <= f).length;

console.log('gpu:prompt-box');
const mcp = await startMcp('gpu-prompt-box');
try {
  await mcp.call('create_project', { name: 'B82 prompt box', format: 'long', durationFrames: 80, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const bg = await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: BG.map((v) => v / 255).concat(1), name: 'cream ground' } });
  assert.equal(bg.ok, true, JSON.stringify(bg).slice(0, 400));
  const render = makeRenderer(mcp, OUT);

  // ---------------------------------------------------------------- r10 S7 light card (first, so the S11 undo test has a busy base)
  const s7 = await mcp.action('agent.addPromptBox', {
    x: 960, y: 800, width: 1000, radius: 28, theme: 'light', text: S7, fontSize: 36, startFrame: 0, endFrame: 80,
    typing: { startFrame: 6, durationFrames: 19 }, caret: { gradient: ['#6175ce', '#e85aa0'], width: 4 }, buttons: { row: ['+', 'Attach', 'Themes'] }, entrance: 'pop', placeholder: 'Ask Lovable to create a web app...',
  });
  assert.equal(s7.ok, true, JSON.stringify(s7).slice(0, 600));
  const P7 = s7.result;
  results.measurements.s7 = { box: P7.box, typing: P7.typing, sendCenter: P7.sendCenter };

  const base30 = await render('pb-0-base-f30', 30);

  // ---------------------------------------------------------------- r10 S11 dark box (times relative: box f7 = ref f427)
  const s11 = await mcp.action('agent.addPromptBox', {
    x: 960, y: 360, width: 872, height: 96, radius: 36, theme: 'dark', text: S11, fontSize: 30, startFrame: 7, endFrame: 80,
    typing: { startFrame: 12, durationFrames: 25 }, arrivalColor: '#e780f6', arrivalFrames: 4,
    caret: { gradient: ['#6175ce', '#e85aa0'], width: 4 }, buttons: { send: true }, sendFrame: 42, flash: true, entrance: 'slideFromRight',
  });
  assert.equal(s11.ok, true, JSON.stringify(s11).slice(0, 600));
  const P = s11.result;
  results.measurements.s11 = { box: P.box, typing: P.typing, sendCenter: P.sendCenter, caretPath: P.caretPath };
  check(`agent.addPromptBox (S11) returns the geometry: box ${P.box.left}..${P.box.right} x ${P.box.top}..${P.box.bottom}, typing f${P.typing.startFrame}-${P.typing.endFrame}, send at (${P.sendCenter}), ${P.caretPath.length} caret points`, () => {
    assert.deepEqual([P.box.left, P.box.right, P.box.top, P.box.bottom, P.box.radius], [524, 1396, 312, 408, 36]);
    assert.deepEqual([P.typing.startFrame, P.typing.endFrame], [12, 36]);
    assert.ok(!P.warnings, JSON.stringify(P.warnings));
  });
  const fr = P.typing.frames;
  const caretAtF = (f) => P.caretPath.find((p) => p.frame === f);

  // Contact sheet of the typing (+ entrance and flash).
  await mcp.call('render_strip', { frames: [7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 42, 44, 50, 56, 63], columns: 4, tileWidth: 480, path: join(OUT, 'pb-contact-sheet.png'), inline: false });

  // 1. Box geometry: transparent on f7, widening and moving left while landing, exactly on its rect from f25.
  const frames = {};
  for (const f of [7, 12, 14, 18, 25, 30]) frames[f] = await render(`pb-1-s11-f${f}`, f);
  const ext = Object.fromEntries([12, 14, 18, 25, 30].map((f) => [f, darkExtent(frames[f], 360, 300, 1919)]));
  results.measurements.entranceRow360 = ext;
  check(`slideFromRight: no box on f7; it widens and slides left while landing (row 360 extent ${[12, 14, 18, 25].map((f) => `f${f} ${ext[f].left}..${ext[f].right}`).join(', ')})`, () => {
    assert.equal(darkExtent(frames[7], 360, 300, 1919).width, 0);
    assert.ok(ext[12].left > ext[14].left && ext[14].left > ext[18].left && ext[18].left >= ext[25].left, 'left edge moves left');
    assert.ok(ext[12].width < ext[14].width && ext[14].width < ext[18].width && ext[18].width <= ext[25].width, 'widens');
  });
  check(`the landed box covers its rect: row 360 from ${ext[30].left}..${ext[30].right} (want 524..1395), corners rounded, outside = ground`, () => {
    const row = ext[30];
    assert.ok(Math.abs(row.left - 524) <= 1.5 && Math.abs(row.right - 1395) <= 1.5, JSON.stringify(row));
    const img = frames[30];
    for (const [x, y] of [[524 + 40, 312 + 3], [524 + 3, 360], [1396 - 3, 360], [960, 408 - 3], [960, 312 + 3], [1396 - 40, 408 - 3]]) assert.ok(near(at(img, x, y), DARK, 4), `inside (${x}, ${y}) = ${at(img, x, y)}`);
    for (const [x, y] of [[524 - 3, 360], [1396 + 3, 360], [960, 312 - 3], [960, 408 + 3], [524 + 3, 312 + 3], [1396 - 3, 408 - 3]]) assert.ok(near(at(img, x, y), BG, 4), `outside / corner (${x}, ${y}) = ${at(img, x, y)}`);
  });

  // 2. Typed ink per frame == the measured prefix; newest glyph pink, older ones white.
  const lineTop = 360 - 22, lineBot = 360 + 22, textX0 = 524 + 10, textX1 = 1396 - 80; // inside the box edge (its antialiased rim is greyish)
  const inkLeftAt = (img) => collect(img, textX0, lineTop, textX1, lineBot, (c) => isWhiteInk(c) || isPink(c)).reduce((m, p) => Math.min(m, p.x), Infinity);
  const typed = {};
  for (let f = 26; f <= 37; f++) typed[f] = await render(`pb-2-s11-typing-f${f}`, f);
  const inkLeft = inkLeftAt(typed[37]);
  const growth = [];
  for (let f = 26; f <= 37; f++) {
    const n = visibleCount(fr, f);
    const prefix = S11.slice(0, n).trimEnd();
    const w = (await mcp.action('agent.measureString', { text: prefix, fontFamily: 'Inter', fontSize: 30 })).result.width;
    // The text ink only: stop just before the caret (the resolver's caret left edge for this frame).
    const px = collect(typed[f], textX0, lineTop, Math.floor(caretAtF(Math.min(f, 37))?.left ?? textX1) - 1, lineBot, (c) => isWhiteInk(c) || isPink(c));
    const right = px.reduce((m, p) => Math.max(m, p.x), -Infinity);
    growth.push({ f, n, measured: Math.round(w * 10) / 10, inkWidth: right - inkLeft + 1 });
  }
  results.measurements.inkGrowth = growth;
  check(`visible characters per frame: rendered ink width == measured prefix width on f26..f37 (max error ${Math.max(...growth.map((g) => Math.abs(g.inkWidth - g.measured))).toFixed(1)} px)`, () => {
    for (const g of growth) assert.ok(Math.abs(g.inkWidth - g.measured) <= 3, `f${g.f}: ink ${g.inkWidth} vs measured ${g.measured} (${g.n} chars)`);
  });
  const colourChecks = [];
  for (let f = 27; f <= 36; f++) {
    const head = caretAtF(f), prev = caretAtF(f - 1), old = caretAtF(f - 4);
    if (!head || !prev || !old) continue;
    const newPx = collect(typed[f], prev.left + 1, lineTop, head.left - 2, lineBot, (c) => Math.max(...c) > 140);
    const oldPx = collect(typed[f], textX0, lineTop, old.left - 3, lineBot, (c) => Math.max(...c) > 140);
    colourChecks.push({ f, newInk: newPx.length, newPink: newPx.filter((p) => isPink(p.c)).length, oldInk: oldPx.length, oldWhite: oldPx.filter((p) => isWhiteInk(p.c)).length, newMean: mean(newPx).map(Math.round), oldMean: mean(oldPx).map(Math.round) });
  }
  results.measurements.arrivalColour = colourChecks;
  const withInk = colourChecks.filter((c) => c.newInk >= 10);
  check(`arrival colour: on ${withInk.length} typing frames the glyphs that arrived THIS frame are pink (mean ${withInk[0]?.newMean}) and glyphs 4+ frames old are white (mean ${withInk[0]?.oldMean})`, () => {
    assert.ok(withInk.length >= 6, `${withInk.length} frames with new ink`);
    for (const c of withInk) {
      assert.ok(c.newPink >= 0.8 * c.newInk, `f${c.f}: ${c.newPink}/${c.newInk} new pixels pink`);
      assert.ok(c.oldInk > 50 && c.oldWhite >= 0.97 * c.oldInk, `f${c.f}: ${c.oldWhite}/${c.oldInk} old pixels white`);
    }
  });

  // 3. Caret: gradient pixels + position (caret pixels = frame with caret minus the same frame without it).
  const caretRuns = [];
  for (const f of [26, 29, 33, 37, 40]) {
    const withC = f <= 37 ? typed[f] : await render(`pb-3-s11-f${f}`, f);
    const off = await mcp.action('editor.updateLayerProperty', { layerId: P.textId, path: 'caret.enabled', value: false });
    assert.equal(off.ok, true);
    const noC = await render(`pb-3-s11-nocaret-f${f}`, f);
    await mcp.call('undo');
    const cp = changed(withC, noC, 524, 300, 1396, 420, 25);
    const xs = cp.map((p) => p.x), ys = cp.map((p) => p.y);
    const top = cp.filter((p) => p.y <= Math.min(...ys) + 2), bottom = cp.filter((p) => p.y >= Math.max(...ys) - 2);
    // Text ink incl. its antialiased rim: anything clearly brighter than the box fill.
    const inkPx = collect(noC, textX0, lineTop, textX1, lineBot, (c) => Math.max(...c) > 90);
    const n = visibleCount(fr, f);
    caretRuns.push({
      f, n, lastChar: S11[n - 1], caretPx: cp.length, drawnLeft: Math.min(...xs), drawnRight: Math.max(...xs), top: mean(top).map(Math.round), bottom: mean(bottom).map(Math.round),
      inkRight: inkPx.reduce((m, p) => Math.max(m, p.x), -Infinity), cpuLeft: caretAtF(Math.min(f, 37))?.left ?? null,
    });
  }
  results.measurements.caret = caretRuns;
  check(`gradient caret: top pixels blue (${caretRuns[0].top}), bottom pixels pink (${caretRuns[0].bottom}) on every sampled frame`, () => {
    for (const c of caretRuns) {
      assert.ok(c.caretPx >= 40, `f${c.f}: ${c.caretPx} caret px`);
      assert.ok(c.top[2] > c.top[0] + 40, `f${c.f}: top ${c.top} is blue`);
      assert.ok(c.bottom[0] > c.bottom[2] + 25 && c.bottom[0] > c.bottom[1] + 60, `f${c.f}: bottom ${c.bottom} is pink`);
    }
  });
  const onHead = caretRuns.filter((c) => c.lastChar !== ' ' && c.f <= 37);
  check(`caret on the head: drawn left edge within ~2 px of the text's right ink edge (gaps ${onHead.map((c) => (c.drawnLeft - c.inkRight - 1)).join(', ')} px) and within 1.5 px of the resolver (${onHead.map((c) => (c.drawnLeft - c.cpuLeft).toFixed(2)).join(', ')})`, () => {
    assert.ok(onHead.length >= 3);
    for (const c of onHead) {
      const gap = c.drawnLeft - c.inkRight - 1;
      assert.ok(gap >= -1 && gap <= 2.5, `f${c.f}: gap ${gap}`);
      assert.ok(Math.abs(c.drawnLeft - c.cpuLeft) <= 1.5, `f${c.f}: drawn ${c.drawnLeft} vs resolver ${c.cpuLeft}`);
    }
  });

  // 4. Send press + flash + wipe.
  const sx = P.sendCenter[0], sy = P.sendCenter[1];
  const light = (img) => collect(img, sx - 40, sy - 40, sx + 40, sy + 40, ([r, g, b]) => Math.min(r, g, b) > 200).length;
  const f42 = await render('pb-4-send-f42', 42), f43 = await render('pb-4-send-f43-pressed', 43), f46 = await render('pb-4-send-f46', 46);
  const ratio = light(f43) / light(f42);
  results.measurements.sendPress = { f42: light(f42), f43: light(f43), f46: light(f46), ratio };
  check(`send press: the button squashes on f43 (light px ${light(f42)} -> ${light(f43)}, ratio ${ratio.toFixed(3)} ~ 0.85^2) and is back on f46 (${light(f46)})`, () => {
    assert.ok(ratio > 0.62 && ratio < 0.82, `${ratio}`);
    assert.ok(Math.abs(light(f46) - light(f42)) <= light(f42) * 0.03);
  });
  const f44 = await render('pb-4-flash-f44', 44), f56 = await render('pb-4-wipe-f56', 56), f63 = await render('pb-4-wiped-f63', 63);
  const L = (img) => at(img, 560, 325), R = (img) => at(img, 1340, 325);
  results.measurements.flash = { f44: [L(f44), R(f44)], f56: [L(f56), R(f56)], f63: [L(f63), R(f63)] };
  check(`flash: f44 the box is a blue -> orange gradient (left ${L(f44)}, right ${R(f44)}); f56 the dark fill is back on the left (${L(f56)}) not yet on the right (${R(f56)}); f63 all dark again`, () => {
    assert.ok(L(f44)[2] > L(f44)[0] + 60, 'left blue');
    assert.ok(R(f44)[0] > R(f44)[2] + 60, 'right orange');
    assert.ok(near(L(f56), DARK, 6) && !near(R(f56), DARK, 30), 'wipe from the left');
    assert.ok(near(L(f63), DARK, 4) && near(R(f63), DARK, 4), 'wiped back');
  });

  // 5. S7 light card.
  const c24 = await render('pb-5-s7-f24-typed', 24), c15 = await render('pb-5-s7-f15', 15);
  const b7 = P7.box;
  const s7Top = b7.top + 10, s7Mid = b7.top + 60;
  const darkInk = ([r, g, b]) => Math.max(r, g, b) < 200; // ink incl. its antialiased rim on white
  const inkS7 = (img) => collect(img, b7.left + 10, s7Top, b7.right - 10, s7Mid, (c) => darkInk(c));
  const w24 = (await mcp.action('agent.measureString', { text: S7, fontFamily: 'Inter', fontSize: 36 })).result.width;
  const n15 = visibleCount(P7.typing.frames, 15);
  const w15 = (await mcp.action('agent.measureString', { text: S7.slice(0, n15).trimEnd(), fontFamily: 'Inter', fontSize: 36 })).result.width;
  const i24 = inkS7(c24), i15 = inkS7(c15);
  const left7 = i24.reduce((m, p) => Math.min(m, p.x), Infinity);
  const width24 = i24.reduce((m, p) => Math.max(m, p.x), -Infinity) - left7 + 1;
  const width15 = i15.reduce((m, p) => Math.max(m, p.x), -Infinity) - left7 + 1;
  const rowInk = collect(c24, b7.left + 10, b7.bottom - 70, b7.left + 400, b7.bottom - 10, (c) => Math.max(...c) < 235).length;
  results.measurements.s7Ink = { width24, w24, width15, w15, n15, rowInk };
  check(`S7 light card: ink width at f24 ${width24} px == measured "${S7}" ${w24.toFixed(1)} (side bearings aside); at f15 (${n15} chars) ${width15} == ${w15.toFixed(1)}; growth f15 -> f24 ${width24 - width15} == ${(w24 - w15).toFixed(1)}; chip row drawn (${rowInk} px)`, () => {
    assert.ok(Math.abs(width24 - w24) <= 4 && Math.abs(width15 - w15) <= 4);
    assert.ok(Math.abs((width24 - width15) - (w24 - w15)) <= 2);
    assert.ok(rowInk > 300);
  });
  const offS7 = await mcp.action('editor.updateLayerProperty', { layerId: P7.textId, path: 'caret.enabled', value: false });
  assert.equal(offS7.ok, true);
  const c15n = await render('pb-5-s7-nocaret-f15', 15);
  await mcp.call('undo');
  const cp7 = changed(c15, c15n, b7.left, b7.top, b7.right, b7.bottom, 25);
  const ys7 = cp7.map((p) => p.y);
  const top7 = mean(cp7.filter((p) => p.y <= Math.min(...ys7) + 2)).map(Math.round), bot7 = mean(cp7.filter((p) => p.y >= Math.max(...ys7) - 2)).map(Math.round);
  const ink15 = collect(c15n, b7.left + 10, s7Top, b7.right - 10, s7Mid, (c) => Math.max(...c) < 200);
  const gap7 = Math.min(...cp7.map((p) => p.x)) - (ink15.reduce((m, p) => Math.max(m, p.x), -Infinity) + 1);
  results.measurements.s7Caret = { px: cp7.length, top: top7, bottom: bot7, gap: gap7, lastChar: S7[n15 - 1] };
  check(`S7 gradient caret on white: top ${top7} blue, bottom ${bot7} pink, ${gap7} px right of the ink`, () => {
    assert.ok(cp7.length >= 40);
    assert.ok(top7[2] > top7[0] + 40 && bot7[0] > bot7[2] + 25);
    assert.ok(gap7 >= -1 && gap7 <= (S7[n15 - 1] === ' ' ? 14 : 2.5), `${gap7}`);
  });

  // 6. One undo removes the whole S11 box (byte-identical to before it); redo.
  await mcp.call('undo');
  const undone30 = await render('pb-6-undone-f30', 30);
  check(`one undo removes the whole S11 box: f30 byte-identical to the frame without it (max delta ${diff(undone30, base30).max})`, () => {
    assert.equal(diff(undone30, base30).max, 0);
  });
  await mcp.call('redo');
  const redone30 = await render('pb-6-redone-f30', 30);
  check(`redo brings it back byte-identically (max delta ${diff(redone30, frames[30]).max})`, () => { assert.equal(diff(redone30, frames[30]).max, 0); });

  // 7. Save / load.
  const pre = { 30: redone30, 44: f44, 33: typed[33] };
  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx }, 300000);
  const post = { 30: await render('pb-7-reloaded-f30', 30), 44: await render('pb-7-reloaded-f44', 44), 33: await render('pb-7-reloaded-f33', 33) };
  check(`export_project + import_project: f30 / f33 / f44 render byte-identically (max delta ${[30, 33, 44].map((f) => diff(post[f], pre[f]).max).join(' / ')})`, () => {
    for (const f of [30, 33, 44]) assert.equal(diff(post[f], pre[f]).max, 0, `f${f}`);
  });

  // 8. The prompt-box recipe (apply_recipe -> one agent.addPromptBox) builds a live box.
  const rec = await mcp.call('apply_recipe', { id: 'prompt-box', params: { text: 'Make it pop', y: 560, width: 700 }, startFrame: 0 });
  const recFrame = await render('pb-8-recipe-f25', 25);
  results.measurements.recipe = rec.returns;
  check(`apply_recipe prompt-box: one call builds the box (send at ${rec.returns?.sendX}, ${rec.returns?.sendY}, press f${rec.returns?.pressFrame}); dark box drawn at y 560`, () => {
    assert.ok(rec.returns && rec.returns.sendX > 960 && rec.returns.pressFrame > 0, JSON.stringify(rec).slice(0, 400));
    assert.ok(near(at(recFrame, 960 - 300, 560), DARK, 4), `${at(recFrame, 960 - 300, 560)}`);
  });

  await render('pb-9-evidence-f33', 33);
  results.passed = passed;
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${passed} checks passed. Frames + results.json: ${OUT}`);
} catch (e) {
  results.error = String(e.stack ?? e.message);
  results.passed = passed;
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
