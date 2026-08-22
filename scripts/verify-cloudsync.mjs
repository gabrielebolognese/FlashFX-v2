// Acceptance harness for the cloud-sync planner (src/project-system/services/cloudSyncPlan.ts).
// Pins the last-write-wins + tombstone rules so a future change can't silently corrupt sync
// (e.g. resurrect deleted projects or lose a newer edit). No test runner in this repo (see
// CLAUDE.md); bundles the real TS with esbuild + node:assert. Run: node scripts/verify-cloudsync.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cloudsync-verify-'));
const outfile = join(tmp, 'plan.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({
    entryPoints: ['src/project-system/services/cloudSyncPlan.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { planSync } = await import(pathToFileURL(outfile).href);
  const item = (id, updatedAt, deleted) => (deleted ? { id, updatedAt, deleted: true } : { id, updatedAt });

  check('local-only project is pushed', () => {
    const p = planSync([item('a', 100)], []);
    assert.deepEqual(p.toPush, ['a']);
    assert.deepEqual(p.toPull, []);
  });

  check('cloud-only project is pulled', () => {
    const p = planSync([], [item('a', 100)]);
    assert.deepEqual(p.toPull, ['a']);
    assert.deepEqual(p.toPush, []);
  });

  check('both present, local newer → push', () => {
    const p = planSync([item('a', 200)], [item('a', 100)]);
    assert.deepEqual(p.toPush, ['a']);
    assert.deepEqual(p.toPull, []);
  });

  check('both present, cloud newer → pull', () => {
    const p = planSync([item('a', 100)], [item('a', 200)]);
    assert.deepEqual(p.toPull, ['a']);
    assert.deepEqual(p.toPush, []);
  });

  check('equal timestamps → no-op (no churn)', () => {
    const p = planSync([item('a', 150)], [item('a', 150)]);
    assert.deepEqual(p, { toPush: [], toPull: [], toDeleteLocal: [], toPushTombstone: [] });
  });

  check('cloud tombstone newer → delete local (delete propagates)', () => {
    const p = planSync([item('a', 100)], [item('a', 200, true)]);
    assert.deepEqual(p.toDeleteLocal, ['a']);
    assert.deepEqual(p.toPull, []);
  });

  check('local delete newer → push tombstone to cloud', () => {
    const p = planSync([item('a', 200, true)], [item('a', 100)]);
    assert.deepEqual(p.toPushTombstone, ['a']);
    assert.deepEqual(p.toPush, []);
  });

  check('local tombstone that never reached cloud → no-op', () => {
    const p = planSync([item('a', 200, true)], []);
    assert.deepEqual(p, { toPush: [], toPull: [], toDeleteLocal: [], toPushTombstone: [] });
  });

  check('cloud tombstone with no local copy → no-op (never resurrected)', () => {
    const p = planSync([], [item('a', 200, true)]);
    assert.deepEqual(p, { toPush: [], toPull: [], toDeleteLocal: [], toPushTombstone: [] });
  });

  check('a deleted-then-reappeared edit wins by timestamp (local newer beats cloud tombstone)', () => {
    // cloud says deleted at t=100; local edited at t=200 → local edit wins, push it back.
    const p = planSync([item('a', 200)], [item('a', 100, true)]);
    assert.deepEqual(p.toPush, ['a']);
    assert.deepEqual(p.toDeleteLocal, []);
  });

  check('mixed set is partitioned correctly', () => {
    const local = [item('push', 200), item('same', 50), item('lonelyL', 10), item('delC', 100)];
    const cloud = [item('push', 100), item('same', 50), item('lonelyC', 10), item('delC', 300, true)];
    const p = planSync(local, cloud);
    assert.deepEqual(p.toPush, ['lonelyL', 'push']);
    assert.deepEqual(p.toPull, ['lonelyC']);
    assert.deepEqual(p.toDeleteLocal, ['delC']);
    assert.deepEqual(p.toPushTombstone, []);
  });

  console.log(`\ncloud-sync: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
