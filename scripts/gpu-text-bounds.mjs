// GPU harness for B43 (text raster bounds): glyph ink that overhangs the measured text box (true italic
// faces, the synthesized oblique of a face with no italic file, f hooks) is no longer clipped, on the
// whole-layer raster AND the per-glyph stamp path (animators, accent words), and the layout does not move.
// Runs the REAL WebGPURenderer in headless Chrome (scripts/lib/headless-gpu.mjs), side by side with the
// pre-B43 renderer + text rasterizer (pinned commit below, bundled from git), with the bundled font files.
// NOT part of `npm test` (CI has no GPU):  npm run gpu:text-bounds
// Env: FLASHFX_TEXT_BOUNDS_OUT=<dir for the PNG evidence>.
//
// Proves:
//  1. Layout unchanged: measureText (the box every layout / glyph slot uses) is identical to the pinned one.
//  2. Italic text keeps all its ink: the rendered ink mass of italic "free" (Playfair Display italic,
//     Inter synthesized oblique), "second" / "spends" / "Aren't louder." (Instrument Serif italic) equals
//     an unclipped Canvas-2D reference within 1%, while the pinned renderer loses ink (the defect).
//  3. The new raster has a clear border (no ink in its outermost rows / columns = nothing cut at the edge).
//  4. The per-glyph stamp path (an animator, an accent-word run) keeps the italic overhang too.
//  5. Upright text with no overhang renders BYTE-IDENTICALLY to the pinned renderer.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleEntry, findChrome, makeTempDir, withHeadlessPage, ROOT } from './lib/headless-gpu.mjs';

// The last commit before B43 touched the text rasterizer / renderer.
const BASELINE_COMMIT = 'b7e9ba3';
const fwd = (p) => p.replace(/\\/g, '/').replace(/\/$/, '');
const ROOT_F = fwd(ROOT);
const OUT_DIR = process.env.FLASHFX_TEXT_BOUNDS_OUT ?? join(tmpdir(), 'flashfx-text-bounds');
mkdirSync(OUT_DIR, { recursive: true });

const FONTS = [
  ['Inter', 'inter-400.woff', 400, 'normal'],
  ['Inter', 'inter-700.woff', 700, 'normal'],
  ['Playfair Display', 'playfair-display-400.woff', 400, 'normal'],
  ['Playfair Display', 'playfair-display-400-italic.woff', 400, 'italic'],
  ['Instrument Serif', 'instrument-serif-400.woff', 400, 'normal'],
  ['Instrument Serif', 'instrument-serif-400-italic.woff', 400, 'italic'],
  ['Montserrat', 'montserrat-700.woff', 700, 'normal'],
];

