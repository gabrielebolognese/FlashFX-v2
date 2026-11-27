// Acceptance harness for B84: track placement keeps new and re-timed layers on top of what is visible at their time.
//   - findStackFit (core/trackPlacement.ts, used by the store's ensureLayerHasTrack): a NEW layer reuses a free track
//     only above every track holding a clip that overlaps its range (the lowest such track, so sequential shots still
//     pack); otherwise the caller creates a new top track. The old first fit took the top-most free track, which could
//     sit under a later shot's ground.
//   - pinClipToTime(..., { restackOnJump: true }) (agent.setClipTiming): a clip that jumps to a range disjoint from
//     its old one is re-dropped on top of what is visible there; a trim / nudge keeps its track (old behaviour).
// Pure node (esbuild bundle of the real TS). The store wiring and real pixels: gpu:track-stack through the MCP.
//   node scripts/verify-track-stack.mjs   (or: npm run verify:track-stack)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'track-stack-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { findStackFit, pinClipToTime, renderOrder } from './src/core/trackPlacement';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createAudioLayer } from './src/core/factory';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { findStackFit, pinClipToTime, renderOrder, resolveFrame, createComposition, createRectangleLayer, createAudioLayer } = await import(pathToFileURL(outfile).href);
  console.log('verify:track-stack');

  let seq = 0;
  const track = (type, order, extra = {}) => ({ id: `T${++seq}-${type}`, name: `${type} track`, type, order, locked: false, visible: true, ...extra });
  const clip = (name, trackId, inPoint, outPoint, type = 'shape') => {
    const l = type === 'audio' ? createAudioLayer(name, `asset-${name}`, 10, outPoint - inPoint) : createRectangleLayer(name, 960, 540, 200, 200, [1, 1, 1, 1], outPoint - inPoint);
    l.id = name; l.inPoint = inPoint; l.outPoint = outPoint; l.trackId = trackId;
    return l;
  };
  const acceptsShape = (t) => t.type === 'shape' || t.type === 'mixed';
  const acceptsAudio = (t) => t.type === 'audio';
  // The pre-B84 rule, verbatim from the store's findFirstFit: the top-most (smallest order) accepted free track.
  const oldFirstFit = (layers, tracks, inPoint, outPoint, accepts) => [...tracks].filter(accepts).sort((a, b) => a.order - b.order)
    .find((t) => !layers.some((l) => l.trackId === t.id && inPoint < l.outPoint && l.inPoint < outPoint))?.id ?? null;
  const above = (tracks, a, b) => tracks.find((t) => t.id === a).order < tracks.find((t) => t.id === b).order;
  const makeTrack = (name, type, order) => track(type, order);
  const trackTypeOf = (l) => (l.type === 'audio' ? 'audio' : l.type === 'video' ? 'video' : 'shape');

  // Shot 1 (f0-120): a dot on the top shape track. Shot 2 (f150-270): its full-frame ground on a NEWER track that
  // sits above the dot's; the dot's track has room at f150-270.
  const scene = () => {
    seq = 0;
    const tDot = track('shape', 1), tGround = track('shape', 0);
    return { tracks: [tGround, tDot], layers: [clip('dot', tDot.id, 0, 120), clip('ground2', tGround.id, 150, 270)], tDot, tGround };
  };

  check('repro: the old first fit drops a new shot-2 layer onto the dot track, UNDER the shot-2 ground', () => {
    const { tracks, layers, tDot, tGround } = scene();
    // the ground's track is busy at f150-270, so the old rule takes the next free one: the dot's (below the ground)
    assert.equal(oldFirstFit(layers, tracks, 150, 270, acceptsShape), tDot.id);
    assert.ok(above(tracks, tGround.id, tDot.id));
  });
  check('findStackFit: the same new layer gets no track below the ground (null = the store creates a new top track)', () => {
    const { tracks, layers } = scene();
    assert.equal(findStackFit(layers, tracks, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape), null);
  });
  check('findStackFit: a free track ABOVE the overlapping clips is reused, the lowest such one', () => {
    const { tracks, layers, tGround } = scene();
    const tHigh = track('shape', -2), tMid = track('shape', -1);
    const all = [...tracks, tHigh, tMid];
    assert.equal(findStackFit(layers, all, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape), tMid.id);
    assert.ok(above(all, tMid.id, tGround.id));
  });
  check('findStackFit: sequential shots pack - with nothing visible in the range it takes the LOWEST free track', () => {
    seq = 0;
    const t0 = track('shape', 0), t1 = track('shape', 1), t2 = track('shape', 2);
    const layers = [clip('g1', t2.id, 0, 120), clip('txt1', t1.id, 0, 120), clip('dot1', t0.id, 0, 120)];
    const tracks = [t0, t1, t2];
    // shot 2 built back to front: ground -> t2, text -> t1 (above the ground), dot -> t0 (above the text); no new tracks
    const g2 = findStackFit(layers, tracks, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape);
    assert.equal(g2, t2.id); layers.push(clip('g2', g2, 150, 270));
    const x2 = findStackFit(layers, tracks, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape);
    assert.equal(x2, t1.id); layers.push(clip('txt2', x2, 150, 270));
    const d2 = findStackFit(layers, tracks, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape);
    assert.equal(d2, t0.id); layers.push(clip('dot2', d2, 150, 270));
    assert.equal(findStackFit(layers, tracks, { inPoint: 150, outPoint: 270, audio: false }, acceptsShape), null, 'a 4th layer needs a new top track');
    const order = renderOrder(layers, tracks).map((l) => l.id).filter((id) => id.endsWith('2'));
    assert.deepEqual(order, ['g2', 'txt2', 'dot2'], 'bottom to top = creation order');
  });
  check('findStackFit: track types still segregate (a text track is never offered to a shape) and mixed tracks are accepted', () => {
    seq = 0;
    const tText = track('text', -1), tMixed = track('mixed', -3), tShape = track('shape', 0);
    const layers = [clip('g', tShape.id, 0, 100)];
    assert.equal(findStackFit(layers, [tText, tMixed, tShape], { inPoint: 0, outPoint: 100, audio: false }, acceptsShape), tMixed.id);
  });
  check('audio keeps the old first fit and is never pushed off a free audio track by visual clips (and vice versa)', () => {
    seq = 0;
    const tV = track('shape', 0), tA1 = track('audio', 1), tA2 = track('audio', 2);
    const layers = [clip('ground', tV.id, 0, 300), clip('music', tA1.id, 0, 100, 'audio')];
    // audio keeps the old first fit (the top-most free audio track): stacking means nothing for clips that never draw
    assert.equal(findStackFit(layers, [tV, tA1, tA2], { inPoint: 50, outPoint: 150, audio: true }, acceptsAudio), tA2.id);
    assert.equal(findStackFit(layers, [tV, tA1, tA2], { inPoint: 120, outPoint: 200, audio: true }, acceptsAudio), tA1.id);
    assert.equal(findStackFit([clip('music', tA1.id, 0, 300, 'audio')], [tV, tA1], { inPoint: 0, outPoint: 100, audio: false }, acceptsShape), tV.id);
  });

  // ---------- agent.setClipTiming: re-drop on a jump ----------
  const comp = (tracks, layers) => ({ ...createComposition('c', { width: 1920, height: 1080, frameRate: 30, durationFrames: 300, backgroundColor: [0, 0, 0, 1] }), tracks, layers });
  check('repro: without restackOnJump a clip timed into shot 2 keeps its old track and renders UNDER the ground', () => {
    const { tracks, layers } = scene();
    const r = pinClipToTime(comp(tracks, layers), 'dot', 160, 200, makeTrack, trackTypeOf);
    const ids = resolveFrame(r.comp, 180).layers.map((l) => l.id);
    assert.deepEqual(ids, ['dot', 'ground2'], `bottom to top ${ids}`);
  });
  check('restackOnJump: the jumped clip lands on a new top track and renders ABOVE the ground; one result flag', () => {
    const { tracks, layers, tDot } = scene();
    const r = pinClipToTime(comp(tracks, layers), 'dot', 160, 200, makeTrack, trackTypeOf, { restackOnJump: true });
    assert.equal(r.restacked, true); assert.equal(r.movedToNewTrack, true); assert.notEqual(r.trackId, tDot.id);
    const ids = resolveFrame(r.comp, 180).layers.map((l) => l.id);
    assert.deepEqual(ids, ['ground2', 'dot'], `bottom to top ${ids}`);
    const dot = r.comp.layers.find((l) => l.id === 'dot');
    assert.deepEqual([dot.inPoint, dot.outPoint], [160, 200]);
  });
  check('restackOnJump: reuses a free track above the ground instead of adding one', () => {
    const { tracks, layers } = scene();
    const tTop = track('shape', -1);
    const r = pinClipToTime(comp([...tracks, tTop], layers), 'dot', 160, 200, makeTrack, trackTypeOf, { restackOnJump: true });
    assert.equal(r.trackId, tTop.id); assert.equal(r.comp.tracks.length, 3);
  });
  check('restackOnJump: a trim / nudge (ranges overlap) keeps the track exactly as before (byte-identical result)', () => {
    const { tracks, layers } = scene();
    const a = pinClipToTime(comp(tracks, layers), 'dot', 30, 140, makeTrack, trackTypeOf, { restackOnJump: true });
    seq = 100; // fresh track ids in the second run would differ only if a track were created
    const b = pinClipToTime(comp(tracks, layers), 'dot', 30, 140, makeTrack, trackTypeOf);
    assert.equal(a.restacked, undefined);
    assert.equal(JSON.stringify(a.comp.layers), JSON.stringify(b.comp.layers));
    assert.equal(JSON.stringify(a.comp.tracks), JSON.stringify(b.comp.tracks));
  });
  check('restackOnJump: leaving a magnetic track turns it absolute (the clips that stay do not re-pack)', () => {
    seq = 0;
    const tV = track('video', 1, { compressed: true }), tG = track('shape', 0);
    const v1 = clip('v1', tV.id, 0, 60), v2 = clip('v2', tV.id, 60, 120);
    v1.type = 'video'; v2.type = 'video';
    const r = pinClipToTime(comp([tG, tV], [v1, v2, clip('g', tG.id, 200, 300)]), 'v1', 220, 280, makeTrack, trackTypeOf, { restackOnJump: true });
    assert.equal(r.restacked, true); assert.equal(r.unpinnedTrack, true);
    assert.equal(r.comp.tracks.find((t) => t.id === tV.id).compressed, false);
    assert.ok(r.comp.tracks.find((t) => t.id === r.trackId).order < tG.order, 'above the ground');
  });

  check('restackOnJump: when the fit is the clip own magnetic track it stays there, turns absolute and reports it (gpu:clip-timing C)', () => {
    seq = 0;
    const tV = track('video', 0, { compressed: true });
    const c = clip('c', tV.id, 0, 90); c.type = 'video';
    const r = pinClipToTime(comp([tV], [c]), 'c', 150, 195, makeTrack, trackTypeOf, { restackOnJump: true });
    assert.equal(r.trackId, tV.id); assert.equal(r.movedToNewTrack, false); assert.equal(r.restacked, true);
    assert.equal(r.unpinnedTrack, true);
    assert.equal(r.comp.tracks.find((t) => t.id === tV.id).compressed, false);
  });

  console.log(`verify:track-stack: ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
