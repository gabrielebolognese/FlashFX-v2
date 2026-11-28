// gpu:clip-timing (B65): agent video clip timing through the real MCP path, proven on pixels and in a real export.
//
// Four 4 s test clips (ffmpeg geq: a distinct colour per clip, and the SOURCE frame number written as 9 binary
// blocks across the top) are imported with import_media (each lands at frame 0 on a magnetic video track, the
// r07 / r09 trap). Then:
//   1. editor.moveClipInTime(B, 60) really moves the video (it used to return ok and stay at 0) - undo / redo work.
//   2. agent.setClipTiming sets in / out, source start, speed and reverse; C at f150-195 at 2x from 1 s to 4 s.
//   3. A later import_media (D) re-packs nothing: A, B, C keep their frames (it used to pack them back to 0).
//   4. render_frame shows the right clip and the right SOURCE frame at f10 / f70 / f160 / f215 (decoded blocks).
//   5. export_project -> import_project keeps every in / out and renders byte-identical frames.
//   6. editor.setTrackMatte(B, 'alpha', rect): a shape created after the videos (not directly above B) mattes B.
//      Without matteLayerId, B is matted by the clip above it instead (shown, then undone).
//   7. export_mp4 (the real exporter) at 540x960: the exported frames decode to the same clips / source frames,
//      the matte included, and match render_frame (mean abs diff < 8 / 255).
//   8. Renderer fix: a track matte that is the frame's only effect renders (it used to draw as two plain layers,
//      because the composite bind group was only built once something else had made the frame multipass).
// Local only (Chrome + a GPU + ffmpeg on PATH), like every gpu:* script:  npm run gpu:clip-timing
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectFlashFx } from '../mcp/examples/lib/mcp-client.mjs';
import { decodePng } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/clip-timing';
mkdirSync(OUT, { recursive: true });
const FPS = 30; const W = 540; const H = 960; const SECS = 4;
// Clip colours (YCbCr at Y 128) and their rough RGB, for nearest-colour classification.
const CLIPS = [
  { name: 'A', cb: 90, cr: 200, rgb: [243, 84, 51] },
  { name: 'B', cb: 90, cr: 60, rgb: [20, 198, 51] },
  { name: 'C', cb: 200, cr: 110, rgb: [99, 115, 255] },
  { name: 'D', cb: 60, cr: 150, rgb: [163, 137, 0] },
];
for (const c of CLIPS) {
  c.path = join(OUT, `src-${c.name}.mp4`);
  if (!existsSync(c.path)) {
    // Top 80 px: block b (60 px wide) is white when bit b of the frame number N is set.
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=gray:size=${W}x${H}:rate=${FPS}`, '-t', String(SECS),
      '-vf', `format=yuv444p,geq=lum='if(lt(Y\\,80)\\,if(mod(floor(N/pow(2\\,floor(X/60)))\\,2)\\,235\\,16)\\,128)':cb=${c.cb}:cr=${c.cr},format=yuv420p`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-crf', '12', c.path]);
  }
}

/** Decode { clip, frame } from an RGBA 540x960 image: colour of the middle band + the 9 bit blocks. */
function readClip(img) {
  const at = (x, y) => { const o = (y * img.width + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
  let s = [0, 0, 0]; let n = 0;
  for (let y = 300; y < 340; y += 4) for (let x = 200; x < 340; x += 4) { const p = at(x, y); s = s.map((v, i) => v + p[i]); n++; }
  const mean = s.map((v) => v / n);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const dark = Math.max(...mean) < 60; // the empty comp background is a dark navy (about 23, 25, 34)
  const best = CLIPS.reduce((b, c) => (dist(mean, c.rgb) < dist(mean, b.rgb) ? c : b));
  let frame = 0;
  for (let b = 0; b < 9; b++) { const p = at(60 * b + 30, 40); if ((p[0] + p[1] + p[2]) / 3 > 128) frame |= 1 << b; }
  return { clip: dark ? 'black' : best.name, frame, mean: mean.map((v) => Math.round(v)) };
}
function mp4Frame(path, frame) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vf', `select=eq(n\\,${frame}),scale=${W}:${H}:in_color_matrix=bt709:in_range=tv`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
  return { width: W, height: H, px: raw };
}
function mad(a, b) {
  let s = 0; let n = 0;
  for (let i = 0; i < a.px.length; i += 4) { s += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]); n += 3; }
  return s / n;
}

let passed = 0;
const log = [];
const check = (name, fn) => { fn(); passed++; const line = `  ✓ ${name}`; console.log(line); log.push(line); };

console.log('gpu:clip-timing');
const mcp = await connectFlashFx({ server: process.env.FLASHFX_SERVER ?? 'dev' });
const render = async (name, frame) => {
  const path = join(OUT, `${name}.png`);
  await mcp.call('render_frame', { frame, width: W, path, inline: false }, { timeoutMs: 300000 });
  return { path, img: decodePng(readFileSync(path)) };
};
const layer = async (id) => (await mcp.call('get_layer', { layerId: id })).result;
const timing = async (id) => { const l = await layer(id); return [l.inPoint, l.outPoint, l.video?.startOffset, l.video?.playbackRate, !!l.video?.reversed]; };
const run = async (actionId, args) => { const r = await mcp.action(actionId, args); assert.equal(r.ok, true, `${actionId}: ${JSON.stringify(r).slice(0, 800)}`); return r; };
try {
  await mcp.call('create_project', { name: 'B65 clip timing', format: 'short', frameRate: FPS, durationFrames: 240, uiMode: 'pro' }, { timeoutMs: 400000 });
  const ids = {};
  for (const c of CLIPS.slice(0, 3)) {
    const r = await mcp.call('import_media', { path: c.path }, { timeoutMs: 600000 });
    assert.equal(r.result.kind, 'video');
    ids[c.name] = r.activeLayerId;
  }
  const st0 = await mcp.call('get_state');
  check(`imports land at frame 0 on magnetic video tracks (A ${(await timing(ids.A)).slice(0, 2)}, tracks magnetic: ${st0.tracks.map((t) => t.magnetic).join('/')})`, () => {
    assert.ok(st0.tracks.length >= 3 && st0.tracks.every((t) => t.magnetic === true));
  });

  // 1. moveClipInTime on video
  await run('editor.moveClipInTime', { layerId: ids.B, newInPoint: 60 });
  const b1 = await timing(ids.B);
  const bTrack = (await layer(ids.B)).trackId;
  const st1 = await mcp.call('get_state');
  check(`editor.moveClipInTime moves a video clip: B in/out ${b1.slice(0, 2)} (was a silent no-op), its track is now absolute`, () => {
    assert.equal(b1[0], 60);
    assert.equal(st1.tracks.find((t) => t.id === bTrack).magnetic, false);
  });

  // 2. setClipTiming: A head-trimmed and shortened, C at f150 from 1 s at 2x
  const ra = await run('agent.setClipTiming', { layerId: ids.A, timing: { sourceStart: 0.5, endFrame: 60 } });
  const rc = await run('agent.setClipTiming', { layerId: ids.C, timing: { startFrame: 150, sourceStart: 1, durationFrames: 45, speed: 2 } });
  check(`agent.setClipTiming returns the applied timing (A ${ra.result.inPoint}-${ra.result.outPoint} from ${ra.result.sourceStart}s; C ${rc.result.inPoint}-${rc.result.outPoint} from ${rc.result.sourceStart}s to ${rc.result.sourceEnd}s at ${rc.result.speed}x)`, () => {
    assert.deepEqual([ra.result.inPoint, ra.result.outPoint, ra.result.sourceStart, ra.result.startOffset], [0, 60, 0.5, 15]);
    assert.deepEqual([rc.result.inPoint, rc.result.outPoint, rc.result.sourceStart, rc.result.sourceEnd, rc.result.speed, rc.result.startOffset], [150, 195, 1, 4, 2, 15]);
    assert.equal(rc.result.trackNowAbsolute, true);
    assert.equal(rc.result.warnings, undefined, 'exactly to the source end: no warning');
  });
  await run('history.undo', {});
  const cUndo = await timing(ids.C);
  await run('history.redo', {});
  const cRedo = await timing(ids.C);
  check(`one undo step: undo puts C back (${cUndo.slice(0, 4)}), redo re-applies (${cRedo.slice(0, 4)})`, () => {
    assert.equal(cUndo[0], 0); assert.equal(cUndo[3], 1);
    assert.deepEqual(cRedo, [150, 195, 15, 2, false]);
  });
  const bad = await mcp.action('agent.setClipTiming', { layerId: ids.C, timing: { speed: 0 } }).catch((e) => ({ ok: false, error: e.message }));
  check(`an invalid spec is refused with a readable error and changes nothing (${String(bad.error ?? JSON.stringify(bad)).slice(0, 90)})`, () => {
    assert.notEqual(bad.ok, true);
  });
  assert.deepEqual(await timing(ids.C), [150, 195, 15, 2, false]);

  // 3. a later import re-packs nothing
  const before = { A: await timing(ids.A), B: await timing(ids.B), C: await timing(ids.C) };
  const rd = await mcp.call('import_media', { path: CLIPS[3].path }, { timeoutMs: 600000 });
  ids.D = rd.activeLayerId;
  const after = { A: await timing(ids.A), B: await timing(ids.B), C: await timing(ids.C) };
  check(`a later import_media re-packs nothing (A ${after.A.slice(0, 2)}, B ${after.B.slice(0, 2)}, C ${after.C.slice(0, 2)} unchanged)`, () => {
    assert.deepEqual(after, before);
  });
  const rD = await run('agent.setClipTiming', { layerId: ids.D, timing: { startFrame: 210, durationFrames: 30, sourceStart: 2, reversed: true } });
  assert.deepEqual([rD.result.inPoint, rD.result.outPoint, rD.result.reversed], [210, 240, true]);

  // 4. pixels: the right clip and source frame at each comp frame
  const EXPECT = [
    { f: 10, clip: 'A', frame: 25 }, // A from 0.5 s (source 15) + 10
    { f: 70, clip: 'B', frame: 10 }, // B moved to 60, source from 0
    { f: 160, clip: 'C', frame: 50 }, // C from 1 s at 2x: (10 + 15) * 2
    { f: 215, clip: 'D', frame: 85 }, // D reversed over [2 s, 3 s]: 210 + 240 - 215 - 210 + 60
  ];
  const shots = {};
  for (const e of EXPECT) shots[e.f] = await render(`render-f${e.f}`, e.f);
  const seen = EXPECT.map((e) => ({ ...e, got: readClip(shots[e.f].img) }));
  check(`render_frame shows the right clip and SOURCE frame: ${seen.map((s) => `f${s.f} ${s.got.clip}#${s.got.frame}`).join(', ')}`, () => {
    for (const s of seen) { assert.equal(s.got.clip, s.clip, `f${s.f} clip (${s.got.mean})`); assert.equal(s.got.frame, s.frame, `f${s.f} source frame`); }
  });
  const emptyImg = (await render('render-f205', 205)).img;
  const black = readClip(emptyImg);
  assert.equal(black.clip, 'black', 'f205: between C (ends 195) and D (starts 210) nothing draws');
  const BG = [0, 1, 2].map((i) => emptyImg.px[(800 * emptyImg.width + 270) * 4 + i]);
  const nearBg = (p, tol) => Math.max(...p.map((v, i) => Math.abs(v - BG[i]))) <= tol;

  // 5. reload
  const FFX = join(OUT, 'clip-timing.ffx');
  await mcp.call('export_project', { path: FFX }, { timeoutMs: 600000 });
  const names = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await timing(id)])));
  const imp = await mcp.call('import_project', { path: FFX }, { timeoutMs: 600000 });
  const st2 = await mcp.call('get_state');
  const byName = Object.fromEntries(st2.layers.map((l) => [l.name, l.id]));
  const reloaded = {};
  for (const c of CLIPS) reloaded[c.name] = await timing(byName[`src-${c.name}`]);
  const re = {};
  for (const e of EXPECT) re[e.f] = await render(`reload-f${e.f}`, e.f);
  const identical = EXPECT.every((e) => readFileSync(re[e.f].path).equals(readFileSync(shots[e.f].path)));
  check(`export_project -> import_project keeps every in / out / source offset / speed (${imp.result?.layers ?? st2.layers.length} layers) and renders byte-identical frames (${identical})`, () => {
    assert.deepEqual(reloaded, names);
    assert.ok(identical);
  });
  for (const k of Object.keys(ids)) ids[k] = byName[`src-${k}`];

  // 6. track matte with a named matte layer, created after every video
  const rect = await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 540, y: 480, width: 1080, height: 960, fill: [1, 1, 1, 1], name: 'matte top half' } });
  const rectId = typeof rect.result === 'string' ? rect.result : rect.activeLayerId;
  await run('editor.setTrackMatte', { layerId: ids.B, mode: 'alpha' });
  const wrongImg = (await render('matte-without-id-f70', 70)).img;
  await run('history.undo', {});
  await run('editor.setTrackMatte', { layerId: ids.B, mode: 'alpha', matteLayerId: rectId });
  const m = (await render('matte-with-id-f70', 70)).img;
  const top = readClip(m);
  const px = (img, x, y) => { const o = (y * img.width + x) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
  const bottom = px(m, 270, 800);
  const rectShownWrong = px(wrongImg, 270, 300);
  const cStill = readClip((await render('matte-with-id-f160', 160)).img);
  const aAlone = readClip((await render('matte-with-id-f10', 10)).img);
  check(`setTrackMatte(B, alpha, rect): B shows only inside the rect (top ${top.clip}#${top.frame}, bottom ${bottom} = background ${BG}); without matteLayerId the clip directly above (C, not on screen at f70) was the matte, so B vanished (bottom ${px(wrongImg, 270, 800)}) and the rect drew as a plain white layer (${rectShownWrong}); C still draws at f160 (${cStill.clip}#${cStill.frame}); at f10, with B off screen, the matte rect stays hidden (${aAlone.clip}#${aAlone.frame})`, () => {
    assert.deepEqual([top.clip, top.frame], ['B', 10]);
    assert.ok(nearBg(bottom, 6), `bottom half should be the empty background ${BG}, got ${bottom}`);
    assert.ok(nearBg(px(wrongImg, 270, 800), 6), 'without the matte id B is matted by C (inactive at f70), not by the rect: B vanishes');
    assert.ok(Math.min(...rectShownWrong) > 230, `without the matte id the rect is not consumed, got ${rectShownWrong}`);
    assert.deepEqual([cStill.clip, cStill.frame], ['C', 50]);
    assert.deepEqual([aAlone.clip, aAlone.frame], ['A', 25], 'f10 (B not on screen): the matte rect stays hidden, A shows');
  });

  // 7. real export
  const MP4 = join(OUT, 'clip-timing-export.mp4');
  const t0 = Date.now();
  const exp = await mcp.call('export_mp4', { path: MP4, width: W, height: H, includeAudio: false }, { timeoutMs: 1800000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', MP4]).toString().trim();
  const exported = EXPECT.map((e) => ({ ...e, img: mp4Frame(MP4, e.f) }));
  const decoded = exported.map((e) => ({ ...e, got: readClip(e.img) }));
  const mads = [];
  for (const e of exported) mads.push(mad(e.img, (await render(`export-ref-f${e.f}`, e.f)).img));
  const eBottom = px(exported[1].img, 270, 800);
  check(`export_mp4 (real exporter, ${statSync(MP4).size} bytes, ${secs} s, ffprobe ${probe}) decodes to the same clips / source frames: ${decoded.map((d) => `f${d.f} ${d.got.clip}#${d.got.frame}`).join(', ')}; matte in the export (f70 bottom ${eBottom}); mean abs diff vs render_frame ${mads.map((v) => v.toFixed(2)).join(' / ')}`, () => {
    assert.equal(exp.result?.bytes > 0 || statSync(MP4).size > 0, true);
    for (const d of decoded) { assert.equal(d.got.clip, d.clip, `export f${d.f} clip`); assert.equal(d.got.frame, d.frame, `export f${d.f} frame`); }
    assert.ok(nearBg(eBottom, 12), `export bottom half should be the background ${BG}, got ${eBottom}`);
    for (const v of mads) assert.ok(v < 8, `export differs from render_frame (${v})`);
  });

  // 8. renderer fix: a frame whose ONLY effect is a track matte used to skip the matte (the composite bind group
  //    was only built on the multipass path, which the matte alone never entered): shape matted by a shape.
  await mcp.call('create_project', { name: 'B65 matte only', format: 'short', frameRate: FPS, durationFrames: 30, uiMode: 'pro', clipLength: 'comp' }, { timeoutMs: 400000 });
  const red = await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 540, y: 960, width: 1080, height: 1920, fill: [1, 0, 0, 1], name: 'red full frame' } });
  await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 540, y: 480, width: 1080, height: 960, fill: [1, 1, 1, 1], name: 'matte top half' } });
  const redId = typeof red.result === 'string' ? red.result : red.activeLayerId;
  const plain = (await render('matte-only-before', 10)).img;
  await run('editor.setTrackMatte', { layerId: redId, mode: 'alpha' });
  const mo = (await render('matte-only-after', 10)).img;
  const moTop = px(mo, 270, 300); const moBottom = px(mo, 270, 800); const plainBottom = px(plain, 270, 800);
  check(`a track matte that is the frame's only effect renders (red full frame matted by a top-half rect: top ${moTop}, bottom ${moBottom} = background ${BG}; before the matte the bottom was ${plainBottom})`, () => {
    assert.ok(moTop[0] > 200 && moTop[1] < 40 && moTop[2] < 40, `top should be red, got ${moTop}`);
    assert.ok(nearBg(moBottom, 6), `bottom should be the background, got ${moBottom}`);
    assert.ok(plainBottom[0] > 200 && plainBottom[1] < 40);
  });

  console.log(`\n${passed} checks passed. Files: ${OUT}`);
  log.push(`${passed} checks passed.`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${(Array.isArray(mcp.stderr) ? mcp.stderr.join('') : '').slice(-3000)}`);
  log.push(`FAILED after ${passed} checks: ${e.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(join(OUT, 'gpu-clip-timing.summary.txt'), `${log.join('\n')}\n`);
  await mcp.close();
}
