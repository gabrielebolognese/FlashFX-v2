// Acceptance harness for the vignette factor math (src/core/effects/vignette.ts) - B13-gpu. The live
// effect is a WGSL case in the image shader that mirrors this formula; this pins the falloff curve so the
// two can't drift (the shader's look is browser-verified, but the MATH is proven here). No test runner in
// this repo (see CLAUDE.md); bundles the real TS with esbuild + node:assert. Run: node scripts/verify-vignette.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'vignette-verify-'));
const outfile = join(tmp, 'vignette.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

try {
  await build({
    entryPoints: ['src/core/effects/vignette.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { smoothstep, vignetteDistance, vignetteFactor, applyVignetteChannel } =
    await import(pathToFileURL(outfile).href);

  check('smoothstep: clamps and is Hermite; degenerate edges are a hard step', () => {
    assert.equal(smoothstep(0, 1, -1), 0);
    assert.equal(smoothstep(0, 1, 2), 1);
    assert.ok(near(smoothstep(0, 1, 0.5), 0.5));
    assert.equal(smoothstep(0.5, 0.5, 0.4), 0); // equal edges -> step
    assert.equal(smoothstep(0.5, 0.5, 0.6), 1);
  });

  check('vignetteDistance: 0 at centre, 1 at an edge midpoint, ~1.414 at a corner', () => {
    assert.ok(near(vignetteDistance(0.5, 0.5), 0));
    assert.ok(near(vignetteDistance(0.5, 1), 1));   // bottom edge midpoint
    assert.ok(near(vignetteDistance(1, 0.5), 1));   // right edge midpoint
    assert.ok(near(vignetteDistance(1, 1), Math.SQRT2, 1e-6)); // corner
  });

  check('vignetteFactor: 1 at centre, < 1 toward the edges (darkens)', () => {
    const r = 0.8, s = 0.4;
    assert.ok(near(vignetteFactor(0.5, 0.5, r, s), 1), 'centre untouched');
    const edge = vignetteFactor(1, 1, r, s); // corner
    assert.ok(edge < 1, `corner darkened (${edge.toFixed(3)})`);
  });

  check('vignetteFactor: monotonic non-increasing with distance from centre', () => {
    const r = 0.9, s = 0.5;
    let prev = Infinity;
    for (let d = 0; d <= 1.4; d += 0.1) {
      // sample straight down from centre so distance == d
      const f = vignetteFactor(0.5, 0.5 + d / 2, r, s);
      assert.ok(f <= prev + 1e-9, `factor does not increase as distance grows (d=${d.toFixed(1)})`);
      prev = f;
    }
  });

  check('vignetteFactor: inside (radius - softness) is fully clear (1)', () => {
    // radius 1.0, softness 0.2 -> clear until dist 0.8; a point at dist 0.5 is untouched
    assert.ok(near(vignetteFactor(0.5, 0.75, 1.0, 0.2), 1));
  });

  check('applyVignetteChannel: amount 0 is a no-op; amount 1 uses the full factor', () => {
    assert.ok(near(applyVignetteChannel(0.8, 0.4, 0), 0.8), 'amount 0 leaves the channel');
    assert.ok(near(applyVignetteChannel(1.0, 0.4, 1), 0.4), 'amount 1 = c*factor');
    assert.ok(near(applyVignetteChannel(1.0, 0.4, 0.5), 0.7), 'amount 0.5 = c*mix(1,0.4,0.5)');
    // clamps amount
    assert.ok(near(applyVignetteChannel(1.0, 0.4, 5), 0.4), 'amount clamps to 1');
  });

  console.log(`\nvignette: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
