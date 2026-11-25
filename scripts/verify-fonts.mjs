// Acceptance harness for the B52 font library: the bundled-face manifest (engine/fonts.ts), CSS-style
// nearest-weight fallback, true italic faces picked over a synthesized oblique, the lazy loader (new
// families / extra weights / italics load on first use, boot faces = exactly the pre-B52 set so first
// paint is unchanged), composition font preloading (export / renderFrame), the custom-font format
// sniffer, and the font files themselves (each declared face exists, is a WOFF whose OS/2 weight +
// italic bit match its manifest slot, and every new family has its licence recorded).
// Browser APIs (document.fonts, FontFace, OffscreenCanvas) are stubbed; the real loading + rendering
// is proven in headless Chrome by `npm run gpu:fonts`.
// Run: node scripts/verify-fonts.mjs   (npm run verify:fonts)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const tmp = mkdtempSync(join(tmpdir(), 'verify-fonts-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };
const FONT_DIR = join(process.cwd(), 'public', 'fonts');

/** Read a WOFF 1.0 file's tables (inflating compressed ones). */
function woffTables(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOFF', 'not a WOFF file');
  const numTables = buf.readUInt16BE(12);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = buf.toString('latin1', o, o + 4);
    const offset = buf.readUInt32BE(o + 4);
    const compLength = buf.readUInt32BE(o + 8);
    const origLength = buf.readUInt32BE(o + 12);
    const raw = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : Buffer.from(raw));
  }
  return tables;
}
/** Windows-platform name record `id` (UTF-16BE), or null. */
function nameRecord(name, id) {
  const count = name.readUInt16BE(2);
  const strOff = name.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (name.readUInt16BE(r) !== 3 || name.readUInt16BE(r + 6) !== id) continue;
    const len = name.readUInt16BE(r + 8);
    const off = strOff + name.readUInt16BE(r + 10);
    const s = name.subarray(off, off + len);
    let out = '';
    for (let k = 0; k + 1 < s.length; k += 2) out += String.fromCharCode(s.readUInt16BE(k));
    return out;
  }
  return null;
}

// The 27 faces loaded at boot before B52 (first paint must not change).
const PRE_B52_BOOT = [
  'bebas-neue-400', 'dm-sans-400', 'dm-sans-700', 'inter-400', 'inter-700', 'lato-400', 'lato-700', 'manrope-400', 'manrope-700',
  'montserrat-400', 'montserrat-700', 'open-sans-400', 'open-sans-700', 'oswald-400', 'oswald-700', 'playfair-display-400',
  'playfair-display-700', 'plus-jakarta-sans-400', 'plus-jakarta-sans-700', 'poppins-400', 'poppins-700', 'raleway-400',
  'raleway-700', 'roboto-400', 'roboto-700', 'space-grotesk-400', 'space-grotesk-700',
].map((s) => `/fonts/${s}.woff`).sort();