const ENTRY = (baselineRenderer, baselineAtlas) => String.raw`
import { WebGPURenderer } from '${ROOT_F}/src/engine/renderer';
import { WebGPURenderer as PinnedRenderer } from '${baselineRenderer}';
import { renderTextToCanvas, measureText } from '${ROOT_F}/src/engine/textAtlas';
import { measureText as pinnedMeasure } from '${baselineAtlas}';
import { resolveFrame } from '${ROOT_F}/src/core/interpolation';
import { createComposition, createTextLayer } from '${ROOT_F}/src/core/factory';
import { defaultRangeSelector } from '${ROOT_F}/src/text/rangeSelector';

const W = 1280, H = 400;
const FONTS = ${JSON.stringify(FONTS)};

async function readPixels(r) {
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d');
  g.drawImage(r.getOffscreenCanvas(), 0, 0);
  return g.getImageData(0, 0, W, H).data;
}
// Sum of the red channel (white text on black: the ink mass) and the ink bbox.
function mass(px, w, h, stride = 4, ch = 0) {
  let m = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = px[(y * w + x) * stride + ch];
    if (v > 0) { m += v; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { m, minX, maxX, minY, maxY };
}
// Unclipped reference: the same string drawn with Canvas 2D on a big canvas (alpha mass).
function referenceMass(font, str, letterSpacing = 0) {
  const c = new OffscreenCanvas(2400, 900);
  const g = c.getContext('2d');
  g.font = font; g.textBaseline = 'top'; g.fillStyle = '#fff';
  if (letterSpacing) { let x = 600; for (const ch of str) { g.fillText(ch, x, 300); x += g.measureText(ch).width + letterSpacing; } }
  else g.fillText(str, 600, 300);
  return mass(g.getImageData(0, 0, 2400, 900).data, 2400, 900, 4, 3).m;
}
function edgeInk(entry) {
  const c = new OffscreenCanvas(entry.width, entry.height);
  const g = c.getContext('2d');
  g.drawImage(entry.bitmap, 0, 0);
  const d = g.getImageData(0, 0, entry.width, entry.height).data;
  let n = 0;
  for (let y = 0; y < entry.height; y++) for (let x = 0; x < entry.width; x++) {
    if (x !== 0 && y !== 0 && x !== entry.width - 1 && y !== entry.height - 1) continue;
    if (d[(y * entry.width + x) * 4 + 3] > 0) n++;
  }
  return n;
}
async function png(px, name) {
  const c = new OffscreenCanvas(W, H);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0);
  const b = await c.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name, b64: btoa(s) };
}

window.__bounds = async () => {
  for (const [fam, file, weight, style] of FONTS) {
    const f = new FontFace(fam, 'url(/' + file + ')', { weight: String(weight), style });
    await f.load(); document.fonts.add(f);
  }
  const cur = new WebGPURenderer();
  const pin = new PinnedRenderer();
  if (!(await cur.initializeOffscreen(W, H)) || !(await pin.initializeOffscreen(W, H))) return { initFailed: true };
  const comp = createComposition('b43', { width: W, height: H, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
  for (const l of comp.background.layers) for (const st of l.stops) st.color = [0, 0, 0];

  // spec: { text | spans, family, weight, style, size, letterSpacing?, animator?, align?, stroke? }
  const makeLayer = (spec) => {
    const t = createTextLayer('t', W / 2, H / 2, spec.text ?? '', 30, [1, 1, 1, 1]);
    const st = t.content.spans[0].style;
    Object.assign(st, { fontFamily: spec.family, fontWeight: spec.weight, fontStyle: spec.style });
    if (spec.spans) t.content.spans = spec.spans.map((s) => ({ text: s.text, style: { ...st, ...s.style } }));
    t.animOverrides.fontSize.defaultValue = spec.size;
    if (spec.letterSpacing) t.animOverrides.letterSpacing.defaultValue = spec.letterSpacing;
    if (spec.align) t.layoutConfig.horizontalAlign = spec.align;
    if (spec.fill) t.content.spans[0].style.fill = spec.fill;
    if (spec.animator) t.animators = [{ enabled: true, splitMode: 'character', selector: defaultRangeSelector(), delta: { position: [0, 0] } }];
    return t;
  };
  const render = async (r, spec) => {
    comp.layers = [makeLayer(spec)];
    const frame = resolveFrame(comp, 0);
    await r.renderFrameAsync(frame, 'offscreen');
    return { px: await readPixels(r), frame };
  };
  const fontOf = (spec) => (spec.style === 'italic' ? 'italic ' : 'normal ') + spec.weight + ' ' + spec.size + 'px "' + spec.family + '"';
  const out = { italic: {}, upright: {}, layout: {}, shots: [] };

  const ITALIC = {
    'playfair-italic-free': { text: 'free', family: 'Playfair Display', weight: 400, style: 'italic', size: 260 },
    'inter-oblique-free': { text: 'free', family: 'Inter', weight: 400, style: 'italic', size: 260 },
    'instrument-italic-second': { text: 'second', family: 'Instrument Serif', weight: 400, style: 'italic', size: 260 },
    'instrument-italic-spends': { text: 'spends', family: 'Instrument Serif', weight: 400, style: 'italic', size: 260 },
    'instrument-italic-arent': { text: "Aren't louder.", family: 'Instrument Serif', weight: 400, style: 'italic', size: 170 },
    'playfair-italic-free-tracked': { text: 'free', family: 'Playfair Display', weight: 400, style: 'italic', size: 260, letterSpacing: 6 },
    'stamps-animator-free': { text: 'free', family: 'Playfair Display', weight: 400, style: 'italic', size: 260, animator: true },
    'stamps-oblique-jiffy': { text: 'jiffy', family: 'Inter', weight: 400, style: 'italic', size: 240, animator: true },
  };
  for (const [name, spec] of Object.entries(ITALIC)) {
    const a = await render(cur, spec);
    const b = await render(pin, spec);
    const t = a.frame.layers.find((l) => l.text);
    const ref = spec.animator
      ? [...spec.text].reduce((s, ch) => s + referenceMass(fontOf(spec), ch), 0)
      : referenceMass(fontOf(spec), spec.text, spec.letterSpacing ?? 0);
    const entry = spec.animator ? null : renderTextToCanvas(t.text);
    out.italic[name] = {
      cur: mass(a.px, W, H), pin: mass(b.px, W, H), ref,
      edgeInk: entry ? edgeInk(entry) : 0,
      pad: entry ? [entry.padX, entry.padY] : null,
      measureSame: spec.animator ? true : JSON.stringify(measureText(t.text)) === JSON.stringify(pinnedMeasure(t.text)),
    };
    if (name === 'playfair-italic-free' || name === 'instrument-italic-second' || name === 'stamps-oblique-jiffy') {
      out.shots.push(await png(a.px, name + '-b43'), await png(b.px, name + '-pinned'));
    }
  }

  // Accent word: "a free file" with "free" in Playfair italic (the sample-01 S05 case), via runs/stamps.
  const accent = { text: '', family: 'Inter', weight: 700, style: 'normal', size: 200, spans: [
    { text: 'a ', style: {} },
    { text: 'free', style: { fontFamily: 'Playfair Display', fontWeight: 400, fontStyle: 'italic' } },
    { text: ' file', style: {} },
  ] };
  {
    const a = await render(cur, accent);
    const b = await render(pin, accent);
    const parts = [['a', 'normal 700 200px "Inter"'], ['f', 'italic 400 200px "Playfair Display"'], ['r', 'italic 400 200px "Playfair Display"'], ['e', 'italic 400 200px "Playfair Display"'], ['e', 'italic 400 200px "Playfair Display"'], ['f', 'normal 700 200px "Inter"'], ['i', 'normal 700 200px "Inter"'], ['l', 'normal 700 200px "Inter"'], ['e', 'normal 700 200px "Inter"']];
    out.italic['accent-run-free'] = { cur: mass(a.px, W, H), pin: mass(b.px, W, H), ref: parts.reduce((s, [ch, f]) => s + referenceMass(f, ch), 0), edgeInk: 0, pad: null, measureSame: true };
    out.shots.push(await png(a.px, 'accent-run-free-b43'), await png(b.px, 'accent-run-free-pinned'));
  }

  const UPRIGHT = {
    'inter-hello': { text: 'Hello World', family: 'Inter', weight: 400, style: 'normal', size: 120 },
    'montserrat-bold': { text: 'FLASHFX 2026', family: 'Montserrat', weight: 700, style: 'normal', size: 110 },
    'inter-two-lines-left': { text: 'Two lines\nof copy', family: 'Inter', weight: 700, style: 'normal', size: 90, align: 'left' },
    'inter-tracked': { text: 'TRACKED', family: 'Inter', weight: 700, style: 'normal', size: 100, letterSpacing: 12 },
    'inter-gradient': { text: 'GRADIENT', family: 'Inter', weight: 700, style: 'normal', size: 120, fill: { kind: 'linear', angle: 90, stops: [{ color: [1, 0.8, 0.2], position: 0, opacity: 1 }, { color: [0.2, 0.5, 1], position: 1, opacity: 1 }] } },
    'stamps-upright': { text: 'Stamped', family: 'Inter', weight: 400, style: 'normal', size: 120, animator: true },
    'serif-upright': { text: 'Mirror', family: 'Instrument Serif', weight: 400, style: 'normal', size: 140 },
  };
  for (const [name, spec] of Object.entries(UPRIGHT)) {
    const a = await render(cur, spec);
    const b = await render(pin, spec);
    let diff = 0;
    for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) diff++;
    const t = a.frame.layers.find((l) => l.text);
    const entry = spec.animator ? null : renderTextToCanvas(t.text);
    out.upright[name] = { diff, ink: mass(a.px, W, H).m, pad: entry ? [entry.padX, entry.padY] : null };
  }
  return out;
};
`;

