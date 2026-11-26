// gpu:export-video (B68): the REAL exporter (export_mp4 -> agent.exportMp4 -> exportToMp4) completes on comps
// with video layers, and the exported frame at t matches render_frame(t).
//
//  A. Synthetic r07 shape: five 540x960 H.264 clips (ffmpeg testsrc2 / mandelbrot / colour bars...), imported
//     through import_media, each scaled 2.0 -> 2.5 and position-keyed, in a 1080x1920 comp. export_mp4 at
//     540x960, then three exported frames (ffmpeg decode) are compared with render_frame of the same frames.
//  B. The real repro: replicas/r07/project.ffx (export used to abort with "A valid external Instance reference
//     no longer exists." 20-80 s in). Imported and exported end to end at 540 px wide. Skipped when the file
//     is missing; FLASHFX_R07=<path> overrides it, FLASHFX_R07=0 skips it.
//
// Local only (Chrome + a GPU + ffmpeg on PATH), like every gpu:* script:  npm run gpu:export-video
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectFlashFx } from '../mcp/examples/lib/mcp-client.mjs';

const OUT = join(tmpdir(), 'flashfx-gpu-export-video');
mkdirSync(OUT, { recursive: true });
const R07 = process.env.FLASHFX_R07 ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/replicas/r07/project.ffx';

const FPS = 30;
const FRAMES = 120; // 4 s
const W = 540;
const H = 960;

/** Raw RGB24 of one frame of an MP4 (ffmpeg), scaled to w x h. The exporter tags BT.709 (ffmpeg's default would be BT.601). */
function mp4FrameRgb(path, frame, w, h) {
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vf', `select=eq(n\\,${frame}),scale=${w}:${h}:in_color_matrix=bt709:in_range=tv`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
}
/** Raw RGB24 of a PNG (ffmpeg), scaled to w x h. */
function pngRgb(path, w, h) {
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
}
function meanAbsDiff(a, b) {
  assert.equal(a.length, b.length, 'frame sizes differ');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
function lumaStd(buf) {
  let n = 0; let s = 0; let s2 = 0;
  for (let i = 0; i < buf.length; i += 3) { const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; n++; s += l; s2 += l * l; }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const SOURCES = ['testsrc2', 'mandelbrot', 'smptehdbars', 'rgbtestsrc', 'testsrc'];
const clips = SOURCES.map((src, i) => {
  const p = join(OUT, `clip${i}-${src}.mp4`);
  if (!existsSync(p)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `${src}=size=${W}x${H}:rate=${FPS}`, '-t', String(FRAMES / FPS + 1),
      '-vf', `drawtext=text='%{n}':x=40:y=40:fontsize=96:fontcolor=white:box=1:boxcolor=black`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '48', p]);
  }
  return p;
});

