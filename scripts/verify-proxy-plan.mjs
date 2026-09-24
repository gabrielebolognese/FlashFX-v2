// Acceptance harness for the pure proxy-planning policy (src/engine/video/proxyPlan.ts, PB4a). Bundles
// the real TS with esbuild + asserts with node:assert. Run: node scripts/verify-proxy-plan.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'proxyplan-verify-'));
const outfile = join(tmp, 'proxyPlan.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  [pass] ${name}`); }

try {
  await build({ entryPoints: ['src/engine/video/proxyPlan.ts'], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  const { planProxy } = await import(pathToFileURL(outfile).href);

  check('no proxy for cheap footage (<=1080p AND short)', () => {
    assert.equal(planProxy({ width: 1920, height: 1080, frameRate: 30, durationFrames: 300 }), null); // 10s 1080p
    assert.equal(planProxy({ width: 1280, height: 720, frameRate: 30, durationFrames: 1800 }), null);  // 60s exactly, 720p
    assert.equal(planProxy({ width: 640, height: 480, frameRate: 30, durationFrames: 30 }), null);
  });

  check('4K -> downscaled to 1280 long-edge, even dims, all-intra', () => {
    const p = planProxy({ width: 3840, height: 2160, frameRate: 30, durationFrames: 300 });
    assert.ok(p, 'expected a plan for 4K');
    assert.equal(p.width, 1280);
    assert.equal(p.height, 720);
    assert.equal(p.keyframeInterval, 1);
    assert.equal(p.width % 2, 0); assert.equal(p.height % 2, 0);
  });

  check('high-res but non-16:9 preserves aspect + even dims', () => {
    const p = planProxy({ width: 3000, height: 4000, frameRate: 30, durationFrames: 300 }); // portrait, long edge 4000
    assert.ok(p);
    assert.equal(p.height, 1280);           // long edge clamped
    assert.equal(p.width, 960);             // 3000 * 1280/4000 = 960
    assert.equal(p.width % 2, 0); assert.equal(p.height % 2, 0);
  });

  check('1080p but LONG (>60s) gets an all-intra proxy (downscaled to 1280)', () => {
    const p = planProxy({ width: 1920, height: 1080, frameRate: 30, durationFrames: 3000 }); // 100s
    assert.ok(p, 'long 1080p should get a proxy for fast seeks');
    assert.equal(p.width, 1280);
    assert.equal(p.height, 720);
    assert.equal(p.keyframeInterval, 1);
  });

  check('degenerate / zero input -> null', () => {
    assert.equal(planProxy({ width: 0, height: 0, frameRate: 30, durationFrames: 300 }), null);
    assert.equal(planProxy({ width: 3840, height: 0, frameRate: 30, durationFrames: 300 }), null);
  });

  console.log(`\nproxy-plan: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
