// Acceptance harness for account plan quotas (src/billing/plans.ts). Pins the free/pro limits and
// the pure quota predicates so a change can't silently let free accounts blow past the media cap.
// No test runner in this repo (see CLAUDE.md); bundles the real TS with esbuild + node:assert.
// Run: node scripts/verify-plans.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'plans-verify-'));
const outfile = join(tmp, 'plans.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const MB = 1024 * 1024;
const GB = 1024 * MB;

try {
  await build({
    entryPoints: ['src/billing/plans.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { PLAN_LIMITS, planLimits, mediaSyncAllowed, fitsMediaQuota, assetWithinLimit, currentPlan } =
    await import(pathToFileURL(outfile).href);

  check('free/pro limits are the agreed values', () => {
    assert.equal(PLAN_LIMITS.free.cloudMediaBytes, 500 * MB);
    assert.equal(PLAN_LIMITS.free.maxAssetBytes, 200 * MB);
    assert.equal(PLAN_LIMITS.pro.cloudMediaBytes, 20 * GB);
    assert.equal(PLAN_LIMITS.pro.maxAssetBytes, 1 * GB);
    assert.equal(PLAN_LIMITS.free.cloudProjects, Infinity);
    assert.equal(PLAN_LIMITS.pro.cloudProjects, Infinity);
  });

  check('default plan is free (no billing yet)', () => {
    assert.equal(currentPlan(), 'free');
  });

  check('media sync is allowed on both plans by default', () => {
    assert.equal(mediaSyncAllowed('free'), true);
    assert.equal(mediaSyncAllowed('pro'), true);
  });

  check('fitsMediaQuota respects the free cap (500 MB)', () => {
    assert.equal(fitsMediaQuota(400 * MB, 50 * MB, 'free'), true);   // 450 <= 500
    assert.equal(fitsMediaQuota(400 * MB, 150 * MB, 'free'), false); // 550 > 500
    assert.equal(fitsMediaQuota(500 * MB, 1, 'free'), false);        // already at cap
    assert.equal(fitsMediaQuota(0, 500 * MB, 'free'), true);         // exactly at cap fits
  });

  check('fitsMediaQuota gives pro the 20 GB ceiling', () => {
    assert.equal(fitsMediaQuota(10 * GB, 5 * GB, 'pro'), true);
    assert.equal(fitsMediaQuota(19 * GB, 2 * GB, 'pro'), false);
  });

  check('assetWithinLimit enforces per-asset caps', () => {
    assert.equal(assetWithinLimit(200 * MB, 'free'), true);
    assert.equal(assetWithinLimit(201 * MB, 'free'), false);
    assert.equal(assetWithinLimit(1 * GB, 'pro'), true);
    assert.equal(assetWithinLimit(1 * GB + 1, 'pro'), false);
  });

  check('planLimits returns the right object', () => {
    assert.equal(planLimits('free').cloudMediaBytes, 500 * MB);
    assert.equal(planLimits('pro').maxAssetBytes, 1 * GB);
  });

  console.log(`\nplans: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
