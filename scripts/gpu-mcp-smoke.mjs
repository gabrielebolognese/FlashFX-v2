// Smoke test of the FlashFX MCP server (mcp/flashfx-mcp.mjs) over the REAL MCP stdio protocol:
// spawns the server, initializes, lists tools/resources, creates a project, adds a text layer and a
// keyframe through run_actions, seeks, screenshots, and checks the text actually rendered on the
// WebGPU preview canvas (pixel diff vs the empty project). Also exports a 1 s MP4 through the real
// exporter unless FLASHFX_SMOKE_EXPORT=0.
//
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:mcp
// Env: FLASHFX_SERVER=dev|dist (default dev), FLASHFX_HEADED=1 to watch it, FLASHFX_SMOKE_OUT=<png path>.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(tmpdir(), 'flashfx-mcp-smoke');
mkdirSync(OUT_DIR, { recursive: true });
const SHOT = process.env.FLASHFX_SMOKE_OUT ?? join(OUT_DIR, 'mcp-smoke.png');
const EMPTY_SHOT = join(OUT_DIR, 'mcp-smoke-empty.png');
const MP4 = join(OUT_DIR, 'mcp-smoke.mp4');

/** Minimal PNG decoder (8-bit RGB / RGBA, non-interlaced: what Chrome's captureScreenshot writes). */
function decodePng(buf) {
  let off = 8;
  let width = 0; let height = 0; let colorType = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'PNG bit depth must be 8'); colorType = data[9];
      assert.equal(data[12], 0, 'interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(bpp, `unsupported PNG color type ${colorType}`);
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
      px[o] = line[x * bpp]; px[o + 1] = line[x * bpp + 1]; px[o + 2] = line[x * bpp + 2]; px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, px };
}

/** Pixel stats inside rect: luminance std-dev, and (vs `other`) the fraction of pixels that changed. */
function regionStats(img, rect, other) {
  const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.floor(rect.x + rect.width)); const y1 = Math.min(img.height, Math.floor(rect.y + rect.height));
  let n = 0; let sum = 0; let sum2 = 0; let changed = 0; let bright = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4;
    const l = 0.2126 * img.px[o] + 0.7152 * img.px[o + 1] + 0.0722 * img.px[o + 2];
    n++; sum += l; sum2 += l * l; if (l > 200) bright++;
    if (other) {
      const d = Math.max(Math.abs(img.px[o] - other.px[o]), Math.abs(img.px[o + 1] - other.px[o + 1]), Math.abs(img.px[o + 2] - other.px[o + 2]));
      if (d > 40) changed++;
    }
  }
  const mean = sum / n;
  return { pixels: n, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), changedFrac: changed / n, brightFrac: bright / n };
}

