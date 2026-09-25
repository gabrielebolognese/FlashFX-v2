// Acceptance harness for the B16-gpu beam SDF shading math (src/core/beam/beamShading.ts) - the pure twin
// of the isolated WGSL beam pipeline. Pins the segment SDF, the capsule-chain min-distance, and the
// core/glow/tonemap falloff curves so the shader can't drift from a proven spec. The on-GPU render is
// browser-only; this proves the math. No test runner in this repo (see CLAUDE.md); bundles the real TS
// with esbuild + node:assert. Run: node scripts/verify-beam.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'beam-verify-'));
const outfile = join(tmp, 'beam.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

try {
  await build({
    entryPoints: ['src/core/beam/beamShading.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { smoothstep, sdSegment, capsuleChainDistance, coreCoverage, glowFalloff, tonemap } =
    await import(pathToFileURL(outfile).href);

  check('sdSegment: 0 on the segment, perpendicular distance off it, clamps past endpoints', () => {
    assert.ok(near(sdSegment(5, 0, 0, 0, 10, 0), 0));      // on the segment
    assert.ok(near(sdSegment(5, 3, 0, 0, 10, 0), 3));      // perpendicular
    assert.ok(near(sdSegment(-4, 0, 0, 0, 10, 0), 4));     // clamped to endpoint a
    assert.ok(near(sdSegment(13, 4, 0, 0, 10, 0), 5));     // clamped to endpoint b (3-4-5)
    // degenerate segment (a == b) -> distance to the point (3-4-5 from (1,1) to (4,5))
    assert.ok(near(sdSegment(4, 5, 1, 1, 1, 1), 5));
  });

  check('capsuleChainDistance: min over segments, minus halfWidth; <2 points -> far', () => {
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    // point near the first segment, 2px off, halfWidth 1 -> signed 1
    assert.ok(near(capsuleChainDistance(5, 2, poly, 1), 1));
    // point on the polyline -> -halfWidth (inside)
    assert.ok(near(capsuleChainDistance(10, 5, poly, 2), -2));
    // takes the nearer of the two segments
    assert.ok(near(capsuleChainDistance(12, 5, poly, 0), 2));
    assert.ok(capsuleChainDistance(0, 0, [{ x: 0, y: 0 }], 1) > 1e8, 'single point -> nothing to draw');
  });

  check('coreCoverage: 1 inside the core, 0 outside, monotonic non-increasing', () => {
    assert.ok(near(coreCoverage(-2, 0.5, 0.1), 1), 'well inside -> 1');
    assert.ok(near(coreCoverage(2, 0.5, 0.1), 0), 'well outside -> 0');
    assert.ok(near(coreCoverage(0.5, 0.5, 0.1), 0.5), 'at the core edge -> 0.5');
    let prev = 1.0001;
    for (let d = -1; d <= 1.0001; d += 0.1) { const c = coreCoverage(d, 0.5, 0.15); assert.ok(c <= prev + 1e-9); prev = c; }
  });

  check('glowFalloff: 1 at/inside the surface, decays with distance, always positive', () => {
    assert.ok(near(glowFalloff(0, 4), 1));
    assert.ok(near(glowFalloff(-3, 4), 1), 'interior clamps to full glow');
    assert.ok(glowFalloff(1, 4) < 1 && glowFalloff(1, 4) > 0);
    assert.ok(glowFalloff(2, 4) < glowFalloff(1, 4), 'monotonic decay');
    assert.ok(near(glowFalloff(1, 3), 1 / (1 + 3)));
  });

  check('tonemap: 0->0, saturates toward 1, monotonic, clamps negatives', () => {
    assert.ok(near(tonemap(0, 2), 0));
    assert.ok(tonemap(10, 2) > 0.99 && tonemap(10, 2) < 1, 'hot core -> near-white, never >= 1');
    assert.ok(tonemap(2, 1) > tonemap(1, 1), 'monotonic');
    assert.ok(near(tonemap(-5, 2), 0), 'negatives clamp');
    assert.ok(near(tonemap(1, 1), 1 - Math.exp(-1)));
  });

  check('smoothstep: clamps + Hermite; degenerate edges are a hard step', () => {
    assert.equal(smoothstep(0, 1, -1), 0);
    assert.equal(smoothstep(0, 1, 2), 1);
    assert.ok(near(smoothstep(0, 1, 0.5), 0.5));
    assert.equal(smoothstep(0.5, 0.5, 0.6), 1);
  });

  console.log(`\nbeam: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
