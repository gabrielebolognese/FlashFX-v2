// Acceptance harness for the Trash retention math (pure). The 7-day / 30-day-if-starred window is
// what erases a project for good, so it's worth pinning. Run: node scripts/verify-trash.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'trash-verify-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const DAY = 86_400_000;
const T = 1_000_000_000_000; // arbitrary fixed "trashed at" epoch

try {
  await build({ entryPoints: ['src/project-system/types/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const m = await import(pathToFileURL(outfile).href);
  const { TRASH_RETENTION_DAYS, TRASH_RETENTION_DAYS_STARRED, trashRetentionDays, trashPurgeAt, isTrashExpired, trashDaysRemaining } = m;

  console.log('trash retention — acceptance\n');

  check('retention windows are 7 days, 30 if starred', () => {
    assert.equal(TRASH_RETENTION_DAYS, 7);
    assert.equal(TRASH_RETENTION_DAYS_STARRED, 30);
    assert.equal(trashRetentionDays({ starred: false }), 7);
    assert.equal(trashRetentionDays({ starred: true }), 30);
  });

  check('a project not in trash has no purge time and never expires', () => {
    const m0 = { starred: false, trashedAt: null };
    assert.equal(trashPurgeAt(m0), null);
    assert.equal(isTrashExpired(m0, T + 100 * DAY), false);
    assert.equal(trashDaysRemaining(m0, T), 0);
  });

  check('normal trashed project purges at trashedAt + 7d', () => {
    const p = { starred: false, trashedAt: T };
    assert.equal(trashPurgeAt(p), T + 7 * DAY);
    assert.equal(isTrashExpired(p, T + 7 * DAY - 1), false, 'not yet at 7d');
    assert.equal(isTrashExpired(p, T + 7 * DAY), true, 'expired exactly at 7d');
  });

  check('STARRED trashed project survives to 30d (still there at 7d)', () => {
    const p = { starred: true, trashedAt: T };
    assert.equal(trashPurgeAt(p), T + 30 * DAY);
    assert.equal(isTrashExpired(p, T + 7 * DAY), false, 'starred still safe at 7d');
    assert.equal(isTrashExpired(p, T + 29 * DAY), false);
    assert.equal(isTrashExpired(p, T + 30 * DAY), true, 'expired at 30d');
  });

  check('days-remaining counts down (ceil) and floors at 0', () => {
    const p = { starred: false, trashedAt: T };
    assert.equal(trashDaysRemaining(p, T), 7);
    assert.equal(trashDaysRemaining(p, T + 6 * DAY), 1);
    assert.equal(trashDaysRemaining(p, T + 6.5 * DAY), 1, 'partial day rounds up');
    assert.equal(trashDaysRemaining(p, T + 7 * DAY), 0);
    assert.equal(trashDaysRemaining(p, T + 99 * DAY), 0, 'never negative');
    assert.equal(trashDaysRemaining({ starred: true, trashedAt: T }, T), 30);
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
