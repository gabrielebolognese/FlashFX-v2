import type { AudioLayer, Composition, Layer, Track, TrackType, VideoLayer } from './types';
import { isTrackCompressed } from './trackCompression';

// B65: pure track-order / placement helpers for agent video timing and track mattes.
//
// Render order: tracks with a HIGHER `order` draw first (lower in the stack); a track with a lower order
// is above. Clips on one track stack by in-point. resolveFrame sorts with compareRenderOrder (single
// source), and a track matte pairs a layer with the NEXT layer in that bottom-to-top order
// (core/trackMatte.ts), so "the layer directly above" is a property of this order.

/** Bottom-to-top render-order comparator (resolveFrame's struct cache sorts with it). */
export function compareRenderOrder(trackOrder: ReadonlyMap<string, number>) {
  return (a: Layer, b: Layer): number => {
    const orderA = a.trackId ? (trackOrder.get(a.trackId) ?? 0) : 0;
    const orderB = b.trackId ? (trackOrder.get(b.trackId) ?? 0) : 0;
    if (orderA !== orderB) return orderB - orderA;
    return a.inPoint - b.inPoint;
  };
}

/** The layers bottom-to-top, as resolveFrame stacks them. */
export function renderOrder(layers: readonly Layer[], tracks: readonly Track[]): Layer[] {
  return [...layers].sort(compareRenderOrder(new Map(tracks.map((t) => [t.id, t.order]))));
}

/** The layer a track matte on `layerId` would use today (the next layer above it), or null. */
export function layerDirectlyAbove(comp: Pick<Composition, 'layers' | 'tracks'>, layerId: string): Layer | null {
  const ordered = renderOrder(comp.layers, comp.tracks);
  const i = ordered.findIndex((l) => l.id === layerId);
  return i >= 0 && i + 1 < ordered.length ? ordered[i + 1] : null;
}

/** Builds a new track (the store passes its own createTrack: id, name, type defaults). */
export type TrackFactory = (name: string, type: TrackType, order: number) => Track;

/**
 * Re-stack so `matteId` is the layer directly above `mattedId` (so a track matte on `mattedId` uses it).
 * The matte layer moves onto a NEW track just above the matted layer's track; when the matted layer
 * shares its track with clips that would sit between them in the stack (later in-points), the matted
 * layer gets its own new track at the same height first. New tracks are absolute (compressed: false), so
 * no clip changes time. Track orders may be fractional here: the store's settle pass renumbers them.
 * Returns the composition unchanged when the matte is already directly above, null when either id is
 * missing or they are the same layer.
 */
export function placeMatteAbove(
  comp: Composition,
  mattedId: string,
  matteId: string,
  makeTrack: TrackFactory,
  trackTypeOf: (layer: Layer) => TrackType,
): Composition | null {
  if (mattedId === matteId) return null;
  const matted = comp.layers.find((l) => l.id === mattedId);
  const matte = comp.layers.find((l) => l.id === matteId);
  if (!matted || !matte) return null;
  if (layerDirectlyAbove(comp, mattedId)?.id === matteId) return comp;

  const tracks = comp.tracks.slice();
  let layers = comp.layers.slice();
  const orderOf = (trackId: string | null): number => (trackId ? (tracks.find((t) => t.id === trackId)?.order ?? 0) : 0);
  const absolute = (t: Track): Track => ({ ...t, compressed: false });

  // Tracks a layer leaves become absolute first, so a magnetic track does not re-pack the clips that stay.
  const pinTrack = (trackId: string | null): void => {
    const idx = trackId ? tracks.findIndex((t) => t.id === trackId) : -1;
    if (idx >= 0 && isTrackCompressed(tracks[idx])) tracks[idx] = absolute(tracks[idx]);
  };
  pinTrack(matte.trackId);

  // 1. The matted layer alone on its track (same height), unless it already is.
  let mattedTrackId = matted.trackId;
  const mattedOrder = orderOf(mattedTrackId);
  const sharesTrack = !mattedTrackId || layers.some((l) => l.id !== mattedId && l.id !== matteId && l.trackId === mattedTrackId);
  if (sharesTrack) {
    pinTrack(mattedTrackId);
    const own = absolute(makeTrack(`${matted.type} track`, trackTypeOf(matted), mattedOrder - 0.25));
    tracks.push(own);
    mattedTrackId = own.id;
    layers = layers.map((l) => (l.id === mattedId ? ({ ...l, trackId: own.id } as Layer) : l));
  } else {
    // Its own track already: make sure a magnetic track cannot re-time it when the matte leaves.
    pinTrack(mattedTrackId);
  }

  // 2. The matte on a new track directly above the matted layer's track.
  const below = sharesTrack ? mattedOrder - 0.25 : mattedOrder;
  const matteTrack = absolute(makeTrack(`${matte.type} track`, trackTypeOf(matte), below - 0.5));
  tracks.push(matteTrack);
  layers = layers.map((l) => (l.id === matteId ? ({ ...l, trackId: matteTrack.id } as Layer) : l));
  return { ...comp, tracks, layers };
}