console.log('gpu:export-video');
const mcp = await connectFlashFx({ server: process.env.FLASHFX_SERVER ?? 'dev' });
try {
  // ---- A. synthetic multi-clip comp ----
  await mcp.call('create_project', { name: 'B68 export video', format: 'short', frameRate: FPS, durationFrames: FRAMES, clipLength: 'comp', uiMode: 'pro' }, { timeoutMs: 400000 });
  const layers = [];
  for (let i = 0; i < clips.length; i++) {
    const r = await mcp.call('import_media', { path: clips[i], fit: false }, { timeoutMs: 600000 });
    assert.equal(r.result.kind, 'video');
    assert.deepEqual([r.result.width, r.result.height], [W, H]);
    layers.push(r.activeLayerId);
  }
  const acts = [];
  layers.forEach((id, i) => {
    const s0 = 2.0 + i * 0.05;
    acts.push({ actionId: 'editor.setKeyframes', args: { layerId: id, propertyPath: 'transform.scale', keyframes: [{ frame: 0, value: [s0, s0] }, { frame: FRAMES - 1, value: [2.5, 2.5] }] } });
    acts.push({ actionId: 'editor.setKeyframes', args: { layerId: id, propertyPath: 'transform.position', keyframes: [
      { frame: 0, value: [540 - 120 + i * 60, 960 - 200] }, { frame: 60, value: [540 + 80 - i * 40, 960 + 150] }, { frame: FRAMES - 1, value: [540, 960] }] } });
    // Staggered opacity so every clip is on screen (and decoded) at some point.
    acts.push({ actionId: 'editor.setKeyframes', args: { layerId: id, propertyPath: 'transform.opacity', keyframes: [{ frame: 0, value: i === 0 ? 1 : 0.6 }, { frame: FRAMES - 1, value: 0.8 }] } });
  });
  const batch = await mcp.call('run_actions', { actions: acts });
  check(`5 x 540x960 H.264 clips imported, scaled 2.0 -> 2.5 and position-keyed (${batch.ran} actions)`, () => {
    assert.equal(batch.ok, true, JSON.stringify(batch).slice(0, 800));
    assert.equal(batch.ran, acts.length);
  });

  // import_media grows the comp to the longest clip (5 s here): the export covers the whole comp.
  const compFrames = (await mcp.call('get_state')).durationFrames;
  const MP4 = join(OUT, 'b68-synthetic.mp4');
  rmSync(MP4, { force: true });
  const t0 = Date.now();
  const exp = await mcp.call('export_mp4', { path: MP4, width: W, height: H, includeAudio: false }, { timeoutMs: 900000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', MP4], { encoding: 'utf8' }).trim();
  const [pw, ph, pn] = probe.split(',').map(Number);
  check(`export_mp4 completes through the real exporter (${exp.result.bytes} bytes, ${secs} s, ffprobe ${pw}x${ph}, ${pn} frames)`, () => {
    assert.equal(readFileSync(MP4).length, exp.result.bytes);
    assert.deepEqual([pw, ph], [W, H]);
    assert.ok(compFrames >= FRAMES && Math.abs(pn - compFrames) <= 1, `expected ${compFrames} frames, got ${pn}`);
  });

  const diffs = [];
  for (const f of [10, 59, 140]) {
    const png = join(OUT, `b68-rf-${f}.png`);
    await mcp.call('render_frame', { frame: f, width: W, path: png, inline: false }, { timeoutMs: 300000 });
    const a = mp4FrameRgb(MP4, f, W, H);
    const b = pngRgb(png, W, H);
    diffs.push({ f, mad: meanAbsDiff(a, b), std: lumaStd(a) });
  }
  check(`exported frames match render_frame(t) (mean abs diff ${diffs.map((d) => `f${d.f}=${d.mad.toFixed(2)}`).join(', ')} of 255; content std ${diffs.map((d) => d.std.toFixed(0)).join('/')})`, () => {
    for (const d of diffs) {
      assert.ok(d.std > 20, `exported frame ${d.f} looks blank (std ${d.std})`);
      assert.ok(d.mad < 8, `exported frame ${d.f} differs from render_frame (${d.mad})`);
    }
  });

  // ---- B. the r07 repro ----
  if (R07 !== '0' && existsSync(R07)) {
    await mcp.call('create_project', { name: 'B68 r07 repro', format: 'short', frameRate: 60, durationFrames: 1200, clipLength: 'comp', uiMode: 'pro' }, { timeoutMs: 400000 });
    await mcp.call('import_project', { path: R07 }, { timeoutMs: 600000 });
    const RMP4 = join(OUT, 'b68-r07.mp4');
    rmSync(RMP4, { force: true });
    const t1 = Date.now();
    const rexp = await mcp.call('export_mp4', { path: RMP4, width: 540, includeAudio: false }, { timeoutMs: 3600000 });
    const rsecs = ((Date.now() - t1) / 1000).toFixed(0);
    const rprobe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,duration', '-of', 'csv=p=0', RMP4], { encoding: 'utf8' }).trim();
    check(`r07 project.ffx (5 clips) exports end to end with the real exporter (${rexp.result.bytes} bytes, ${rsecs} s, ffprobe ${rprobe})`, () => {
      assert.ok(statSync(RMP4).size === rexp.result.bytes && rexp.result.bytes > 100000);
    });
    const mid = join(OUT, 'b68-r07-f600.png');
    await mcp.call('render_frame', { frame: 600, width: 540, path: mid, inline: false }, { timeoutMs: 300000 });
    const [rw, rh] = rprobe.split(',').map(Number);
    const mad = meanAbsDiff(mp4FrameRgb(RMP4, 600, rw, rh), pngRgb(mid, rw, rh));
    check(`r07 exported frame 600 matches render_frame(600) (mean abs diff ${mad.toFixed(2)})`, () => {
      assert.ok(mad < 10, `r07 f600 differs (${mad})`);
    });
  } else {
    console.log(`  - r07 repro skipped (${R07 === '0' ? 'FLASHFX_R07=0' : `${R07} not found`})`);
  }

  console.log(`\n${passed} checks passed. Output: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr.slice(-30).join('')}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
