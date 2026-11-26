// Acceptance harness for per-glyph text motion: animator TRACKING placement and per-glyph MOTION
// BLUR, proven through the real resolveFrame (src/core/interpolation.ts) rather than the pure core
// alone. Text measurement is canvas-only, so a deterministic OffscreenCanvas stub (every glyph is
// 12 px wide) stands in for it; the renderer is untouched (it already draws any resolved layer's
// `motionBlur`). What this pins:
//   - a static text layer whose letters slide in via an animator gets a motion-blur descriptor PER
//     GLYPH, equal to that glyph's own frame-to-frame motion (the old path gave every glyph the layer's
//     blur, which is nothing when the layer itself is still - so Bricks-style reveals never streaked);
//   - settled glyphs, motion blur off, a closed shutter and the first frame of the clip get none;
//   - layer motion still reaches the glyphs (glyph blur = layer motion + animator motion);
//   - animator tracking re-aligns the line and a full negative tracking collapses it to one point;
//   - frame purity: resolving out of order is byte-identical.
// B45 / B36 layout (same stub):
//   - every reveal preset hides every unit (the first included) up to its start frame and shows all of
//     it from its end frame; the non-reveal presets (colour wave, delete) behave as documented;
//   - fixed / fixedWidth boxes, wrapped text and hard multi-line text: each stamp lands exactly where
//     the whole-layer raster draws that glyph (left / centre / right), line by line;
//   - reflowHidden re-centres a centred type-on on its visible glyphs (off: the full-line layout);
//   - keyframed selector start / end resolve like the same static selector; skew, fill colour and a
//     seeded scatter reach the stamps and leave nothing behind once settled.
// Run: node scripts/verify-text-glyph-motion.mjs   (npm run verify:text-glyph-motion)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'text-glyph-motion-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 120, backgroundColor: [0, 0, 0, 1] };
const GLYPH_W = 12;
const FONT_PX = 48; // createTextLayer's default font size: animator tracking is in em (x FONT_PX = px)
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createTextLayer, createProperty, createKeyframe } from './src/core/factory';
        export { defaultRangeSelector } from './src/text/rangeSelector';
        export { TEXT_ANIMATOR_PRESETS, NON_REVEAL_TEXT_ANIMATOR_PRESETS, buildTextAnimatorPreset, withSelectorProperty } from './src/core/textAnimatorPresets';
        export { mapLinesToContent } from './src/core/textGlyphLayout';
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
  // Deterministic measurement: every character is GLYPH_W px wide.
  globalThis.OffscreenCanvas = class {
    getContext() { return { font: '', measureText: (s) => ({ width: String(s).length * GLYPH_W }) }; }
  };

  const m = await import(pathToFileURL(outfile).href);
  const { resolveFrame, createComposition, createTextLayer, createProperty, createKeyframe, defaultRangeSelector, TEXT_ANIMATOR_PRESETS, NON_REVEAL_TEXT_ANIMATOR_PRESETS, buildTextAnimatorPreset, withSelectorProperty, mapLinesToContent } = m;

  const offsetKf = (f0, v0, f1, v1) => {
    const p = createProperty('Animator Offset', 'number', 0);
    p.keyframes = [createKeyframe(f0, v0, 'linear'), createKeyframe(f1, v1, 'linear')];
    return p;
  };
  // "Style 1": letters rise 80 px + fade, revealed left to right over frames 0..30.
  const riseAnimator = () => ({
    enabled: true,
    splitMode: 'characterNoSpaces',
    selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.3 },
    offset: offsetKf(0, -0.3, 30, 1),
    delta: { position: [0, 80], opacity: -1 },
  });
  const build1 = ({ motionBlur = true, animators = [riseAnimator()], text = 'HELLO', shutterAngle } = {}) => {
    const comp = createComposition('Glyph Motion', { ...SETTINGS, ...(shutterAngle != null ? { shutterAngle } : {}) });
    const layer = createTextLayer('Title', 960, 540, text, SETTINGS.durationFrames);
    layer.animators = animators;
    layer.motionBlur = motionBlur;
    comp.layers = [layer];
    return { comp, layer };
  };
  const stampsOf = (rf, layer) => rf.layers.filter((l) => l.id.startsWith(`${layer.id}#g`));
  const glyphIndex = (s) => Number(s.id.split('#g')[1]);
  const pivotX = (s) => s.transform.positionX + s.transform.anchorX;
  const pivotY = (s) => s.transform.positionY + s.transform.anchorY;

  console.log('per-glyph text motion (tracking + motion blur) - acceptance\n');

  check('a static layer with an animator expands to per-glyph stamps (the path under test)', () => {
    const { comp, layer } = build1();
    const st = stampsOf(resolveFrame(comp, 15), layer);
    assert.ok(st.length > 0 && st.length <= 5, `expected 1..5 glyph stamps, got ${st.length}`);
  });

  check('placement: stamps sit ON the layer (text quads are centred on their position): glyph row centred on the layer position', () => {
    const noop = { enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), amount: 0 }, delta: { position: [0, 0] } };
    for (const align of ['center', 'left', 'right']) {
      const { comp, layer } = build1({ motionBlur: false, animators: [noop], text: 'HELLO' });
      layer.layoutConfig.horizontalAlign = align;
      const st = stampsOf(resolveFrame(comp, 5), layer).sort((a, b) => glyphIndex(a) - glyphIndex(b));
      assert.equal(st.length, 5);
      const xs = st.map(pivotX);
      // 5 glyphs of 12 px: centres at -24, -12, 0, 12, 24 around the layer position (960, 540).
      [-24, -12, 0, 12, 24].forEach((e, j) => assert.ok(approx(xs[j], 960 + e), `${align}: glyph ${j} at ${xs[j]}, expected ${960 + e}`));
      for (const s of st) assert.ok(approx(pivotY(s), 540), `${align}: glyph row on the layer centre line (y ${pivotY(s)})`);
      for (const s of st) assert.ok(s.transform.anchorX === 0 && s.transform.anchorY === 0, 'glyphs rotate / scale about their own centre');
    }
  });

  check('motion blur OFF: no glyph carries a blur descriptor (unchanged behaviour)', () => {
    const { comp, layer } = build1({ motionBlur: false });
    for (const s of stampsOf(resolveFrame(comp, 15), layer)) assert.equal(s.motionBlur, undefined);
  });

  check('motion blur ON: a mid-reveal glyph streaks with ITS OWN velocity (layer is still)', () => {
    const { comp, layer } = build1();
    const now = stampsOf(resolveFrame(comp, 15), layer);
    const prev = stampsOf(resolveFrame(comp, 14), layer);
    const moving = now.filter((s) => s.motionBlur);
    assert.ok(moving.length > 0, 'at least one glyph is mid-animation at frame 15');
    for (const s of moving) {
      const p = prev.find((q) => q.id === s.id);
      assert.ok(p, `glyph ${s.id} was visible on the previous frame too`);
      assert.ok(approx(s.motionBlur.vy, pivotY(s) - pivotY(p)), `vy ${s.motionBlur.vy} = pivot dy ${pivotY(s) - pivotY(p)}`);
      assert.ok(approx(s.motionBlur.vx, 0), 'a vertical rise has no x velocity');
      assert.ok(s.motionBlur.vy < 0, 'rising (moving up) means negative y velocity');
      assert.ok(approx(s.motionBlur.pivotX, pivotX(s)) && approx(s.motionBlur.pivotY, pivotY(s)), 'pivot = the glyph centre');
      assert.equal(s.motionBlur.shutter, 180);
    }
  });

  check('glyphs at rest get no blur: settled (frame 60) and not-yet-started glyphs', () => {
    const { comp, layer } = build1();
    for (const s of stampsOf(resolveFrame(comp, 60), layer)) assert.equal(s.motionBlur, undefined, `${s.id} settled`);
  });

  check('first frame of the clip: no previous frame, so no glyph blur', () => {
    const { comp, layer } = build1();
    const shown = (an) => ({ ...an, offset: offsetKf(0, 0.5, 30, 1) }); // some glyphs visible at frame 0
    layer.animators = [shown(riseAnimator())];
    for (const s of stampsOf(resolveFrame(comp, 0), layer)) assert.equal(s.motionBlur, undefined);
  });

  check('composition shutter 0 closes the shutter for glyphs too', () => {
    const { comp, layer } = build1({ shutterAngle: 0 });
    for (const s of stampsOf(resolveFrame(comp, 15), layer)) assert.equal(s.motionBlur, undefined);
  });

  check('layer motion reaches settled glyphs (glyph blur = layer velocity)', () => {
    const { comp, layer } = build1();
    // Slide the whole layer 300 px right over frames 40..50; glyphs are settled by then.
    layer.transform.position.keyframes = [createKeyframe(40, [960, 540], 'linear'), createKeyframe(50, [1260, 540], 'linear')];
    const st = stampsOf(resolveFrame(comp, 45), layer);
    assert.ok(st.length === 5, 'all 5 glyphs visible');
    for (const s of st) {
      assert.ok(s.motionBlur, `${s.id} moves with the layer`);
      assert.ok(approx(s.motionBlur.vx, 30, 1e-6), `vx ${s.motionBlur.vx} = 300 px / 10 frames`);
      assert.ok(approx(s.motionBlur.vy, 0));
    }
  });

  check('tracking: centred text re-aligns symmetrically (+10 px tracking spreads about the centre)', () => {
    const base = build1({ motionBlur: false, animators: [{ enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), shape: 'square', offset: -2 }, delta: { opacity: 0.0001 } }] });
    const spread = build1({ motionBlur: false, animators: [{ enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), shape: 'square', offset: -2 }, delta: { tracking: 10 / FONT_PX } }] });
    base.layer.layoutConfig.horizontalAlign = 'center';
    spread.layer.layoutConfig.horizontalAlign = 'center';
    const a = stampsOf(resolveFrame(base.comp, 10), base.layer).sort((x, y) => glyphIndex(x) - glyphIndex(y));
    const b = stampsOf(resolveFrame(spread.comp, 10), spread.layer).sort((x, y) => glyphIndex(x) - glyphIndex(y));
    assert.equal(a.length, 5);
    assert.equal(b.length, 5);
    const dx = b.map((s, j) => pivotX(s) - pivotX(a[j]));
    // 5 glyphs, +10 after each: shifts 0,10,20,30,40 minus half of 40 -> -20,-10,0,10,20.
    [-20, -10, 0, 10, 20].forEach((e, j) => assert.ok(approx(dx[j], e), `glyph ${j} shift ${dx[j]} expected ${e}`));
  });

  check('tracking burst: tracking = -advance collapses a centred word onto one point', () => {
    const { comp, layer } = build1({ motionBlur: false, animators: [{ enabled: true, splitMode: 'characterNoSpaces', selector: { ...defaultRangeSelector(), shape: 'square', offset: -2 }, delta: { tracking: -GLYPH_W / FONT_PX } }] });
    layer.layoutConfig.horizontalAlign = 'center';
    const st = stampsOf(resolveFrame(comp, 10), layer);
    assert.equal(st.length, 5);
    const xs = st.map(pivotX);
    for (const x of xs) assert.ok(approx(x, xs[0]), `all glyph centres equal (got ${xs.join(', ')})`);
  });

  check('animated tracking streaks horizontally (per-glyph blur picks up tracking motion)', () => {
    const burst = {
      enabled: true, splitMode: 'characterNoSpaces',
      selector: { ...defaultRangeSelector(), shape: 'square', start: 0, end: 1 },
      offset: offsetKf(0, 0, 20, 1), // window slides off the letters: tracking releases over 20 frames
      delta: { tracking: -GLYPH_W / FONT_PX },
    };
    const { comp, layer } = build1({ animators: [burst] });
    layer.layoutConfig.horizontalAlign = 'center';
    const st = stampsOf(resolveFrame(comp, 10), layer);
    const outer = st.find((s) => glyphIndex(s) === 4);
    assert.ok(outer && outer.motionBlur, 'the last glyph is moving while the tracking expands');
    assert.ok(Math.abs(outer.motionBlur.vx) > 0.1 && approx(outer.motionBlur.vy, 0), `vx ${outer.motionBlur?.vx}`);
  });

  check('frame purity: resolving out of order is byte-identical', () => {
    const { comp } = build1();
    const a = JSON.stringify(resolveFrame(comp, 17).layers);
    resolveFrame(comp, 3);
    resolveFrame(comp, 90);
    const b = JSON.stringify(resolveFrame(comp, 17).layers);
    assert.equal(a, b);
  });

  // ---------- the four kinetic title presets (Bricks-style "N styles") ----------
  const KINETIC = ['rise-fade-word', 'scale-rise-letter', 'tracking-burst', 'blur-settle'];
  const preset = (id) => TEXT_ANIMATOR_PRESETS.find((x) => x.id === id);

  check('kinetic presets exist; blur-settle is a 2-animator stack, the others one animator', () => {
    for (const id of KINETIC) {
      assert.ok(preset(id), `preset ${id}`);
      assert.equal(buildTextAnimatorPreset(preset(id).build, 0, 30).length, id === 'blur-settle' ? 2 : 1);
    }
  });

  check('kinetic presets: hidden at the start, streaking mid-way, fully settled at the end', () => {
    for (const id of KINETIC) {
      const { comp, layer } = build1({ animators: buildTextAnimatorPreset(preset(id).build, 10, 30), text: 'MAKE IT' });
      const before = stampsOf(resolveFrame(comp, 10), layer);
      assert.ok(before.every((s) => s.transform.opacity < 0.5), `${id}: nothing fully shown at its start frame`);
      let streakFrames = 0;
      for (let f = 11; f < 40; f++) if (stampsOf(resolveFrame(comp, f), layer).some((s) => s.motionBlur)) streakFrames++;
      assert.ok(streakFrames >= 10, `${id}: glyphs streak through the reveal (${streakFrames} frames)`);
      const end = stampsOf(resolveFrame(comp, 45), layer);
      assert.equal(end.length, 6, `${id}: all 6 letters visible at the end`);
      for (const s of end) {
        assert.ok(approx(s.transform.opacity, 1), `${id}: settled opacity`);
        assert.ok(approx(s.transform.scaleX, 1) && approx(s.transform.rotation, 0), `${id}: settled scale/rotation`);
        assert.equal(s.motionBlur, undefined, `${id}: no blur once settled`);
        assert.ok(!s.blur || s.blur.radius === 0, `${id}: no residual glyph blur`);
      }
    }
  });

  check('tracking-burst starts collapsed: early glyph spread is far tighter than at rest', () => {
    const { comp, layer } = build1({ motionBlur: false, animators: buildTextAnimatorPreset(preset('tracking-burst').build, 0, 30), text: 'BURST' });
    layer.layoutConfig.horizontalAlign = 'center';
    // A realistic advance/size ratio: the 12 px stub glyph is 0.55 em at this size (preset: -0.55 em).
    layer.animOverrides.fontSize.defaultValue = GLYPH_W / 0.55;
    const spread = (f) => { const xs = stampsOf(resolveFrame(comp, f), layer).map(pivotX); return Math.max(...xs) - Math.min(...xs); };
    const rest = spread(60);
    // The fade hides most glyphs early, so measure the layout with the fade removed.
    layer.animators = layer.animators.map((a) => ({ ...a, delta: { ...a.delta, opacity: 0 } }));
    const early = spread(2);
    assert.ok(early < rest * 0.5, `early spread ${early} vs rest ${rest}`);
  });

  check('layer masks reach every glyph stamp (words rising out of a mask); unmasked stamps stay mask-free', () => {
    const { comp, layer } = build1({ motionBlur: false });
    const plain = stampsOf(resolveFrame(comp, 15), layer);
    assert.ok(plain.length > 0 && plain.every((s) => !s.masks || s.masks.length === 0), 'no masks without layer masks');
    const ps = (name, v) => createProperty(name, Array.isArray(v) ? 'vec2' : 'number', v);
    layer.masks = [{
      id: 'm1', name: 'Mask', type: 'rectangle', enabled: true, inverted: false, mode: 'add', points: 6,
      position: ps('Mask Position', [960, 540]), size: ps('Mask Size', [800, 120]), rotation: ps('Mask Rotation', 0),
      feather: ps('Mask Feather', 0), opacity: ps('Mask Opacity', 1), innerRadius: ps('Inner Radius', 10), expansion: ps('Mask Expansion', 0),
    }];
    const st = stampsOf(resolveFrame(comp, 15), layer);
    assert.ok(st.length > 0);
    for (const s of st) {
      assert.equal(s.masks?.length, 1, `${s.id} carries the layer mask`);
      assert.equal(s.masks[0].centerX, 960);
      assert.equal(s.masks[0].sizeY, 120);
      assert.ok(s.mask, `${s.id} carries the legacy single mask too`);
    }
  });

  // ---------- B45 (b): reveal presets never show a unit before their start frame ----------
  const START = 10;
  const DUR = 30;
  const isReveal = (id) => !NON_REVEAL_TEXT_ANIMATOR_PRESETS.includes(id);
  check('every reveal preset: nothing drawn at or before its start frame (the first glyph included), everything at rest from its end', () => {
    const reveals = TEXT_ANIMATOR_PRESETS.filter((p) => isReveal(p.id));
    assert.ok(reveals.length >= 13, `all reveal presets covered (${reveals.length})`);
    for (const p of reveals) {
      for (const text of ['Make it smooth', 'A', 'two words\nand a line']) {
        const { comp, layer } = build1({ motionBlur: false, animators: buildTextAnimatorPreset(p.build, START, DUR), text });
        for (const f of [0, START - 1, START]) {
          const st = stampsOf(resolveFrame(comp, f), layer);
          assert.equal(st.length, 0, `${p.id} "${text}": ${st.length} glyph(s) drawn at frame ${f} (first: ${st[0]?.id}, opacity ${st[0]?.transform.opacity})`);
        }
        const glyphs = text.replace(/\s/g, '').length;
        const end = stampsOf(resolveFrame(comp, START + DUR), layer);
        assert.equal(end.length, glyphs, `${p.id} "${text}": every glyph drawn at the end frame`);
        for (const s of end) assert.ok(approx(s.transform.opacity, 1), `${p.id}: settled opacity at the end frame (${s.id} ${s.transform.opacity})`);
        // Shows up right after the start (no dead frames at the head of the reveal).
        let first = -1;
        for (let f = START + 1; f <= START + DUR && first < 0; f++) if (stampsOf(resolveFrame(comp, f), layer).length > 0) first = f;
        assert.ok(first > START && first <= START + Math.ceil(DUR / 2), `${p.id}: first glyph appears at ${first}`);
      }
    }
  });

  check('non-reveal presets: the colour wave keeps every glyph drawn and returns to the base colour; delete is full before and empty after', () => {
    const wave = build1({ motionBlur: false, animators: buildTextAnimatorPreset(TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'color-wave').build, START, DUR), text: 'WAVE IT' });
    const base = [1, 1, 1, 1];
    let tinted = 0;
    for (let f = 0; f <= START + DUR + 5; f++) {
      const st = stampsOf(resolveFrame(wave.comp, f), wave.layer);
      assert.equal(st.length, 6, `all glyphs drawn at ${f}`);
      if (st.some((s) => s.text.fillColor.some((c, i) => Math.abs(c - base[i]) > 1e-3))) tinted++;
      if (f <= START || f >= START + DUR) for (const s of st) assert.deepEqual(s.text.fillColor, base, `base colour exactly at ${f}`);
    }
    assert.ok(tinted >= DUR / 2, `the wave tints glyphs through the pass (${tinted} frames)`);
    const del = build1({ motionBlur: false, animators: buildTextAnimatorPreset(TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'delete-char').build, START, DUR), text: 'DELETE' });
    assert.equal(stampsOf(resolveFrame(del.comp, START), del.layer).length, 6, 'whole word before the delete');
    assert.equal(stampsOf(resolveFrame(del.comp, START + DUR), del.layer).length, 0, 'nothing after it');
    const mid = stampsOf(resolveFrame(del.comp, START + DUR / 2), del.layer).map(glyphIndex).sort((a, b) => a - b);
    assert.ok(mid.length > 0 && mid.length < 6 && mid[0] === 0 && mid.every((g, i) => g === i), `deletes from the end (left: ${mid.join(',')})`);
  });

  // ---------- B45 (a) / B36: stamps land where the static layout draws each glyph ----------
  /** Expected glyph centre x / glyph top y (comp px) for every non-space char, from the layout rules
   *  the raster uses (renderTextToCanvas) with the stub's fixed advance. */
  const staticGlyphs = (layer, lines, rf) => {
    const t = rf.layers.find((l) => l.id === layer.id).text; // the plain (stamp-free) twin
    const W = t.measuredWidth; const H = t.measuredHeight;
    const pad = t.mode === 'box' ? 0 : 2;
    const lh = t.fontSize * t.lineHeight;
    const out = new Map();
    const ranges = mapLinesToContent(t.content, lines);
    ranges.forEach((r, li) => {
      const lineW = (r.end - r.start) * GLYPH_W;
      const startX = t.textAlign === 'center' ? (W - lineW) / 2 : t.textAlign === 'right' ? W - pad - lineW : pad;
      for (let j = r.start; j < r.end; j++) {
        if (t.content[j].trim() === '') continue;
        out.set(j, { x: layer.transform.position.defaultValue[0] - W / 2 + startX + (j - r.start) * GLYPH_W + GLYPH_W / 2, top: layer.transform.position.defaultValue[1] - H / 2 + pad + li * lh, line: li });
      }
    });
    return out;
  };
  const glyphTop = (s) => s.transform.positionY - s.text.measuredHeight / 2 + 2; // a stamp is a point text: 2 px inset
  const NOOP = { enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), amount: 0 }, delta: { position: [0, 0] } };
  const placementCase = (text, setup, lines) => {
    const twin = build1({ motionBlur: false, animators: [], text });
    setup(twin.layer);
    const anim = build1({ motionBlur: false, animators: [NOOP], text });
    setup(anim.layer);
    const want = staticGlyphs(twin.layer, lines, resolveFrame(twin.comp, 5));
    const st = stampsOf(resolveFrame(anim.comp, 5), anim.layer);
    assert.equal(st.length, want.size, `${text}: one stamp per drawn glyph`);
    for (const s of st) {
      const e = want.get(glyphIndex(s));
      assert.ok(e, `stamp ${s.id} is a drawn glyph`);
      assert.ok(approx(s.transform.positionX, e.x), `${JSON.stringify(text)} glyph ${glyphIndex(s)}: x ${s.transform.positionX} vs static ${e.x}`);
      assert.ok(approx(glyphTop(s), e.top), `${JSON.stringify(text)} glyph ${glyphIndex(s)}: top ${glyphTop(s)} vs static ${e.top}`);
      assert.equal(s.text.mode, 'point', 'stamps are point text (a box stamp would rasterize the whole box)');
    }
    return st;
  };

  check('fixedWidth box, left / centre / right: every stamp lands on its static glyph (not at the box top / centre)', () => {
    for (const align of ['left', 'center', 'right']) {
      placementCase('LOWER THIRD', (l) => { l.layoutConfig.boundingBox = { type: 'fixedWidth', width: 600 }; l.layoutConfig.horizontalAlign = align; }, ['LOWER THIRD']);
    }
  });

  check('fixed box, left / centre / right, incl. a wrapped paragraph: stamps follow the wrap line by line', () => {
    for (const align of ['left', 'center', 'right']) {
      placementCase('Name Surname', (l) => { l.layoutConfig.boundingBox = { type: 'fixed', width: 500, height: 120 }; l.layoutConfig.horizontalAlign = align; }, ['Name Surname']);
      // 12 px glyphs in a 100 px box: "alpha beta" = 120 px wraps after "alpha".
      const st = placementCase('alpha beta gamma', (l) => { l.layoutConfig.boundingBox = { type: 'fixed', width: 100, height: 400 }; l.layoutConfig.horizontalAlign = align; }, ['alpha', 'beta', 'gamma']);
      assert.equal(new Set(st.map((s) => s.transform.positionY.toFixed(3))).size, 3, `${align}: three wrapped lines`);
    }
  });

  check('a fixed box clips lines that start below it (like the raster); fixedWidth keeps its default height', () => {
    const { comp, layer } = build1({ motionBlur: false, animators: [NOOP], text: 'one\ntwo\nthree\nfour' });
    layer.layoutConfig.boundingBox = { type: 'fixed', width: 300, height: 100 }; // 57.6 px lines: 2 start inside
    const lines = new Set(stampsOf(resolveFrame(comp, 5), layer).map((s) => s.transform.positionY.toFixed(3)));
    assert.equal(lines.size, 2, `lines drawn: ${lines.size}`);
  });

  check('hard multi-line point text (captions), left / centre / right: every line placed like the raster', () => {
    for (const align of ['left', 'center', 'right']) {
      placementCase('students\nand staff\nfaculty', (l) => { l.layoutConfig.horizontalAlign = align; }, ['students', 'and staff', 'faculty']);
      placementCase('blank\n\nline', (l) => { l.layoutConfig.horizontalAlign = align; }, ['blank', '', 'line']);
    }
  });

  check('multi-line per-word animation: a cascade by word runs across all three lines in order', () => {
    const cascade = TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'rise-fade-word');
    const { comp, layer } = build1({ motionBlur: false, animators: buildTextAnimatorPreset(cascade.build, 0, 30), text: 'one two\nthree four\nfive six' });
    // "one two" = content 0..6, "three four" = 8..17, "five six" = 19..26.
    assert.ok(stampsOf(resolveFrame(comp, 5), layer).every((s) => glyphIndex(s) < 8 || s.transform.opacity < 0.5), 'early: lines 2 and 3 still hidden');
    const end = stampsOf(resolveFrame(comp, 30), layer);
    assert.equal(end.length, 22);
    assert.equal(new Set(end.map((s) => s.transform.positionY.toFixed(3))).size, 3, 'settled on three lines');
    // Mid-way the words of line 2 are still rising (offset below their rest line), line 1 settled.
    const rest = new Map(end.map((s) => [s.id, s.transform.positionY]));
    const mid = stampsOf(resolveFrame(comp, 16), layer);
    const risingOnLine2 = mid.filter((s) => glyphIndex(s) >= 8 && glyphIndex(s) < 18 && s.transform.positionY > rest.get(s.id) + 1);
    assert.ok(risingOnLine2.length > 0, 'line 2 words animate per word');
  });

  check('reflowHidden: a centred type-on stays centred on its visible glyphs; off = the full-line layout (AE)', () => {
    const typeOn = TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'type-on');
    const run = (reflow) => {
      const { comp, layer } = build1({ motionBlur: false, animators: buildTextAnimatorPreset(typeOn.build, 0, 30), text: 'SEARCHING' });
      layer.layoutConfig.horizontalAlign = 'center';
      if (reflow) layer.reflowHidden = true;
      return stampsOf(resolveFrame(comp, 12), layer).sort((a, b) => glyphIndex(a) - glyphIndex(b));
    };
    const on = run(true);
    const off = run(false);
    assert.ok(on.length > 1 && on.length < 9, `mid-type (${on.length} glyphs)`);
    const mid = (st) => (st[0].transform.positionX - GLYPH_W / 2 + st[st.length - 1].transform.positionX + GLYPH_W / 2) / 2;
    assert.ok(approx(mid(on), 960), `reflow: visible glyphs centred on the layer (${mid(on)})`);
    assert.ok(approx(off[0].transform.positionX, 960 - 4.5 * GLYPH_W + GLYPH_W / 2), 'off: the first glyph sits where the full word puts it');
    // Fully typed: reflow and full layout agree.
    const { comp, layer } = build1({ motionBlur: false, animators: buildTextAnimatorPreset(typeOn.build, 0, 30), text: 'SEARCHING' });
    layer.reflowHidden = true;
    const all = stampsOf(resolveFrame(comp, 40), layer);
    layer.reflowHidden = false;
    assert.equal(JSON.stringify(all), JSON.stringify(stampsOf(resolveFrame(comp, 40), layer)));
  });

  // ---------- B36: keyframable start / end, skew, fill, scatter ----------
  check('keyframed selector start / end resolve exactly like the same static selector at every frame', () => {
    const keyed = withSelectorProperty(withSelectorProperty({ enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), shape: 'smooth', start: 0, end: 0.4 }, delta: { position: [0, 60], opacity: -1 } }, 'start'), 'end');
    assert.equal(keyed.start.defaultValue, 0, 'start created from the static selector value');
    assert.equal(keyed.end.defaultValue, 0.4);
    keyed.start.keyframes = [createKeyframe(0, -0.5, 'linear'), createKeyframe(20, 1, 'linear')];
    keyed.end.keyframes = [createKeyframe(0, 0, 'linear'), createKeyframe(30, 1.3, 'linear')];
    const { comp, layer } = build1({ motionBlur: false, animators: [keyed], text: 'KEYED' });
    for (const f of [0, 7, 13, 20, 26, 40]) {
      const s = f >= 20 ? 1 : -0.5 + (1.5 * f) / 20;
      const e = f >= 30 ? 1.3 : (1.3 * f) / 30;
      const twin = build1({ motionBlur: false, animators: [{ ...keyed, start: undefined, end: undefined, selector: { ...keyed.selector, start: s, end: e } }], text: 'KEYED' });
      twin.layer.id = layer.id;
      const a = stampsOf(resolveFrame(comp, f), layer);
      const b = stampsOf(resolveFrame(twin.comp, f), twin.layer);
      assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id), `frame ${f}: same glyphs drawn`);
      a.forEach((x, i) => {
        for (const k of ['positionX', 'positionY', 'opacity']) assert.ok(approx(x.transform[k], b[i].transform[k], 1e-9), `frame ${f} ${x.id} ${k}: ${x.transform[k]} vs ${b[i].transform[k]}`);
      });
    }
  });

  check('skew reaches the glyph stamp (a wider sheared raster), none once settled', () => {
    const anim = { enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.5 }, offset: offsetKf(0, -0.5, 30, 1), delta: { skew: 30 } };
    const { comp, layer } = build1({ motionBlur: false, animators: [anim], text: 'SKEW' });
    const mid = stampsOf(resolveFrame(comp, 12), layer);
    const skewed = mid.filter((s) => s.text.skewX);
    assert.ok(skewed.length > 0, 'some glyphs skewed mid-way');
    for (const s of skewed) assert.ok(s.text.measuredWidth > GLYPH_W + 4, `sheared raster is wider (${s.text.measuredWidth})`);
    for (const s of stampsOf(resolveFrame(comp, 40), layer)) assert.equal(s.text.skewX, undefined, 'settled: no skew');
  });

  check('seeded scatter-in: letters start far from home, land exactly, frame-pure', () => {
    const scatter = TEXT_ANIMATOR_PRESETS.find((p) => p.id === 'scatter-in');
    const { comp, layer } = build1({ animators: buildTextAnimatorPreset(scatter.build, 0, 30), text: 'SCATTER' });
    const rest = new Map(stampsOf(resolveFrame(comp, 30), layer).map((s) => [s.id, s.transform.positionX]));
    const early = stampsOf(resolveFrame(comp, 9), layer);
    assert.ok(early.some((s) => Math.abs(s.transform.positionX - rest.get(s.id)) > 20), 'scattered mid-flight');
    const a = JSON.stringify(resolveFrame(comp, 14).layers);
    resolveFrame(comp, 29); resolveFrame(comp, 2);
    assert.equal(JSON.stringify(resolveFrame(comp, 14).layers), a, 'byte-identical out of order');
  });

  console.log(`\ntext-glyph-motion: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
