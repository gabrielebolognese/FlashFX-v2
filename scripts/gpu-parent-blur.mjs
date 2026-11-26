// gpu:parent-blur (B66): motion blur from parent transforms, proven on real WebGPU pixels through the MCP.
//
// Scenes (one 1080x1920 @ 60 fps project, separated in time):
//   A f0-39    the r02 S1 rig: exit null > slide null > zoom null (scale 5.2 -> 1) > "Attention" (motion blur on),
//              next to an unparented twin keyed with the same zoom. render_frame of the child and of the twin must be
//              byte-identical at f6 / f8 / f12, and the blur must be real (the blur-off render differs a lot).
//   B f50-99   a parent null whips x 100 -> 980 over f50-70; a 160 px square (motion blur on) enters at f60, mid-whip.
//              Its first frame must smear like an unparented twin with the same motion keyed on itself (before B66 the
//              first frame was sharp: the blur sample was clamped to the in-point).
//   C f110-149 a parent with a Position expression ([x + 300, y]): the child must follow it (before B66 the chain was
//              evaluated with the child's expression context, so the parent's expression was ignored).
//   D          blur OFF: the same scenes with motion blur off render byte-identical to the pre-B66 engine (compares
//              against the PNGs of a `PARENT_BLUR_MODE=before` run when they exist).
//   E          export_mp4 (the real exporter, 540x960): the exported f60 carries the same first-frame smear.
// Modes: PARENT_BLUR_MODE=before renders + logs only (run it on the old engine); default (after) asserts.
// Local only (Chrome + a GPU + ffmpeg on PATH), like every gpu:* script:  npm run gpu:parent-blur
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, diff, idOf, ink, makeRenderer, startMcp } from './lib/mcp-pixels.mjs';

const MODE = process.env.PARENT_BLUR_MODE === 'before' ? 'before' : 'after';
const ROOT_OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/parent-blur';
const OUT = join(ROOT_OUT, MODE);
mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0;
const check = (name, fn) => {
  try { const info = fn(); passed++; results.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? `  ${JSON.stringify(info)}` : ''}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); if (MODE === 'after') throw e; }
};
const FULL = { x: 0, y: 0, width: 1080, height: 1920 };

