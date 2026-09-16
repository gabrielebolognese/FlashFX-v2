// Acceptance harness for the pure CPU gradient sampler (B8e). Bundles core/fillSampler.ts (a faithful
// port of the shape gradient shader) and asserts with node:assert. The pen-path gradient STROKE bakes
// this per stroke-vertex; the shader math is verified here (the on-GPU look is browser-verified).
//   node scripts/verify-fill-sampler.mjs   (or: npm run verify:fill-sampler)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fillsampler-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;
const nearC = (c, e, eps = 1e-5) => c.every((v, i) => near(v, e[i], eps));

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const RED = [1, 0, 0, 1];
const BLUE = [0, 0, 1, 1];
const solid = (color) => ({ kind: 0, color, layers: [] });
// Horizontal 2-stop gradient (angle 90° → gradient line points +x): red@0 → blue@1.
const hGrad = (a = RED, b = BLUE) => ({
  kind: 1, color: a,
  layers: [{ gradientType: 0, angle: Math.PI / 2, centerX: 0.5, centerY: 0.5, blendMode: 0, stops: [{ color: a, position: 0 }, { color: b, position: 1 }] }],
});

try {
  const F = await bundle('src/core/fillSampler.ts', 'fillSampler.mjs');
  const { sampleResolvedFill } = F;
  const box = [100, 100];

  check('solid fill returns its flat color at any uv', () => {
    assert.ok(nearC(sampleResolvedFill(solid([0.2, 0.4, 0.6, 1]), [0.3, 0.7], box), [0.2, 0.4, 0.6, 1]));
  });

  check('linear gradient: left→red, middle→purple, right→blue', () => {
    assert.ok(nearC(sampleResolvedFill(hGrad(), [0, 0.5], box), RED), 'left = first stop');
    assert.ok(nearC(sampleResolvedFill(hGrad(), [0.5, 0.5], box), [0.5, 0, 0.5, 1]), 'mid = halfway');
    assert.ok(nearC(sampleResolvedFill(hGrad(), [1, 0.5], box), BLUE), 'right = last stop');
  });

  check('linear gradient: quarter point interpolates 25% toward the end', () => {
    assert.ok(nearC(sampleResolvedFill(hGrad(), [0.25, 0.5], box), [0.75, 0, 0.25, 1]));
  });

  check('gradient clamps outside the stop range (t clamped to [0,1])', () => {
    // uv beyond the box still clamps to the last/first stop
    assert.ok(nearC(sampleResolvedFill(hGrad(), [5, 0.5], box), BLUE));
    assert.ok(nearC(sampleResolvedFill(hGrad(), [-5, 0.5], box), RED));
  });

  check('radial gradient: center = first stop, corner ≈ last stop', () => {
    const g = { kind: 1, color: RED, layers: [{ gradientType: 1, angle: 0, centerX: 0.5, centerY: 0.5, blendMode: 0, stops: [{ color: RED, position: 0 }, { color: BLUE, position: 1 }] }] };
    assert.ok(nearC(sampleResolvedFill(g, [0.5, 0.5], box), RED), 'center = first stop');
    const corner = sampleResolvedFill(g, [1, 1], box);
    assert.ok(corner[2] > 0.9, `corner should be ~blue, got ${corner}`);
  });

  check('single-stop layer is a constant color', () => {
    const g = { kind: 1, color: RED, layers: [{ gradientType: 0, angle: 0, centerX: 0.5, centerY: 0.5, blendMode: 0, stops: [{ color: [0.1, 0.2, 0.3, 1], position: 0.5 }] }] };
    assert.ok(nearC(sampleResolvedFill(g, [0.9, 0.1], box), [0.1, 0.2, 0.3, 1]));
  });

  check('multiply blend of two opaque layers = component product at the sampled point', () => {
    // top layer solid grey 0.5 (multiply) over bottom solid 0.8 → 0.4 per channel
    const g = {
      kind: 1, color: RED,
      layers: [
        { gradientType: 0, angle: 0, centerX: 0.5, centerY: 0.5, blendMode: 1, stops: [{ color: [0.5, 0.5, 0.5, 1], position: 0 }, { color: [0.5, 0.5, 0.5, 1], position: 1 }] },
        { gradientType: 0, angle: 0, centerX: 0.5, centerY: 0.5, blendMode: 0, stops: [{ color: [0.8, 0.8, 0.8, 1], position: 0 }, { color: [0.8, 0.8, 0.8, 1], position: 1 }] },
      ],
    };
    const c = sampleResolvedFill(g, [0.5, 0.5], box);
    assert.ok(nearC(c, [0.4, 0.4, 0.4, 1]), `expected 0.4 per channel, got ${c}`);
  });

  check('fully transparent stack → alpha 0', () => {
    const g = { kind: 1, color: RED, layers: [{ gradientType: 0, angle: 0, centerX: 0.5, centerY: 0.5, blendMode: 0, stops: [{ color: [1, 0, 0, 0], position: 0 }, { color: [0, 0, 1, 0], position: 1 }] }] };
    assert.ok(near(sampleResolvedFill(g, [0.5, 0.5], box)[3], 0));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ fill-sampler harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
