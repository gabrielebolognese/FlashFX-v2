// In-browser proof of the B52 font library on the REAL app, driven only through the MCP server
// (like an agent would):
//   - import_font of a WOFF2 (built here from a bundled WOFF, so the test needs no download)
//     registers a family that measures exactly like its source face and NOT like the fallback;
//   - lazy bundled families (Archivo Expanded, VT323), Inter 600 and true italics really load:
//     their advance widths differ from the fallback / the 400 face / the upright face, while a
//     family without an italic face keeps its upright widths (synthesized oblique);
//   - render_frame (the exporter path) draws the imported and the new bundled faces: the text's
//     ink width on the WebGPU frame differs from the same text in the fallback face.
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:fonts
// Env: FLASHFX_SERVER=dev|dist (default dev), FLASHFX_FONTS_OUT=<dir for the PNGs + the woff2>.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = process.env.FLASHFX_FONTS_OUT ?? join(tmpdir(), 'flashfx-fonts');
mkdirSync(OUT_DIR, { recursive: true });

// ----- WOFF -> WOFF2 (null-transformed tables + one brotli stream; WOFF2 spec section 5) -----
function uintBase128(n) {
  const bytes = [n & 0x7f];
  for (n >>>= 7; n > 0; n >>>= 7) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
function woffToWoff2(woff) {
  assert.equal(woff.toString('latin1', 0, 4), 'wOFF');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = woff.toString('latin1', o, o + 4);
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw) });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const dir = [];
  for (const t of tables) {
    // Tag index 63 = explicit tag. glyf / loca use transform version 3 (= null transform).
    dir.push((t.tag === 'glyf' || t.tag === 'loca') ? 0xff : 0x3f);
    for (let k = 0; k < 4; k++) dir.push(t.tag.charCodeAt(k));
    dir.push(...uintBase128(t.data.length));
  }
  const stream = brotliCompressSync(Buffer.concat(tables.map((t) => t.data)));
  const totalSfntSize = 12 + 16 * tables.length + tables.reduce((s, t) => s + ((t.data.length + 3) & ~3), 0);
  const header = Buffer.alloc(48);
  const length = (48 + dir.length + stream.length + 3) & ~3;
  header.write('wOF2', 0, 'latin1');
  header.writeUInt32BE(flavor, 4);
  header.writeUInt32BE(length, 8);
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt32BE(totalSfntSize, 16);
  header.writeUInt32BE(stream.length, 20);
  header.writeUInt16BE(1, 24);
  const out = Buffer.alloc(length);
  Buffer.concat([header, Buffer.from(dir), stream]).copy(out);
  return out;
}

