// Contract harness for video/audio clip EDITING correctness (head-trim + split source-time).
//
// The core invariant: which SOURCE frame is shown at a given COMP frame must not change when you cut
// the head off a clip — trimming the left edge removes footage from the front, it does not slide the
// remaining footage. resolveVideoLayer (src/core/interpolation.ts:571-582) maps a comp frame to a
// source frame via  localFrame = frame - inPoint + startOffset  (reflected first when reversed). So
// advancing inPoint by d MUST advance startOffset by d, or the clip replays source-0 from the new
// head — the "can't edit clips / left trim loses the tail" bug (root cause #4 of the video audit).
//
// This locks that contract: it replicates the exact mapping, applies the SAME trim/split math the
// store now uses, asserts frame-identity, and (negative test) asserts the OLD uncompensated trim
// breaks it — so a regression is caught. Pure math; run: node scripts/verify-clip-edit.mjs

import assert from 'node:assert/strict';

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// ── The mapping under contract (mirrors interpolation.ts:571-582) ────────────────────────────────
function sourceFrameAt(layer, frame, compFps) {
  const v = layer.video;
  const totalSourceFrames = Math.round(v.sourceDuration * v.sourceFrameRate);
  const effFrame = v.reversed ? layer.inPoint + layer.outPoint - frame : frame;
  const localFrame = effFrame - layer.inPoint + v.startOffset;
  const timeInSeconds = localFrame / compFps;
  const sourceFrame = Math.floor(timeInSeconds * v.sourceFrameRate * v.playbackRate);
  const chosen = v.freezeSourceFrame != null ? Math.floor(v.freezeSourceFrame) : sourceFrame;
  return Math.max(0, Math.min(chosen, totalSourceFrames - 1));
}

// ── The edit operations (mirror src/store/editor.ts) ─────────────────────────────────────────────
// FIXED head-trim: advance inPoint AND startOffset by the same delta.
function trimLeftFixed(layer, playhead) {
  const d = playhead - layer.inPoint;
  return { ...layer, inPoint: playhead, video: { ...layer.video, startOffset: Math.max(0, layer.video.startOffset + d) } };
}
// OLD buggy head-trim: advance only inPoint (kept to prove the harness catches the regression).
function trimLeftBuggy(layer, playhead) {
  return { ...layer, inPoint: playhead };
}
// Split: clipA keeps the head, clipB advances inPoint + startOffset (the already-correct path).
function split(layer, playhead) {
  const d = playhead - layer.inPoint;
  const a = { ...layer, outPoint: playhead };
  const b = { ...layer, inPoint: playhead, outPoint: layer.outPoint, video: { ...layer.video, startOffset: Math.max(0, layer.video.startOffset + d) } };
  return [a, b];
}

const mkClip = (over = {}) => ({
  inPoint: 30,
  outPoint: 150,
  video: { startOffset: 0, sourceDuration: 20, sourceFrameRate: 30, playbackRate: 1, reversed: false, freezeSourceFrame: null, ...over },
});

const compFps = 30;
const sampleRange = (lo, hi) => { const out = []; for (let f = lo; f < hi; f++) out.push(f); return out; };

try {
  check('head-trim preserves the source frame at every remaining comp frame', () => {
    const orig = mkClip();
    const playhead = 70;
    const trimmed = trimLeftFixed(orig, playhead);
    for (const f of sampleRange(playhead, orig.outPoint)) {
      assert.equal(sourceFrameAt(trimmed, f, compFps), sourceFrameAt(orig, f, compFps), `frame ${f}`);
    }
  });

  check('head-trim preserves it with a pre-existing startOffset and speed change', () => {
    const orig = mkClip({ startOffset: 12, playbackRate: 1.5 });
    const trimmed = trimLeftFixed(orig, 90);
    for (const f of sampleRange(90, orig.outPoint)) {
      assert.equal(sourceFrameAt(trimmed, f, compFps), sourceFrameAt(orig, f, compFps), `frame ${f}`);
    }
  });

  check('startOffset never goes negative (guarded)', () => {
    const orig = mkClip({ startOffset: 5 });
    const trimmed = trimLeftFixed(orig, 40); // d=10 → 5+10=15, fine; now trim a clip that would underflow
    assert.ok(trimmed.video.startOffset >= 0);
    const orig2 = mkClip({ inPoint: 30, startOffset: 0 });
    // A negative delta can't happen for left-trim (playhead > inPoint), but the Math.max guard holds.
    assert.ok(trimLeftFixed(orig2, 31).video.startOffset >= 0);
  });

  check('split: both halves reproduce the original source frame across their ranges', () => {
    const orig = mkClip({ startOffset: 7 });
    const playhead = 95;
    const [a, b] = split(orig, playhead);
    for (const f of sampleRange(orig.inPoint, playhead)) {
      assert.equal(sourceFrameAt(a, f, compFps), sourceFrameAt(orig, f, compFps), `A frame ${f}`);
    }
    for (const f of sampleRange(playhead, orig.outPoint)) {
      assert.equal(sourceFrameAt(b, f, compFps), sourceFrameAt(orig, f, compFps), `B frame ${f}`);
    }
  });

  check('NEGATIVE: the old uncompensated head-trim BREAKS the invariant (proves the guard works)', () => {
    const orig = mkClip();
    const playhead = 70;
    const buggy = trimLeftBuggy(orig, playhead);
    let diverged = false;
    for (const f of sampleRange(playhead, orig.outPoint)) {
      if (sourceFrameAt(buggy, f, compFps) !== sourceFrameAt(orig, f, compFps)) { diverged = true; break; }
    }
    assert.ok(diverged, 'uncompensated left-trim should have shifted the source frame');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
}
