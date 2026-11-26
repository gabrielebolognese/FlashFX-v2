// Acceptance harness for B65 agent video clip timing (core/trackPlacement.ts): exact placement on magnetic
// video tracks, the in / out / source-range / speed / reverse planner, keyframes that follow the clip, and a
// track matte whose matte layer is named (re-stacked directly above). Pure node: an esbuild bundle of the real
// TS (trackPlacement, trackCompression, resolveFrame, factory). The store wiring and real pixels are proven by
// gpu:clip-timing through the MCP.
//   node scripts/verify-clip-timing.mjs   (or: npm run verify:clip-timing)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'clip-timing-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/trackPlacement';
        export { reflowCompressedTracks, isTrackCompressed } from './src/core/trackCompression';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createVideoLayer, createAudioLayer, createRectangleLayer, createKeyframe } from './src/core/factory';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const M = await import(pathToFileURL(outfile).href);
  const { planClipTiming, pinClipToTime, shiftLayerKeyframes, placeMatteAbove, layerDirectlyAbove, renderOrder, withTrackCompression,
    reflowCompressedTracks, isTrackCompressed, resolveFrame, createComposition, createVideoLayer, createAudioLayer, createRectangleLayer } = M;
  console.log('verify:clip-timing');

  const FPS = 30;
  let trackSeq = 0;
  const makeTrack = (name, type, order) => ({ id: `T${++trackSeq}`, name, type, order, locked: false, visible: true, compressed: type === 'video' });
  const trackTypeOf = (l) => (l.type === 'video' ? 'video' : l.type === 'audio' ? 'audio' : 'mixed');
  // The store's settle pass, minus pruning: magnetic tracks re-pack (this is what undid every agent placement).
  const settle = (c) => reflowCompressedTracks(c);
  const comp0 = () => createComposition('c', { width: 1080, height: 1920, frameRate: FPS, durationFrames: 900, backgroundColor: [0, 0, 0, 1] });
  // A 10 s, 30 fps source clip, 90 frames long on the timeline, on its own magnetic video track (what the store
  // creates for editor.addVideoFromAsset).
  const video = (name, trackId, inPoint = 0, frames = 90) => {
    const v = createVideoLayer(name, 540, 960, `asset-${name}`, 540, 960, 10, 30, frames, 'wait', 1);
    v.inPoint = inPoint; v.outPoint = inPoint + frames; v.trackId = trackId;
    return v;
  };
  const srcFrameAt = (comp, layerId, f) => resolveFrame(comp, f).layers.find((l) => l.id === layerId)?.video?.sourceFrame;

  // ---------- the bug, reproduced on the old path ----------
  check('repro: an in-point typed on a magnetic video track is packed back to frame 0 by the settle pass (the r07 / r09 trap)', () => {
    const c = comp0();
    const tA = makeTrack('video track', 'video', 0); const tB = makeTrack('video track', 'video', 1);
    const a = video('A', tA.id); const b = video('B', tB.id);
    c.tracks = [tA, tB]; c.layers = [a, b];
    assert.equal(isTrackCompressed(tA), true);
    const typed = { ...c, layers: c.layers.map((l) => (l.id === b.id ? { ...l, inPoint: 114, outPoint: 204 } : l)) };
    assert.equal(settle(typed).layers.find((l) => l.id === b.id).inPoint, 0);
  });

  // ---------- exact placement ----------
  check('pinClipToTime: the clip stays at frame 114 through later settles; its track turns absolute; nothing else moves', () => {
    const c = comp0();
    const tA = makeTrack('video track', 'video', 0); const tB = makeTrack('video track', 'video', 1);
    const a = video('A', tA.id); const b = video('B', tB.id);
    c.tracks = [tA, tB]; c.layers = [a, b];
    const r = pinClipToTime(c, b.id, 114, 204, makeTrack, trackTypeOf);
    assert.equal(r.unpinnedTrack, true); assert.equal(r.movedToNewTrack, false); assert.equal(r.trackId, tB.id);
    let s = settle(r.comp);
    // a later "import": a new clip lands on a new magnetic track and the comp is settled again
    const tC = makeTrack('video track', 'video', -1);
    s = settle({ ...s, tracks: [...s.tracks, tC], layers: [...s.layers, video('C', tC.id)] });
    const B = s.layers.find((l) => l.id === b.id);
    assert.deepEqual([B.inPoint, B.outPoint], [114, 204]);
    assert.equal(s.tracks.find((t) => t.id === tB.id).compressed, false);
    assert.deepEqual([s.layers.find((l) => l.id === a.id).inPoint, s.layers.find((l) => l.id === a.id).outPoint], [0, 90]);
    assert.equal(s.tracks.find((t) => t.id === tA.id).compressed, true, 'other tracks keep their magnetism');
  });
  check('pinClipToTime: on a shared magnetic track the neighbours keep their packed frames; an overlap moves the clip to a new absolute track directly above', () => {
    const c = comp0();
    const t = makeTrack('video track', 'video', 0); const tLow = makeTrack('mixed', 'mixed', 1);
    const a = video('A', t.id, 0, 60); const b = video('B', t.id, 60, 60); const d = video('D', t.id, 120, 60);
    const g = createRectangleLayer('bg', 540, 960, 1080, 1920, [0, 0, 1, 1], 900); g.trackId = tLow.id;
    c.tracks = [t, tLow]; c.layers = [g, a, b, d];
    // B to 200: no overlap on its (now absolute) track, A and D stay put
    const r1 = pinClipToTime(c, b.id, 200, 260, makeTrack, trackTypeOf);
    const s1 = settle(r1.comp);
    assert.equal(r1.movedToNewTrack, false);
    assert.deepEqual(s1.layers.filter((l) => l.trackId === t.id).map((l) => [l.name, l.inPoint]).sort(), [['A', 0], ['B', 200], ['D', 120]]);
    // B to 30 overlaps A: B moves to a new track just above (order -0.5) and A / D stay put
    const r2 = pinClipToTime(c, b.id, 30, 90, makeTrack, trackTypeOf);
    const s2 = settle(r2.comp);
    assert.equal(r2.movedToNewTrack, true);
    const newT = s2.tracks.find((x) => x.id === r2.trackId);
    assert.equal(newT.compressed, false); assert.equal(newT.order, -0.5);
    assert.deepEqual(s2.layers.filter((l) => l.trackId === t.id).map((l) => [l.name, l.inPoint]).sort(), [['A', 0], ['D', 120]]);
    assert.deepEqual([s2.layers.find((l) => l.id === b.id).inPoint, s2.layers.find((l) => l.id === b.id).outPoint], [30, 90]);
    assert.equal(pinClipToTime(c, 'nope', 0, 1, makeTrack, trackTypeOf), null);
  });

  // ---------- planner: in / out, source range, speed, reverse ----------
  const base = () => video('V', 'T0', 0, 90);
  check('plan: startFrame + durationFrames / endFrame; unset fields keep the clip as it is', () => {
    const v = base();
    assert.deepEqual((({ inPoint, outPoint }) => [inPoint, outPoint])(planClipTiming(v, FPS, { startFrame: 114, durationFrames: 93 })), [114, 207]);
    assert.deepEqual((({ inPoint, outPoint }) => [inPoint, outPoint])(planClipTiming(v, FPS, { startFrame: 114, endFrame: 150 })), [114, 150]);
    const same = planClipTiming(v, FPS, {});
    assert.deepEqual([same.inPoint, same.outPoint, same.startOffset, same.playbackRate, same.reversed, same.keyframeShift], [0, 90, 0, 1, false, 0]);
  });
  check('plan: sourceStart / sourceEnd trim the source; speed keeps the source range and its first frame', () => {
    const v = base();
    const p = planClipTiming(v, FPS, { startFrame: 10, sourceStart: 2.5, sourceEnd: 4.5 });
    assert.deepEqual([p.inPoint, p.outPoint, p.startOffset, p.sourceStart, p.sourceEnd], [10, 70, 75, 2.5, 4.5]);
    const fast = planClipTiming({ ...v, video: { ...v.video, startOffset: 75 } }, FPS, { speed: 2 });
    assert.deepEqual([fast.outPoint - fast.inPoint, fast.playbackRate, fast.sourceStart, fast.startOffset], [45, 2, 2.5, 37.5]);
    const slow = planClipTiming(v, FPS, { speed: 0.5, durationFrames: 120 });
    assert.deepEqual([slow.outPoint - slow.inPoint, slow.sourceEnd], [120, 2]);
  });
  check('plan -> resolveFrame: the source frame shown at every comp frame matches sourceStart + elapsed * speed (forward and reversed)', () => {
    const c = comp0();
    const v = base(); v.trackId = null; c.layers = [v];
    for (const spec of [{ startFrame: 30, sourceStart: 2, durationFrames: 60 }, { startFrame: 30, sourceStart: 1, durationFrames: 40, speed: 1.5 }, { startFrame: 5, sourceStart: 3, sourceEnd: 5, reversed: true }]) {
      const p = planClipTiming(v, FPS, spec);
      const placed = { ...v, inPoint: p.inPoint, outPoint: p.outPoint, video: { ...v.video, startOffset: p.startOffset, playbackRate: p.playbackRate, reversed: p.reversed } };
      const cc = { ...c, layers: [placed] };
      for (let k = 0; k < p.outPoint - p.inPoint; k += 7) {
        const f = p.inPoint + k;
        const eff = p.reversed ? p.outPoint - p.inPoint - k : k;
        const want = Math.floor((p.sourceStart + (eff / FPS) * p.playbackRate) * 30 + 1e-9);
        assert.equal(srcFrameAt(cc, v.id, f), Math.min(299, want), `${JSON.stringify(spec)} f${f}`);
      }
    }
    // before the in-point the clip is not drawn
    const p = planClipTiming(v, FPS, { startFrame: 30, sourceStart: 2 });
    const cc = { ...c, layers: [{ ...v, inPoint: p.inPoint, outPoint: p.outPoint, video: { ...v.video, startOffset: p.startOffset } }] };
    assert.equal(srcFrameAt(cc, v.id, 29), undefined);
    assert.equal(srcFrameAt(cc, v.id, 30), 60);
  });
  check('plan: audio takes in / out + source range; text / shape layers take in / out only', () => {
    const a = createAudioLayer('vo', 'aud', 20, 48000, 2, 300);
    const p = planClipTiming(a, FPS, { startFrame: 60, sourceStart: 4, durationFrames: 90 });
    assert.deepEqual([p.inPoint, p.outPoint, p.startOffset, p.playbackRate], [60, 150, 120, undefined]);
    const r = createRectangleLayer('r', 0, 0, 10, 10, [1, 1, 1, 1], 300);
    const q = planClipTiming(r, FPS, { startFrame: 12, endFrame: 40 });
    assert.deepEqual([q.inPoint, q.outPoint, q.startOffset], [12, 40, undefined]);
    assert.throws(() => planClipTiming(r, FPS, { sourceStart: 1 }), /video or audio/);
    assert.throws(() => planClipTiming(a, FPS, { speed: 2 }), /video layer/);
  });
  check('plan: invalid specs throw a readable error (nothing to apply); warnings for a clip past its source end and for Time Remap', () => {
    const v = base();
    assert.throws(() => planClipTiming(v, FPS, { speed: 0 }), /between/);
    assert.throws(() => planClipTiming(v, FPS, { speed: -1 }), /reversed/);
    assert.throws(() => planClipTiming(v, FPS, { endFrame: 50, durationFrames: 10 }), /only one/);
    assert.throws(() => planClipTiming(v, FPS, { startFrame: 50, endFrame: 50 }), /at least 1/);
    assert.throws(() => planClipTiming(v, FPS, { startFrame: -3 }), /0 or more/);
    assert.throws(() => planClipTiming(v, FPS, { sourceStart: 12 }), /past the end/);
    assert.throws(() => planClipTiming(v, FPS, { startFrame: 'x' }), /finite number/);
    assert.throws(() => planClipTiming(v, FPS, { sourceStart: 2, sourceEnd: 1 }), /after the source start/);
    const long = planClipTiming(v, FPS, { sourceStart: 9, durationFrames: 60 });
    assert.match(long.warnings.join(' '), /past the end of its source.*holds for about 30 frames/);
    const remapped = planClipTiming({ ...v, video: { ...v.video, timeRemap: { id: 'r', name: 'Time Remap', valueType: 'number', defaultValue: 0, keyframes: [] } } }, FPS, { speed: 2 });
    assert.match(remapped.warnings.join(' '), /Time Remap/);
  });

  // ---------- keyframes follow the clip ----------
  check('shiftLayerKeyframes: every keyframe (transform, effect, Time Remap) moves by the shift; generator frame fields stay', () => {
    const v = base();
    v.transform.opacity.keyframes = [{ frame: 0, value: 0, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] }, { frame: 10, value: 1, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] }];
    v.video.timeRemap = { id: 'r', name: 'Time Remap', valueType: 'number', defaultValue: 0, keyframes: [{ frame: 0, value: 0, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] }] };
    v.someGenerator = { startFrame: 5 };
    const s = shiftLayerKeyframes(v, 114);
    assert.deepEqual(s.transform.opacity.keyframes.map((k) => k.frame), [114, 124]);
    assert.deepEqual(s.video.timeRemap.keyframes.map((k) => k.frame), [114]);
    assert.equal(s.someGenerator.startFrame, 5);
    assert.deepEqual(v.transform.opacity.keyframes.map((k) => k.frame), [0, 10], 'input untouched');
    assert.equal(shiftLayerKeyframes(v, 0), v);
    assert.equal(planClipTiming(v, FPS, { startFrame: 114 }).keyframeShift, 114);
    assert.equal(planClipTiming(v, FPS, { startFrame: 114, moveKeyframes: false }).keyframeShift, 0);
  });

  // ---------- track magnetism ----------
  check('withTrackCompression: explicit on / off; off moves nothing; unknown id or same value returns the same comp', () => {
    const c = comp0();
    const t = makeTrack('video track', 'video', 0);
    c.tracks = [t]; c.layers = [video('A', t.id, 0, 60), video('B', t.id, 60, 60)];
    const off = withTrackCompression(c, t.id, false);
    assert.equal(off.tracks[0].compressed, false);
    assert.deepEqual(settle(off).layers.map((l) => l.inPoint), [0, 60]);
    assert.equal(withTrackCompression(off, t.id, false), off);
    assert.equal(withTrackCompression(c, 'nope', false), c);
    const gapped = { ...off, layers: [off.layers[0], { ...off.layers[1], inPoint: 200, outPoint: 260 }] };
    assert.deepEqual(settle(withTrackCompression(gapped, t.id, true)).layers.map((l) => l.inPoint), [0, 60], 'on = packed again');
  });

  // ---------- track matte over video with a matte created after it ----------
  check('placeMatteAbove: a shape created after a video (landing on a track BELOW it) becomes the layer directly above; resolveFrame pairs the matte to it', () => {
    const c = comp0();
    const tTop = makeTrack('video track', 'video', 0); const tLow = makeTrack('mixed', 'mixed', 1);
    const vid = video('fire', tTop.id, 0, 90);
    const other = video('other', tTop.id, 90, 60);
    const card = createRectangleLayer('card', 540, 960, 600, 600, [1, 1, 1, 1], 300); card.trackId = tLow.id;
    c.tracks = [tTop, tLow]; c.layers = [vid, other, card];
    assert.notEqual(layerDirectlyAbove(c, vid.id)?.id, card.id, 'before: the card is below the video');
    const placed = placeMatteAbove(c, vid.id, card.id, makeTrack, trackTypeOf);
    assert.equal(layerDirectlyAbove(placed, vid.id).id, card.id);
    const s = settle(placed);
    assert.deepEqual([s.layers.find((l) => l.id === vid.id).inPoint, s.layers.find((l) => l.id === other.id).inPoint], [0, 90], 'no clip changes time');
    const withMatte = { ...s, layers: s.layers.map((l) => (l.id === vid.id ? { ...l, trackMatte: 'alpha' } : l)) };
    const r = resolveFrame(withMatte, 10);
    assert.equal(r.layers.find((l) => l.id === vid.id).matte?.sourceId, card.id);
    assert.equal(r.layers.find((l) => l.id === card.id).consumedAsMatte, true);
    assert.equal(placeMatteAbove(s, vid.id, vid.id, makeTrack, trackTypeOf), null);
    assert.equal(placeMatteAbove(placed, vid.id, card.id, makeTrack, trackTypeOf), placed, 'already above: unchanged');
  });
  check('renderOrder (trackPlacement) is the order resolveFrame draws in (one comparator)', () => {
    const c = comp0();
    const t0 = makeTrack('a', 'mixed', 0); const t1 = makeTrack('b', 'mixed', 1); const t2 = makeTrack('c', 'mixed', 2);
    const mk = (n, t, i) => { const r = createRectangleLayer(n, 0, 0, 10, 10, [1, 1, 1, 1], 300); r.trackId = t.id; r.inPoint = i; r.outPoint = 300; return r; };
    c.tracks = [t0, t1, t2]; c.layers = [mk('x', t0, 0), mk('y', t2, 5), mk('z', t1, 0), mk('w', t2, 0), mk('v', t0, 3)];
    const nameOf = new Map(c.layers.map((l) => [l.id, l.name]));
    assert.deepEqual(resolveFrame(c, 20).layers.map((l) => nameOf.get(l.id)), renderOrder(c.layers, c.tracks).map((l) => l.name));
    assert.deepEqual(renderOrder(c.layers, c.tracks).map((l) => l.name), ['w', 'y', 'z', 'x', 'v']);
  });

  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