try {
  await build({
    stdin: {
      contents: `
        export * from './src/engine/fonts';
        export { textCacheKey, measureText } from './src/engine/textAtlas';
        export { sniffFontFormat } from './src/engine/customFonts';
        export { buildAgentCatalogs } from './src/agent/catalogs';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'entry.ts',
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    alias: { '@': `${process.cwd().replace(/\\/g, '/')}/src` },
  });

  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  globalThis.OffscreenCanvas = class {
    getContext() {
      const ctx = { font: '', measureText: (s) => ({ width: String(s).length * 10 }) };
      return ctx;
    }
  };
  // Browser font API stubs: every FontFace the loader creates, and what it adds to document.fonts.
  const created = [];
  const added = [];
  globalThis.FontFace = class {
    constructor(family, source, descriptors = {}) { this.family = family; this.source = source; this.descriptors = descriptors; created.push(this); }
    load() { return Promise.resolve(this); }
  };
  globalThis.document = { fonts: { add: (f) => { added.push(f); } } };
  const urlOf = (f) => /url\((.*)\)/.exec(f.source)?.[1];
  const flush = () => new Promise((r) => setTimeout(r, 0));

  const m = await import(pathToFileURL(outfile).href);
  const { FONT_MANIFEST, nearestWeight, matchBundledFace, bundledFontUrl, collectFontRequests, loadBundledFonts, ensureFontFace, ensureCompositionFonts, textCacheKey, measureText, sniffFontFormat, buildAgentCatalogs, FONT_CATEGORY_ORDER } = m;

  console.log('font library (B52) - acceptance\n');

  // ---------- CSS nearest-weight fallback ----------
  await check('nearestWeight follows CSS Fonts 4 (400-500 heavier-to-500 first, <400 lighter first, >500 heavier first)', () => {
    const w = [400, 700];
    assert.equal(nearestWeight(w, 400), 400);
    assert.equal(nearestWeight(w, 500), 400, '500 with no 500 face: lighter (400) before heavier than 500');
    assert.equal(nearestWeight(w, 600), 700, '600: heavier first');
    assert.equal(nearestWeight(w, 300), 400, '300 with nothing lighter: heavier');
    assert.equal(nearestWeight(w, 900), 700);
    assert.equal(nearestWeight([300, 500, 700], 450), 500, '450: heavier up to 500 first');
    assert.equal(nearestWeight([300, 600], 450), 300, '450: then lighter, before > 500');
    assert.equal(nearestWeight([100, 300, 900], 200), 100);
    assert.equal(nearestWeight([400, 500, 600, 700], 550), 600);
    assert.equal(nearestWeight([], 400), null);
  });

  await check('Inter 500 / 600 resolve to the real 500 / 600 faces; families without them fall back like CSS', () => {
    assert.equal(matchBundledFace('Inter', 500).url, '/fonts/inter-500.woff');
    assert.equal(matchBundledFace('Inter', 600).url, '/fonts/inter-600.woff');
    assert.equal(matchBundledFace('Inter', 650).weight, 700);
    assert.equal(matchBundledFace('Inter', 800).weight, 700);
    assert.equal(matchBundledFace('Inter', 800).syntheticBold, false, '700 face is bold already');
    assert.equal(matchBundledFace('Inter Tight', 500).url, '/fonts/inter-tight-500.woff');
    assert.equal(matchBundledFace('Inter Tight', 600).url, '/fonts/inter-tight-600.woff');
    assert.equal(matchBundledFace('Montserrat', 500).weight, 400, 'Montserrat has 400 / 700 only: 500 -> 400');
    assert.equal(matchBundledFace('Montserrat', 600).weight, 700, '600 -> 700');
    assert.equal(matchBundledFace('Archivo Expanded', 900).weight, 800);
    assert.equal(matchBundledFace('VT323', 700).syntheticBold, true, 'single-weight face: bold is synthesized');
    assert.equal(bundledFontUrl('Inter', 600), '/fonts/inter-600.woff');
    assert.equal(matchBundledFace('Arial', 400), null, 'system font: nothing to load');
    assert.equal(matchBundledFace('My Imported Font', 400), null, 'custom font: nothing bundled');
  });

  await check('italic: a true italic face is picked over a synthesized oblique when bundled', () => {
    const pf = matchBundledFace('Playfair Display', 400, 'italic');
    assert.equal(pf.url, '/fonts/playfair-display-400-italic.woff');
    assert.equal(pf.italic, true);
    assert.equal(pf.syntheticOblique, false);
    assert.equal(matchBundledFace('Playfair Display', 700, 'italic').url, '/fonts/playfair-display-700-italic.woff');
    assert.equal(matchBundledFace('Playfair Display', 600, 'italic').weight, 700);
    const is = matchBundledFace('Instrument Serif', 400, 'italic');
    assert.equal(is.url, '/fonts/instrument-serif-400-italic.woff');
    assert.equal(is.syntheticOblique, false);
    assert.equal(matchBundledFace('Instrument Serif', 400).url, '/fonts/instrument-serif-400.woff', 'upright request keeps the upright face');
    const inter = matchBundledFace('Inter', 400, 'italic');
    assert.equal(inter.italic, false);
    assert.equal(inter.syntheticOblique, true, 'Inter has no italic bundled: oblique');
    assert.equal(inter.url, '/fonts/inter-400.woff');
  });

  // ---------- manifest + files on disk ----------
  const allFaces = [];
  for (const e of FONT_MANIFEST) {
    if (!e.slug) continue;
    for (const w of e.weights) allFaces.push({ e, w, italic: false, url: `/fonts/${e.slug}-${w}.woff` });
    for (const w of e.italicWeights ?? []) allFaces.push({ e, w, italic: true, url: `/fonts/${e.slug}-${w}-italic.woff` });
  }

  await check(`every declared face (${allFaces.length}) is a WOFF on disk whose OS/2 weight + italic bit match its manifest slot`, () => {
    for (const f of allFaces) {
      const path = join(FONT_DIR, f.url.replace('/fonts/', ''));
      assert.ok(existsSync(path), `missing ${f.url}`);
      const t = woffTables(readFileSync(path));
      const os2 = t.get('OS/2');
      assert.ok(os2, `${f.url}: no OS/2 table`);
      const weightClass = os2.readUInt16BE(4);
      const italicBit = (os2.readUInt16BE(62) & 1) === 1;
      // Single-weight display faces ship a 400 file regardless; multi-weight families must match.
      if (f.e.weights.length > 1 || f.italic) assert.equal(weightClass, f.w, `${f.url}: OS/2 weight ${weightClass}`);
      assert.equal(italicBit, f.italic, `${f.url}: italic bit ${italicBit}`);
    }
  });

  await check('Archivo Expanded is a real wide instance (renamed, OS/2 width class expanded)', () => {
    const t = woffTables(readFileSync(join(FONT_DIR, 'archivo-expanded-400.woff')));
    assert.equal(nameRecord(t.get('name'), 1), 'Archivo Expanded');
    const os2 = t.get('OS/2');
    assert.equal(os2.readUInt16BE(6), 7, 'usWidthClass 7 = expanded');
  });

  await check('every family added by B52 has its licence recorded (public/fonts/LICENSES.md, OFL)', () => {
    const lic = readFileSync(join(FONT_DIR, 'LICENSES.md'), 'utf8');
    for (const e of FONT_MANIFEST) {
      if (!e.slug || !(e.lazy || e.lazyWeights?.length || e.italicWeights?.length)) continue;
      assert.ok(lic.includes(`${e.slug}-`), `LICENSES.md does not list ${e.family}`);
    }
    assert.ok(lic.includes('SIL OFL 1.1'));
  });

  await check('the B52 reference families are bundled with the right categories, and every category has a menu group', () => {
    const fam = (n) => FONT_MANIFEST.find((f) => f.family === n);
    for (const n of ['Inter Tight', 'Archivo Expanded', 'Montserrat Alternates', 'Unbounded', 'Nunito', 'Instrument Serif', 'Damion', 'VT323', 'Silkscreen', 'Space Mono']) {
      assert.ok(fam(n), `${n} missing`);
      assert.equal(fam(n).lazy, true, `${n} must load lazily`);
    }
    assert.equal(fam('Damion').category, 'Script');
    assert.equal(fam('VT323').category, 'Pixel');
    for (const f of FONT_MANIFEST) assert.ok(FONT_CATEGORY_ORDER.includes(f.category), `${f.family}: category ${f.category} has no menu group`);
    assert.equal(new Set(FONT_MANIFEST.map((f) => f.family)).size, FONT_MANIFEST.length, 'duplicate family');
  });

  await check('agent catalog fontFamilies lists every family with its weights / italics', () => {
    const cat = buildAgentCatalogs().fontFamilies;
    assert.equal(cat.length, FONT_MANIFEST.length);
    const pf = cat.find((c) => c.id === 'Playfair Display');
    assert.match(pf.description, /true italic 400, 700/);
    assert.match(cat.find((c) => c.id === 'Inter').description, /400, 500, 600, 700/);
    assert.match(cat.find((c) => c.id === 'VT323').description, /loads on first use/);
  });

  // ---------- loading ----------
  await check('boot loads exactly the pre-B52 faces (first paint unchanged); lazy families / weights / italics are not fetched', async () => {
    await loadBundledFonts();
    const boot = created.map(urlOf).sort();
    assert.deepEqual(boot, PRE_B52_BOOT);
    assert.equal(added.length, PRE_B52_BOOT.length);
  });

  const ink = (fontFamily, fontWeight = 400, fontStyle = 'normal') => ({
    content: 'Hello', mode: 'point', boxWidth: 300, boxHeight: 200, fontFamily, fontWeight, fontStyle, fontSize: 40, lineHeight: 1.2,
    letterSpacing: 0, fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, textAlign: 'center', underline: false, strikethrough: false,
    measuredWidth: 0, measuredHeight: 0,
  });

  await check('a lazy face loads on first draw (requested by the text rasterizer), is added only once loaded, and busts the text caches', async () => {
    const before = created.length;
    const key0 = textCacheKey(ink('Archivo Expanded', 800));
    measureText(ink('Archivo Expanded', 800));
    const face = created[created.length - 1];
    assert.equal(created.length, before + 1);
    assert.equal(urlOf(face), '/fonts/archivo-expanded-800.woff');
    assert.equal(face.family, 'Archivo Expanded');
    assert.equal(face.descriptors.weight, '800');
    await flush();
    assert.ok(added.includes(face), 'added to document.fonts after load');
    assert.notEqual(textCacheKey(ink('Archivo Expanded', 800)), key0, 'font epoch bumped: text re-rasterizes in the real face');
    measureText(ink('Archivo Expanded', 800));
    measureText({ ...ink('Archivo Expanded', 800), content: 'other' });
    assert.equal(created.length, before + 1, 'the same face is never fetched twice');
  });

  await check('Inter 600 loads the 600 face on demand; Inter 400 (boot) fetches nothing; Playfair italic loads the italic file', async () => {
    const before = created.length;
    measureText(ink('Inter', 400));
    assert.equal(created.length, before);
    measureText(ink('Inter', 600));
    assert.equal(urlOf(created[created.length - 1]), '/fonts/inter-600.woff');
    measureText(ink('Playfair Display', 700, 'italic'));
    const it = created[created.length - 1];
    assert.equal(urlOf(it), '/fonts/playfair-display-700-italic.woff');
    assert.equal(it.descriptors.style, 'italic');
    measureText(ink('Arial', 400));
    measureText(ink('Some Custom Font', 400));
    assert.equal(created.length, before + 2, 'system / custom families load nothing');
    assert.equal(ensureFontFace('Arial', 400), null);
  });

  await check('collectFontRequests walks text spans and follows precomps; ensureCompositionFonts loads them before a render', async () => {
    const sub = { id: 'sub', layers: [{ type: 'text', content: { spans: [{ text: 'x', style: { fontFamily: 'Damion', fontWeight: 400, fontStyle: 'normal' } }] } }] };
    const root = { id: 'root', layers: [
      { type: 'text', content: { spans: [{ text: 'a', style: { fontFamily: 'VT323', fontWeight: 400, fontStyle: 'normal' } }, { text: 'b', style: { fontFamily: 'Instrument Serif', fontWeight: 400, fontStyle: 'italic' } }] } },
      { type: 'precomp', compositionId: 'sub' },
    ] };
    const reqs = collectFontRequests(root, (id) => (id === 'sub' ? sub : undefined));
    assert.deepEqual(reqs.map((r) => `${r.fontFamily}|${r.fontStyle}`).sort(), ['Damion|normal', 'Instrument Serif|italic', 'VT323|normal']);
    const before = created.length;
    await ensureCompositionFonts(root, (id) => (id === 'sub' ? sub : undefined));
    const urls = created.slice(before).map(urlOf).sort();
    assert.deepEqual(urls, ['/fonts/damion-400.woff', '/fonts/instrument-serif-400-italic.woff', '/fonts/vt323-400.woff']);
    for (const f of created.slice(before)) assert.ok(added.includes(f), `${urlOf(f)} registered before the render`);
  });

  // ---------- custom font import ----------
  await check('custom font import sniffs WOFF2 / WOFF / TTF / OTF and rejects anything else', () => {
    const ab = (bytes) => new Uint8Array(bytes).buffer;
    assert.equal(sniffFontFormat(ab([0x77, 0x4f, 0x46, 0x32, 0, 0])), 'woff2');
    const woff = readFileSync(join(FONT_DIR, 'inter-400.woff'));
    assert.equal(sniffFontFormat(woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength)), 'woff');
    assert.equal(sniffFontFormat(ab([0, 1, 0, 0, 0, 9])), 'ttf');
    assert.equal(sniffFontFormat(ab([0x4f, 0x54, 0x54, 0x4f])), 'otf');
    assert.equal(sniffFontFormat(ab([0x89, 0x50, 0x4e, 0x47])), null, 'PNG is not a font');
    assert.equal(sniffFontFormat(ab([1, 2])), null);
  });

  console.log(`\nfonts: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