const mcp = await startMcp('gpu-parent-blur');
try {
  console.log(`gpu:parent-blur (${MODE})`);
  await mcp.call('create_project', { name: `gpu parent-blur ${MODE}`, format: 'short', frameRate: 60, durationFrames: 150, uiMode: 'pro', clipLength: 'comp' }, 400000);
  const render = makeRenderer(mcp, OUT);
  const set = (layerId, path, value) => mcp.action('editor.updateLayerProperty', { layerId, path, value });
  const span = async (id, a, b) => { await set(id, 'inPoint', a); await set(id, 'outPoint', b); };
  const shape = async (x, y, w, h, fill, name) => idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x, y, width: w, height: h, fill, name } }));
  const nul = (x, y, name) => shape(x, y, 4, 4, [0, 0, 0, 0], name);
  const parent = async (childId, parentId, local) => { await mcp.action('editor.setLayerParent', { childId, parentId }); if (local) await set(childId, 'transform.position.defaultValue', local); };
  const keys = (layerId, propertyPath, keyframes) => mcp.action('editor.setKeyframes', { layerId, propertyPath, keyframes });
  const show = async (on, off) => { for (const id of on) await set(id, 'visible', true); for (const id of off) await set(id, 'visible', false); };
  const text = async (name) => {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x: 533, y: 980, text: 'Attention' } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: 81.5 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'motionBlur', value: true } },
      { actionId: 'editor.renameLayer', args: { id: '$0.result', name } },
    ]);
    return idOf(r.results[0]);
  };

  // ---------- scene A: the r02 S1 rig ----------
  const ease = [0.196, 1.334, 0.882, 0.803];
  const exitN = await nul(548, 980, 'A exit (null)'); await span(exitN, 0, 40);
  const slideN = await nul(533, 980, 'A slide (null)'); await span(slideN, 0, 40); await parent(slideN, exitN, [-15, 0]);
  const zoomN = await nul(533, 980, 'A zoom (null)'); await span(zoomN, 0, 40); await parent(zoomN, slideN, [0, 0]);
  await keys(zoomN, 'transform.scale', [{ frame: 5, value: [5.2, 5.2], ease }, { frame: 35, value: [1, 1] }]);
  const attChild = await text('A Attention (parented)'); await span(attChild, 5, 40); await parent(attChild, zoomN, [0, 0]);
  const attTwin = await text('A Attention (twin)'); await span(attTwin, 5, 40);
  await keys(attTwin, 'transform.scale', [{ frame: 5, value: [5.2, 5.2], ease }, { frame: 35, value: [1, 1] }]);

  // ---------- scene B: first frame mid-whip ----------
  const whipN = await nul(100, 960, 'B whip (null)'); await span(whipN, 50, 100);
  await keys(whipN, 'transform.position', [{ frame: 50, value: [100, 960] }, { frame: 70, value: [980, 960] }]);
  const sqChild = await shape(100, 960, 160, 160, [1, 0.25, 0.2, 1], 'B square (parented)'); await span(sqChild, 60, 100); await parent(sqChild, whipN, [0, 0]);
  await set(sqChild, 'motionBlur', true);
  const sqTwin = await shape(100, 960, 160, 160, [1, 0.25, 0.2, 1], 'B square (twin)'); await span(sqTwin, 60, 100);
  await keys(sqTwin, 'transform.position', [{ frame: 50, value: [100, 960] }, { frame: 70, value: [980, 960] }]);
  await set(sqTwin, 'motionBlur', true);

  // ---------- scene C: parent expression ----------
  const exN = await shape(300, 600, 40, 40, [0.2, 0.8, 1, 1], 'C parent (expression)'); await span(exN, 110, 150);
  await mcp.action('agent.setExpression', { layerId: exN, propertyName: 'Position', code: '[value[0] + 300, value[1]]' });
  const exChild = await shape(300, 800, 120, 120, [1, 0.9, 0.2, 1], 'C child'); await span(exChild, 110, 150); await parent(exChild, exN, [0, 200]);

  const bgOf = (img) => [img.px[0], img.px[1], img.px[2]];
  const all = [attChild, attTwin, sqChild, sqTwin];

  // A: child vs twin.
  const A = {};
  for (const f of [6, 8, 12]) {
    await show([attChild], [attTwin]); A[`child${f}`] = await render(`A-child-f${f}`, f);
    await show([attTwin], [attChild]); A[`twin${f}`] = await render(`A-twin-f${f}`, f);
  }
  await show([attChild], [attTwin]);
  await set(attChild, 'motionBlur', false); A.off8 = await render('A-child-blur-off-f8', 8); await set(attChild, 'motionBlur', true);
  check('A. r02 rig: the parented "Attention" renders byte-identical to its unparented twin at f6 / f8 / f12', () => {
    const out = {};
    for (const f of [6, 8, 12]) { const d = diff(A[`child${f}`], A[`twin${f}`], null, 0); out[`f${f}`] = d.n; assert.equal(d.max, 0, `f${f}: ${JSON.stringify(d)}`); }
    return out;
  });
  check('A. the zoom smear is real (blur on vs off at f8)', () => {
    const d = diff(A.child8, A.off8, null, 8);
    assert.ok(d.n > 5000, JSON.stringify(d));
    return { pixelsChanged: d.n, max: d.max };
  });

  // B: first frame mid-whip.
  const B = {};
  await show([sqChild], [sqTwin]); B.child60 = await render('B-child-f60', 60); B.child61 = await render('B-child-f61', 61);
  await show([sqTwin], [sqChild]); B.twin60 = await render('B-twin-f60', 60);
  await show([sqChild], [sqTwin]);
  await set(sqChild, 'motionBlur', false); B.off60 = await render('B-child-blur-off-f60', 60); await set(sqChild, 'motionBlur', true);
  const bandB = { x: 0, y: 860, width: 1080, height: 200 };
  const widthOf = (img) => { const k = ink(img, bandB, bgOf(img), 20); return { width: k.n ? k.right - k.left + 1 : 0, left: k.left, right: k.right, n: k.n }; };
  check('B. first frame of a child entering mid-whip smears (streak wider than the 160 px square)', () => {
    const w = widthOf(B.child60); const off = widthOf(B.off60);
    assert.ok(off.width >= 158 && off.width <= 164, `blur-off square is ~160 px: ${JSON.stringify(off)}`);
    assert.ok(w.width >= off.width + 15, `first-frame streak ${JSON.stringify(w)} vs sharp ${JSON.stringify(off)}`);
    return { streakWidth: w.width, sharpWidth: off.width, secondFrameWidth: widthOf(B.child61).width };
  });
  check('B. ... and it is the same smear as the twin with the motion keyed on itself (byte-identical)', () => {
    const d = diff(B.child60, B.twin60, null, 0); assert.equal(d.max, 0, JSON.stringify(d)); return { maxDiff: d.max };
  });

  // C: parent expression (the expression worker is asynchronous: render, let it answer, render again).
  await show([exN, exChild], all);
  await render('C-warmup-f120', 120); await new Promise((r) => setTimeout(r, 400)); await render('C-warmup2-f120', 120);
  const C = await render('C-f120', 120);
  const parentInk = ink(C, { x: 0, y: 500, width: 1080, height: 200 }, bgOf(C), 30);
  const childInk = ink(C, { x: 0, y: 700, width: 1080, height: 200 }, bgOf(C), 30);
  check('C. the child follows its parent\'s Position expression (parent drawn at x 600, child under it)', () => {
    assert.ok(Math.abs(parentInk.cx - 600) < 4, `parent cx ${parentInk.cx}`);
    assert.ok(Math.abs(childInk.cx - 600) < 4, `child cx ${childInk.cx} (300 = the expression ignored)`);
    return { parentCx: Math.round(parentInk.cx), childCx: Math.round(childInk.cx) };
  });

  // D: blur off byte-identical to the pre-B66 engine.
  await show(all, [exN, exChild]);
  for (const id of [attChild, attTwin, sqChild, sqTwin]) await set(id, 'motionBlur', false);
  const D = {};
  for (const f of [8, 12, 60, 64]) D[f] = await render(`D-blur-off-f${f}`, f);
  for (const id of [attChild, attTwin, sqChild, sqTwin]) await set(id, 'motionBlur', true);
  const beforeDir = join(ROOT_OUT, 'before');
  if (MODE === 'after' && existsSync(join(beforeDir, 'D-blur-off-f8.png'))) {
    check('D. motion blur off: frames are byte-identical to the pre-B66 engine (f8, f12, f60, f64)', () => {
      const out = {};
      for (const f of [8, 12, 60, 64]) { const d = diff(D[f], decodePng(readFileSync(join(beforeDir, `D-blur-off-f${f}.png`))), null, 0); out[`f${f}`] = d.max; assert.equal(d.max, 0, `f${f}: ${JSON.stringify(d)}`); }
      return out;
    });
    check('D. motion blur on, after the first frame (f61, A f8): unchanged vs the pre-B66 engine', () => {
      const out = {};
      for (const [name, img] of [['B-child-f61', B.child61], ['A-child-f8', A.child8]]) { const d = diff(img, decodePng(readFileSync(join(beforeDir, `${name}.png`))), null, 0); out[name] = d.max; assert.equal(d.max, 0, `${name}: ${JSON.stringify(d)}`); }
      return out;
    });
  }

  // E: the real exporter.
  if (MODE === 'after') {
    await show([sqChild], [attChild, attTwin, sqTwin, exN, exChild]);
    const mp4 = join(OUT, 'parent-blur-export.mp4');
    await mcp.call('export_mp4', { path: mp4, width: 540, height: 960, frameRate: 60, bitrate: 12000000, includeAudio: false }, 1800000);
    const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', mp4, '-vf', 'select=eq(n\\,60),scale=540:960:in_color_matrix=bt709:in_range=tv', '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
    const ex = { width: 540, height: 960, px: raw };
    const k = ink(ex, { x: 0, y: 430, width: 540, height: 100 }, [ex.px[0], ex.px[1], ex.px[2]], 20);
    check('E. export_mp4: the exported first frame (f60) carries the smear too (>= 86 px at half size; the sharp square is 80)', () => {
      const w = k.right - k.left + 1; assert.ok(w >= 86, `exported streak width ${w}`); return { exportedStreakWidth: w };
    });
  }

  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ mode: MODE, passed, results }, null, 2));
  console.log(`\n${MODE === 'after' ? '✓' : '·'} gpu:parent-blur (${MODE}) - ${passed}/${results.length} checks passed`);
} catch (e) {
  console.error(e.message, '\n', mcp.stderr().slice(-3000));
  process.exitCode = 1;
} finally {
  await mcp.close();
}