/** Set a track's magnetism (compressed = clips packed gaplessly from frame 0). Unknown id = unchanged. */
export function withTrackCompression(comp: Composition, trackId: string, compressed: boolean): Composition {
  const track = comp.tracks.find((t) => t.id === trackId);
  if (!track || (isTrackCompressed(track) === compressed && track.compressed === compressed)) return comp;
  return { ...comp, tracks: comp.tracks.map((t) => (t.id === trackId ? { ...t, compressed } : t)) };
}

// ---------------------------------------------------------------------------------------------------------
// Exact clip placement (agent.setClipTiming, editor.moveClipInTime). Video tracks are magnetic by default
// (core/trackCompression.ts): settleComposition packs their clips gaplessly from frame 0, so a clip slid to
// frame 114 snaps back to 0 and every later edit re-packs clips timed by hand. An exact placement turns the
// clip's track absolute first (nothing moves: a settled magnetic track is already packed, so every clip keeps
// its current frames) and then puts the clip at the asked frames.

export interface PinResult {
  comp: Composition;
  /** The track the clip ends up on. */
  trackId: string | null;
  /** The clip overlapped a neighbour on its own track, so it moved onto a new track directly above. */
  movedToNewTrack: boolean;
  /** The clip's track was magnetic and is now absolute. */
  unpinnedTrack: boolean;
}

/**
 * Place `layerId` at exactly [inPoint, outPoint). A magnetic track becomes absolute (no clip changes time);
 * when the new range overlaps another clip on the same track, the clip moves onto a new absolute track
 * directly above its track (same stacking neighbourhood, nobody else moves). Track orders may be fractional
 * here: the store's settle pass renumbers them. Null when the layer is missing.
 */
export function pinClipToTime(
  comp: Composition,
  layerId: string,
  inPoint: number,
  outPoint: number,
  makeTrack: TrackFactory,
  trackTypeOf: (layer: Layer) => TrackType,
): PinResult | null {
  const layer = comp.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const tracks = comp.tracks.slice();
  let trackId = layer.trackId;
  let unpinnedTrack = false;
  let movedToNewTrack = false;
  const idx = trackId ? tracks.findIndex((t) => t.id === trackId) : -1;
  if (idx >= 0 && isTrackCompressed(tracks[idx])) {
    tracks[idx] = { ...tracks[idx], compressed: false };
    unpinnedTrack = true;
  }
  if (idx >= 0) {
    const overlaps = comp.layers.some((l) => l.id !== layerId && l.trackId === trackId && inPoint < l.outPoint && l.inPoint < outPoint);
    if (overlaps) {
      const own: Track = { ...makeTrack(`${layer.type} track`, trackTypeOf(layer), tracks[idx].order - 0.5), compressed: false };
      tracks.push(own);
      trackId = own.id;
      movedToNewTrack = true;
    }
  }
  const layers = comp.layers.map((l) => (l.id === layerId ? ({ ...l, inPoint, outPoint, trackId } as Layer) : l));
  return { comp: { ...comp, tracks, layers }, trackId, movedToNewTrack, unpinnedTrack };
}

