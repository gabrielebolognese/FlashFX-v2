// gpu:design-kit (B76): the design-tool UI kit renders where it claims, through the real MCP path
// (agent.addSelectionBox / addAnchorSquares / addReadout / addGuideLabel / addCursor / cursorIcon -> render_frame
// on the WebGPU renderer), on an r11-style light canvas with dark "glyph" shapes:
//   - the selection box's handles sit on the target's corners at the start, the eased middle (rotated 45 deg) and
//     the end of a slide + rotate + resize, and every pixel the kit adds lies within a few px of the box outline;
//   - one undo removes the box and the frame is byte-identical to the frame without it;
//   - anchor squares sit on a point-pose morph's vertices while one vertex is dragged;
//   - the readout tooltip text is pixel-identical to the same layer with that string typed by hand, and counts;
//   - the guide label draws magenta above its vertex; pen / rotate cursor icons draw and swap;
//   - export_project + import_project reloads the kit and renders byte-identically.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:design-kit
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/ui';
const ffx = join(mkdtempSync(join(tmpdir(), 'gpu-design-kit-')), 'design-kit.ffx');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const BG = [0.91, 0.91, 0.91, 1];
const at = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const isBlue = ([r, g, b]) => b > 150 && b - r > 70 && b - g > 25;
const isWhite = ([r, g, b]) => r > 245 && g > 245 && b > 245; // brighter than the 232 canvas
const isMagenta = ([r, g, b]) => r > 150 && b > 140 && g < 150 && r - g > 50;
function countIn(img, cx, cy, half, pred) {
  let n = 0;
  for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) if (pred(at(img, x, y))) n++;
  return n;
}
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** The rect target's oriented box at frame f (it moves / rotates / resizes on easeInOutCubic between f10 and f20). */
function rectBox(f) {
  const u = easeInOutCubic(Math.min(1, Math.max(0, (f - 10) / 10)));
  const cx = 700 + (540 - 700) * u, cy = 540 + (520 - 540) * u, rot = 90 * u;
  const w = 220 * (1 + 0.4 * u), h = 120 * (1 - 0.3 * u);
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const corner = (lx, ly) => [cx + lx * c - ly * s, cy + lx * s + ly * c];
  return { cx, cy, rot, w, h, corners: [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)] };
}
/** Distance of a pixel from the oriented box outline. */
function distToOutline(b, x, y) {
  const a = (-b.rot * Math.PI) / 180, dx0 = x - b.cx, dy0 = y - b.cy;
  const lx = dx0 * Math.cos(a) - dy0 * Math.sin(a), ly = dx0 * Math.sin(a) + dy0 * Math.cos(a);
  const ex = Math.abs(lx) - b.w / 2, ey = Math.abs(ly) - b.h / 2;
  return ex <= 0 && ey <= 0 ? Math.min(-ex, -ey) : Math.hypot(Math.max(ex, 0), Math.max(ey, 0));
}

