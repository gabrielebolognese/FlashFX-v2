// Acceptance harness for the replace-source core (core/replaceSource.ts).
// Run: node scripts/verify-replacesource.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'replacesource-verify-'));
const outfile = join(tmp, 'rs.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const anim = (v) => ({ valueType: 'number', defaultValue: v, keyframes: [] });
const transform = () => ({ position: { valueType: 'vec2', defaultValue: [10, 20], keyframes: [{ id: 'k1', frame: 5, value: [30, 40] }] }, scale: anim(1), rotation: anim(0), anchorPoint: { valueType: 'vec2', defaultValue: [0, 0], keyframes: [] }, opacity: anim(1) });

const imageLayer = (over = {}) => ({
  id: 'im', type: 'image', name: 'Photo', parentId: null, trackId: 't1', visible: true, locked: false,
  blendMode: 'multiply', transform: transform(), masks: [{ id: 'm1' }], inPoint: 0, outPoint: 100,
  image: { assetId: 'A', sourceWidth: 800, sourceHeight: 600, format: 'png', fileSize: 1234 },
  filters: { brightness: 0.5 }, colorCorrection: { saturation: 1 }, effects: [{ kind: 'x' }], ...over,
});
const videoLayer = (over = {}) => ({
  id: 'vi', type: 'video', name: 'Clip', parentId: null, trackId: 't2', visible: true, locked: false,
  blendMode: 'normal', transform: transform(), inPoint: 0, outPoint: 200,
  video: { assetId: 'V', sourceWidth: 1920, sourceHeight: 1080, sourceDuration: 300, sourceFrameRate: 30, startOffset: 12, playbackRate: 2, muted: true, playbackMode: 'loop', proxyScale: 0.5 }, ...over,
});
const precompLayer = (over = {}) => ({
  id: 'pc', type: 'precomp', name: 'Nested', parentId: null, trackId: 't3', visible: true, locked: false,
  blendMode: 'normal', transform: transform(), inPoint: 0, outPoint: 150, compositionId: 'COMP_A', timeRemap: anim(0), ...over,
});
const shapeLayer = () => ({ id: 'sh', type: 'shape', transform: transform(), shape: { type: 'circle' } });

try {
  await build({ entryPoints: ['src/core/replaceSource.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { sourceKindForLayer, sourceFromLayer, applyReplaceSource } = await import(pathToFileURL(outfile).href);

  check('image replace: media handle + dims swap; transform/filters/effects/masks/timing preserved', () => {
    const l = imageLayer();
    const out = applyReplaceSource(l, { kind: 'image', assetId: 'B', sourceWidth: 400, sourceHeight: 300, format: 'jpg', fileSize: 999 });
    assert.equal(out.image.assetId, 'B');
    assert.equal(out.image.sourceWidth, 400);
    assert.equal(out.image.sourceHeight, 300);
    assert.equal(out.image.format, 'jpg');
    assert.equal(out.image.fileSize, 999);
    assert.deepEqual(out.transform, l.transform);       // transform literal-preserved
    assert.deepEqual(out.filters, l.filters);
    assert.deepEqual(out.effects, l.effects);
    assert.deepEqual(out.masks, l.masks);
    assert.equal(out.blendMode, 'multiply');
    assert.equal(out.inPoint, 0); assert.equal(out.outPoint, 100);
  });

  check('video replace: video handle/dims/duration/fps swap; timing/playback preserved', () => {
    const l = videoLayer();
    const out = applyReplaceSource(l, { kind: 'video', assetId: 'W', sourceWidth: 1280, sourceHeight: 720, sourceDuration: 500, sourceFrameRate: 24 });
    assert.equal(out.video.assetId, 'W');
    assert.equal(out.video.sourceWidth, 1280);
    assert.equal(out.video.sourceFrameRate, 24);
    assert.equal(out.video.startOffset, 12);   // timing preserved
    assert.equal(out.video.playbackRate, 2);
    assert.equal(out.video.muted, true);
    assert.equal(out.video.playbackMode, 'loop');
    assert.equal(out.video.proxyScale, 0.5);
  });

  check('precomp replace: compositionId swaps; transform/timeRemap/timing preserved', () => {
    const l = precompLayer();
    const out = applyReplaceSource(l, { kind: 'precomp', compositionId: 'COMP_B' });
    assert.equal(out.compositionId, 'COMP_B');
    assert.deepEqual(out.transform, l.transform);
    assert.deepEqual(out.timeRemap, l.timeRemap);
    assert.equal(out.inPoint, 0); assert.equal(out.outPoint, 150);
  });

  check('kind mismatch (image source onto a video layer) → same reference unchanged', () => {
    const l = videoLayer();
    const out = applyReplaceSource(l, { kind: 'image', assetId: 'B', sourceWidth: 1, sourceHeight: 1 });
    assert.equal(out, l); // returned unchanged, same object
  });

  check('input purity: original layer byte-identical after the call', () => {
    const l = imageLayer();
    const snap = JSON.stringify(l);
    applyReplaceSource(l, { kind: 'image', assetId: 'Z', sourceWidth: 1, sourceHeight: 1 });
    assert.equal(JSON.stringify(l), snap);
  });

  check('sourceFromLayer round-trip: descriptor from A applied to B carries A\'s handle+dims', () => {
    const a = imageLayer({ image: { assetId: 'AAA', sourceWidth: 111, sourceHeight: 222, format: 'webp', fileSize: 7 } });
    const desc = sourceFromLayer(a);
    assert.equal(desc.kind, 'image');
    const b = imageLayer();
    const out = applyReplaceSource(b, desc);
    assert.equal(out.image.assetId, 'AAA');
    assert.equal(out.image.sourceWidth, 111);
    assert.equal(out.image.format, 'webp');
  });

  check('sourceFromLayer/sourceKindForLayer on a shape → null', () => {
    assert.equal(sourceFromLayer(shapeLayer()), null);
    assert.equal(sourceKindForLayer(shapeLayer()), null);
    assert.equal(sourceKindForLayer(imageLayer()), 'image');
    assert.equal(sourceKindForLayer(videoLayer()), 'video');
    assert.equal(sourceKindForLayer(precompLayer()), 'precomp');
  });

  check('omitted optional keys (format/fileSize) leave those fields untouched', () => {
    const l = imageLayer();
    const out = applyReplaceSource(l, { kind: 'image', assetId: 'B', sourceWidth: 400, sourceHeight: 300 });
    assert.equal(out.image.format, 'png');   // unchanged
    assert.equal(out.image.fileSize, 1234);  // unchanged
    assert.equal(out.image.assetId, 'B');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