/** Minimal PNG decoder (8-bit RGB / RGBA, non-interlaced). */
function decodePng(buf) {
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

/** Horizontal extent of the bright (text) pixels. */
function inkExtent(img) {
  let x0 = Infinity; let x1 = -Infinity; let n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const o = (y * img.width + x) * 4;
    if (img.px[o] > 200 && img.px[o + 1] > 200 && img.px[o + 2] > 200) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  return { width: n ? x1 - x0 + 1 : 0, pixels: n };
}

// ----- MCP client over the server's stdio -----
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
async function call(name, args = {}, timeoutMs) {
  const r = await request('tools/call', { name, arguments: args }, timeoutMs);
  if (r.isError) throw new Error(`${name} -> ${r.content.map((c) => c.text).join('\n')}`);
  return JSON.parse(r.content[0].text);
}
const run = (actionId, args) => call('run_action', { actionId, args });

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const IMPORTED = 'FFX Proof Import';
const FALLBACK = 'FFX No Such Family';
const SAMPLE = 'HELLO WORLD 404 make';

try {
  console.log('gpu:fonts');
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gpu-fonts', version: '1' } });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  await call('create_project', { name: 'Font library proof', format: 'long', durationFrames: 30, uiMode: 'pro' }, 400000);

  // The import fixture: VT323 (a narrow pixel face, far from the sans-serif fallback) as WOFF2.
  const woff2Path = join(OUT_DIR, 'proof-vt323.woff2');
  writeFileSync(woff2Path, woffToWoff2(readFileSync(join(ROOT, 'public/fonts/vt323-400.woff'))));
  const imp = await call('import_font', { path: woff2Path, family: IMPORTED });
  check(`import_font registers the WOFF2 under the given family and stores it (${JSON.stringify({ family: imp.result.family, format: imp.result.format, persisted: imp.result.persisted })})`, () => {
    assert.equal(imp.ok, true);
    assert.equal(imp.result.family, IMPORTED);
    assert.equal(imp.result.format, 'woff2');
    assert.equal(imp.result.persisted, true);
  });

  const bad = await request('tools/call', { name: 'run_action', arguments: { actionId: 'agent.importFont', args: { data: Buffer.from('not a font at all').toString('base64'), fileName: 'x.ttf' } } });
  check('a non-font file is rejected with a clear error', () => {
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /not a font file/);
  });

  const width = async (fontFamily, fontWeight = 400, fontStyle = 'normal') => (await run('agent.measureString', { text: SAMPLE, fontFamily, fontSize: 100, fontWeight, fontStyle })).result.width;
  const w = {
    imported: await width(IMPORTED),
    vt323: await width('VT323'),
    fallback: await width(FALLBACK),
    archivo: await width('Archivo Expanded', 800),
    inter400: await width('Inter', 400),
    inter600: await width('Inter', 600),
    playfair: await width('Playfair Display', 400),
    playfairItalic: await width('Playfair Display', 400, 'italic'),
    instrument: await width('Instrument Serif', 400),
    instrumentItalic: await width('Instrument Serif', 400, 'italic'),
    montserrat: await width('Montserrat', 400),
    montserratItalic: await width('Montserrat', 400, 'italic'),
    alternates: await width('Montserrat Alternates', 600),
  };
  console.log(`    widths @100px: ${Object.entries(w).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  const differs = (a, b, rel = 0.02) => Math.abs(a - b) / Math.max(a, b) > rel;
  check('the imported WOFF2 measures exactly like its source face (VT323) and not like the fallback', () => {
    assert.ok(Math.abs(w.imported - w.vt323) < 0.5, `imported ${w.imported} vs VT323 ${w.vt323}`);
    assert.ok(differs(w.imported, w.fallback, 0.05), `imported ${w.imported} vs fallback ${w.fallback}`);
  });
  check('lazy bundled families load: Archivo Expanded 800 is far wider than the fallback, Montserrat Alternates differs from it', () => {
    assert.ok(w.archivo > w.fallback * 1.15, `Archivo Expanded ${w.archivo} vs fallback ${w.fallback}`);
    assert.ok(differs(w.alternates, w.fallback), `Montserrat Alternates ${w.alternates} vs fallback ${w.fallback}`);
  });
  check('Inter 600 is a real face (advances differ from 400; a synthesized bold would keep them)', () => {
    assert.ok(differs(w.inter600, w.inter400, 0.01), `Inter 600 ${w.inter600} vs 400 ${w.inter400}`);
  });
  check('true italics are drawn from italic faces (Playfair / Instrument italic advances differ); Montserrat italic stays a synthesized oblique', () => {
    assert.ok(differs(w.playfairItalic, w.playfair, 0.005), `Playfair italic ${w.playfairItalic} vs upright ${w.playfair}`);
    assert.ok(differs(w.instrumentItalic, w.instrument, 0.005), `Instrument italic ${w.instrumentItalic} vs upright ${w.instrument}`);
    assert.ok(Math.abs(w.montserratItalic - w.montserrat) < 0.5, `Montserrat oblique ${w.montserratItalic} vs upright ${w.montserrat}`);
  });

  // ----- render proof through the exporter path -----
  const batch = await call('run_actions', {
    actions: [
      { actionId: 'editor.addText', args: { content: SAMPLE } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 100 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.activeLayerId', path: 'content.spans.0.style.color', value: [1, 1, 1, 1] } },
    ],
  });
  const layerId = batch.results[0].activeLayerId;
  const inkIn = async (fontFamily, fontWeight, name) => {
    await run('editor.updateLayerProperty', { layerId, path: 'content.spans.0.style.fontFamily', value: fontFamily });
    await run('editor.updateLayerProperty', { layerId, path: 'content.spans.0.style.fontWeight', value: fontWeight });
    const path = join(OUT_DIR, `${name}.png`);
    await call('render_frame', { frame: 10, path, inline: false });
    return inkExtent(decodePng(readFileSync(path)));
  };
  const inkFallback = await inkIn(FALLBACK, 400, 'render-fallback');
  const inkImported = await inkIn(IMPORTED, 400, 'render-imported-woff2');
  const inkArchivo = await inkIn('Archivo Expanded', 800, 'render-archivo-expanded-800');
  console.log(`    rendered ink widths: fallback ${inkFallback.width}px, imported ${inkImported.width}px, Archivo Expanded 800 ${inkArchivo.width}px`);
  check('render_frame draws the imported WOFF2 face (ink width differs from the fallback face)', () => {
    assert.ok(inkFallback.pixels > 500 && inkImported.pixels > 500, 'text rendered');
    assert.ok(differs(inkImported.width, inkFallback.width, 0.05), `imported ${inkImported.width} vs fallback ${inkFallback.width}`);
    assert.ok(Math.abs(inkImported.width - w.imported) < w.imported * 0.08, `ink ${inkImported.width} vs measured ${w.imported}`);
  });
  check('render_frame draws the lazy Archivo Expanded face (much wider than the fallback)', () => {
    assert.ok(inkArchivo.width > inkFallback.width * 1.15, `Archivo ${inkArchivo.width} vs fallback ${inkFallback.width}`);
  });

  const state = await call('list_features', { area: 'text' });
  check('the agent catalog lists the bundled families', () => {
    for (const f of ['Archivo Expanded', 'Instrument Serif', 'VT323', 'Damion', 'Inter Tight']) assert.ok(state.catalogs.fontFamilies.includes(f), f);
  });

  console.log(`\n${passed} checks passed. Files: ${OUT_DIR}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.message}\n--- server stderr ---\n${stderr.join('').slice(-4000)}`);
  process.exitCode = 1;
} finally {
  server.stdin.end();
  await new Promise((r) => { const t = setTimeout(() => { server.kill(); r(); }, 15000); server.on('exit', () => { clearTimeout(t); r(); }); });
}