// ----- MCP client over the server's stdio -----
const env = { ...process.env, FLASHFX_SERVER: process.env.FLASHFX_SERVER ?? 'dev' };
const server = spawn(process.execPath, [join(ROOT, 'mcp/flashfx-mcp.mjs')], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
const stderr = [];
server.stderr.on('data', (d) => { stderr.push(String(d)); if (process.env.FLASHFX_SMOKE_VERBOSE) process.stderr.write(d); });
const pending = new Map();
let nextId = 1;
createInterface({ input: server.stdout }).on('line', (line) => {
  const m = JSON.parse(line); // anything non-JSON on stdout would be a protocol violation: let it throw
  if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const request = (method, params, timeoutMs = 300000) => new Promise((res, rej) => {
  const id = nextId++;
  const timer = setTimeout(() => rej(new Error(`${method} timed out\n${stderr.join('')}`)), timeoutMs);
  pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
const notify = (method, params) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
async function call(name, args = {}, timeoutMs) {
  const r = await request('tools/call', { name, arguments: args }, timeoutMs);
  if (r.isError) throw new Error(`${name} -> ${r.content.map((c) => c.text).join('\n')}`);
  return r;
}
const json = (r) => JSON.parse(r.content[0].text);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  console.log('gpu:mcp');
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gpu-mcp-smoke', version: '1' } });
  notify('notifications/initialized');
  check('initialize negotiates the protocol and advertises tools + resources', () => {
    assert.equal(init.protocolVersion, '2025-06-18');
    assert.ok(init.capabilities.tools && init.capabilities.resources);
    assert.equal(init.serverInfo.name, 'flashfx');
  });

  const { tools } = await request('tools/list', {});
  check('tools/list exposes the FlashFX tool set', () => {
    const names = tools.map((t) => t.name);
    for (const n of ['list_features', 'get_state', 'create_project', 'run_action', 'run_actions', 'seek', 'play', 'pause', 'screenshot', 'export_mp4', 'undo']) {
      assert.ok(names.includes(n), `missing tool ${n}`);
    }
    assert.ok(tools.every((t) => t.inputSchema?.type === 'object'));
  });

  const { resources } = await request('resources/list', {});
  const manifestRes = await request('resources/read', { uri: 'flashfx://manifest' });
  const features = json(await call('list_features', { area: 'text' }));
  check('the manifest resource and list_features come from /agent/features.json', () => {
    assert.ok(resources.some((r) => r.uri === 'flashfx://manifest'));
    const m = JSON.parse(manifestRes.contents[0].text);
    assert.ok(m.actions.some((a) => a.id === 'agent.createProject') && m.actions.some((a) => a.id === 'agent.exportMp4'));
    assert.ok(features.actions.some((a) => a.id === 'editor.addText'));
    assert.ok(features.catalogs.textAnimatorPresets.includes('pop-in'));
  });

  const created = json(await call('create_project', { name: 'MCP smoke', format: 'long', durationFrames: 30, uiMode: 'pro' }, 400000));
  check('create_project opens a 1920x1080 project in the editor', () => {
    assert.equal(created.ok, true);
    assert.equal(created.result.width, 1920);
    assert.equal(created.result.height, 1080);
  });
  const emptyShot = json(await call('screenshot', { path: EMPTY_SHOT, inline: false }));

  const batch = json(await call('run_actions', {
    actions: [
      { actionId: 'editor.addText', args: { content: 'FlashFX MCP' } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 220 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
      { actionId: 'editor.addKeyframe', args: ['$0.activeLayerId', 'transform.opacity', 0, 0] },
      { actionId: 'editor.addKeyframe', args: ['$0.activeLayerId', 'transform.opacity', 15, 1] },
    ],
  }));
  const layerId = batch.results[0].activeLayerId;
  check('run_actions adds a text layer, styles it and keyframes it (with $0 references)', () => {
    assert.equal(batch.ok, true, JSON.stringify(batch));
    assert.equal(batch.ran, 5);
    assert.ok(layerId);
  });

  const sought = json(await call('seek', { frame: 20 }));
  const state = json(await call('get_state'));
  check('seek moves the real playhead; get_state sees the text layer', () => {
    assert.equal(sought.result, 20);
    assert.equal(state.currentFrame, 20);
    const layer = state.layers.find((l) => l.id === layerId);
    assert.ok(layer, 'text layer missing from state');
    assert.equal(layer.text, 'FlashFX MCP');
  });

  const shotRes = await call('screenshot', { path: SHOT });
  const shot = json(shotRes);
  check('screenshot writes a PNG and returns an inline preview image', () => {
    assert.ok(existsSync(SHOT) && readFileSync(SHOT).length > 5000);
    assert.ok(shotRes.content.some((c) => c.type === 'image' && c.data.length > 1000));
    assert.ok(shot.canvasRect && shot.canvasRect.width > 200, `no preview canvas: ${JSON.stringify(shot.canvasRect)}`);
  });

  const after = decodePng(readFileSync(SHOT));
  const before = decodePng(readFileSync(EMPTY_SHOT));
  const whole = regionStats(after, { x: 0, y: 0, width: after.width, height: after.height });
  const canvas = regionStats(after, shot.canvasRect, before);
  check(`the screenshot is not blank and the text rendered on the canvas (std ${whole.std.toFixed(1)}, ${(canvas.changedFrac * 100).toFixed(2)}% of canvas pixels changed)`, () => {
    assert.ok(whole.std > 8, `screenshot looks blank (luminance std ${whole.std})`);
    assert.ok(canvas.changedFrac > 0.005, `the preview canvas did not change after adding the text (${canvas.changedFrac})`);
  });

  const undone = json(await call('undo'));
  const afterUndo = json(await call('get_state'));
  json(await call('redo'));
  check('undo reverts the last action (one history step)', () => {
    assert.equal(undone.ok, true);
    assert.ok(afterUndo.canRedo);
  });

  if (process.env.FLASHFX_SMOKE_EXPORT !== '0') {
    rmSync(MP4, { force: true });
    const exp = json(await call('export_mp4', { path: MP4, width: 640, height: 360 }, 600000));
    check(`export_mp4 renders through the real exporter (${exp.result.bytes} bytes)`, () => {
      const b = readFileSync(MP4);
      assert.equal(b.length, exp.result.bytes);
      assert.ok(b.length > 1000);
      assert.equal(b.toString('ascii', 4, 8), 'ftyp', 'not an MP4 (no ftyp box)');
    });
  }

  console.log(`\n${passed} checks passed. Screenshot: ${SHOT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.message}\n--- server stderr ---\n${stderr.join('').slice(-4000)}`);
  process.exitCode = 1;
} finally {
  server.stdin.end();
  await new Promise((r) => { const t = setTimeout(() => { server.kill(); r(); }, 15000); server.on('exit', () => { clearTimeout(t); r(); }); });
}