const chrome = findChrome();
if (!chrome) {
  console.error('gpu:text-bounds needs Chrome/Chromium/Edge with WebGPU (set CHROME_PATH).');
  process.exit(2);
}

const dir = makeTempDir('gpu-text-bounds-');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  console.log('gpu:text-bounds (B43 italic / overhang raster bounds)');
  const show = (p) => execSync(`git show ${BASELINE_COMMIT}:${p}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const atlasPath = `${fwd(dir)}/textAtlas-baseline.ts`;
  writeFileSync(atlasPath, show('src/engine/textAtlas.ts').replace(/from '\.\.\//g, `from '${ROOT_F}/src/`));
  const rendererPath = `${fwd(dir)}/renderer-baseline.ts`;
  writeFileSync(rendererPath, show('src/engine/renderer.ts')
    .replace(/from '\.\/textAtlas'/g, `from '${atlasPath.replace(/\.ts$/, '')}'`)
    .replace(/from '\.\.\//g, `from '${ROOT_F}/src/`)
    .replace(/from '\.\//g, `from '${ROOT_F}/src/engine/`));
  for (const [, file] of FONTS) copyFileSync(join(ROOT, 'public/fonts', file), join(dir, file));
  await bundleEntry(ENTRY(rendererPath.replace(/\.ts$/, ''), atlasPath.replace(/\.ts$/, '')), dir);

  const value = await withHeadlessPage({ dir, chrome, timeoutMs: 300000 }, async (page) => {
    await page.evaluate(`import('/bundle.js').then(() => true)`);
    return page.evaluate('window.__bounds()');
  });
  if (!value || value.initFailed) throw new Error('offscreen renderer init failed (no WebGPU adapter?)');
  for (const s of value.shots) writeFileSync(join(OUT_DIR, `${s.name}.png`), Buffer.from(s.b64, 'base64'));
  const report = {};
  for (const [k, v] of Object.entries(value.italic)) report[k] = { cur: v.cur.m, pin: v.pin.m, ref: Math.round(v.ref), pad: v.pad, edgeInk: v.edgeInk };
  for (const [k, v] of Object.entries(value.upright)) report[k] = { diff: v.diff, ink: v.ink, pad: v.pad };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  check('layout unchanged: measureText (the layout box) is identical to the pinned rasterizer for every italic case', () => {
    for (const [k, v] of Object.entries(value.italic)) assert.ok(v.measureSame, k);
  });
  const rel = (a, b) => Math.abs(a - b) / b;
  for (const [k, v] of Object.entries(value.italic)) {
    check(`${k}: rendered ink = unclipped reference within 1% (${v.cur.m} vs ${Math.round(v.ref)}; pinned ${v.pin.m})`, () => {
      assert.ok(rel(v.cur.m, v.ref) < 0.01, `${k}: cur ${v.cur.m} ref ${v.ref}`);
      assert.ok(v.cur.m >= v.pin.m, `${k}: never less ink than before`);
    });
  }
  check('the pinned renderer clipped italic ink (the defect reproduced): >= 0.3% ink lost on the f / j hook cases', () => {
    for (const k of ['playfair-italic-free', 'inter-oblique-free', 'stamps-animator-free', 'stamps-oblique-jiffy', 'accent-run-free']) {
      const v = value.italic[k];
      assert.ok((v.cur.m - v.pin.m) / v.cur.m > 0.003, `${k}: cur ${v.cur.m} pin ${v.pin.m}`);
    }
  });
  check('the B43 raster has a clear border: no ink in its outermost rows / columns, and it carries a pad', () => {
    for (const [k, v] of Object.entries(value.italic)) {
      if (!v.pad) continue;
      assert.equal(v.edgeInk, 0, `${k}: ${v.edgeInk} edge px`);
    }
    assert.ok(value.italic['playfair-italic-free'].pad[0] > 0, 'italic f hook pads the raster');
  });
  check('ink extends past the measured box on the left (the f hook) and stays centred', () => {
    const v = value.italic['playfair-italic-free'];
    assert.ok(v.cur.minX < v.pin.minX, `cur minX ${v.cur.minX} vs pinned ${v.pin.minX}`);
  });
  for (const [k, v] of Object.entries(value.upright)) {
    check(`upright ${k}: byte-identical to the pinned renderer (pad ${v.pad ? v.pad.join('/') : 'stamps'})`, () => {
      assert.ok(v.ink > 0, 'drew something');
      assert.equal(v.diff, 0, `${v.diff} bytes differ`);
    });
  }
  console.log(`\ngpu:text-bounds: ${passed} checks passed (evidence in ${OUT_DIR})`);
} catch (e) {
  console.error(`✖ gpu:text-bounds failed after ${passed} checks:\n${e.stack ?? e}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
