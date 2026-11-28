// gpu:shape-contours (B83): arbitrary shape morphs render right through the real MCP path
// (editor.setShapeMorph with svg / path / layer poses -> render_frame on the WebGPU renderer):
//   - an SVG ring pose shows its hole; mid-morph to a heart the unpaired hole has shrunk to ~25 % area;
//   - the heart pose (one contour) is solid; a three-island SVG logo pose draws all three islands;
//   - an outlined "i" keeps its dot (the island used to be ear-cut as a hole and vanished: B80), and a
//     { type: "layer" } pose morphs into that exact outline, dot included;
//   - one undo restores the frame byte-identically; export_project + import_project renders byte-identically.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:shape-contours
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMcp, makeRenderer, diff, ink } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/shape-contours';
const ffx = join(mkdtempSync(join(tmpdir(), 'gpu-shape-contours-')), 'contours.ffx');
let passed = 0;
const results = [];
const check = (name, fn) => { fn(); passed++; results.push(name); console.log(`  ✓ ${name}`); };

const BG = [0.08, 0.08, 0.1, 1];
const BG8 = BG.map((c) => Math.round(c * 255));
const FILL = [0.96, 0.32, 0.45, 1];
const at = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const isFill = ([r, g, b]) => r > 180 && g < 140 && b < 170;
const isBg = ([r, g, b]) => r < 40 && g < 40 && b < 45;
function count(img, cx, cy, rad, pred) {
  let n = 0;
  for (let y = Math.round(cy - rad); y <= Math.round(cy + rad); y++) for (let x = Math.round(cx - rad); x <= Math.round(cx + rad); x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && pred(at(img, x, y))) n++;
  }
  return n;
}
/** Runs of ink down one column between y0 and y1. */
function runs(img, x, y0, y1) {
  let n = 0, inRun = false;
  for (let y = y0; y <= y1; y++) { const f = isFill(at(img, x, y)); if (f && !inRun) n++; inRun = f; }
  return n;
}

const RING = 'M0 50 A50 50 0 1 1 100 50 A50 50 0 1 1 0 50 Z M30 50 A20 20 0 1 0 70 50 A20 20 0 1 0 30 50 Z';
const HEART = 'M50 95 C20 70 0 52 0 30 C0 12 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 12 100 30 C100 52 80 70 50 95 Z';
const ISLANDS = 'M0 25 a25 25 0 1 0 50 0 a25 25 0 1 0 -50 0 Z M100 25 a25 25 0 1 0 50 0 a25 25 0 1 0 -50 0 Z M200 25 a25 25 0 1 0 50 0 a25 25 0 1 0 -50 0 Z';

