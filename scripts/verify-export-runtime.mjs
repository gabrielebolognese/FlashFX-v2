// Acceptance harness for the pure export runtime-policy helpers (src/codec/exportRuntime.ts).
// No test runner in this repo (see CLAUDE.md); this bundles the REAL TS with the installed esbuild and
// asserts with node:assert. Run: node scripts/verify-export-runtime.mjs (or: npm run verify:export-runtime)
//
// The point of these tests is the never-hang guarantee: a wedged encoder, an encoder that errors on a
// given frame, and an unsupported configure must each reach a TERMINAL outcome (clean error or a software
// fallback) in bounded time - never an infinite wait. The simulations below drive a fake encoder and a
// fake clock through the SAME pure policies the real exporter uses, and the harness itself is the proof
// of termination (it would hang or throw if the policy could).

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'exportruntime-verify-'));
const outfile = join(tmp, 'exportRuntime.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/codec/exportRuntime.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const {
    EXPORT_STALL_TIMEOUT_MS, EXPORT_QUEUE_HIGH, EXPORT_QUEUE_LOW, EXPORT_ACCEL_LADDER,
    isExportStalled, shouldRetryWithSoftware, formatAdapterInfo, formatExportDiagnostics,
  } = await import(pathToFileURL(outfile).href);

  check('isExportStalled: false before the timeout, true once reached', () => {
    assert.equal(isExportStalled(1000, 0, 30_000), false);
    assert.equal(isExportStalled(29_999, 0, 30_000), false);
    assert.equal(isExportStalled(30_000, 0, 30_000), true);
    assert.equal(isExportStalled(100_000, 0, 30_000), true);
    assert.equal(isExportStalled(5000, 4000), false); // uses the default timeout
  });

  check('shouldRetryWithSoftware: retry hardware failures once, never a cancel, never twice', () => {
    assert.equal(shouldRetryWithSoftware({ cancelled: false, triedSoftware: false }), true);
    assert.equal(shouldRetryWithSoftware({ cancelled: false, triedSoftware: true }), false);
    assert.equal(shouldRetryWithSoftware({ cancelled: true, triedSoftware: false }), false);
  });

  check('accel ladder is browser-default then forced software', () => {
    assert.deepEqual(EXPORT_ACCEL_LADDER, ['no-preference', 'prefer-software']);
    assert.ok(EXPORT_QUEUE_HIGH > EXPORT_QUEUE_LOW);
  });

  check('formatAdapterInfo: joins present fields, tolerates null/empty', () => {
    assert.equal(formatAdapterInfo(null), '');
    assert.equal(formatAdapterInfo({}), '');
    assert.equal(formatAdapterInfo({ vendor: 'nvidia', architecture: 'ampere' }), 'nvidia ampere');
    assert.equal(formatAdapterInfo({ vendor: '', device: 'RTX', description: 'd3d11' }), 'RTX d3d11');
  });

  check('formatExportDiagnostics: multi-line, carries the key fields, no em dash', () => {
    const text = formatExportDiagnostics({
      appVersion: 'abc1234', userAgent: 'Chrome/999', deviceMemoryGB: 8, gpu: 'nvidia ampere',
      codec: 'avc1.4d0028', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30,
      hardwareAcceleration: 'prefer-software', configSupported: true, stoppedAtFrame: 10, totalFrames: 150,
      reason: 'encoder wedged',
    });
    assert.ok(text.includes('build:        abc1234'));
    assert.ok(text.includes('stoppedAt:    10 / 150'));
    assert.ok(text.includes('hwAccel:      prefer-software'));
    assert.ok(text.includes('bitrate:      10000 kbps'));
    assert.ok(text.split('\n').length >= 10);
    assert.ok(!text.includes(String.fromCharCode(0x2014)), 'no em dash');
  });

  // ---- Simulations: the real exporter policy over a fake encoder + fake clock ----
  // A faithful model of exporter.ts's attempt loop, using ONLY the pure helpers above for its decisions.
  // `encoder` is a fake whose behavior encodes a scenario. Returns the terminal outcome; the WHILE loops
  // are bounded by a hard tick cap so a policy bug would surface as a thrown "did not terminate", never a
  // real hang.
  const STALL = EXPORT_STALL_TIMEOUT_MS;

  function simulateAttempt(makeEncoder, totalFrames) {
    const enc = makeEncoder();
    let now = 0;
    let lastAdvance = 0;
    let ticks = 0;
    const tick = (ms) => { now += ms; if (++ticks > 1_000_000) throw new Error('simulation did not terminate'); };

    for (let frame = 0; frame < totalFrames; frame++) {
      lastAdvance = now; // starting a frame counts as progress
      // render (fast, deterministic) then enqueue
      enc.encode(); // may throw-flag via enc.error
      lastAdvance = now;
      if (enc.error) return { outcome: 'error', reason: enc.error, frame };
      // backpressure drain, bounded by the stall guard
      if (enc.queueSize() > EXPORT_QUEUE_HIGH) {
        while (true) {
          if (enc.error) return { outcome: 'error', reason: enc.error, frame };
          if (isExportStalled(now, lastAdvance, STALL)) return { outcome: 'stall', frame };
          if (enc.queueSize() <= EXPORT_QUEUE_LOW) break;
          const dequeued = enc.drainStep(now); // a healthy encoder emits here
          if (dequeued) lastAdvance = now;
          tick(30);
        }
      }
    }
    // flush, also bounded by the stall guard
    while (enc.queueSize() > 0) {
      if (enc.error) return { outcome: 'error', reason: enc.error };
      if (isExportStalled(now, lastAdvance, STALL)) return { outcome: 'stall' };
      const dequeued = enc.drainStep(now);
      if (dequeued) lastAdvance = now;
      tick(30);
    }
    return { outcome: 'ok', frames: totalFrames };
  }

  function simulateExport(makeEncoderFor, totalFrames) {
    // Mirrors the real retry ladder: try each accel, stop on success, retry a failure once with software.
    let last = null;
    for (let i = 0; i < EXPORT_ACCEL_LADDER.length; i++) {
      const accel = EXPORT_ACCEL_LADDER[i];
      const res = simulateAttempt(() => makeEncoderFor(accel), totalFrames);
      if (res.outcome === 'ok') return { ...res, accel };
      last = { ...res, accel };
      const triedSoftware = accel === 'prefer-software';
      if (!shouldRetryWithSoftware({ cancelled: false, triedSoftware })) break;
    }
    return last;
  }

  // Healthy hardware encoder: keeps a shallow queue, always drains.
  const healthy = () => {
    let q = 0;
    return { encode() { q++; }, queueSize() { return q; }, drainStep() { if (q > 0) q--; return true; }, error: null };
  };
  // Wedged hardware encoder: queue fills, NEVER drains, never reports an error (the exact silent hang).
  const wedged = () => {
    let q = 0;
    return { encode() { q++; }, queueSize() { return q; }, drainStep() { return false; }, error: null };
  };
  // Errors on a specific frame (hardware fault that DOES surface).
  const errorsOnFrame = (n) => {
    let q = 0; let f = 0;
    return { encode() { if (f++ === n) this.error = `encoder error at frame ${n}`; else q++; }, queueSize() { return q; }, drainStep() { if (q > 0) q--; return true; }, error: null };
  };

  check('healthy encoder: exports to completion, no stall', () => {
    const res = simulateExport(() => healthy(), 150);
    assert.equal(res.outcome, 'ok');
    assert.equal(res.frames, 150);
    assert.equal(res.accel, 'no-preference'); // succeeds on the first (hardware) try
  });

  check('wedged hardware encoder: stalls in bounded time, then software succeeds (no hang)', () => {
    const res = simulateExport((accel) => (accel === 'prefer-software' ? healthy() : wedged()), 150);
    assert.equal(res.outcome, 'ok');
    assert.equal(res.accel, 'prefer-software'); // the fallback carried it
  });

  check('wedged on BOTH paths: terminates with a clean stall error, never hangs', () => {
    const res = simulateExport(() => wedged(), 150);
    assert.equal(res.outcome, 'stall');
    assert.equal(res.accel, 'prefer-software'); // gave up only after trying software
  });

  check('encoder that errors on frame 10: retried, software completes', () => {
    const res = simulateExport((accel) => (accel === 'prefer-software' ? healthy() : errorsOnFrame(10)), 150);
    assert.equal(res.outcome, 'ok');
    assert.equal(res.accel, 'prefer-software');
  });

  check('errors on both paths: terminates with the error, never hangs', () => {
    const res = simulateExport(() => errorsOnFrame(10), 150);
    assert.equal(res.outcome, 'error');
    assert.match(res.reason, /frame 10/);
  });

  console.log(`\nexport-runtime: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
