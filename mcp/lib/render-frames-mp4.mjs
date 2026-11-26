// Fallback MP4 when the real exporter fails (e.g. B68: export_mp4 aborts on some video clips): render every frame of a
// saved .ffx with the MCP render_frame tool (the exporter's offscreen renderer, export motion blur, full-resolution
// video decode) in N parallel sessions, then mux the PNGs with ffmpeg. Resumable: frames already on disk are skipped.
//
//   node mcp/lib/render-frames-mp4.mjs <project.ffx> <out.mp4> [--workers 3] [--width <px>] [--frames-dir <dir>]
//
// Say so wherever the MP4 is used: it is NOT the File > Export Video path (no audio, PNG round trip, optional upscale).
// Generalized from the r07 replica (artifacts/replicas/r07/render_mp4.mjs).

import { mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { connectFlashFx } from '../examples/lib/mcp-client.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const [ffx, outMp4] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!ffx || !outMp4) { console.error('usage: render-frames-mp4.mjs <project.ffx> <out.mp4> [--workers 3] [--width px] [--frames-dir dir]'); process.exit(2); }
const N = Number(opt('workers', 3));
const WIDTH = opt('width') ? Number(opt('width')) : undefined;
const OUT = resolve(opt('frames-dir', join(dirname(resolve(outMp4)), 'frames-render')));
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
let info = null;

async function worker(w) {
  const mcp = await connectFlashFx({ server: process.env.FLASHFX_SERVER ?? 'auto' });
  try {
    await mcp.call('import_project', { path: resolve(ffx) });
    const st = await mcp.call('get_state');
    info ??= { width: st.width, height: st.height, fps: st.fps, frames: st.durationFrames };
    for (let f = w; f < st.durationFrames; f += N) {
      const p = join(OUT, `f${String(f).padStart(5, '0')}.png`);
      if (existsSync(p) && statSync(p).size > 0) continue;
      await mcp.call('render_frame', { frame: f, path: p, inline: false, ...(WIDTH ? { width: WIDTH } : {}) });
      if (f % 60 === w) console.log(`w${w} f${f} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally { await mcp.close(); }
}

await Promise.all(Array.from({ length: N }, (_, w) => worker(w)));
const even = (v) => Math.round(v / 2) * 2;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(info.fps), '-i', join(OUT, 'f%05d.png'),
  '-vf', `scale=${even(info.width)}:${even(info.height)}:flags=bicubic`, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', resolve(outMp4)], { stdio: 'inherit' });
console.log(`${outMp4} written (${info.frames} frames, ${info.width}x${info.height}@${info.fps}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