/**
 * Shift every keyframe of a layer by `delta` frames (keyframe frames are absolute comp frames, so moving a
 * clip leaves its animation behind unless it is shifted with it, as After Effects does). Walks the whole
 * layer: every `keyframes` / `keyframesX` / `keyframesY` / `pathKeyframes` array of `{ frame }` objects,
 * including Time Remap. Frame fields of generators (a text counter's startFrame, recipe settings) are not
 * keyframes and stay put. Frames are not clamped, so the animation keeps its exact shape.
 */
export function shiftLayerKeyframes<T>(layer: T, delta: number): T {
  if (!delta) return layer;
  const KEY_ARRAYS = new Set(['keyframes', 'keyframesX', 'keyframesY', 'pathKeyframes']);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (KEY_ARRAYS.has(k) && Array.isArray(v)) {
        out[k] = v.map((kf) => (kf && typeof kf === 'object' && typeof (kf as { frame?: unknown }).frame === 'number'
          ? walk({ ...(kf as object), frame: (kf as { frame: number }).frame + delta })
          : walk(kf)));
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  };
  return walk(layer) as T;
}

/** What agent.setClipTiming accepts. Frames are comp frames; source times are seconds of the source file. */
export interface ClipTimingSpec {
  /** Comp frame the clip starts at (its in-point). */
  startFrame?: number;
  /** Comp frame the clip ends at (exclusive out-point). */
  endFrame?: number;
  /** Clip length in comp frames (instead of endFrame). */
  durationFrames?: number;
  /** Video / audio: the source second shown at the in-point (trims the head of the source). */
  sourceStart?: number;
  /** Video / audio: the source second at the out-point (sets the length from the source range). */
  sourceEnd?: number;
  /** Video: playback speed (1 = normal, 2 = twice as fast, 0.5 = slow motion). */
  speed?: number;
  /** Video: play the source range backwards. */
  reversed?: boolean;
  /** Move the layer's keyframes with the clip when its start moves (default true). */
  moveKeyframes?: boolean;
}

export interface ClipTimingPlan {
  inPoint: number;
  outPoint: number;
  /** Video / audio only. */
  startOffset?: number;
  playbackRate?: number;
  reversed?: boolean;
  /** Video / audio: the source range the clip plays, in seconds. */
  sourceStart?: number;
  sourceEnd?: number;
  sourceDuration?: number;
  /** Keyframe shift that follows the clip (0 = none). */
  keyframeShift: number;
  warnings: string[];
}

export const CLIP_SPEED_MIN = 0.01;
export const CLIP_SPEED_MAX = 100;

/**
 * Pure: the timing fields a clip gets from a spec. Unset fields keep the clip's current values; when only the
 * speed changes, the clip keeps its source range (its length scales by old / new speed) and its first source
 * frame. Source mapping (core/timeRemap.ts linearSourceSeconds): source seconds at comp frame f =
 * (f - inPoint + startOffset) / compFps * playbackRate, so startOffset = sourceStart * compFps / speed.
 * Reversed plays the same source range backwards (the in-point shows sourceEnd).
 * Throws a readable error on an invalid spec; nothing is applied then.
 */
