// Acceptance harness for the video frame-eviction policy (engine/video/frameEviction.ts).
//
// This is the core of the playback-FREEZE fix: the scheduler must cap how many
// decoded frames it holds open (a hardware VideoDecoder stalls past ~16-24 open
// frames), evicting already-played frames first so a tight ring stays around the
// playhead. Proves the selection is deterministic and correct.
// Run: node scripts/verify-framecap.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'framecap-verify-'));
const outfile = join(tmp, 'fc.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

try {
  await build({ entryPoints: ['src/engine/video/frameEviction.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { selectFramesToEvict } = await import(pathToFileURL(outfile).href);

  check('within cap → evicts nothing', () => {
    assert.deepEqual(selectFramesToEvict(range(10, 21), [15], 12), []); // 12 frames, cap 12
    assert.deepEqual(selectFramesToEvict([1, 2, 3], [2], 12), []);
  });

  check('evicts exactly (open - cap) frames', () => {
    const evict = selectFramesToEvict(range(0, 20), [15], 12); // 21 open, cap 12 → 9 evicted
    assert.equal(evict.length, 9);
  });

  check('already-PLAYED frames (behind the anchor) are evicted first, oldest first', () => {
    // Playhead at 15; frames 0..20 open. The 9 evicted should be the lowest indices
    // (0..8, all behind 15) — never the on-screen frame or the look-ahead.
    const evict = selectFramesToEvict(range(0, 20), [15], 12).sort((a, b) => a - b);
    assert.deepEqual(evict, range(0, 8));
    assert.ok(!evict.includes(15), 'never evicts the on-screen frame');
    assert.ok(!evict.some((i) => i > 15), 'never evicts look-ahead while played frames remain');
  });

  check('with no played frames, evicts the FARTHEST-ahead first', () => {
    // All frames ahead of the anchor (anchor 10, frames 10..30). Keep the 12
    // nearest (10..21); evict the 9 farthest (22..30).
    const evict = selectFramesToEvict(range(10, 30), [10], 12).sort((a, b) => a - b);
    assert.equal(evict.length, 9);
    assert.deepEqual(evict, range(22, 30));
  });

  check('keeps a ring around MULTIPLE anchors (two layers on one asset)', () => {
    // Anchors at 5 and 50; frames 0..60 open (61), cap 12 → evict 49. Frames near
    // EITHER anchor must survive; the survivors are the 12 nearest to an anchor.
    const open = range(0, 60);
    const evict = new Set(selectFramesToEvict(open, [5, 50], 12));
    const survivors = open.filter((i) => !evict.has(i));
    assert.equal(survivors.length, 12);
    assert.ok(survivors.includes(5) && survivors.includes(50), 'both on-screen frames kept');
    // Every survivor is within a small distance of one of the two anchors.
    for (const s of survivors) {
      const d = Math.min(Math.abs(s - 5), Math.abs(s - 50));
      assert.ok(d <= 6, `survivor ${s} too far from any anchor (d=${d})`);
    }
  });

  check('no anchors → falls back to evicting lowest indices', () => {
    const evict = selectFramesToEvict(range(0, 20), [], 12).sort((a, b) => a - b);
    assert.equal(evict.length, 9);
    assert.deepEqual(evict, range(0, 8)); // farthest from 0
  });

  // Guard the SCHEDULER INVARIANT that caused the "~1 frame / 2-3s" freeze: lookahead MUST be < the
  // open-frame cap, or prefetch decodes leading-edge frames that get evicted and re-requested every
  // tick, forcing the worker onto the reseek+flush path (2s watchdog) on every frame.
  check('lookahead < open-frame cap (frameScheduler constants)', () => {
    const src = readFileSync('src/engine/video/frameScheduler.ts', 'utf8');
    const num = (name) => {
      const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
      assert.ok(m, `could not find ${name}`);
      return Number(m[1]);
    };
    const normal = num('LOOKAHEAD_NORMAL');
    const fast = num('LOOKAHEAD_FAST');
    const cap = num('MAX_OPEN_FRAMES_PER_ASSET');
    assert.ok(normal < cap, `LOOKAHEAD_NORMAL (${normal}) must be < MAX_OPEN_FRAMES_PER_ASSET (${cap})`);
    assert.ok(fast < cap, `LOOKAHEAD_FAST (${fast}) must be < MAX_OPEN_FRAMES_PER_ASSET (${cap})`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
