// Acceptance harness for AI token metering (src/billing/aiCredits.ts). Pins the per-plan monthly token
// budgets and the pure budget/period math so a change can't silently give free accounts AI, or let a
// spent account keep generating. The edge function (supabase/functions/ai-proxy) duplicates the pro
// budget + period bucket; if this harness's PRO number changes, update the function too.
// No test runner in this repo (see CLAUDE.md); bundles the real TS with esbuild + node:assert.
// Run: node scripts/verify-ai-credits.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'aicredits-verify-'));
const outfile = join(tmp, 'aicredits.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({
    entryPoints: ['src/billing/aiCredits.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const {
    AI_MONTHLY_TOKENS, aiBudget, aiTokensRemaining, hasAiBudget, aiUsageFraction,
    usagePeriod, totalTokens, ZERO_AI_USAGE,
  } = await import(pathToFileURL(outfile).href);

  check('free gets ZERO AI budget; pro gets the agreed 6M', () => {
    assert.equal(AI_MONTHLY_TOKENS.free, 0);
    assert.equal(AI_MONTHLY_TOKENS.pro, 6_000_000);
    assert.equal(aiBudget('free'), 0);
    assert.equal(aiBudget('pro'), 6_000_000);
  });

  check('totalTokens sums all four fields', () => {
    assert.equal(totalTokens(ZERO_AI_USAGE), 0);
    assert.equal(totalTokens({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 8 }), 15);
  });

  check('hasAiBudget: free can never start; pro can until the budget is spent', () => {
    assert.equal(hasAiBudget(0, 'free'), false);        // free has no budget at all
    assert.equal(hasAiBudget(0, 'pro'), true);
    assert.equal(hasAiBudget(5_999_999, 'pro'), true);  // one token left
    assert.equal(hasAiBudget(6_000_000, 'pro'), false); // exactly spent -> blocked
    assert.equal(hasAiBudget(9_000_000, 'pro'), false); // over (bounded overage) -> blocked
  });

  check('aiTokensRemaining clamps at 0 and never goes negative', () => {
    assert.equal(aiTokensRemaining(0, 'pro'), 6_000_000);
    assert.equal(aiTokensRemaining(1_000_000, 'pro'), 5_000_000);
    assert.equal(aiTokensRemaining(7_000_000, 'pro'), 0); // over-budget clamps, no negatives
    assert.equal(aiTokensRemaining(0, 'free'), 0);
  });

  check('aiUsageFraction is 0..1 and 0 for a budget-less plan', () => {
    assert.equal(aiUsageFraction(0, 'pro'), 0);
    assert.equal(aiUsageFraction(3_000_000, 'pro'), 0.5);
    assert.equal(aiUsageFraction(9_000_000, 'pro'), 1); // clamps at 1
    assert.equal(aiUsageFraction(1000, 'free'), 0);     // no budget -> 0, never divide-by-zero
  });

  check('usagePeriod is the UTC YYYY-MM bucket (padded, timezone-stable)', () => {
    assert.equal(usagePeriod(new Date('2026-09-25T12:00:00Z')), '2026-09');
    assert.equal(usagePeriod(new Date('2026-01-01T00:00:00Z')), '2026-01'); // month is padded
    // A late-UTC instant that is a different local day still buckets by UTC month.
    assert.equal(usagePeriod(new Date('2026-12-31T23:59:59Z')), '2026-12');
  });

  console.log(`\nai-credits: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