export function planClipTiming(layer: Layer, compFps: number, spec: ClipTimingSpec): ClipTimingPlan {
  const fps = compFps > 0 ? compFps : 30;
  const isVideo = layer.type === 'video';
  const isAudio = layer.type === 'audio';
  const num = (v: unknown, label: string): number | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${label}" must be a finite number`);
    return v;
  };
  const startFrame = num(spec.startFrame, 'startFrame');
  const endFrame = num(spec.endFrame, 'endFrame');
  const durationFrames = num(spec.durationFrames, 'durationFrames');
  const sourceStartIn = num(spec.sourceStart, 'sourceStart');
  const sourceEndIn = num(spec.sourceEnd, 'sourceEnd');
  const speedIn = num(spec.speed, 'speed');
  const reversedIn = spec.reversed === null ? undefined : spec.reversed;
  if (reversedIn !== undefined && typeof reversedIn !== 'boolean') throw new Error('"reversed" must be true or false');
  if (spec.moveKeyframes !== undefined && spec.moveKeyframes !== null && typeof spec.moveKeyframes !== 'boolean') throw new Error('"moveKeyframes" must be true or false');
  if (startFrame !== undefined && startFrame < 0) throw new Error('"startFrame" must be 0 or more');
  if ([endFrame, durationFrames, sourceEndIn].filter((v) => v !== undefined).length > 1) throw new Error('pass only one of "endFrame", "durationFrames" or "sourceEnd"');
  if (!isVideo && !isAudio && (sourceStartIn !== undefined || sourceEndIn !== undefined)) throw new Error(`"sourceStart" / "sourceEnd" need a video or audio layer (this is a ${layer.type} layer)`);
  if (!isVideo && (speedIn !== undefined || reversedIn !== undefined)) throw new Error(`"speed" / "reversed" need a video layer (this is a ${layer.type} layer)`);
  if (speedIn !== undefined && !(speedIn >= CLIP_SPEED_MIN && speedIn <= CLIP_SPEED_MAX)) throw new Error(`"speed" must be between ${CLIP_SPEED_MIN} and ${CLIP_SPEED_MAX} (use "reversed": true to play backwards)`);
  if (sourceStartIn !== undefined && sourceStartIn < 0) throw new Error('"sourceStart" must be 0 or more seconds');

  const warnings: string[] = [];
  const inPoint = Math.round(startFrame ?? layer.inPoint);
  const oldDuration = Math.max(1, layer.outPoint - layer.inPoint);
  const video = isVideo ? (layer as VideoLayer).video : null;
  const audio = isAudio ? (layer as AudioLayer).audio : null;
  const oldRate = video ? (video.playbackRate > 0 ? video.playbackRate : 1) : 1;
  const rate = speedIn ?? oldRate;
  const oldOffset = video ? video.startOffset : audio ? audio.startOffset : 0;
  const sourceStart = sourceStartIn ?? Math.max(0, (oldOffset / fps) * oldRate);

  let duration: number;
  if (endFrame !== undefined) duration = Math.round(endFrame) - inPoint;
  else if (durationFrames !== undefined) duration = Math.round(durationFrames);
  else if (sourceEndIn !== undefined) {
    if (sourceEndIn <= sourceStart) throw new Error(`"sourceEnd" (${sourceEndIn}) must be after the source start (${sourceStart})`);
    duration = Math.round(((sourceEndIn - sourceStart) / rate) * fps);
  } else if (speedIn !== undefined && speedIn !== oldRate) duration = Math.round((oldDuration * oldRate) / rate);
  else duration = oldDuration;
  if (!(duration >= 1)) throw new Error(`the clip would be ${duration} frames long; it needs at least 1 (check endFrame / durationFrames / sourceEnd)`);

  const plan: ClipTimingPlan = { inPoint, outPoint: inPoint + duration, keyframeShift: spec.moveKeyframes === false ? 0 : inPoint - layer.inPoint, warnings };
  if (video || audio) {
    const total = video ? video.sourceDuration : audio ? audio.sourceDuration : 0;
    if (total > 0 && sourceStart >= total) throw new Error(`"sourceStart" (${sourceStart} s) is past the end of the source (${round3(total)} s)`);
    plan.startOffset = (sourceStart * fps) / rate;
    plan.sourceStart = sourceStart;
    plan.sourceEnd = sourceStart + (duration / fps) * rate;
    plan.sourceDuration = total;
    if (total > 0 && plan.sourceEnd > total + 1e-6) {
      warnings.push(`the clip runs past the end of its source (${round3(plan.sourceEnd)} s of ${round3(total)} s): the last frame holds for about ${Math.round(((plan.sourceEnd - total) / rate) * fps)} frames`);
    }
  }
  if (video) {
    plan.playbackRate = rate;
    plan.reversed = reversedIn ?? !!video.reversed;
    if (video.timeRemap && (speedIn !== undefined || sourceStartIn !== undefined || reversedIn !== undefined)) {
      warnings.push('this clip has Time Remap, which overrides speed / sourceStart / reversed; remove it with editor.updateLayerProperty(layerId, "video.timeRemap", null) to use them');
    }
    if (video.freezeSourceFrame != null && !video.timeRemap) warnings.push(`this clip is frozen on source frame ${video.freezeSourceFrame}; clear "video.freezeSourceFrame" to play it`);
  }
  return plan;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
