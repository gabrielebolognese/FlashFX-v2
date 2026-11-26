// gpu:shape-render (B63): the shape render defects found replicating r02 / r03 / r04 / r06 / r07, each proven on the
// WebGPU renderer through the real MCP path (addShapeLayer / updateLayerProperty / setShapeMorph -> render_frame):
//   1. a circle draws at its true radius (it drew 10% too large: the old 1.1x SDF quad margin was read as the radius)
//   2. a centred SDF stroke is never clipped at the shape bounds (rings had flat sides, outlines lost their ends)
//   3. addShapeLayer circle w != h is a true ellipse (radius / radiusY, scale 1); GPU == CPU twin ellipseDistance
//   4. a circle with a non-uniform layer scale draws as an ellipse (it drew a circle at the smaller scale)
//   5. rounded-rect corner radii scale with the layer / parent (the r06 "lens ends" on a 3305 px pill under a 0.5 null)
//   6. borderRadius is clamped to half the short side
//   7. a radial materialConfig written in 0..1 units (the r07 config) renders, == its 0..100 twin; a loose material
//      (no ids / opacity, RGBA array colours) == its complete twin
//   8. a setShapeMorph ellipse keeps its size and its radial gradient (it drew flat), == the SDF ellipse twin
//   9. a single-pose (or hold-first-pose) 48-vertex sunburst renders its full area (it rendered nothing)
//  10. addShapeLayer polygon has `sides` (it made a rectangle)
//  11. a gradient material on a path shape == the same gradient on the SDF rectangle
// Every check is evaluated (a failure does not stop the run), so the same file documents the BEFORE state when run
// on the pre-B63 tree. Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:shape-render
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, makeRenderer, idOf, ink, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/shapes/after';
const tmp = mkdtempSync(join(tmpdir(), 'gpu-shape-'));
let twin = null;
try {
  await build({ stdin: { contents: `export * from './src/core/shapeSdf';`, resolveDir: process.cwd(), sourcefile: 'e.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 's.mjs'), logLevel: 'silent' });
  twin = await import(pathToFileURL(join(tmp, 's.mjs')).href);
} catch { /* pre-B63 tree: no twin module; the twin check reports it */ }

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`); };
const W = [1, 1, 1, 1];
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const box = (i) => `${i.right - i.left + 1}x${i.bottom - i.top + 1}`;
const rect = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });
const px = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
/** diff of region a (centred ca) against the same-size region centred cb, in one frame. */
function shiftDiff(img, ca, cb, w, h, tol) {
  let n = 0; let max = 0; let sum = 0; let cnt = 0;
  for (let y = -h / 2; y < h / 2; y++) for (let x = -w / 2; x < w / 2; x++) {
    const p = px(img, ca[0] + x, ca[1] + y); const q = px(img, cb[0] + x, cb[1] + y);
    const d = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
    sum += d; cnt++; if (d > tol) n++; if (d > max) max = d;
  }
  return { n, max, mean: sum / cnt };
}

console.log('gpu:shape-render');
const mcp = await startMcp('gpu-shape-render');
try {
  await mcp.call('create_project', { name: 'B63 shapes', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const st = await mcp.call('get_state');
  let bgId = st.background?.layers?.[0]?.id;
  if (!bgId) bgId = (await mcp.action('editor.addBackgroundLayer', [])).result;
  await mcp.action('editor.updateBackgroundLayer', { id: bgId, updates: { type: 'solid', opacity: 1, enabled: true, stops: [{ color: [0, 0, 0], position: 0, opacity: 1 }, { color: [0, 0, 0], position: 1, opacity: 1 }] } });
  const render = makeRenderer(mcp, OUT);
  const BG = [0, 0, 0];
  const add = async (opts) => idOf(await mcp.action('editor.addShapeLayer', { opts }));
  const set = (layerId, path, value) => mcp.action('editor.updateLayerProperty', { layerId, path, value });
  const layer = async (layerId) => (await mcp.call('get_layer', { layerId })).result;
  const clear = async (ids) => { for (const id of ids) await mcp.action('editor.removeLayer', { id }); };

  // ── 1-4: circle radius, ring / rect strokes, ellipse ────────────────────────────────────────────────────────────
  {
    const a = await add({ type: 'circle', x: 300, y: 300, width: 300, height: 300, fill: W, name: 'circle r150' });
    const b = await add({ type: 'circle', x: 800, y: 300, width: 300, height: 300, fill: [0, 0, 0, 0], stroke: W, strokeWidth: 40, name: 'ring r150 sw40' });
    const c = await add({ type: 'rectangle', x: 1400, y: 300, width: 400, height: 200, fill: [0, 0, 0, 0], stroke: W, strokeWidth: 30, name: 'rect outline sw30' });
    const d = await add({ type: 'circle', x: 500, y: 800, width: 600, height: 200, fill: W, name: 'ellipse 600x200' });
    const e = await add({ type: 'circle', x: 1400, y: 800, width: 400, height: 400, fill: W, name: 'circle scaled 1 x 0.4' });
    await set(e, 'transform.scale.defaultValue', [1, 0.4]);
    const img = await render('01-circles-strokes-ellipses', 0);
    const ia = ink(img, rect(300, 300, 420, 420), BG, 127);
    check('1. circle radius 150 draws 300 px wide (was 10% larger)', near(ia.right - ia.left + 1, 300, 3) && near(ia.bottom - ia.top + 1, 300, 3), box(ia));
    const ib = ink(img, rect(800, 300, 440, 440), BG, 127);
    const diag = px(img, 800 + 165 * Math.SQRT1_2, 300 - 165 * Math.SQRT1_2)[0];
    check('2a. ring stroke 40 on r150 is not clipped: 340 px round ring', near(ib.right - ib.left + 1, 340, 3) && near(ib.bottom - ib.top + 1, 340, 3) && diag > 200, `${box(ib)}, 45 deg sample ${diag}`);
    const ic = ink(img, rect(1400, 300, 500, 300), BG, 127);
    check('2b. rect 400x200 outline 30 is not clipped: 430x230', near(ic.right - ic.left + 1, 430, 3) && near(ic.bottom - ic.top + 1, 230, 3), box(ic));
    const L = await layer(d);
    const rY = L.shape?.radiusY?.defaultValue; const sc = L.transform?.scale?.defaultValue;
    const id_ = ink(img, rect(500, 800, 700, 300), BG, 127);
    check('3a. addShapeLayer circle 600x200 is a true ellipse (radius 300, radiusY 100, scale [1, 1]) drawn 600x200',
      L.shape?.radius?.defaultValue === 300 && rY === 100 && sc?.[0] === 1 && sc?.[1] === 1 && near(id_.right - id_.left + 1, 600, 3) && near(id_.bottom - id_.top + 1, 200, 3),
      `radius ${L.shape?.radius?.defaultValue}, radiusY ${rY}, scale ${JSON.stringify(sc)}, ink ${box(id_)}`);
    if (twin) {
      let tested = 0; let wrong = 0;
      for (let k = 0; k < 720; k++) {
        const ang = (k / 720) * Math.PI * 2;
        for (const f of [0.9, 0.97, 1.03, 1.1]) {
          const x = 300 * f * Math.cos(ang); const y = 100 * f * Math.sin(ang);
          const dd = twin.ellipseDistance(x, y, 300, 100);
          if (Math.abs(dd) < 1.5) continue;
          tested++;
          const on = px(img, 500 + x, 800 + y)[0] > 127;
          if (on !== dd < 0) wrong++;
        }
      }
      check('3b. GPU ellipse == CPU twin ellipseDistance (inside / outside at points >= 1.5 px from the edge)', tested > 2000 && wrong === 0, `${tested} points, ${wrong} wrong`);
    } else check('3b. GPU ellipse == CPU twin ellipseDistance', false, 'no core/shapeSdf.ts on this tree');
    const ie = ink(img, rect(1400, 800, 500, 300), BG, 127);
    check('4. circle r200 with scale [1, 0.4] draws a 400x160 ellipse (was a circle)', near(ie.right - ie.left + 1, 400, 3) && near(ie.bottom - ie.top + 1, 160, 3), box(ie));
    await clear([a, b, c, d, e]);
  }

  // ── 5-6: corner radius with the parent scale (lens ends), radius clamp ────────────────────────────────────────
  {
    const cam = await add({ type: 'rectangle', x: 960, y: 250, width: 2, height: 2, fill: [0, 0, 0, 0], name: 'null 0.5' });
    await set(cam, 'transform.scale.defaultValue', [0.5, 0.5]);
    const a = await add({ type: 'rectangle', x: 960, y: 250, width: 3305, height: 319, fill: W, radius: 155, name: 'pill 3305 under 0.5' });
    await mcp.action('editor.setLayerParent', { childId: a, parentId: cam });
    await set(a, 'transform.position.defaultValue', [0, 0]);
    const b = await add({ type: 'rectangle', x: 960, y: 550, width: 1652.5, height: 159.5, fill: W, radius: 77.5, name: 'pill twin at half size' });
    const c = await add({ type: 'rectangle', x: 500, y: 850, width: 400, height: 100, fill: W, radius: 200, name: 'rect r200 (clamps to 50)' });
    const d = await add({ type: 'rectangle', x: 1300, y: 850, width: 400, height: 100, fill: W, radius: 50, name: 'rect r50 twin' });
    const img = await render('02-lens-ends-radius-clamp', 0);
    const lens = shiftDiff(img, [960, 250], [960, 550], 1700, 190, 8);
    check('5. pill 3305x319 r155 under a 0.5 null == the same pill at half size (round ends, no lens)', lens.n === 0, `${lens.n} px differ > 8, max ${lens.max}`);
    const cl = shiftDiff(img, [500, 850], [1300, 850], 440, 140, 8);
    check('6. borderRadius 200 on a 400x100 rect == radius 50 (clamped to half the short side)', cl.n === 0, `${cl.n} px differ > 8, max ${cl.max}`);
    await clear([a, b, c, d, cam]);
  }

  // ── 7: materials (r07 0..1 radial, loose material) ───────────────────────────────────────────────────────────────
  {
    const R07 = { enabled: true, layers: [{ id: 'm1', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 1, colorStops: [{ id: 's1', color: '#33389a', opacity: 1, position: 0 }, { id: 's2', color: '#33389a', opacity: 0, position: 1 }] }] };
    const PCT = { enabled: true, layers: [{ id: 'm1', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 100, colorStops: [{ id: 's1', color: '#33389a', opacity: 100, position: 0 }, { id: 's2', color: '#33389a', opacity: 0, position: 100 }] }] };
    const LOOSE = { enabled: true, layers: [{ type: 'linear', angle: 90, colorStops: [{ color: [1, 0, 0, 1], position: 0 }, { color: '#0000ff', position: 100 }] }] };
    const FULL = { enabled: true, layers: [{ id: 'l', type: 'linear', angle: 90, blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#0000ff', opacity: 100, position: 100 }] }] };
    const a = await add({ type: 'circle', x: 400, y: 300, width: 400, height: 400, fill: W, name: 'r07 radial 0..1' });
    const b = await add({ type: 'circle', x: 1200, y: 300, width: 400, height: 400, fill: W, name: 'radial 0..100 twin' });
    const r1 = await set(a, 'materialConfig', R07); await set(b, 'materialConfig', PCT);
    const c = await add({ type: 'rectangle', x: 400, y: 800, width: 500, height: 200, fill: W, name: 'loose linear' });
    const d = await add({ type: 'rectangle', x: 1200, y: 800, width: 500, height: 200, fill: W, name: 'complete linear twin' });
    await set(c, 'materialConfig', LOOSE); await set(d, 'materialConfig', FULL);
    const img = await render('03-materials', 0);
    const centre = px(img, 400, 300); const mid = px(img, 400 + 100, 300);
    check('7a. the r07 radial material (opacity 1, stops at 0 / 1) renders: #33389a centre fading out', r1.ok !== false && near(centre[0], 51, 6) && near(centre[1], 56, 6) && near(centre[2], 154, 6) && mid[2] < centre[2] && mid[2] > 20, `centre ${centre}, r100 ${mid}`);
    const t7 = shiftDiff(img, [400, 300], [1200, 300], 420, 420, 2);
    check('7b. ... == its 0..100 percent twin', t7.n === 0, `${t7.n} px differ > 2, max ${t7.max}`);
    const t7c = shiftDiff(img, [400, 800], [1200, 800], 520, 220, 2);
    const lc = px(img, 400 - 240, 800);
    check('7c. a loose material (no ids / opacity, RGBA array colour) == its complete twin', t7c.n === 0 && lc[0] > 200 && lc[2] < 60, `${t7c.n} px differ > 2, left edge ${lc}`);
    await clear([a, b, c, d]);
  }

  // ── 8: morph ellipse with a radial gradient vs the SDF ellipse ─────────────────────────────────────────────────
  {
    const RAD = { enabled: true, layers: [{ id: 'g', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#0000ff', opacity: 100, position: 100 }] }] };
    const a = await add({ type: 'circle', x: 500, y: 540, width: 600, height: 200, fill: W, name: 'morph ellipse' });
    await mcp.action('editor.setShapeMorph', { layerId: a, poses: [{ frame: 0, shape: { type: 'ellipse', width: 600, height: 200 }, ease: 'hold' }, { frame: 30, shape: { type: 'ellipse', width: 600, height: 200 } }] });
    await set(a, 'materialConfig', RAD);
    const b = await add({ type: 'circle', x: 1400, y: 540, width: 600, height: 200, fill: W, name: 'SDF ellipse twin' });
    await set(b, 'materialConfig', RAD);
    const img = await render('04-morph-ellipse-radial', 10);
    const ia = ink(img, rect(500, 540, 900, 400), BG, 30);
    const c0 = px(img, 500, 540); const c1 = px(img, 500 + 260, 540);
    check('8a. setShapeMorph ellipse 600x200 keeps its size and its radial gradient (red centre, blue rim)', near(ia.right - ia.left + 1, 600, 4) && near(ia.bottom - ia.top + 1, 200, 4) && c0[0] > 220 && c0[2] < 40 && c1[2] > c1[0], `${box(ia)}, centre ${c0}, x+260 ${c1}`);
    // interior only (the path outline is a bezier flattening, its anti-aliased rim differs from the SDF by design)
    let worst = 0; let n = 0;
    for (let k = 0; k < 400; k++) {
      const ang = (k / 400) * Math.PI * 2;
      for (const f of [0, 0.3, 0.6, 0.9]) {
        const x = 300 * f * Math.cos(ang); const y = 100 * f * Math.sin(ang);
        const p = px(img, 500 + x, 540 + y); const q = px(img, 1400 + x, 540 + y);
        worst = Math.max(worst, ...p.map((v, i) => Math.abs(v - q[i]))); n++;
      }
    }
    check('8b. ... == the SDF ellipse with the same material inside the outline', worst <= 3, `${n} points, worst channel delta ${worst}`);
    await clear([a, b]);
  }

  // ── 9: single-pose / hold sunburst ────────────────────────────────────────────────────────────────────────────
  {
    const pts = []; const R = 400; const half = 5.625;
    for (let i = 0; i < 16; i++) { const a0 = (i * 22.5 - half) * Math.PI / 180; const a1 = (i * 22.5 + half) * Math.PI / 180; pts.push([0, 0], [R * Math.sin(a0), -R * Math.cos(a0)], [R * Math.sin(a1), -R * Math.cos(a1)]); }
    const expected = 16 * 0.5 * R * R * Math.sin((2 * half * Math.PI) / 180);
    const a = await add({ type: 'rectangle', x: 960, y: 540, width: 100, height: 100, fill: [0.33, 0.67, 0, 1], name: 'sunburst single pose' });
    await mcp.action('editor.setShapeMorph', { layerId: a, poses: [{ frame: 0, shape: { type: 'path', points: pts, closed: true } }] });
    const img = await render('05-sunburst-single-pose', 10);
    const ia = ink(img, rect(960, 540, 900, 900), BG, 60);
    check('9a. single-pose 48-vertex sunburst renders its full area', near(ia.n / expected, 1, 0.03), `${ia.n} px vs ${Math.round(expected)} expected`);
    await clear([a]);
    const b = await add({ type: 'rectangle', x: 960, y: 540, width: 100, height: 100, fill: [0.33, 0.67, 0, 1], name: 'sunburst hold' });
    await mcp.action('editor.setShapeMorph', { layerId: b, poses: [{ frame: 0, shape: { type: 'path', points: pts, closed: true }, ease: 'hold' }, { frame: 30, shape: { type: 'rectangle', width: 200, height: 200 } }] });
    const img2 = await render('06-sunburst-hold-first-pose', 10);
    const d2 = diff(img, img2, rect(960, 540, 900, 900), 2);
    check('9b. hold-eased first pose == the single pose', d2.n === 0, `${d2.n} px differ > 2`);
    await clear([b]);
  }

  // ── 3c: a thick stroke on a thin ellipse (the band crosses the ellipse's interior ridge) ───────────────────────
  {
    const a = await add({ type: 'circle', x: 960, y: 540, width: 800, height: 120, fill: [0, 0, 0, 0], stroke: W, strokeWidth: 40, name: 'thin ellipse outline sw40' });
    const img = await render('08-thin-ellipse-stroke', 0);
    const ia = ink(img, rect(960, 540, 1000, 300), BG, 127);
    let gaps = 0;
    for (let k = 0; k < 1440; k++) { const t = (k / 1440) * Math.PI * 2; if (px(img, 960 + 400 * Math.cos(t), 540 + 60 * Math.sin(t))[0] < 200) gaps++; }
    const hole = px(img, 960, 540)[0];
    check('3c. a 40 px stroke on an 800x120 ellipse: 840x160, solid all the way round, empty inside', near(ia.right - ia.left + 1, 840, 3) && near(ia.bottom - ia.top + 1, 160, 3) && gaps === 0 && hole < 10, `${box(ia)}, ${gaps} gaps on the centreline, centre ${hole}`);
    await clear([a]);
  }

  // ── 10-11: polygon sides, gradient on a path fill ──────────────────────────────────────────────────────────────
  {
    const a = await add({ type: 'polygon', x: 400, y: 300, width: 400, height: 400, fill: W, sides: 6, name: 'hexagon' });
    const LIN = { enabled: true, layers: [{ id: 'l', type: 'linear', angle: 90, blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#00ff00', opacity: 100, position: 50 }, { id: 'c', color: '#0000ff', opacity: 100, position: 100 }] }] };
    const b = await add({ type: 'rectangle', x: 1100, y: 750, width: 500, height: 300, fill: W, name: 'SDF rect gradient' });
    await set(b, 'materialConfig', LIN);
    const c = await add({ type: 'rectangle', x: 1100, y: 300, width: 500, height: 300, fill: W, name: 'path rect gradient' });
    await set(c, 'materialConfig', LIN);
    await mcp.action('editor.setShapeMorph', { layerId: c, poses: [{ frame: 0, shape: { type: 'rectangle', width: 500, height: 300 } }] });
    const img = await render('07-polygon-path-gradient', 0);
    const L = await layer(a);
    const hexArea = 1.5 * Math.sqrt(3) * 200 * 200;
    const ia = ink(img, rect(400, 300, 450, 450), BG, 127);
    check('10. addShapeLayer polygon sides 6 is a hexagon (6 vertices, hexagon area)', L.shape?.vertices?.length === 6 && near(ia.n / hexArea, 1, 0.02), `${L.shape?.vertices?.length} vertices, ${ia.n} px vs ${Math.round(hexArea)}`);
    const t11 = shiftDiff(img, [1100, 300], [1100, 750], 490, 290, 3);
    const mid = px(img, 1100, 300);
    check('11. a gradient material on a path fill == the same gradient on the SDF rect (was the flat first colour)', t11.n === 0 && mid[1] > 200, `${t11.n} px differ > 3 (max ${t11.max}) inside, centre ${mid}`);
    await clear([a, b, c]);
  }

  // ── regression frame: plain shapes that B63 must leave untouched (compared before / after outside this script) ──
  {
    const ids = [
      await add({ type: 'rectangle', x: 300, y: 300, width: 300, height: 200, fill: [0.9, 0.3, 0.2, 1], name: 'plain rect' }),
      await add({ type: 'rectangle', x: 800, y: 300, width: 300, height: 200, fill: [0.2, 0.6, 0.9, 1], radius: 24, name: 'rounded rect r24' }),
      await add({ type: 'star', x: 1300, y: 300, width: 300, height: 300, fill: [0.9, 0.8, 0.1, 1], points: 5, name: 'star' }),
      await add({ type: 'rectangle', x: 1700, y: 300, width: 200, height: 200, fill: [0.5, 0.9, 0.4, 1], name: 'path square' }),
    ];
    await mcp.action('editor.setShapeMorph', { layerId: ids[3], poses: [{ frame: 0, shape: { type: 'star', width: 200, height: 200, points: 6 } }] });
    await render('99-regression-plain-shapes', 0);
    await clear(ids);
  }
} catch (e) {
  check('harness ran to the end', false, `${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Frames: ${OUT}`);
if (failed.length) process.exitCode = 1;
