// Acceptance harness for B82: the typing prompt box (agent.addPromptBox) and its engine pieces - the
// per-character typing schedule (core/textTyping.ts: explicit frames, cps, eased rate), the arrival colour
// (each new glyph drawn in arrivalColor on its arrival frame, the text colour N frames later), the gradient
// caret (TextCaret.gradient) and the caret riding the type-on head (also on a centred line that grows both
// ways). Runs the REAL agent runtime + editor / history stores in node (esbuild bundle, canvas measurement
// stubbed at 10 px per character), so undo is the real history command. Old projects: resolveFrame of
// projects without the new fields is compared byte for byte with the resolver of the base commit (git).
// GPU proof through the MCP: gpu:prompt-box.
//   node scripts/verify-prompt-box.mjs   (or: npm run verify:prompt-box)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, alphabeticBaseline: -8 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} };
  }
};

// The base commit B82 was built on (old projects must resolve exactly like it).
const BASE_COMMIT = process.env.PROMPT_BOX_BASE ?? '2c1e99f';
const ROOT = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'prompt-box-verify-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const supabaseStub = { name: 'stub', setup(b) { b.onResolve({ filter: /^@supabase\// }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const createClient = () => null; export default {};', loader: 'js' })); } };
const bundleOpts = (resolveDir, outfile, contents) => ({
  stdin: { contents, resolveDir, sourcefile: 'entry.ts', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent', plugins: [supabaseStub],
  nodePaths: [join(ROOT, 'node_modules')], loader: { '.wgsl': 'text', '.svg': 'text', '.png': 'dataurl', '.css': 'empty' }, define: { 'import.meta.env': '{}' },
});

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build(bundleOpts(ROOT, outfile, `
    export { runAgentAction } from './src/agent/runtime';
    export { useEditorStore } from './src/store/editor';
    export { useHistoryStore } from './src/store/history';
    export { resolveFrame } from './src/core/interpolation';
    export { typingFrames, typingVisibleCount, normalizeTextTyping, typingAnimatorsAt, arrivalWeight } from './src/core/textTyping';
    export { normalizeTextCaret } from './src/core/textCaret';
    export { createTextLayer, createComposition } from './src/core/factory';
    export { buildTextAnimatorPreset, TEXT_ANIMATOR_PRESETS, createTextDecode } from './src/core/textAnimatorPresets';
    export { validateComposition } from './src/project-system/services/validation';
    export { applyEasing } from './src/core/easings';
    export { evaluateNumber, evaluateVec2 } from './src/core/interpolation';
  `));
  const m = await import(pathToFileURL(outfile).href);
  const { runAgentAction, useEditorStore, useHistoryStore, resolveFrame, typingFrames, typingVisibleCount, normalizeTextTyping, arrivalWeight, createTextLayer,
    buildTextAnimatorPreset, TEXT_ANIMATOR_PRESETS, createTextDecode, validateComposition, applyEasing, evaluateNumber, evaluateVec2, normalizeTextCaret } = m;

  console.log('verify:prompt-box');
  const run = async (id, args) => { const r = await runAgentAction(id, args); assert.equal(r.ok, true, `${id}: ${r.error}`); return r.result; };
  const comp = () => useEditorStore.getState().composition;
  const resolveAt = (f) => resolveFrame(comp(), f, { getComposition: useEditorStore.getState().getComposition }).layers;
  const glyphs = (layers, textId) => layers.filter((l) => l.id.startsWith(`${textId}#g`)).map((l) => ({ i: Number(l.id.slice(textId.length + 2)), l })).sort((a, b) => a.i - b.i);
  const caretOf = (layers, textId) => layers.find((l) => l.id === `${textId}#caret`);
  const fps = comp().settings.frameRate;
  const PINK = [0xe7 / 255, 0x80 / 255, 0xf6 / 255, 1];
  const WHITE = [0xf3 / 255, 0xee / 255, 0xed / 255, 1];
  const S11 = 'Add user authentication with login and signup';

  // ---------------------------------------------------------------- schedule math
  await check('typingFrames: durationFrames puts the first char on startFrame and the last on start + D - 1, evenly (r10 S7: 31 chars f227-245)', () => {
    const fr = typingFrames({ count: 31, startFrame: 227, fps: 30, durationFrames: 19 });
    assert.equal(fr.length, 31); assert.equal(fr[0], 227); assert.equal(fr[30], 245);
    fr.forEach((f, i) => assert.equal(f, 227 + Math.ceil((i * 18) / 30 - 1e-9), `char ${i}`));
    for (let i = 1; i < fr.length; i++) assert.ok(fr[i] >= fr[i - 1]);
  });
  await check('typingFrames: cps = one char every fps / cps frames; explicit frames are kept (padded, made non-decreasing)', () => {
    assert.deepEqual(typingFrames({ count: 5, startFrame: 10, fps: 30, cps: 10 }), [10, 13, 16, 19, 22]);
    assert.deepEqual(typingFrames({ count: 4, startFrame: 0, fps: 30, cps: 60 }), [0, 1, 1, 2]);
    assert.deepEqual(typingFrames({ count: 5, startFrame: 0, fps: 30, frames: [153, 155, 151, 160] }), [153, 155, 155, 160, 160]);
    assert.deepEqual(typingFrames({ count: 1, startFrame: 7, fps: 30, cps: 5 }), [7]);
  });
  await check('typingFrames: an eased RATE (easeInOutCubic, r10 S4) - visible count per frame == floor(ease(u) * (n - 1)) + 1; slow ends, fast middle', () => {
    const n = 27, s = 119, D = 22;
    const fr = typingFrames({ count: n, startFrame: s, fps: 30, durationFrames: D, ease: 'cubicInOut' });
    const T = D - 1;
    for (let f = s; f <= s + T; f++) {
      const want = Math.floor(applyEasing('cubicInOut', (f - s) / T) * (n - 1) + 1e-9) + 1;
      assert.equal(typingVisibleCount({ frames: fr }, n, f), want, `f${f}`);
    }
    const gaps = fr.slice(1).map((f, i) => f - fr[i]);
    assert.ok(gaps[0] + gaps[1] > gaps[12] + gaps[13], `slow start: ${gaps}`);
    // a cubic-bezier quad works too (the measured r10 S4 curve)
    const fb = typingFrames({ count: n, startFrame: s, fps: 30, durationFrames: D, ease: [0.67, 0.086, 0.211, 0.849] });
    assert.equal(fb[0], s); assert.equal(fb[n - 1], s + T);
  });
  await check('normalizeTextTyping: rounds, sorts forward, drops junk; arrival weight 1 on the arrival frame, 0 after N frames', () => {
    const t = normalizeTextTyping({ frames: [3.4, 'x', 1, 9], arrivalColor: PINK, arrivalFrames: 4, bogus: 1 });
    assert.deepEqual(t, { enabled: true, frames: [3, 3, 9], arrivalColor: PINK, arrivalFrames: 4 });
    assert.equal(normalizeTextTyping({ frames: [] }), undefined);
    assert.equal(normalizeTextTyping('x'), undefined);
    assert.equal(arrivalWeight(t, 0, 2), 0); assert.equal(arrivalWeight(t, 0, 3), 1); assert.equal(arrivalWeight(t, 0, 5), 0.5); assert.equal(arrivalWeight(t, 0, 7), 0);
  });

  // ---------------------------------------------------------------- the r10 S11 box through the real runtime
  const before = JSON.stringify(comp());
  const s11 = await run('agent.addPromptBox', {
    x: 960, y: 540, width: 872, height: 96, radius: 36, theme: 'dark', text: S11, startFrame: 427, endFrame: 490,
    typing: { startFrame: 432, durationFrames: 25 }, arrivalColor: '#e780f6', arrivalFrames: 4,
    caret: { gradient: ['#6175ce', '#e85aa0'] }, buttons: { send: true }, sendFrame: 462, flash: true, entrance: 'slideFromRight', placeholder: 'Ask Lovable to create',
  });
  const afterAdd = JSON.stringify(comp());
  const T11 = s11.textId;
  const fr11 = s11.typing.frames;

  await check(`agent.addPromptBox (r10 S11): ${s11.content.length} chars typed f${s11.typing.startFrame}-${s11.typing.endFrame}, box ${s11.box.width} x ${s11.box.height} r${s11.box.radius}, send at (${s11.sendCenter})`, () => {
    assert.equal(s11.content, S11);
    assert.equal(fr11.length, S11.length);
    assert.equal(s11.typing.startFrame, 432); assert.equal(s11.typing.endFrame, 456);
    assert.deepEqual([s11.box.width, s11.box.height, s11.box.radius, s11.box.left, s11.box.right], [872, 96, 36, 524, 1396]);
    assert.ok(s11.sendId && s11.flashId && s11.refillId && s11.placeholderId);
    assert.ok(!s11.warnings, JSON.stringify(s11.warnings));
    const box = comp().layers.find((l) => l.id === s11.boxId);
    assert.deepEqual(box.shape.fillColor.map((c) => Math.round(c * 255)), [0x24, 0x1e, 0x21, 255]);
  });

  await check('visible glyphs per frame == the schedule (every frame of the typing window, spaces carry no glyph)', () => {
    for (let f = 428; f <= 460; f++) {
      const n = typingVisibleCount({ frames: fr11 }, S11.length, f);
      const want = [...S11.slice(0, n)].filter((c) => c.trim() !== '').length;
      const got = glyphs(resolveAt(f), T11);
      assert.equal(got.length, want, `f${f}`);
      assert.ok(got.every((g) => g.i < n), `f${f}: only the first ${n} characters`);
    }
  });

  await check('arrival colour: the newest glyph == arrivalColor (#e780f6) on its arrival frame, == the text colour 4 frames later, in between mid-fade', () => {
    let tested = 0;
    for (let k = 0; k < S11.length; k++) {
      if (S11[k] === ' ') continue;
      const a = fr11[k];
      const at = (f) => glyphs(resolveAt(f), T11).find((g) => g.i === k).l.text.fillColor;
      at(a).forEach((c, i) => close(c, PINK[i], 1e-9, `char ${k} on f${a}`));
      at(a + 4).forEach((c, i) => close(c, WHITE[i], 1e-9, `char ${k} on f${a + 4}`));
      const mid = at(a + 2);
      assert.ok(mid[1] > PINK[1] && mid[1] < WHITE[1], `char ${k} mid-fade g ${mid[1]}`);
      tested++;
    }
    assert.ok(tested > 30);
  });

  await check('caret rides the head: on every typing frame its left edge = the last visible glyph\'s right edge + gap (1e-6 px), never moving left', () => {
    const gap = 0; // the prompt box caret sits right on the head
    let prev = -Infinity, seen = 0;
    for (let f = 446; f <= 489; f++) { // after the slide-in landed (f445)
      const L = resolveAt(f);
      const g = glyphs(L, T11);
      const c = caretOf(L, T11);
      if (!c) { assert.ok(f >= s11.typing.endFrame + 15, `f${f}: the caret is solid while typing and the blink restarts ON at the last keystroke`); continue; }
      seen++;
      const last = g[g.length - 1];
      const n = typingVisibleCount({ frames: fr11 }, S11.length, f);
      // the head may sit after a space (space = 10 px in the stub)
      const trailingSpaces = n - 1 - last.i;
      const left = c.transform.positionX - c.shape.width / 2;
      close(left, last.l.transform.positionX + 5 + trailingSpaces * 10 + gap, 1e-6, `f${f}`);
      assert.ok(left >= prev - 1e-9); prev = left;
    }
    assert.ok(seen >= 20, `${seen} caret frames`);
  });

  await check('gradient caret: the caret stamp carries a linear top -> bottom fill #6175ce -> #e85aa0 (solid fallback kept)', () => {
    const c = caretOf(resolveAt(440), T11);
    assert.equal(c.shape.fill.kind, 1);
    const ly = c.shape.fill.layers[0];
    assert.equal(ly.gradientType, 0); close(ly.angle, Math.PI, 1e-12, 'angle = to bottom');
    assert.deepEqual(ly.stops.map((s) => s.color.map((v) => Math.round(v * 255))), [[0x61, 0x75, 0xce, 255], [0xe8, 0x5a, 0xa0, 255]]);
    assert.deepEqual(ly.stops.map((s) => s.position), [0, 1]);
  });

  await check('returned caretPath == the resolved caret on each keystroke frame; sendCenter == the resolved send button after the landing', () => {
    assert.ok(s11.caretPath.length >= 20);
    for (const p of s11.caretPath.filter((q) => q.frame >= 446)) {
      const c = caretOf(resolveAt(p.frame), T11);
      if (!c) continue;
      close(p.x, c.transform.positionX, 0.01, `f${p.frame} x`); close(p.y, c.transform.positionY, 0.01, `f${p.frame} y`);
    }
    const send = resolveAt(458).find((l) => l.id === s11.sendId);
    close(send.transform.positionX, s11.sendCenter[0], 1e-6, 'send x'); close(send.transform.positionY, s11.sendCenter[1], 1e-6, 'send y');
  });

  await check('slideFromRight: the box slides in and widens 62 % -> 100 % (easeOutCubic, f427-445); the typed text keeps its padding from the box left edge throughout', () => {
    const boxAt = (f) => resolveAt(f).find((l) => l.id === s11.boxId);
    close(boxAt(427).shape.width, 872 * 0.62, 1e-6, 'start width');
    close(boxAt(445).shape.width, 872, 1e-6, 'landed width');
    close(boxAt(427).transform.positionX, 960 + Math.round(872 * 0.55), 1e-6, 'starts right');
    close(boxAt(445).transform.positionX, 960, 1e-6, 'lands on x');
    assert.equal(boxAt(427).transform.opacity, 0);
    for (const f of [433, 436, 440, 445, 450]) {
      const b = boxAt(f);
      const left = b.transform.positionX - b.shape.width / 2;
      const g0 = glyphs(resolveAt(f), T11)[0];
      close(g0.l.transform.positionX - 5 - left, glyphs(resolveAt(450), T11)[0].l.transform.positionX - 5 - 524, 1e-6, `f${f} text padding`);
    }
  });

  await check('send press + flash: the button squashes to 85 % on f463 and is back on f466; the gradient overlay is in by f464; the fill wipes back from the left f471 -> f483', () => {
    const at = (f, id) => resolveAt(f).find((l) => l.id === id);
    close(at(462, s11.sendId).transform.scaleX, 1, 1e-9, 'f462');
    close(at(463, s11.sendId).transform.scaleX, 0.85, 1e-9, 'f463');
    close(at(466, s11.sendId).transform.scaleX, 1, 1e-9, 'f466');
    assert.equal(at(461, s11.flashId).transform.opacity, 0);
    assert.equal(at(464, s11.flashId).transform.opacity, 1);
    assert.equal(at(464, s11.flashId).shape.fill.kind, 1);
    assert.equal(at(470, s11.refillId).transform.opacity, 0);
    const w = (f) => at(f, s11.refillId).shape.width;
    assert.equal(w(471), 0); close(w(483), 872, 1e-6, 'wiped back');
    const r477 = at(477, s11.refillId);
    close(r477.transform.positionX - r477.shape.width / 2, 524, 1e-6, 'the wipe grows from the box left edge');
  });

  await check('placeholder shows until the first keystroke (f431 visible, f432 gone)', () => {
    const ph = (f) => resolveAt(f).find((l) => l.id === s11.placeholderId || l.id.startsWith(`${s11.placeholderId}#`));
    assert.ok(ph(431) && Math.abs(ph(431).transform.opacity - 4 / 6) < 1e-9, 'visible (at the group fade-in opacity)');
    assert.ok(!ph(432) || ph(432).transform.opacity === 0);
  });

  // ---------------------------------------------------------------- undo / redo
  await check('ONE undo removes the whole box: the composition is byte-identical to before; redo restores it byte-identically', () => {
    useHistoryStore.getState().undo();
    assert.equal(JSON.stringify(comp()), before);
    useHistoryStore.getState().redo();
    assert.equal(JSON.stringify(comp()), afterAdd);
  });

  // ---------------------------------------------------------------- save / load
  await check('save / load: typing schedule, arrival colour and caret gradient survive validateComposition; reloaded frames resolve identically', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(comp())));
    const t = back.layers.find((l) => l.id === T11);
    assert.deepEqual(t.typing, comp().layers.find((l) => l.id === T11).typing);
    assert.deepEqual(t.caret.gradient, comp().layers.find((l) => l.id === T11).caret.gradient);
    for (const f of [430, 437, 445, 452, 463, 477]) {
      assert.equal(JSON.stringify(resolveFrame(back, f).layers), JSON.stringify(resolveFrame(comp(), f).layers), `f${f}`);
    }
    const junk = JSON.parse(JSON.stringify(comp()));
    junk.layers.find((l) => l.id === T11).typing = { frames: 'nope' };
    junk.layers.find((l) => l.id === T11).caret.gradient = ['#fff'];
    const j = validateComposition(junk).layers.find((l) => l.id === T11);
    assert.equal('typing' in j, false); assert.equal('gradient' in j.caret, false);
  });

  // ---------------------------------------------------------------- S7 light card, centred box, password, autoGrow, explicit frames
  const s7 = await run('agent.addPromptBox', {
    x: 960, y: 300, width: 1000, radius: 28, theme: 'light', text: 'Build me a fitness tracking app', fontSize: 36, startFrame: 220, endFrame: 270,
    typing: { startFrame: 227, durationFrames: 19 }, caret: { gradient: [[0.38, 0.46, 0.81, 1], [0.91, 0.35, 0.63, 1]] }, buttons: { row: ['+', 'Attach', 'Themes'] }, entrance: 'pop',
  });
  await check(`S7 light card: chip row (${s7.rowIds.length / 2} chips), 31 chars f${s7.typing.startFrame}-${s7.typing.endFrame}, light fill + hairline, send on the row`, () => {
    assert.equal(s7.rowIds.length, 6);
    assert.deepEqual([s7.typing.startFrame, s7.typing.endFrame], [227, 245]);
    const box = comp().layers.find((l) => l.id === s7.boxId);
    assert.deepEqual(box.shape.fillColor, [1, 1, 1, 1]);
    assert.ok(box.shape.strokeWidth.defaultValue > 0);
    assert.ok(s7.sendCenter[1] > s7.box.y, 'send sits on the chip row (lower half)');
    const L = resolveAt(250);
    assert.equal(glyphs(L, s7.textId).length, 'Buildmeafitnesstrackingapp'.length);
    const scaleAt = (f) => resolveAt(f).find((l) => l.id === s7.boxId).transform.scaleX;
    assert.ok(scaleAt(220) < 0.9 && Math.abs(scaleAt(230) - 1) < 1e-9, 'pop entrance');
  });

  const cen = await run('agent.addPromptBox', {
    x: 960, y: 800, width: 1200, theme: 'light', text: "That's where everyone quits", fontSize: 80, align: 'center', startFrame: 110, endFrame: 170,
    typing: { startFrame: 119, durationFrames: 22, ease: 'cubicInOut' }, buttons: { send: false }, caret: { color: '#e85aa0' },
  });
  await check('align center (r10 S4): the typed line grows both ways (its centre stays put) and the caret rides its right end; eased rate', () => {
    const t = comp().layers.find((l) => l.id === cen.textId);
    assert.equal(t.reflowHidden, true);
    const centre = 960; // no send button: text centred in the box
    let widths = [];
    for (let f = 119; f <= 141; f++) {
      const L = resolveAt(f);
      const g = glyphs(L, cen.textId);
      const n = typingVisibleCount({ frames: cen.typing.frames }, t.content.spans[0].text.length, f);
      const left = g[0].l.transform.positionX - 5, lastG = g[g.length - 1];
      const trailing = n - 1 - lastG.i;
      const right = lastG.l.transform.positionX + 5 + trailing * 10;
      close((left + right) / 2, centre, 1e-6, `f${f} line centred`);
      const c = caretOf(L, cen.textId);
      close(c.transform.positionX - c.shape.width / 2, right, 1e-6, `f${f} caret at the right end`);
      widths.push(right - left);
    }
    assert.ok(widths[2] - widths[0] < widths[12] - widths[10], 'eased: slower growth at the start than mid-way');
  });

  const pw = await run('agent.addPromptBox', { x: 600, y: 200, width: 500, text: 'hunter2pass', mask: true, startFrame: 0, endFrame: 60, typing: { startFrame: 5, cps: 30 } });
  await check('mask: a password field types one "*" per character', () => {
    assert.equal(pw.content, '*'.repeat('hunter2pass'.length));
    assert.equal(comp().layers.find((l) => l.id === pw.textId).content.spans[0].text, pw.content);
  });

  const grow = await run('agent.addPromptBox', { x: 400, y: 950, width: 120, height: 60, fontSize: 20, text: 'grow with me please', autoGrow: true, startFrame: 0, endFrame: 80, typing: { startFrame: 10, frames: [10, 12, 13, 15, 20, 21, 22, 30, 31, 32, 33, 34, 40, 41, 42, 43, 44, 50, 51] } });
  await check('explicit per-char frames + autoGrow: glyphs appear exactly on the given frames; the box width follows the typed line, left edge fixed, send button on the right edge', () => {
    assert.deepEqual(grow.typing.frames.slice(0, 5), [10, 12, 13, 15, 20]);
    assert.equal(glyphs(resolveAt(12), grow.textId).length, 2);
    assert.equal(glyphs(resolveAt(14), grow.textId).length, 3);
    const box = (f) => resolveAt(f).find((l) => l.id === grow.boxId);
    const lefts = [], ws = [];
    for (const f of [9, 20, 35, 51, 60]) { const b = box(f); lefts.push(b.transform.positionX - b.shape.width / 2); ws.push(b.shape.width); }
    lefts.forEach((l) => close(l, 340, 1e-6, 'left edge fixed'));
    assert.deepEqual(ws, [120, 130, 200, 270, 270]);
    close(ws[4], grow.box.width, 1e-6, 'final width');
    const send = resolveAt(60).find((l) => l.id === grow.sendId);
    close(send.transform.positionX, grow.sendCenter[0], 1e-6, 'send rides the right edge');
  });

  await check('agent.setTextTyping on any text layer: eased schedule + arrival colour, one undo step; null removes it; errors are clear', async () => {
    const id = (await runAgentAction('editor.addShapeLayer', { opts: { type: 'rectangle', x: 10, y: 10, width: 4, height: 4 } })).activeLayerId;
    assert.ok(id);
    const t = createTextLayer('plain', 300, 300, 'hello world', 90, [1, 1, 1, 1]);
    useEditorStore.getState().applyLayerEdits('add', { add: [t] });
    const snap = JSON.stringify(comp());
    const r = await run('agent.setTextTyping', { layerId: t.id, typing: { startFrame: 5, durationFrames: 11, ease: 'quadOut', arrivalColor: [1, 0, 0, 1], arrivalFrames: 3 } });
    assert.equal(r.count, 11); assert.equal(r.startFrame, 5); assert.equal(r.endFrame, 15);
    assert.equal(glyphs(resolveAt(4), t.id).length, 0);
    assert.equal(glyphs(resolveAt(15), t.id).length, 10);
    useHistoryStore.getState().undo();
    assert.equal(JSON.stringify(comp()), snap);
    useHistoryStore.getState().redo();
    assert.equal((await run('agent.setTextTyping', { layerId: t.id, typing: null })).typing, null);
    const bad = await runAgentAction('agent.setTextTyping', { layerId: t.id, typing: { ease: 'nope', startFrame: 0 } });
    assert.equal(bad.ok, false); assert.match(bad.error, /unknown easing/);
    const bad2 = await runAgentAction('agent.addPromptBox', { text: 'x', theme: 'blue' });
    assert.equal(bad2.ok, false); assert.match(bad2.error, /theme/);
    const bad3 = await runAgentAction('agent.addPromptBox', { text: 'x', caret: { colour: '#fff' } });
    assert.equal(bad3.ok, false); assert.match(bad3.error, /unknown caret field/);
  });

  await check('agent.setTextCaret takes a gradient; a solid caret has no fill descriptor (old look)', async () => {
    const t = createTextLayer('c', 300, 600, 'abc', 90, [1, 1, 1, 1]);
    useEditorStore.getState().applyLayerEdits('add', { add: [t] });
    await run('agent.setTextCaret', { layerId: t.id, caret: { blinkRate: 0 } });
    assert.equal(caretOf(resolveAt(5), t.id).shape.fill, undefined);
    const c = await run('agent.setTextCaret', { layerId: t.id, caret: { gradient: [[0, 0, 1, 1], [1, 0, 0, 1]] } });
    assert.deepEqual(c.gradient, [[0, 0, 1, 1], [1, 0, 0, 1]]);
    assert.equal(caretOf(resolveAt(5), t.id).shape.fill.kind, 1);
    assert.equal(normalizeTextCaret({ gradient: [[0, 0, 1, 1]] }).gradient, undefined);
  });

  // ---------------------------------------------------------------- old projects resolve identically (vs the base commit)
  const oldProject = () => {
    const c = JSON.parse(JSON.stringify(comp()));
    c.layers = [];
    const mk = (name, y, text) => { const t = createTextLayer(name, 700, y, text, 120, [0.9, 0.9, 0.95, 1]); t.content.spans[0].style.fontSize = 40; t.animOverrides.fontSize.defaultValue = 40; return t; };
    const a = mk('type-on + caret', 100, 'Typing with a caret'); a.animators = buildTextAnimatorPreset(TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'type-on').build, 5, 30); a.caret = { enabled: true, style: 'bar', color: [1, 0, 1, 1], blinkRate: 1 };
    const b = mk('centred reflow type-on + caret', 200, 'Centred reflow line'); b.layoutConfig.horizontalAlign = 'center'; b.reflowHidden = true; b.animators = buildTextAnimatorPreset(TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'type-on').build, 0, 40); b.caret = { enabled: true, style: 'block', blinkRate: 2 };
    const d = mk('decode', 300, 'DECODE ME'); d.decode = createTextDecode(10, 20);
    const e = mk('plain', 400, 'Plain text');
    const g = mk('fill animator', 500, 'Colour wave'); g.animators = buildTextAnimatorPreset(TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'fade-in').build, 0, 30); g.animators[0].delta.fillColor = [1, 0.2, 0.2, 1];
    c.layers = [a, b, d, e, g];
    return c;
  };
  const old = oldProject();
  const resolveAll = (resolver, project) => JSON.stringify(Array.from({ length: 50 }, (_, f) => resolver(project, f * 2).layers));
  const nowJson = resolveAll(resolveFrame, old);
  let baseResolve = null;
  try {
    const baseDir = join(tmp, 'base');
    mkdirSync(baseDir, { recursive: true });
    execSync(`git archive ${BASE_COMMIT} src | tar -x -C "${baseDir.replace(/\\/g, '/')}"`, { stdio: ['ignore', 'ignore', 'pipe'], shell: true });
    const baseOut = join(tmp, 'base-bundle.mjs');
    await build(bundleOpts(resolve(baseDir), baseOut, `export { resolveFrame } from './src/core/interpolation';`));
    baseResolve = (await import(pathToFileURL(baseOut).href)).resolveFrame;
  } catch (err) {
    console.log(`  (base commit ${BASE_COMMIT} not available: ${String(err.message ?? err).split('\n')[0]}; comparing against the typing-disabled twin only)`);
  }
  if (baseResolve) {
    await check(`old projects (type-on + caret, centred reflow + caret, decode, plain, fill animator): 50 frames resolve byte-identically to the base commit ${BASE_COMMIT}`, () => {
      assert.equal(nowJson, resolveAll(baseResolve, old));
    });
  }
  await check('a disabled typing schedule (enabled: false) resolves exactly like none', () => {
    const tw = JSON.parse(JSON.stringify(old));
    tw.layers.forEach((l) => { l.typing = { enabled: false, frames: [999, 999, 999] }; });
    assert.equal(resolveAll(resolveFrame, tw), nowJson);
  });

  // keyframe sanity: the widen keys of the S11 box are 2 keys with the measured easeOutCubic
  await check('editable result: plain layers in one group with real keys (box width 2 keys, send scale 3 keys), all parts tagged prompt.*', () => {
    const L = comp().layers;
    const box = L.find((l) => l.id === s11.boxId);
    assert.equal(box.shape.width.keyframes.length, 2);
    assert.equal(evaluateNumber(box.shape.width, 436) > 872 * 0.62, true);
    assert.equal(L.find((l) => l.id === s11.sendId).transform.scale.keyframes.length, 3);
    const parts = L.filter((l) => l.rigRole && l.rigRole.startsWith('prompt.') && (l.parentId === s11.groupId || l.id === s11.groupId || L.find((p) => p.id === l.parentId)?.parentId === s11.groupId));
    assert.ok(parts.length >= 8, `${parts.length} parts`);
    assert.deepEqual(evaluateVec2(L.find((l) => l.id === s11.groupId).transform.position, 445), [960, 540]);
  });

  console.log(`\nprompt-box: all ${passed} checks passed`);
} catch (e) {
  console.error('\n✗ prompt-box FAILED:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