console.log('gpu:shape-contours');
const mcp = await startMcp('gpu-shape-contours');
try {
  await mcp.call('create_project', { name: 'B83 shape contours', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const built = await mcp.actions([
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: BG, name: 'bg' } } },
    { actionId: 'editor.createQuickText', args: { x: 1640, y: 540, text: 'i' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$1.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 420 } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 540, width: 200, height: 200, fill: FILL, name: 'morph' } } },
  ]);
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 600));
  const textId = built.results[1].activeLayerId ?? built.results[1].result;
  const morphId = built.results[3].activeLayerId;
  const render = makeRenderer(mcp, OUT);

  // The plain text "i" before outlining: the reference ink.
  await mcp.action('editor.updateLayerProperty', { layerId: textId, path: 'content.spans.0.style.color', value: FILL });
  const textImg = await render('sc-0-text-i', 0);
  const textInk = ink(textImg, { x: 1440, y: 140, width: 400, height: 800 }, BG8, 60);
  const ol = await mcp.action('editor.outlineTextLayer', { layerId: textId });
  assert.equal(ol.ok, true, JSON.stringify(ol).slice(0, 400));
  const state = await mcp.call('get_state', {});
  const glyph = (state.layers ?? state.composition?.layers ?? []).find((l) => l.name === 'Glyph 1');
  assert.ok(glyph, `no "Glyph 1" layer after outlining: ${JSON.stringify(state).slice(0, 500)}`);
  const outImg = await render('sc-1-outlined-i', 0);
  const outInk = ink(outImg, { x: 1440, y: 140, width: 400, height: 800 }, BG8, 60);
  const colX = Math.round(outInk.cx);
  check(`outlined "i" keeps its dot (B80): ${runs(outImg, colX, 140, 940)} ink runs down the centre column (text: ${runs(textImg, Math.round(textInk.cx), 140, 940)}), ink ${outInk.n} px vs text ${textInk.n} px`, () => {
    assert.equal(runs(textImg, Math.round(textInk.cx), 140, 940), 2, 'reference text has a dot');
    assert.equal(runs(outImg, colX, 140, 940), 2, 'outlined glyph has stem + dot');
    assert.ok(Math.abs(outInk.n - textInk.n) / textInk.n < 0.06, `${outInk.n} vs ${textInk.n}`);
  });

  const before = await render('sc-2-before-morph-f6', 6);
  const mo = await mcp.action('editor.setShapeMorph', { layerId: morphId, poses: [
    { frame: 0, shape: { type: 'svg', d: RING, width: 400, height: 400 } },
    { frame: 12, shape: { type: 'svg', d: HEART, width: 400, height: 400 }, ease: 'cubicInOut' },
    { frame: 24, shape: { type: 'svg', d: ISLANDS, width: 400, height: 400 }, ease: 'cubicInOut' },
    { frame: 36, shape: { type: 'layer', layerId: glyph.id } },
  ] });
  assert.equal(mo.ok, true, JSON.stringify(mo).slice(0, 600));

  const f0 = await render('sc-3-ring-f0', 0);
  const holeF0 = count(f0, 960, 540, 100, isBg);
  check(`SVG ring pose: the hole shows (${holeF0} bg px within r 100 of the centre, ~${Math.round(Math.PI * 80 * 80)} expected) and the band is filled`, () => {
    assert.ok(isBg(at(f0, 960, 540)) && isFill(at(f0, 960 + 140, 540)) && isFill(at(f0, 960, 540 - 140)));
    assert.ok(Math.abs(holeF0 - Math.PI * 80 * 80) / (Math.PI * 80 * 80) < 0.05, String(holeF0));
  });
  const f6 = await render('sc-4-ring-to-heart-f6', 6);
  const holeF6 = count(f6, 960, 540, 100, isBg);
  check(`mid-morph ring -> heart (f6, linear 50 %): the unpaired hole has shrunk into its centre to ${(holeF6 / holeF0 * 100).toFixed(1)} % of its area (25 % expected)`, () => {
    assert.ok(isBg(at(f6, 960, 540)));
    assert.ok(Math.abs(holeF6 / holeF0 - 0.25) < 0.04, `${holeF6} / ${holeF0}`);
  });
  const f12 = await render('sc-5-heart-f12', 12);
  check('heart pose (one contour): solid centre, the notch at the top and the tip at the bottom', () => {
    assert.ok(isFill(at(f12, 960, 540)), 'centre filled');
    assert.ok(isBg(at(f12, 960, 540 - 185)), 'notch between the lobes');
    assert.ok(isFill(at(f12, 960, 540 + 170)), 'tip');
  });
  const f24 = await render('sc-6-islands-f24', 24);
  const islandHits = [-160, 0, 160].map((dx) => isFill(at(f24, 960 + dx, 540)));
  check(`three-island SVG logo pose: all three islands filled ${JSON.stringify(islandHits)}, the gaps between them empty`, () => {
    assert.deepEqual(islandHits, [true, true, true]);
    assert.ok(isBg(at(f24, 960 - 80, 540)) && isBg(at(f24, 960 + 80, 540)));
    for (const dx of [-160, 0, 160]) assert.ok(Math.abs(count(f24, 960 + dx, 540, 45, isFill) - Math.PI * 40 * 40) / (Math.PI * 40 * 40) < 0.06);
  });
  const f18 = await render('sc-7-heart-to-islands-f18', 18);
  check('heart -> islands mid-morph (f18): the two new islands are growing out of their own centres', () => {
    const left = count(f18, 960 - 160, 540, 45, isFill), right = count(f18, 960 + 160, 540, 45, isFill);
    assert.ok(left + right > 200, `${left} / ${right}`);
  });
  const f36 = await render('sc-8-layer-pose-i-f36', 36);
  const morphInk = ink(f36, { x: 760, y: 140, width: 400, height: 800 }, BG8, 60);
  check(`{ type: "layer" } pose: the morph lands on the outlined "i" exactly (${morphInk.n} px vs ${outInk.n} px on the glyph), dot included (${runs(f36, Math.round(morphInk.cx), 140, 940)} runs)`, () => {
    assert.equal(runs(f36, Math.round(morphInk.cx), 140, 940), 2);
    assert.ok(Math.abs(morphInk.n - outInk.n) <= Math.max(30, outInk.n * 0.01), `${morphInk.n} vs ${outInk.n}`);
    assert.ok(Math.abs((morphInk.bottom - morphInk.top) - (outInk.bottom - outInk.top)) <= 2);
  });
  const f30 = await render('sc-9-islands-to-i-f30', 30);

  await mcp.call('undo');
  const undone = await render('sc-10-undone-f6', 6);
  check(`one undo restores the pre-morph frame byte-identically (max delta ${diff(undone, before).max})`, () => {
    assert.equal(diff(undone, before).max, 0);
  });
  await mcp.call('redo');
  const redone = await render('sc-11-redone-f6', 6);
  check(`redo brings the morph back byte-identically (max delta ${diff(redone, f6).max})`, () => { assert.equal(diff(redone, f6).max, 0); });

  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx }, 300000);
  const reloaded = { 6: await render('sc-12-reloaded-f6', 6), 24: await render('sc-12-reloaded-f24', 24), 36: await render('sc-12-reloaded-f36', 36) };
  check(`export_project + import_project: f6 / f24 / f36 render byte-identically (max ${diff(reloaded[6], f6).max} / ${diff(reloaded[24], f24).max} / ${diff(reloaded[36], f36).max})`, () => {
    assert.equal(diff(reloaded[6], f6).max, 0);
    assert.equal(diff(reloaded[24], f24).max, 0);
    assert.equal(diff(reloaded[36], f36).max, 0);
  });
  await mcp.call('render_strip', { frames: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 36], path: join(OUT, 'sc-contact-sheet.png'), inline: false }).catch((e) => console.log(`  (contact sheet skipped: ${e.message.slice(0, 120)})`));
  void f30;
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ suite: 'gpu:shape-contours', passed, checks: results }, null, 2));
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
