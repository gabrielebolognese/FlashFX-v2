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
        export { TEXT_ANIMATOR_PRESETS, buildTextAnimatorPreset } from './src/core/textAnimatorPresets';
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
  const { resolveFrame, createComposition, createTextLayer, createProperty, createKeyframe, defaultRangeSelector, TEXT_ANIMATOR_PRESETS, buildTextAnimatorPreset } = m;

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

  console.log(`\ntext-glyph-motion: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
