// Acceptance harness for the B31 audio-reactive keyframe math (pure). Bundles
// core/audioReactive/audioReactive.ts and asserts with node:assert: per-frame RMS envelope,
// attack/release smoothing, the mapping curve, and amplitude + beat keyframe tracks. The audio decode
// (extractMonoAudio) and beat detection run in the browser; this math is proved here.
//   node scripts/verify-audio-reactive.mjs   (or: npm run verify:audio-reactive)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'audioreact-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearVec = (v, e, tol = 1e-6) => Array.isArray(v) && near(v[0], e[0], tol) && near(v[1], e[1], tol);

try {
  const outfile = join(tmp, 'audioReactive.mjs');
  await build({ entryPoints: ['src/core/audioReactive/audioReactive.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { frameAmplitude, smoothEnvelope, mapAmplitude, buildAmplitudeTrack, secondsToFrames, buildBeatTrack } = M;

  check('frameAmplitude: silence -> 0; a mid burst is louder than the quiet edges; normalized peak = 1', () => {
    const sr = 48000, fps = 30, frames = 30;
    const silent = new Float32Array(sr); // 1s of zeros
    const sa = frameAmplitude(silent, sr, fps, frames);
    assert.equal(sa.length, frames);
    for (const v of sa) assert.ok(near(v, 0, 1e-9), 'silence -> 0');
    // loud sine in the middle third (frames ~10..20 => ~0.33s..0.66s), quiet elsewhere
    const buf = new Float32Array(sr);
    for (let i = 0; i < sr; i++) { const t = i / sr; buf[i] = (t > 0.33 && t < 0.66) ? Math.sin(2 * Math.PI * 440 * t) : 0.001 * Math.sin(2 * Math.PI * 440 * t); }
    const a = frameAmplitude(buf, sr, fps, frames);
    assert.ok(a[15] > a[2] * 10, `mid burst (${a[15].toFixed(3)}) >> edge (${a[2].toFixed(3)})`);
    assert.ok(Math.max(...a) <= 1 + 1e-6 && Math.abs(Math.max(...a) - 1) < 1e-6, 'normalized to peak 1');
  });

  check('smoothEnvelope: attack=release=1 identity; fast attack + slow release snaps up, eases down', () => {
    const step = new Float32Array([0, 0, 1, 1, 1, 0, 0, 0]);
    assert.deepEqual(Array.from(smoothEnvelope(step, 1, 1)), Array.from(step), 'identity at 1/1');
    const sm = smoothEnvelope(step, 1, 0.25); // instant up, slow down
    assert.ok(near(sm[2], 1, 1e-9), 'snaps up instantly on the rise');
    assert.ok(sm[5] > 0 && sm[5] < 1, 'releases gradually');
    assert.ok(sm[6] < sm[5], 'still decaying');
  });

  check('mapAmplitude: 0->min, 1->max, threshold gates, monotonic, exponent shapes', () => {
    const env = new Float32Array([0, 0.25, 0.5, 0.75, 1]);
    const lin = mapAmplitude(env, { min: 1, max: 3 });
    assert.ok(near(lin[0], 1) && near(lin[4], 3), 'endpoints map to min/max');
    for (let i = 1; i < lin.length; i++) assert.ok(lin[i] >= lin[i - 1] - 1e-9, 'monotonic');
    const gated = mapAmplitude(env, { min: 0, max: 1, threshold: 0.5 });
    assert.ok(near(gated[0], 0) && near(gated[1], 0), 'below threshold -> min');
    assert.ok(gated[3] > 0, 'above threshold rises');
    const sq = mapAmplitude(new Float32Array([0.5]), { min: 0, max: 1, exponent: 2 });
    assert.ok(near(sq[0], 0.25, 1e-6), 'exponent 2 squares the normalized amplitude');
  });

  check('buildAmplitudeTrack: keyframe per stride + last; targets map scalar to number/vec2', () => {
    const vals = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const t = buildAmplitudeTrack(vals, 'transform.scale', 'vec2-uniform', 0);
    assert.equal(t.propertyPath, 'transform.scale');
    assert.equal(t.keyframes.length, 5);
    assert.ok(nearVec(t.keyframes[2].value, [0.3, 0.3], 1e-5), 'uniform scale');
    assert.equal(t.keyframes[4].frame, 4, 'frames offset by startFrame');
    const strided = buildAmplitudeTrack(vals, 'transform.opacity', 'number', 10, [0, 0], 2);
    assert.deepEqual(strided.keyframes.map((k) => k.frame), [10, 12, 14], 'every 2 frames + the last');
    assert.ok(near(strided.keyframes[0].value, 0.1, 1e-5), 'number target keeps scalar');
    const posY = buildAmplitudeTrack(vals, 'transform.position', 'vec2-y', 0, [960, 0]);
    assert.ok(nearVec(posY.keyframes[1].value, [960, 0.2], 1e-5), 'position-y keeps base x');
  });

  check('secondsToFrames + buildBeatTrack: base held, peak on each beat, decays back; higher value wins', () => {
    assert.deepEqual(secondsToFrames([0, 0.5, 1], 30), [0, 15, 30]);
    const beats = secondsToFrames([0.5, 1.0], 30); // frames 15, 30
    const t = buildBeatTrack(beats, 'transform.scale', 'vec2-uniform', { base: 1, peak: 1.5, decayFrames: 6 }, [0, 0], 60);
    const at = (f) => t.keyframes.find((k) => k.frame === f);
    assert.deepEqual(at(0).value, [1, 1], 'base at frame 0');
    assert.deepEqual(at(15).value, [1.5, 1.5], 'peak on beat');
    assert.deepEqual(at(21).value, [1, 1], 'decays to base after decayFrames');
    assert.deepEqual(at(30).value, [1.5, 1.5], 'peak on 2nd beat');
    assert.ok(t.keyframes.every((k) => k.frame >= 0 && k.frame <= 60), 'clamped to [0,endFrame]');
    // frames strictly increasing (deduped + sorted)
    for (let i = 1; i < t.keyframes.length; i++) assert.ok(t.keyframes[i].frame > t.keyframes[i - 1].frame, 'sorted unique frames');
  });

  check('determinism: identical inputs -> identical output', () => {
    const env = new Float32Array([0.2, 0.9, 0.4, 0.7]);
    assert.deepEqual(mapAmplitude(env, { min: 0, max: 2, gain: 1.5, threshold: 0.1 }), mapAmplitude(env, { min: 0, max: 2, gain: 1.5, threshold: 0.1 }));
    assert.deepEqual(buildBeatTrack([5, 10], 'x', 'number', { base: 0, peak: 1, decayFrames: 3 }), buildBeatTrack([5, 10], 'x', 'number', { base: 0, peak: 1, decayFrames: 3 }));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ audio-reactive harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
