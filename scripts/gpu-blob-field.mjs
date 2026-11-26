// gpu:blob-field (B58): the gradient-blob field (pattern type 'blobField') renders on the real WebGPU pattern
// pipeline exactly like its CPU twin (src/patterns/blobField.ts), through the real MCP path:
// editor.addBlobField -> render_frame. Proves: the mesh field == twin over a 1920x1080 grid; the cloud floor ==
// twin composited over a black ground and leaves everything above its edge byte-identical to the ground; a
// masked blob field (the CPU image path, patterns/renderer.ts) matches the twin inside its mask; a field
// track-matted by a pill shows only inside the pill (the gradient inside a button); an older
// pattern type (plasma) still renders like its twin (and byte-identical to a pre-B58 baseline frame when one is
// present in the output folder); setBlobField changes the field and one undo restores it exactly; one more undo
// removes the layer. Writes evidence frames (a cloud floor and a mesh field in the style of r06 / r10).
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:blob-field
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, makeRenderer, idOf, decodePng } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/blob-field';
// BLOB_BASELINE_ONLY=1: render only the plasma frame (used once on the pre-B58 tree to make the baseline).
const BASELINE_ONLY = process.env.BLOB_BASELINE_ONLY === '1';
const tmp = mkdtempSync(join(tmpdir(), 'gpu-blob-'));
const W = 1920, H = 1080, FPS = 30;
const PLASMA = { type: 'plasma', scale: 1.2, speed: 0.9, rotationDeg: 0, complexity: 4, warp: 0, contrast: 0.25, paletteMode: 'smooth',
  palette: [{ color: [0.04, 0, 0.15], pos: 0 }, { color: [0.5, 0, 0.8], pos: 0.33 }, { color: [0, 0.8, 0.9], pos: 0.66 }, { color: [0.9, 1, 0.4], pos: 1 }] };

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const px = (img, x, y) => { const o = (y * img.width + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };

console.log(BASELINE_ONLY ? 'gpu:blob-field (baseline only)' : 'gpu:blob-field');
const mcp = await startMcp('gpu-blob-field');
try {
  const render = makeRenderer(mcp, OUT);
  // ---- an older pattern type (plasma) ----
  await mcp.call('create_project', { name: 'B58 plasma', format: 'long', durationFrames: 30, clipLength: 'comp', uiMode: 'pro' }, 400000);
  await mcp.action('editor.addGenerativePatternLayer', { configJSON: JSON.stringify(PLASMA) });
  if (BASELINE_ONLY) {
    await render('plasma-f12-BASELINE', 12);
    console.log(`baseline written to ${OUT}`);
  } else {
    await build({ stdin: { contents: `export * from './src/patterns/blobField'; export { patternSample } from './src/patterns/patterns'; export { parsePatternConfig } from './src/patterns/config';`, resolveDir: process.cwd(), sourcefile: 'e.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'b.mjs'), logLevel: 'silent' });
    const B = await import(pathToFileURL(join(tmp, 'b.mjs')).href);
    const log = [];
    // Compare a rendered frame with the twin on a grid. rect = the layer quad in comp px; bg = ground under it.
    const compare = (img, cfg, t, rect, bg, opts = {}) => {
      const step = opts.step ?? 24;
      let max = 0, sum = 0, n = 0, worst = null;
      for (let y = Math.floor(rect.y) + 6; y < rect.y + rect.h - 6; y += step) for (let x = Math.floor(rect.x) + 6; x < rect.x + rect.w - 6; x += step) {
        if (opts.inside && !opts.inside(x, y)) continue;
        const s = B.patternSample(cfg, (x + 0.5 - rect.x) / rect.w, (y + 0.5 - rect.y) / rect.h, rect.w / rect.h, t);
        const want = [0, 1, 2].map((c) => (s[c] * s[3] + bg[c] / 255 * (1 - s[3])) * 255);
        const got = px(img, x, y);
        const d = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
        sum += d; n++;
        if (d > max) { max = d; worst = { x, y, got, want: want.map((v) => Math.round(v)) }; }
      }
      return { max, mean: sum / n, n, worst };
    };

    const plasma = await render('plasma-f12', 12);
    const pr = compare(plasma, PLASMA, 12 / FPS, { x: W * 0.2, y: H * 0.2, w: W * 0.6, h: H * 0.6 }, [0, 0, 0]);
    log.push({ plasma: pr });
    const basePath = join(OUT, 'plasma-f12-BASELINE.png');
    const base = existsSync(basePath) ? decodePng(readFileSync(basePath)) : null;
    let baseDiff = null;
    if (base) { baseDiff = 0; for (let i = 0; i < base.px.length; i++) baseDiff = Math.max(baseDiff, Math.abs(base.px[i] - plasma.px[i])); }
    check(`older pattern type (plasma) still renders like its twin (mean ${pr.mean.toFixed(2)}, max ${pr.max.toFixed(1)} / 255)${base ? `, byte-identical to the pre-B58 baseline (max diff ${baseDiff})` : ' (no pre-B58 baseline in the output folder: byte check skipped)'}`, () => {
      assert.ok(pr.mean < 3, JSON.stringify(pr.worst));
      if (base) assert.equal(baseDiff, 0);
    });

    // ---- mesh field (r10 style) ----
    await mcp.call('create_project', { name: 'B58 mesh field', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
    const add = await mcp.action('editor.addBlobField', { opts: { mode: 'field', colors: ['#f6eee8', '#e85aa6', '#5b6cf0', '#fd5d88', '#ab79d9', '#f6eee8', '#4a6cf0'], count: 7, seed: 3, warp: 0.35 } });
    const fid = idOf(add);
    const flayer = (await mcp.call('get_layer', { layerId: fid })).result;
    const fcfg = B.parsePatternConfig(flayer.generativePattern.configJSON);
    check(`editor.addBlobField (MCP) adds one full-frame blobField pattern layer (${flayer.name}, ${flayer.width.defaultValue}x${flayer.height.defaultValue})`, () => {
      assert.equal(typeof fid, 'string');
      assert.equal(flayer.type, 'generativePattern');
      assert.equal(fcfg.type, 'blobField');
      assert.equal(flayer.width.defaultValue, W);
      assert.equal(flayer.height.defaultValue, H);
    });
    const field = await render('mesh-field-f15', 15);
    const fr = compare(field, fcfg, 15 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 20 });
    log.push({ field: fr });
    check(`mesh field: GPU == CPU twin over ${fr.n} grid pixels (mean ${fr.mean.toFixed(2)}, max ${fr.max.toFixed(1)} / 255)`, () => {
      assert.ok(fr.max <= 4 && fr.mean < 1.5, JSON.stringify(fr.worst));
    });
    const field2 = await render('mesh-field-f45', 45);
    const fr2 = compare(field2, fcfg, 45 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 40 });
    let moved = 0; for (let i = 0; i < field.px.length; i++) moved = Math.max(moved, Math.abs(field.px[i] - field2.px[i]));
    check(`mesh field drifts (f15 vs f45 max change ${moved} / 255) and f45 still == twin (max ${fr2.max.toFixed(1)})`, () => {
      assert.ok(moved > 20);
      assert.ok(fr2.max <= 4, JSON.stringify(fr2.worst));
    });

    // setBlobField + undo
    await mcp.action('editor.setBlobField', { layerId: fid, patch: { seed: 11 } });
    const reseeded = await render('mesh-field-seed11-f15', 15);
    const rcfg = B.parsePatternConfig((await mcp.call('get_layer', { layerId: fid })).result.generativePattern.configJSON);
    const rr = compare(reseeded, rcfg, 15 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 40 });
    let changed = 0; for (let i = 0; i < field.px.length; i++) changed = Math.max(changed, Math.abs(field.px[i] - reseeded.px[i]));
    await mcp.action('history.undo', {});
    const undone = await render('mesh-field-undo-f15', 15);
    let undoDiff = 0; for (let i = 0; i < field.px.length; i++) undoDiff = Math.max(undoDiff, Math.abs(field.px[i] - undone.px[i]));
    check(`editor.setBlobField { seed: 11 } relays the blobs (max change ${changed}, == twin max ${rr.max.toFixed(1)}); one undo restores the frame byte for byte (max diff ${undoDiff})`, () => {
      assert.equal(rcfg.seed, 11);
      assert.ok(changed > 40);
      assert.ok(rr.max <= 4, JSON.stringify(rr.worst));
      assert.equal(undoDiff, 0);
    });
    await mcp.action('history.undo', {});
    const removed = await render('mesh-field-removed-f15', 15);
    const state = await mcp.call('get_state', {});
    const still = JSON.stringify(state).includes(fid);
    check(`one more undo removes the blob-field layer (layer gone: ${!still}, frame back to the ground ${px(removed, 960, 540)})`, () => {
      assert.equal(still, false);
    });

    // masked field = the CPU image path (patterns/renderer.ts, low-res field upscaled)
    await mcp.action('history.redo', {});
    // editor.addMask does not take pattern layers (layerSupportsMasks), but a persisted mask renders: borrow a
    // rectangle mask (comp space, 40 % of the comp, centred) from a temporary shape and set it on the field.
    const tmpShape = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: 200, height: 200, name: 'mask donor' } }));
    await mcp.action('editor.addMask', { layerId: tmpShape, type: 'rectangle' });
    const donorMasks = (await mcp.call('get_layer', { layerId: tmpShape })).result.masks;
    await mcp.action('editor.removeLayer', { id: tmpShape });
    await mcp.action('editor.updateLayerProperty', { layerId: fid, path: 'masks', value: donorMasks });
    const masked = await render('mesh-field-masked-f15', 15);
    const inside = (x, y) => Math.abs(x - W / 2) < W * 0.17 && Math.abs(y - H / 2) < H * 0.17;
    const mr = compare(masked, fcfg, 15 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 12, inside });
    const outside = px(masked, 40, 40);
    log.push({ masked: mr });
    check(`masked blob field (CPU image path) == twin inside the mask (mean ${mr.mean.toFixed(2)}, max ${mr.max.toFixed(1)} / 255 over ${mr.n} px; the field is computed at 480 px and upscaled) and empty outside (${outside})`, () => {
      assert.ok(mr.mean < 3 && mr.max <= 12, JSON.stringify(mr.worst));
      const ground = px(removed, 40, 40);
      assert.deepEqual(outside, ground, 'outside the mask the field does not draw (== the empty comp ground)');
    });

    // ---- track-matted field: the gradient inside a pill (r10 S12.E6 Sign in button) ----
    await mcp.call('create_project', { name: 'B58 matted field', format: 'long', durationFrames: 30, clipLength: 'comp', uiMode: 'pro' }, 400000);
    const mfid = idOf(await mcp.action('editor.addBlobField', { opts: { mode: 'field', seed: 4, count: 5 } }));
    const pill = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: 800, height: 160, radius: 80, fill: [1, 1, 1, 1], name: 'button matte' } }));
    await mcp.action('editor.setTrackMatte', { layerId: mfid, mode: 'alpha', matteLayerId: pill });
    const matted = await render('mesh-field-matted-pill-f10', 10);
    const mcfg = B.parsePatternConfig((await mcp.call('get_layer', { layerId: mfid })).result.generativePattern.configJSON);
    const inPill = (x, y) => Math.abs(x - W / 2) < 300 && Math.abs(y - H / 2) < 60;
    const tr = compare(matted, mcfg, 10 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 8, inside: inPill });
    const groundPx = px(removed, 40, 40);
    const outPill = [px(matted, 40, 40), px(matted, W / 2, H / 2 - 140), px(matted, W / 2 - 500, H / 2)];
    check(`track-matted by a pill (alpha matte): the field shows only inside the pill (== twin, max ${tr.max.toFixed(1)} / 255 over ${tr.n} px) and the ground outside (${outPill.join(' / ')})`, () => {
      assert.ok(tr.max <= 4, JSON.stringify(tr.worst));
      for (const o of outPill) assert.deepEqual(o, groundPx);
    });

    // ---- cloud floor (r06 style) over a black ground ----
    await mcp.call('create_project', { name: 'B58 cloud floor', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
    await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: W + 40, height: H + 40, fill: [0, 0, 0, 1], name: 'black ground' } });
    const cid = idOf(await mcp.action('editor.addBlobField', { opts: { mode: 'floor', floor: 0.42, lumps: 0.1, softness: 1.2, billow: 0.35, seed: 1, warp: 0.2 } }));
    const ccfg = B.parsePatternConfig((await mcp.call('get_layer', { layerId: cid })).result.generativePattern.configJSON);
    const floor = await render('cloud-floor-f30', 30);
    const cr = compare(floor, ccfg, 30 / FPS, { x: 0, y: 0, w: W, h: H }, [0, 0, 0], { step: 20 });
    log.push({ floor: cr });
    check(`cloud floor: GPU == CPU twin composited over the black ground (mean ${cr.mean.toFixed(2)}, max ${cr.max.toFixed(1)} / 255 over ${cr.n} px)`, () => {
      assert.ok(cr.max <= 4 && cr.mean < 1.5, JSON.stringify(cr.worst));
    });
    // rows fully above the lumpy edge stay exactly the ground
    let topMax = 0;
    const topRows = Math.floor(H * 0.25);
    for (let y = 0; y < topRows; y++) for (let x = 0; x < W; x++) topMax = Math.max(topMax, ...px(floor, x, y));
    const bottom = px(floor, W / 2, H - 4), mid = px(floor, W / 2, Math.round(H * 0.75));
    check(`cloud floor is transparent above its edge (top ${topRows} rows byte-identical to the black ground, max ${topMax}) and blue to white below (75 % ${mid}, bottom ${bottom})`, () => {
      assert.equal(topMax, 0);
      assert.ok(bottom[0] > 180 && bottom[1] > 180 && bottom[2] > 200, 'white-ish bottom');
      assert.ok(mid[2] > mid[0], 'blue tint mid floor');
    });
    writeFileSync(join(OUT, 'gpu-blob-field-metrics.json'), JSON.stringify(log, null, 2));
    console.log(`\n${passed} checks passed. Frames + metrics: ${OUT}`);
  }
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