console.log('gpu:design-kit');
const mcp = await startMcp('gpu-design-kit');
try {
  await mcp.call('create_project', { name: 'B76 design kit', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const built = await mcp.actions([
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: BG, name: 'canvas' } } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 700, y: 540, width: 220, height: 120, fill: [0.2, 0.2, 0.21, 1], name: 'glyph bar' } } },
    { actionId: 'editor.setKeyframes', args: { layerId: '$1.activeLayerId', propertyPath: 'transform.position', keyframes: [{ frame: 10, value: [700, 540], ease: 'cubicInOut' }, { frame: 20, value: [540, 520] }] } },
    { actionId: 'editor.setKeyframes', args: { layerId: '$1.activeLayerId', propertyPath: 'transform.rotation', keyframes: [{ frame: 10, value: 0, ease: 'cubicInOut' }, { frame: 20, value: 90 }] } },
    { actionId: 'editor.setKeyframes', args: { layerId: '$1.activeLayerId', propertyPath: 'transform.scale', keyframes: [{ frame: 10, value: [1, 1], ease: 'cubicInOut' }, { frame: 20, value: [1.4, 0.7] }] } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 1400, y: 560, width: 160, height: 240, fill: [0.2, 0.2, 0.21, 1], name: 'glyph V' } } },
    { actionId: 'editor.setShapeMorph', args: { layerId: '$5.activeLayerId', poses: [
      { frame: 10, shape: { type: 'path', points: [[-80, -120], [-30, -120], [0, 40], [30, -120], [80, -120], [20, 120], [-20, 120]], closed: true }, ease: 'cubicInOut' },
      { frame: 20, shape: { type: 'path', points: [[-150, -60], [-100, -60], [0, 40], [30, -120], [80, -120], [20, 120], [-20, 120]], closed: true } },
    ], align: 'vertices' } },
  ]);
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 600));
  const bar = built.results[1].activeLayerId;
  const vee = built.results[5].activeLayerId;
  const render = makeRenderer(mcp, OUT);
  const base = { 0: await render('dk-0-base-f0', 0), 15: await render('dk-0-base-f15', 15), 25: await render('dk-0-base-f25', 25) };

  // 1. Selection box on the moving / rotating / resizing bar.
  const sb = await mcp.action('agent.addSelectionBox', { targetId: bar, startFrame: 0, endFrame: 40 });
  assert.equal(sb.ok, true, JSON.stringify(sb).slice(0, 400));
  const box = { 0: await render('dk-1-box-f0', 0), 15: await render('dk-1-box-f15-rotated45', 15), 25: await render('dk-1-box-f25', 25) };
  check(`agent.addSelectionBox returns the measured box (f0 ${sb.result.first.width} x ${sb.result.first.height} at ${sb.result.first.center}, end rot ${sb.result.last.rotation})`, () => {
    assert.equal(sb.result.handleIds.length, 8);
    assert.deepEqual(sb.result.first.center, [700, 540]);
    assert.equal(sb.result.first.width, 220);
    assert.equal(sb.result.last.rotation, 90);
    assert.equal(sb.result.last.width, 308);
  });
  for (const f of [0, 15, 25]) {
    const b = rectBox(f);
    const counts = b.corners.map(([x, y]) => [countIn(box[f], x, y, 5, isWhite), countIn(box[f], x, y, 5, isBlue)]);
    check(`f${f} (rot ${b.rot.toFixed(1)} deg): a white handle with a blue rim on each of the 4 target corners (white/blue px ${counts.map((c) => c.join('/')).join(', ')})`, () => {
      for (const [w, bl] of counts) { assert.ok(w >= 12, `white ${w}`); assert.ok(bl >= 6, `blue ${bl}`); }
    });
    let changed = 0, far = 0, worst = 0;
    for (let y = 0; y < box[f].height; y++) for (let x = 0; x < box[f].width; x++) {
      const o = (y * box[f].width + x) * 4;
      const d = Math.max(Math.abs(box[f].px[o] - base[f].px[o]), Math.abs(box[f].px[o + 1] - base[f].px[o + 1]), Math.abs(box[f].px[o + 2] - base[f].px[o + 2]));
      if (d > 2) { changed++; const dist = distToOutline(b, x, y); worst = Math.max(worst, dist); if (dist > 7) far++; }
    }
    check(`f${f}: every pixel the box adds lies on the outline band (${changed} px changed, farthest ${worst.toFixed(1)} px from the box edge, ${far} beyond 7 px)`, () => {
      assert.ok(changed > 300, `changed ${changed}`);
      assert.equal(far, 0);
    });
  }
  await mcp.call('undo');
  const undone = await render('dk-1-box-undone-f15', 15);
  check(`one undo removes the whole box: f15 byte-identical to the frame without it (max delta ${diff(undone, base[15]).max})`, () => {
    assert.equal(diff(undone, base[15]).max, 0);
  });
  await mcp.call('redo');

  // 2. Anchor squares on the V while vertex 0 is dragged (point-pose morph), + a guide label on it.
  const an = await mcp.action('agent.addAnchorSquares', { targetId: vee, startFrame: 0, endFrame: 40, options: { highlight: [0] } });
  assert.equal(an.ok, true, JSON.stringify(an).slice(0, 400));
  const gl = await mcp.action('agent.addGuideLabel', { text: 'anchor', startFrame: 0, endFrame: 40, options: { targetId: vee, point: 0, offset: [24, -22] } });
  assert.equal(gl.ok, true, JSON.stringify(gl).slice(0, 400));
  const a0 = await render('dk-2-anchors-f0', 0), a15 = await render('dk-2-anchors-f15-mid-drag', 15), a25 = await render('dk-2-anchors-f25', 25);
  const vAt = (f) => { const u = easeInOutCubic(Math.min(1, Math.max(0, (f - 10) / 10))); return [[1400 - 80 + (-70) * u, 560 - 120 + 60 * u], [1400 - 30 + (-70) * u, 560 - 120 + 60 * u], [1400, 600]]; };
  check(`agent.addAnchorSquares: ${an.result.pointCount} vertices, first at ${JSON.stringify(an.result.firstPositions[0])}`, () => {
    assert.equal(an.result.pointCount, 7);
    assert.deepEqual(an.result.firstPositions[0].map(Math.round), [1320, 440]);
  });
  for (const [f, img] of [[0, a0], [15, a15], [25, a25]]) {
    const [p0, p1, p2] = vAt(f);
    const s0 = countIn(img, p0[0], p0[1], 5, isBlue), s1w = countIn(img, p1[0], p1[1], 5, isWhite), s1b = countIn(img, p1[0], p1[1], 5, isBlue), s2b = countIn(img, p2[0], p2[1], 5, isBlue);
    check(`f${f}: the dragged vertex 0 at (${p0.map(Math.round)}) carries the filled blue square (${s0} blue px); vertex 1 a white square with blue rim (${s1w}/${s1b}); vertex 2 (${s2b} blue px)`, () => {
      assert.ok(s0 >= 30, `blue ${s0}`);
      assert.ok(s1w >= 12 && s1b >= 6);
      assert.ok(s2b >= 6);
    });
    const mg = countIn(img, p0[0] + 24, p0[1] - 22, 26, isMagenta);
    check(`f${f}: the magenta "anchor" guide label rides above vertex 0 (${mg} magenta px)`, () => { assert.ok(mg >= 25, `magenta ${mg}`); });
  }

  // align "vertices": mid-drag the drawn outline still has its sharp corner ON the anchor. The left arm's outer
  // edge runs from vertex 6 (1380, 680) to vertex 0 (1285, 470) at f15, so row 480's first dark pixel is at x ~1289.5.
  let firstDark = -1;
  for (let x = 1240; x < 1340; x++) { const [r, g, b] = at(a15, x, 480); if (r < 120 && g < 120 && b < 120) { firstDark = x; break; } }
  check(`f15 mid-drag (align "vertices"): the glyph edge passes through the dragged anchor (row 480 first dark px at x ${firstDark}, expected ~1289.5)`, () => {
    assert.ok(Math.abs(firstDark - 1289.5) <= 1.6, `${firstDark}`);
  });

  // 3. Readout: Angle tooltip on the bar, then the same text typed by hand.
  const ro = await mcp.action('agent.addReadout', { targetId: bar, startFrame: 0, endFrame: 40, options: { preset: 'angle', follow: [1100, 200] } });
  assert.equal(ro.ok, true, JSON.stringify(ro).slice(0, 400));
  check(`agent.addReadout formats the measured angle (${JSON.stringify(ro.result.sampleText)})`, () => {
    assert.deepEqual(ro.result.sampleText[0], { start: 'Angle: 0,00\u00b0', middle: 'Angle: 90,00\u00b0', end: 'Angle: 90,00\u00b0' });
  });
  const R = { x: 1090, y: 190, width: ro.result.size.width + 20, height: ro.result.size.height + 20 };
  const r12 = await render('dk-3-readout-f12', 12), r15 = await render('dk-3-readout-f15', 15);
  const tid = ro.result.textIds[0];
  const layer = await mcp.action('agent.getLayer', { layerId: tid });
  const counter = (layer.result?.layer ?? layer.result).counter;
  const fmt = (v) => `Angle: ${v.toFixed(2).replace('.', ',')}\u00b0`;
  const s12 = fmt(counter.samples[12]), s15 = fmt(counter.samples[15]);
  await mcp.action('agent.setTextCounter', { layerId: tid, counter: null });
  await mcp.action('agent.setTextContent', { layerId: tid, text: s12 });
  const t12 = await render('dk-3-typed-f12', 12);
  await mcp.action('agent.setTextContent', { layerId: tid, text: s15 });
  const t15 = await render('dk-3-typed-f15', 15);
  const d12 = diff(r12, t12, R, 0), d15 = diff(r15, t15, R, 0);
  check(`readout frames == the hand-typed strings "${s12}" / "${s15}", pixel for pixel (${d12.n} / ${d15.n} px differ)`, () => {
    assert.equal(s15, 'Angle: 45,00\u00b0');
    assert.equal(d12.n, 0); assert.equal(d15.n, 0);
  });
  check(`the readout counts: f12 and f15 differ inside the tooltip (${diff(r12, r15, R, 8).n} px)`, () => { assert.ok(diff(r12, r15, R, 8).n > 50); });
  await mcp.call('undo'); await mcp.call('undo'); await mcp.call('undo'); // back to the live counter

  // 4. Design-app cursors.
  const cur = await mcp.action('agent.addCursor', { icon: 'pen', x: 300, y: 860, frame: 0, color: [0.1, 0.1, 0.12, 1], size: 40 });
  assert.equal(cur.ok, true, JSON.stringify(cur).slice(0, 400));
  const sw = await mcp.action('agent.cursorIcon', { cursorId: cur.result.cursorId, frame: 20, icon: 'rotate' });
  assert.equal(sw.ok, true, JSON.stringify(sw).slice(0, 400));
  const c19 = await render('dk-4-cursor-pen-f19', 19), c21 = await render('dk-4-cursor-rotate-f21', 21);
  const C = { x: 260, y: 820, width: 90, height: 90 };
  check(`agent.addCursor icon "pen" carries a pen icon (icons ${Object.keys(cur.result.icons).join(', ')}); cursorIcon "rotate" adds the rotate icon (${sw.result.addedIconId ? 'added' : 'missing'}) and swaps on f20 (${diff(c19, c21, C, 30).n} px change around the hotspot)`, () => {
    assert.ok(cur.result.icons.pen);
    assert.ok(sw.result.addedIconId);
    assert.ok(diff(c19, c21, C, 30).n > 40);
    assert.ok(countIn(c19, 312, 872, 12, ([r, g, b]) => r < 80 && g < 80 && b < 90) > 20, 'dark pen nib down-right of the hotspot');
  });

  // 4b. Pen rubber band: a guide line from the V's dragged anchor to the pen cursor; r11's black arrow with a white rim.
  const gln = await mcp.action('agent.addGuideLine', { startFrame: 0, endFrame: 40, options: { from: { layerId: vee, point: 0 }, to: { layerId: cur.result.cursorId } } });
  assert.equal(gln.ok, true, JSON.stringify(gln).slice(0, 400));
  const mac = await mcp.action('agent.addCursor', { icon: 'arrow', x: 160, y: 200, frame: 0, color: [0, 0, 0, 1], rimColor: [1, 1, 1, 1], size: 44 });
  assert.equal(mac.ok, true, JSON.stringify(mac).slice(0, 400));
  const g25 = await render('dk-4b-rubber-band-f25', 25);
  const mid25 = [(1250 + 300) / 2, (500 + 860) / 2];
  const bandBlue = countIn(g25, mid25[0], mid25[1], 3, isBlue);
  const onLine = [0.25, 0.75].map((u) => countIn(g25, 1250 + (300 - 1250) * u, 500 + (860 - 500) * u, 3, isBlue));
  check(`agent.addGuideLine: the rubber band runs from the dragged anchor to the pen hotspot at f25 (blue px at 25 / 50 / 75 %: ${onLine[0]} / ${bandBlue} / ${onLine[1]}; ends ${JSON.stringify(gln.result.from)} -> ${JSON.stringify(gln.result.to)})`, () => {
    assert.ok(bandBlue >= 2 && onLine.every((n) => n >= 2));
    assert.deepEqual(gln.result.to, [300, 860]);
  });
  const rimWhite = countIn(g25, 166, 214, 12, isWhite), rimDark = countIn(g25, 166, 214, 12, ([r, g, b]) => r < 40 && g < 40 && b < 40);
  check(`black arrow with a white rim (rimColor): ${rimDark} black px inside, ${rimWhite} white rim px`, () => {
    assert.ok(rimDark >= 40 && rimWhite >= 20, `${rimDark} / ${rimWhite}`);
  });

  // 5. Save / load.
  const before = await render('dk-5-all-f15', 15);
  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx }, 300000);
  const after = await render('dk-5-reloaded-f15', 15);
  check(`export_project + import_project: the whole kit reloads and f15 renders byte-identically (max delta ${diff(after, before).max})`, () => {
    assert.equal(diff(after, before).max, 0);
  });
  // Evidence frame: everything at once, mid-edit.
  await render('dk-6-evidence-f17', 17);
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
