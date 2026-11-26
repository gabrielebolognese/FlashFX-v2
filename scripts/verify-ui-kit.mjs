// Acceptance harness for the B35 / B51 UI-mock kit:
//   B35  typing caret on type-on text (core/textCaret.ts, resolved as one rectangle stamp by resolveFrame)
//   B35  UI-mock templates (animation-templates/categories/uiKit.ts: search bar, toggle, chat bubbles,
//        notification banner)
//   B51  agent cursor rig (animation-templates/cursorRig.ts: addCursor / move / click / icon swap)
// Proves, through the REAL resolveFrame (text measurement stubbed: every glyph is 12 px wide, like
// verify-text-glyph-motion): the caret sits exactly at the type-on head glyph advance on every frame,
// blinks frame-purely (scrub order does not matter), stays solid while typing, honours its window /
// style / colour; persistence keeps it; the cursor reaches its target exactly at the given frame along
// an arc with a ballistic ease, squashes exactly on the click frame, swaps icons on the frame, and keeps
// earlier moves intact; the UI-kit templates instantiate (unique ids, rebased caret window) and resolve
// on every frame without throwing.
//   node scripts/verify-ui-kit.mjs   (or: npm run verify:ui-kit)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'ui-kit-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 150, backgroundColor: [0, 0, 0, 1] };
const GLYPH_W = 12;
const FONT_PX = 48; // createTextLayer default

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame, evaluateVec2, evaluateNumber } from './src/core/interpolation';
        export { createComposition, createTextLayer } from './src/core/factory';
        export { typeOnByCharacter } from './src/core/textAnimatorPresets';
        export { normalizeTextCaret, caretHeadIndex, caretBlinkOn } from './src/core/textCaret';
        export { validateComposition } from './src/project-system/services/validation';
        export * from './src/animation-templates/cursorRig';
        export { ANIMATION_TEMPLATES, getTemplate } from './src/animation-templates/catalog';
        export { instantiateTemplate } from './src/animation-templates/instantiate';
        export { cubicBezier } from './src/core/easings';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'entry.ts',
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  globalThis.OffscreenCanvas = class {
    getContext() { return { font: '', measureText: (s) => ({ width: String(s).length * GLYPH_W }) }; }
  };
  const m = await import(pathToFileURL(outfile).href);
  const {
    resolveFrame, evaluateVec2, evaluateNumber, createComposition, createTextLayer, typeOnByCharacter,
    normalizeTextCaret, validateComposition, ANIMATION_TEMPLATES, getTemplate, instantiateTemplate, cubicBezier,
    buildAgentCursor, findCursorRig, planCursorMove, planCursorClick, buildClickRipple, planCursorIcon, cursorIconAt,
    spliceKeys, ballisticMoveFrames, BALLISTIC_EASE, AGENT_CURSOR_ICONS,
  } = m;

  // ------------------------------------------------------------------ B35 caret
  console.log('B35 typing caret');
  const TEXT = 'HELLO WORLD';
  const typingComp = (caret, { text = TEXT, x = 960, y = 540, start = 10, dur = 20 } = {}) => {
    const comp = createComposition('Caret', SETTINGS);
    const layer = createTextLayer('Typed', x, y, text, SETTINGS.durationFrames);
    layer.animators = [typeOnByCharacter(start, dur)];
    if (caret) layer.caret = caret;
    comp.layers = [layer];
    return { comp, layer };
  };
  const caretOf = (rf, layer) => rf.layers.find((l) => l.id === `${layer.id}#caret`);
  const glyphsOf = (rf, layer) => rf.layers.filter((l) => l.id.startsWith(`${layer.id}#g`));

  const BAR = { enabled: true, style: 'bar', blinkRate: 1 };
  const { comp: c1, layer: t1 } = typingComp(BAR);
  const canvasW = Math.ceil(TEXT.length * GLYPH_W) + 4; // POINT_PADDING 2 each side
  const lineStart = (canvasW - TEXT.length * GLYPH_W) / 2;
  const barW = Math.max(2, FONT_PX * 0.06), gap = FONT_PX * 0.05;

  check('caret x = the type-on head glyph advance on EVERY frame (and hugs the last visible glyph stamp)', () => {
    let typingFrames = 0;
    for (let f = 0; f < 60; f++) {
      const rf = resolveFrame(c1, f);
      const glyphs = glyphsOf(rf, t1);
      const visible = glyphs.map((g) => Number(g.id.split('#g')[1]));
      // Index just past the last glyph that is revealed (spaces have no stamp: use the animator's head).
      const lastStamp = visible.length ? Math.max(...visible) : -1;
      const caret = caretOf(rf, t1);
      if (!caret) continue; // blinking off this frame
      const head = Math.round((caret.transform.positionX - 960 - gap - barW / 2 + canvasW / 2 - lineStart) / GLYPH_W);
      const expectX = 960 + lineStart + head * GLYPH_W - canvasW / 2 + gap + barW / 2;
      assert.ok(near(caret.transform.positionX, expectX), `f${f}: caret x ${caret.transform.positionX} vs ${expectX}`);
      // The head is never before the last visible glyph and at most one (a space) past it.
      assert.ok(head === lastStamp + 1 || (head === lastStamp + 2 && TEXT[lastStamp + 1] === ' '), `f${f}: head ${head} vs last stamp ${lastStamp}`);
      if (lastStamp >= 0) {
        const g = glyphs.find((s) => s.id.endsWith(`#g${lastStamp}`));
        const rightEdge = g.transform.positionX + GLYPH_W / 2;
        const spaces = head - lastStamp - 1;
        assert.ok(near(caret.transform.positionX - barW / 2 - gap, rightEdge + spaces * GLYPH_W), `f${f}: caret hugs glyph ${lastStamp}`);
      }
      if (head > 0 && head < TEXT.length) typingFrames++;
    }
    assert.ok(typingFrames >= 15, `the caret travelled through the text (${typingFrames} typing frames)`);
  });

  check('caret geometry: bar is 6% x 100% of the font size, centred on the em box, text colour by default', () => {
    const caret = caretOf(resolveFrame(c1, 20), t1);
    assert.equal(caret.layerType, 'shape');
    assert.equal(caret.shape.renderType, 'rectangle');
    assert.ok(near(caret.shape.width, barW) && near(caret.shape.height, FONT_PX));
    assert.deepEqual(caret.shape.fillColor, t1.content.spans[0].style.color);
    const canvasH = Math.ceil(FONT_PX * 1.2 + FONT_PX * 0.25) + 4;
    assert.ok(near(caret.transform.positionY, 540 + 2 + FONT_PX / 2 - canvasH / 2), `y ${caret.transform.positionY}`);
  });

  check('blink is frame-pure: shuffled scrub order resolves byte-identically; solid while typing; 1 Hz after', () => {
    const frames = Array.from({ length: 90 }, (_, i) => i);
    const forward = frames.map((f) => JSON.stringify(caretOf(resolveFrame(c1, f), t1) ?? null));
    const shuffled = [...frames].sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
    for (const f of shuffled) assert.equal(JSON.stringify(caretOf(resolveFrame(c1, f), t1) ?? null), forward[f], `f${f}`);
    const on = (f) => forward[f] !== 'null';
    for (let f = 11; f < 30; f++) assert.ok(on(f), `solid while typing at f${f}`);
    // After the text is complete (f30+): 15 on / 15 off from the clip start (inPoint 0, 30 fps, 1 Hz).
    for (let f = 31; f < 90; f++) assert.equal(on(f), (f % 30) < 15, `blink phase at f${f}`);
  });

  check('blinkRate 0 = always on; solidWhileTyping false blinks through the typing too', () => {
    const { comp, layer } = typingComp({ ...BAR, blinkRate: 0 });
    for (let f = 0; f < 60; f++) assert.ok(caretOf(resolveFrame(comp, f), layer), `f${f}`);
    const { comp: c2, layer: l2 } = typingComp({ ...BAR, solidWhileTyping: false });
    assert.equal(caretOf(resolveFrame(c2, 20), l2), undefined, 'f20 is in the off half of the cycle');
  });

  check('block / underline styles, custom colour, radius, gap and the startFrame / endFrame window', () => {
    const lime = [0.6, 0.85, 0.16, 1];
    const { comp, layer } = typingComp({ enabled: true, style: 'block', color: lime, blinkRate: 0, radius: 4, gap: 3, startFrame: 12, endFrame: 40 });
    assert.equal(caretOf(resolveFrame(comp, 11), layer), undefined, 'before the window');
    assert.equal(caretOf(resolveFrame(comp, 40), layer), undefined, 'after the window');
    const b = caretOf(resolveFrame(comp, 20), layer);
    assert.deepEqual(b.shape.fillColor, lime);
    assert.ok(near(b.shape.width, FONT_PX * 0.55) && b.shape.borderRadius === 4);
    const head = caretHeadIndexAt(layer, 20);
    assert.ok(near(b.transform.positionX, 960 + lineStart + head * GLYPH_W - canvasW / 2 + 3 + b.shape.width / 2));
    const { comp: cu, layer: lu } = typingComp({ enabled: true, style: 'underline', blinkRate: 0 });
    const u = caretOf(resolveFrame(cu, 20), lu);
    assert.ok(u.shape.height < 5 && u.transform.positionY > b.transform.positionY, 'underline sits low and thin');
  });
  function caretHeadIndexAt(layer, f) {
    const a = layer.animators[0];
    return m.caretHeadIndex(layer.content.spans[0].text, [{ splitMode: a.splitMode, selector: { ...a.selector, offset: evaluateNumber(a.offset, f) }, delta: a.delta }]);
  }

  check('caret follows the layer transform (moved / scaled text) and a static text puts it at the end', () => {
    const { comp, layer } = typingComp({ ...BAR, blinkRate: 0 });
    layer.transform.scale.defaultValue = [2, 2];
    const c = caretOf(resolveFrame(comp, 50), layer);
    assert.ok(near(c.transform.positionX, 960 + 2 * (lineStart + TEXT.length * GLYPH_W - canvasW / 2 + gap + barW / 2)));
    assert.equal(c.transform.scaleX, 2);
    layer.animators = [];
    const s = caretOf(resolveFrame(comp, 0), layer);
    assert.ok(s, 'no animators: caret at the end of the text');
    assert.ok(near(s.transform.positionX, c.transform.positionX));
  });

  check('no caret: disabled / absent / multi-line produce no stamp; absent leaves the frame untouched', () => {
    const { comp: off, layer: lo } = typingComp({ ...BAR, enabled: false });
    assert.equal(caretOf(resolveFrame(off, 20), lo), undefined);
    const { comp: none } = typingComp(null);
    const { comp: dis } = typingComp({ ...BAR, enabled: false });
    dis.layers[0].id = none.layers[0].id;
    const strip = (rf) => JSON.stringify(rf.layers);
    assert.equal(strip(resolveFrame(dis, 20)), strip(resolveFrame(none, 20)), 'a disabled caret resolves exactly like none');
    const { comp: ml, layer: lm } = typingComp({ ...BAR, blinkRate: 0 }, { text: 'TWO\nLINES' });
    assert.equal(caretOf(resolveFrame(ml, 50), lm), undefined);
  });

  check('persistence: normalizeTextCaret sanitizes; the validation round-trip keeps the caret', () => {
    assert.equal(normalizeTextCaret(null), undefined);
    assert.equal(normalizeTextCaret([1]), undefined);
    assert.deepEqual(normalizeTextCaret({ style: 'nope', width: -3, color: [1, 0, 0], blinkRate: 'x', junk: 1 }), { enabled: true, style: 'bar' });
    const full = { enabled: true, style: 'block', color: [1, 0, 0, 1], width: 20, height: 30, gap: 2, offsetY: 1, radius: 3, blinkRate: 2, solidWhileTyping: false, startFrame: 4, endFrame: 90 };
    assert.deepEqual(normalizeTextCaret(full), full);
    const { comp } = typingComp(full);
    const v = validateComposition(JSON.parse(JSON.stringify(comp)));
    assert.deepEqual(v.layers[0].caret, full);
    const { comp: none } = typingComp(null);
    assert.equal('caret' in validateComposition(JSON.parse(JSON.stringify(none))).layers[0], false);
  });

  // ------------------------------------------------------------------ B51 cursor rig
  console.log('B51 cursor rig');
  const cursorComp = (layers) => { const comp = createComposition('Cursor', SETTINGS); comp.layers = layers; return comp; };
  const replace = (layers, ...next) => layers.map((l) => next.find((n) => n.id === l.id) ?? l);
  const worldOf = (comp, id, f) => resolveFrame(comp, f).layers.find((l) => l.id === id)?.transform;

  let layers = buildAgentCursor({ icon: 'arrow', x: 200, y: 300, frame: 5, endFrame: 150 });
  const cursorId = layers[0].id;

  check('addCursor: a group (hotspot) + arrow / hand / ibeam icons, only the chosen one visible, on screen from its frame', () => {
    assert.equal(layers[0].type, 'group');
    assert.deepEqual(layers.slice(1).map((l) => l.name).sort(), [...AGENT_CURSOR_ICONS].sort());
    for (const l of layers.slice(1)) assert.equal(l.parentId, cursorId);
    const rig = findCursorRig(layers, cursorId);
    assert.equal(rig.icons.arrow.transform.opacity.defaultValue, 1);
    assert.equal(rig.icons.hand.transform.opacity.defaultValue, 0);
    assert.equal(findCursorRig(layers, rig.icons.hand.id).group.id, cursorId, 'an icon id resolves to its rig');
    assert.deepEqual(layers[0].transform.scale.defaultValue, [1.8, 1.8], 'default 36 px icon');
    for (const l of layers) assert.equal(l.inPoint, 5);
    const comp = cursorComp(layers);
    assert.equal(worldOf(comp, rig.icons.arrow.id, 4), undefined, 'not on screen before its frame');
    assert.deepEqual([worldOf(comp, rig.icons.arrow.id, 5).positionX, worldOf(comp, rig.icons.arrow.id, 5).positionY], [200, 300]);
    assert.throws(() => buildAgentCursor({ icon: 'razor', x: 0, y: 0, frame: 0, endFrame: 10 }), /icon/);
    assert.throws(() => findCursorRig([createTextLayer('t', 0, 0, 'x', 10)], 'nope'), /no layer/);
  });

  const move1 = planCursorMove(findCursorRig(layers, cursorId).group, { frame: 10, to: [800, 500], fps: 30, durationFrames: 12 });
  layers = replace(layers, move1.group);

  check('cursorMoveTo: reaches the target EXACTLY at frame + duration (world position of the drawn icon) and stays', () => {
    const comp = cursorComp(layers);
    const arrowId = findCursorRig(layers, cursorId).icons.arrow.id;
    assert.deepEqual(move1.from, [200, 300]);
    assert.equal(move1.endFrame, 22);
    for (const f of [22, 23, 40]) {
      const t = worldOf(comp, arrowId, f);
      assert.ok(near(t.positionX, 800, 1e-9) && near(t.positionY, 500, 1e-9), `f${f}: ${t.positionX}, ${t.positionY}`);
    }
    const t10 = worldOf(comp, arrowId, 10);
    assert.ok(near(t10.positionX, 200) && near(t10.positionY, 300), 'starts where it was');
    const kfs = move1.group.transform.position.keyframes;
    assert.equal(kfs.length, 2, 'two editable keys per move');
    assert.deepEqual(kfs[0].handleOut, [BALLISTIC_EASE[0], BALLISTIC_EASE[1]]);
  });

  check('the move is ballistic (fast start, long settle) and arced (off the straight line mid-way)', () => {
    const pos = move1.group.transform.position;
    const p = (f) => evaluateVec2(pos, f);
    const dist = Math.hypot(600, 200);
    const along = (f) => { const [x, y] = p(f); return ((x - 200) * 600 + (y - 300) * 200) / (dist * dist); };
    const off = (f) => { const [x, y] = p(f); return Math.abs((x - 200) * 200 - (y - 300) * 600) / dist; };
    // ~38% of the time -> well over half of the distance (ballistic 1 - (1 - t)^2.6 gives ~70%).
    assert.ok(along(10 + 0.38 * 12 | 0) > 0.55, `progress at 38% time: ${along(14)}`);
    const bow = Math.max(...Array.from({ length: 11 }, (_, i) => off(11 + i)));
    assert.ok(bow > dist * 0.03 && bow < dist * 0.05, `arc bows away from the chord (${bow.toFixed(1)} px; a quadratic with 8% offset peaks at 4%)`);
    // Ballistic fit vs the template rig's curve.
    for (let i = 1; i < 20; i++) { const t = i / 20; assert.ok(Math.abs(cubicBezier(t, ...BALLISTIC_EASE) - (1 - Math.pow(1 - t, 2.6))) < 0.005, `fit at t ${t}`); }
    assert.equal(ballisticMoveFrames(0, 30), 7);
    assert.equal(ballisticMoveFrames(5000, 30), 14);
    const straight = planCursorMove(findCursorRig(layers, cursorId).group, { frame: 30, to: [100, 100], fps: 30, arc: 0 });
    assert.equal(straight.group.transform.position.keyframes.find((k) => k.frame === 30).spatialOut, undefined);
    assert.throws(() => planCursorMove(move1.group, { frame: 0, to: [0, 0], fps: 30, ease: 'wobble' }), /ease/);
  });

  const move2 = planCursorMove(findCursorRig(layers, cursorId).group, { frame: 40, to: [400, 700], fps: 30 });
  check('a second move starts from the first target, keeps the first move frame-for-frame, default duration from distance', () => {
    assert.deepEqual(move2.from, [800, 500]);
    assert.equal(move2.endFrame - move2.startFrame, ballisticMoveFrames(Math.hypot(400, 200), 30));
    for (let f = 0; f <= 40; f++) assert.deepEqual(evaluateVec2(move2.group.transform.position, f), evaluateVec2(move1.group.transform.position, f), `f${f}`);
    assert.deepEqual(evaluateVec2(move2.group.transform.position, move2.endFrame), [400, 700]);
  });
  layers = replace(layers, move2.group);

  check('spliceKeys keeps the outside halves of boundary keys and drops keys inside the run', () => {
    const k = (frame, value, extra = {}) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0], ...extra });
    const existing = [k(0, 0, { interpolation: 'bezier', handleOut: [0.1, 0.2] }), k(10, 5, { handleIn: [0.7, 0.8], interpolation: 'hold' }), k(15, 7), k(20, 9, { interpolation: 'bezier', handleOut: [0.3, 0.3] })];
    const out = spliceKeys(existing, [k(10, 5, { interpolation: 'bezier', handleOut: [0.5, 0.5] }), k(20, 1, { handleIn: [0.9, 0.9] })]);
    assert.deepEqual(out.map((x) => x.frame), [0, 10, 20]);
    assert.deepEqual(out[1].handleIn, [0.7, 0.8], 'incoming side of the first key kept');
    assert.equal(out[1].interpolation, 'bezier');
    assert.deepEqual(out[2].handleIn, [0.9, 0.9]);
    assert.equal(out[2].interpolation, 'bezier', 'outgoing side of the last key kept');
    assert.deepEqual(out[2].handleOut, [0.3, 0.3]);
    assert.equal(out[2].value, 1);
  });

  check('cursorClick: scale squash lands exactly ON the click frame, back to rest after; ripple ring at the hotspot', () => {
    const g = planCursorClick(findCursorRig(layers, cursorId).group, { frame: 25 });
    const s = (f) => evaluateVec2(g.transform.scale, f);
    assert.deepEqual(s(23), [1.8, 1.8]);
    assert.ok(near(s(25)[0], 1.8 * 0.82, 1e-9) && near(s(25)[1], 1.8 * 0.82, 1e-9), `click frame ${s(25)}`);
    assert.ok(s(24)[0] < 1.8 && s(24)[0] > 1.8 * 0.82, 'pressing');
    assert.deepEqual(s(29), [1.8, 1.8]);
    assert.deepEqual(s(60), [1.8, 1.8]);
    for (let f = 0; f <= 22; f++) assert.deepEqual(evaluateVec2(g.transform.position, f), evaluateVec2(move2.group.transform.position, f), 'the click does not touch the path');
    const ring = buildClickRipple(g, 25);
    assert.deepEqual(ring.transform.position.defaultValue, [800, 500], 'at the hotspot on the click frame');
    assert.equal(ring.inPoint, 25);
    assert.equal(evaluateNumber(ring.transform.opacity, 24), 0);
    assert.equal(evaluateNumber(ring.transform.opacity, 25), 1);
    assert.equal(evaluateNumber(ring.transform.opacity, 37), 0);
    assert.deepEqual(evaluateVec2(ring.transform.scale, 25), [0.25, 0.25]);
    assert.deepEqual(evaluateVec2(ring.transform.scale, 37), [1, 1]);
    assert.equal(ring.parentId, g.parentId);
    assert.throws(() => planCursorClick(g, { frame: 25, squash: 0 }), /squash/);
    // Resolved: the drawn arrow is squashed on the click frame too.
    const comp = cursorComp(replace(layers, g));
    assert.ok(near(worldOf(comp, findCursorRig(layers, cursorId).icons.arrow.id, 25).scaleX, 1.8 * 0.82, 1e-9));
  });

  check('cursorIcon: hold swap exactly on the frame, the others hide; a later swap back keeps the first', () => {
    const rig = findCursorRig(layers, cursorId);
    const swapped = planCursorIcon(rig, 30, 'hand');
    const after = replace(layers, ...swapped);
    const r2 = findCursorRig(after, cursorId);
    assert.equal(cursorIconAt(r2, 29), 'arrow');
    assert.equal(cursorIconAt(r2, 30), 'hand');
    assert.equal(evaluateNumber(r2.icons.arrow.transform.opacity, 30), 0);
    assert.equal(evaluateNumber(r2.icons.ibeam.transform.opacity, 30), 0);
    const back = replace(after, ...planCursorIcon(r2, 50, 'ibeam'));
    const r3 = findCursorRig(back, cursorId);
    assert.deepEqual([29, 30, 49, 50, 80].map((f) => cursorIconAt(r3, f)), ['arrow', 'hand', 'hand', 'ibeam', 'ibeam']);
    // Frame purity of the whole rig: resolving out of order is byte-identical.
    const comp = cursorComp(back);
    const fr = [0, 12, 25, 30, 50, 70];
    const fwd = fr.map((f) => JSON.stringify(resolveFrame(comp, f).layers));
    for (const i of [5, 2, 0, 4, 1, 3]) assert.equal(JSON.stringify(resolveFrame(comp, fr[i]).layers), fwd[i]);
  });

  // ------------------------------------------------------------------ B35 UI-mock templates
  console.log('B35 UI-mock templates');
  const KIT = ['search-bar-typing', 'toggle-switch', 'chat-bubbles', 'notification-banner'];

  check('the four UI-kit templates are in the catalog', () => {
    for (const id of KIT) assert.ok(getTemplate(id), id);
    assert.ok(ANIMATION_TEMPLATES.length >= KIT.length);
  });

  for (const id of KIT) {
    check(`${id}: instantiates at a playhead with unique ids and resolves on every frame without throwing`, () => {
      const tpl = getTemplate(id);
      const inst = instantiateTemplate(tpl, { playhead: 40, frameRate: 30, center: [960, 540] });
      const ids = inst.map((l) => l.id);
      assert.equal(new Set(ids).size, ids.length);
      const again = instantiateTemplate(tpl, { playhead: 40, frameRate: 30, center: [960, 540] });
      assert.equal(again.filter((l) => ids.includes(l.id)).length, 0, 'a second insert gets fresh ids');
      const comp = createComposition(id, { ...SETTINGS, durationFrames: 40 + tpl.durationFrames + 5 });
      comp.layers = inst;
      let drawn = 0;
      for (let f = 0; f < comp.settings.durationFrames; f++) drawn = Math.max(drawn, resolveFrame(comp, f).layers.length);
      assert.ok(drawn >= 4, `draws layers (${drawn})`);
    });
  }

  check('search-bar-typing: the caret window is rebased with the playhead and rides the query type-on', () => {
    const inst = instantiateTemplate(getTemplate('search-bar-typing'), { playhead: 40, frameRate: 30, center: [960, 540] });
    const q = inst.find((l) => l.name === 'Query');
    assert.equal(q.caret.startFrame, 54);
    const comp = createComposition('s', { ...SETTINGS, durationFrames: 170 });
    comp.layers = inst;
    const caret = (f) => resolveFrame(comp, f).layers.find((l) => l.id === `${q.id}#caret`);
    assert.equal(caret(53), undefined, 'not before its window');
    assert.ok(caret(54), 'blinking on in the empty field');
    const empty = caret(54).transform.positionX;
    const mid = caret(92).transform.positionX;
    const done = caret(116).transform.positionX; // typing ends at 114; 1.2 Hz from 54: f116 is in an on half
    assert.ok(empty < mid && mid < done, `moves right while typing: ${empty} ${mid} ${done}`);
    const glyphs = resolveFrame(comp, 60).layers.filter((l) => l.id.startsWith(`${q.id}#g`));
    assert.equal(glyphs.length, 0, 'no glyph before the first keystroke');
  });

  check('toggle-switch: the cursor clicks the knob, the knob slides and the track turns green after the click', () => {
    const inst = instantiateTemplate(getTemplate('toggle-switch'), { playhead: 0, frameRate: 30, center: [960, 540] });
    const knob = inst.find((l) => l.name === 'Toggle knob');
    const track = inst.find((l) => l.name === 'Toggle track');
    const comp = createComposition('t', SETTINGS);
    comp.layers = inst;
    const at = (id, f) => resolveFrame(comp, f).layers.find((l) => l.id === id);
    assert.ok(at(knob.id, 29).transform.positionX < at(knob.id, 45).transform.positionX - 40, 'knob slid right');
    const off = at(track.id, 20).shape.fillColor, on = at(track.id, 45).shape.fillColor;
    assert.ok(off[1] < 0.8 && on[1] > 0.75 && on[0] < 0.3, `track grey -> green: ${off} -> ${on}`);
    const cursor = inst.find((l) => l.type === 'group' && l.name === 'Cursor');
    const rig = findCursorRig(inst, cursor.id);
    const arrow = at(rig.icons.arrow.id, 28);
    const k = at(knob.id, 28);
    assert.ok(Math.hypot(arrow.transform.positionX - k.transform.positionX, arrow.transform.positionY - k.transform.positionY) < 30, 'the cursor is on the knob at the click');
    assert.ok(arrow.transform.scaleX < at(rig.icons.arrow.id, 24).transform.scaleX, 'squashed on the click frame');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
