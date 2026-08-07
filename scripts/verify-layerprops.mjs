// Acceptance harness for the copy/paste-properties core (core/layerProperties.ts).
// Run: node scripts/verify-layerprops.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'layerprops-verify-'));
const outfile = join(tmp, 'lp.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const anim = (v) => ({ valueType: 'number', defaultValue: v, keyframes: [] });
const baseTransform = () => ({ opacity: anim(1) });
const shadow = () => ({ enabled: true, onlyShadow: false, color: [0, 0, 0, 0.5] });

const rect = (over = {}) => ({
  id: 'r', type: 'shape', transform: baseTransform(),
  shape: { type: 'rectangle', width: anim(100), height: anim(50), fillColor: [1, 0, 0, 1], strokeColor: [0, 0, 0, 1], strokeWidth: anim(2), borderRadius: anim(8) },
  ...over,
});
const circle = (over = {}) => ({
  id: 'c', type: 'shape', transform: baseTransform(),
  shape: { type: 'circle', radius: anim(40), fillColor: [0, 1, 0, 1], strokeColor: [1, 1, 1, 1], strokeWidth: anim(1) },
  ...over,
});
const star = (over = {}) => ({
  id: 's', type: 'shape', transform: baseTransform(),
  shape: { type: 'star', points: anim(5), outerRadius: anim(50), innerRadius: anim(25), fillColor: [0, 0, 1, 1], strokeColor: [1, 1, 1, 1], strokeWidth: anim(3) },
  ...over,
});
const spanStyle = (color) => ({ fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 24, color, letterSpacing: 0, lineHeight: 1.2, strokeColor: [0, 0, 0, 1], strokeWidth: 0, underline: false, strikethrough: false, textTransform: 'none' });
const text = (spans, over = {}) => ({ id: 't', type: 'text', transform: { opacity: anim(1) }, content: { spans }, ...over });

try {
  await build({ entryPoints: ['src/core/layerProperties.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { extractLayerProperties, applyLayerProperties, bundleLabels } = await import(pathToFileURL(outfile).href);

  check('extract from a rectangle captures fill/stroke/strokeWidth/borderRadius/opacity', () => {
    const b = extractLayerProperties(rect());
    assert.deepEqual(b.fillColor, [1, 0, 0, 1]);
    assert.deepEqual(b.strokeColor, [0, 0, 0, 1]);
    assert.equal(b.strokeWidth, 2);
    assert.equal(b.borderRadius, 8);
    assert.equal(b.opacity, 1);
  });

  check('extract does not mutate the source layer', () => {
    const r = rect();
    const snap = JSON.stringify(r);
    extractLayerProperties(r);
    assert.equal(JSON.stringify(r), snap);
  });

  check('paste rect props onto a circle: fill/stroke/width applied, borderRadius skipped (circle has none)', () => {
    const b = extractLayerProperties(rect());
    const out = applyLayerProperties(circle(), b);
    assert.deepEqual(out.shape.fillColor, [1, 0, 0, 1]);
    assert.deepEqual(out.shape.strokeColor, [0, 0, 0, 1]);
    assert.equal(out.shape.strokeWidth.defaultValue, 2);
    assert.equal(out.shape.radius.defaultValue, 40); // geometry untouched
    assert.ok(!('borderRadius' in out.shape));       // never introduced on a circle
  });

  check('paste does not mutate the target layer (returns a clone)', () => {
    const c = circle();
    const snap = JSON.stringify(c);
    applyLayerProperties(c, extractLayerProperties(rect()));
    assert.equal(JSON.stringify(c), snap);
  });

  check('paste shape props onto text: only opacity/effects cross over, geometry+text skipped', () => {
    const b = extractLayerProperties(rect({ transform: { opacity: anim(0.5) }, shadow: shadow() }));
    const t = text([{ text: 'hi', style: spanStyle([1, 1, 1, 1]) }]);
    const out = applyLayerProperties(t, b);
    assert.equal(out.transform.opacity.defaultValue, 0.5);
    assert.deepEqual(out.shadow, shadow());                 // effect crossed over
    assert.deepEqual(out.content.spans[0].style.color, [1, 1, 1, 1]); // text style untouched
    assert.ok(!('shape' in out));
  });

  check('effects (shadow) copy shape→circle', () => {
    const b = extractLayerProperties(rect({ shadow: shadow() }));
    assert.deepEqual(b.shadow, shadow());
    const out = applyLayerProperties(circle(), b);
    assert.deepEqual(out.shadow, shadow());
  });

  check('text style pastes to every span of the target', () => {
    const src = text([{ text: 'a', style: spanStyle([0.2, 0.4, 0.6, 1]) }]);
    const b = extractLayerProperties(src);
    const dst = text([{ text: 'x', style: spanStyle([1, 1, 1, 1]) }, { text: 'y', style: spanStyle([0, 0, 0, 1]) }]);
    const out = applyLayerProperties(dst, b);
    assert.deepEqual(out.content.spans[0].style.color, [0.2, 0.4, 0.6, 1]);
    assert.deepEqual(out.content.spans[1].style.color, [0.2, 0.4, 0.6, 1]);
    assert.equal(out.content.spans.length, 2);
  });

  check('borderRadius is rectangle-only: pasting onto a star leaves geometry, applies fill/stroke', () => {
    const b = extractLayerProperties(rect());
    const out = applyLayerProperties(star(), b);
    assert.deepEqual(out.shape.fillColor, [1, 0, 0, 1]);
    assert.equal(out.shape.strokeWidth.defaultValue, 2);
    assert.ok(!('borderRadius' in out.shape));
    assert.equal(out.shape.outerRadius.defaultValue, 50); // star geometry intact
  });

  check('opacity clamps to [0,1] on paste', () => {
    const out = applyLayerProperties(circle(), { opacity: 1.7 });
    assert.equal(out.transform.opacity.defaultValue, 1);
    const out2 = applyLayerProperties(circle(), { opacity: -0.3 });
    assert.equal(out2.transform.opacity.defaultValue, 0);
  });

  check('bundleLabels lists exactly the present properties', () => {
    const b = extractLayerProperties(rect({ shadow: shadow() }));
    assert.deepEqual(bundleLabels(b), ['Fill', 'Stroke', 'Stroke width', 'Corner radius', 'Opacity', 'Shadow']);
  });

  check('blendMode copies across visual layers (target must already carry the field)', () => {
    const b = extractLayerProperties(rect({ blendMode: 'multiply' }));
    assert.equal(b.blendMode, 'multiply');
    const out = applyLayerProperties(circle({ blendMode: 'normal' }), b);
    assert.equal(out.blendMode, 'multiply');
    assert.ok(bundleLabels(b).includes('Blend mode'));
  });

  check('extract with an evaluator uses the resolved value, not defaultValue', () => {
    const b = extractLayerProperties(rect(), () => 9); // every AnimatableProperty resolves to 9
    assert.equal(b.strokeWidth, 9);
    assert.equal(b.borderRadius, 9);
    assert.equal(b.opacity, 9); // extract returns the resolved value; clamping happens on APPLY
    // apply then clamps opacity into [0,1]
    assert.equal(applyLayerProperties(circle(), b).transform.opacity.defaultValue, 1);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
