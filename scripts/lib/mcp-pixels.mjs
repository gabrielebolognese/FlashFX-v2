// Shared harness for MCP-driven pixel proofs (gpu:text-effects, gpu:parent-blur): spawns the real
// FlashFX MCP server over stdio (it drives a headless Chrome tab with WebGPU), decodes render_frame PNGs
// and offers small pixel helpers. Local only, like every gpu:* script.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Minimal PNG decoder (8-bit RGB / RGBA, non-interlaced: what the render_frame path writes). */
export function decodePng(buf) {
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

/** Spawn the MCP server and return a tiny client: call(tool, args), action(id, args), actions([...]), close(). */
export async function startMcp(clientName) {
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
  const call = async (name, args = {}, timeoutMs) => {
    const r = await request('tools/call', { name, arguments: args }, timeoutMs);
    if (r.isError) throw new Error(`${name} -> ${r.content.map((c) => c.text).join('\n')}`);
    return JSON.parse(r.content[0].text);
  };
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: clientName, version: '1' } });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return {
    call,
    stderr: () => stderr.join(''),
    action: (actionId, args) => call('run_action', { actionId, args }),
    actions: (actions) => call('run_actions', { actions }),
    async close() {
      server.stdin.end();
      await new Promise((r) => { const t = setTimeout(() => { server.kill(); r(); }, 15000); server.on('exit', () => { clearTimeout(t); r(); }); });
    },
  };
}

/** render_frame to `<outDir>/<name>.png` and decode it. */
export function makeRenderer(mcp, outDir) {
  mkdirSync(outDir, { recursive: true });
  return async (name, frame) => {
    const path = join(outDir, `${name}.png`);
    await mcp.call('render_frame', { frame, path, inline: false });
    return decodePng(readFileSync(path));
  };
}

export const idOf = (r) => (typeof r?.result === 'string' ? r.result : r?.activeLayerId ?? r?.result?.activeLayerId);

/** Pixels whose colour differs from `bg` by more than `tol` (max channel) inside a rect. */
export function ink(img, rect, bg, tol = 40) {
  const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.floor(rect.x + rect.width)); const y1 = Math.min(img.height, Math.floor(rect.y + rect.height));
  let n = 0; let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity; let sx = 0; let sy = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4;
    const d = Math.max(Math.abs(img.px[o] - bg[0]), Math.abs(img.px[o + 1] - bg[1]), Math.abs(img.px[o + 2] - bg[2]));
    if (d > tol) { n++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); sx += x; sy += y; }
  }
  return { n, left, right, top, bottom, cx: n ? sx / n : NaN, cy: n ? sy / n : NaN };
}

/** Per-pixel comparison of two frames inside a rect: count of pixels differing by > tol and the max delta. */
export function diff(a, b, rect, tol = 0) {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0)); const y0 = Math.max(0, Math.floor(rect?.y ?? 0));
  const x1 = Math.min(a.width, Math.floor(rect ? rect.x + rect.width : a.width)); const y1 = Math.min(a.height, Math.floor(rect ? rect.y + rect.height : a.height));
  let n = 0; let max = 0; let sum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * a.width + x) * 4;
    const d = Math.max(Math.abs(a.px[o] - b.px[o]), Math.abs(a.px[o + 1] - b.px[o + 1]), Math.abs(a.px[o + 2] - b.px[o + 2]));
    sum += d;
    if (d > tol) n++;
    if (d > max) max = d;
  }
  return { n, max, mean: sum / Math.max(1, (x1 - x0) * (y1 - y0)) };
}

/** Bounding box of the pixels that differ between two frames (by > tol). */
export function diffBox(a, b, tol = 8) {
  let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity; let n = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const o = (y * a.width + x) * 4;
    const d = Math.max(Math.abs(a.px[o] - b.px[o]), Math.abs(a.px[o + 1] - b.px[o + 1]), Math.abs(a.px[o + 2] - b.px[o + 2]));
    if (d > tol) { n++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  return { n, left, right, top, bottom };
}
