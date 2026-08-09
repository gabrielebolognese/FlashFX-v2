// M6 persistence hardening — a 2.5D scene (camera layer + a 3D layer with depth transforms)
// must survive the full save/load round-trip (serialize → deserialize → validateComposition).
// Guards the "new layer type / field silently stripped on load" bug class the plan flags.
//   node scripts/verify-scene3d.mjs   (or: npm run verify:scene3d)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'scene3d-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

try {
  const factory = await bundle('src/core/factory.ts');
  const ser = await bundle('src/project-system/services/serialization.ts');
  const { createCameraLayer, createRectangleLayer, createProperty, createComposition } = factory;
  const { serializeComposition, deserializeComposition } = ser;

  console.log('2.5D scene persistence — acceptance\n');

  const W = 1920, H = 1080, DUR = 150;

  // Build a comp: a camera, a 3D shape (depth transform), and a plain 2D shape.
  const comp = createComposition('3D Test', { width: W, height: H, frameRate: 30, durationFrames: DUR, backgroundColor: [0, 0, 0, 1] });
  const camera = createCameraLayer('Camera 1', W, H, DUR);
  camera.camera.mode = 'one-node';
  camera.camera.zoom.defaultValue = 2200;
  camera.camera.dofEnabled = true;
  camera.camera.focusDistance.defaultValue = 1500;
  camera.camera.filmSize = 50;
  camera.camera.measureFilmSize = 'diagonal';
  camera.camera.lockToZoom = false;

  const shape3d = createRectangleLayer('Card', 400, 300, 200, 120, [1, 0, 0, 1], DUR);
  shape3d.is3D = true;
  shape3d.transform.positionZ = createProperty('Z Position', 'number', 350);
  shape3d.transform.rotationX = createProperty('X Rotation', 'number', 42);
  shape3d.transform.rotationY = createProperty('Y Rotation', 'number', -18);

  const shape2d = createRectangleLayer('Flat', 100, 100, 50, 50, [0, 1, 0, 1], DUR);

  comp.layers = [camera, shape3d, shape2d];

  const round = deserializeComposition(serializeComposition(comp));

  check('camera layer survives load with type + is3D + settings', () => {
    const c = round.layers.find((l) => l.type === 'camera');
    assert.ok(c, 'camera layer present after round-trip (not stripped)');
    assert.equal(c.is3D, true);
    assert.equal(c.camera.mode, 'one-node');
    assert.ok(near(c.camera.zoom.defaultValue, 2200));
    assert.equal(c.camera.dofEnabled, true);
    assert.ok(near(c.camera.focusDistance.defaultValue, 1500));
    assert.ok(c.camera.pointOfInterest && c.camera.blurLevel, 'aim + DOF props present');
    // AE lens paperwork must survive too (else stripped → dialog resets on reload).
    assert.equal(c.camera.filmSize, 50, 'film size round-trips');
    assert.equal(c.camera.measureFilmSize, 'diagonal', 'measure axis round-trips');
    assert.equal(c.camera.lockToZoom, false, 'lock-to-zoom round-trips');
  });

  check('camera eye position (transform + positionZ) round-trips', () => {
    const c = round.layers.find((l) => l.type === 'camera');
    assert.ok(c.transform.positionZ, 'camera has a Z position prop');
    assert.ok(near(c.transform.positionZ.defaultValue, -H), 'default camera eye at z=-compH');
  });

  check('3D layer keeps is3D and all depth transform values', () => {
    const s = round.layers.find((l) => l.name === 'Card');
    assert.ok(s, 'card layer present');
    assert.equal(s.is3D, true);
    assert.ok(s.transform.positionZ && near(s.transform.positionZ.defaultValue, 350), 'Z position');
    assert.ok(s.transform.rotationX && near(s.transform.rotationX.defaultValue, 42), 'X rotation');
    assert.ok(s.transform.rotationY && near(s.transform.rotationY.defaultValue, -18), 'Y rotation');
  });

  check('plain 2D layer does NOT gain depth props (byte-identical transform)', () => {
    const s = round.layers.find((l) => l.name === 'Flat');
    assert.ok(s, 'flat layer present');
    assert.ok(!s.is3D, 'stays 2D');
    assert.equal(s.transform.positionZ, undefined, 'no positionZ key added');
    assert.equal(s.transform.rotationX, undefined, 'no rotationX key added');
    assert.equal(s.transform.rotationY, undefined, 'no rotationY key added');
  });

  check('a second round-trip is idempotent (stable serialization)', () => {
    const once = serializeComposition(round);
    const twice = serializeComposition(deserializeComposition(once));
    assert.equal(once, twice, 'serialize∘deserialize is a fixed point');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
