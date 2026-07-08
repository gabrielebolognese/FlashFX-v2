import type { Composition, Track, Layer } from './types';

// Whether a track lays its clips out gaplessly (CapCut-style). Undefined falls
// back to the type default: video tracks compress, everything else does not.
export function isTrackCompressed(track: Track): boolean {
  return track.compressed ?? track.type === 'video';
}

// Lay out all clips on compressed tracks gaplessly in inPoint order, starting at
// frame 0. Each clip keeps its duration; only its absolute position changes.
// Returns the same composition reference when nothing moved, so callers can rely
// on referential equality to skip downstream work.
export function reflowCompressedTracks(composition: Composition): Composition {
  const compressedTrackIds = new Set<string>();
  for (const track of composition.tracks) {
    if (isTrackCompressed(track)) compressedTrackIds.add(track.id);
  }
  if (compressedTrackIds.size === 0) return composition;

  const byTrack = new Map<string, number[]>();
  composition.layers.forEach((layer, idx) => {
    if (layer.trackId && compressedTrackIds.has(layer.trackId)) {
      const arr = byTrack.get(layer.trackId);
      if (arr) arr.push(idx);
      else byTrack.set(layer.trackId, [idx]);
    }
  });
  if (byTrack.size === 0) return composition;

  let changed = false;
  const nextLayers = composition.layers.slice();

  for (const indices of byTrack.values()) {
    indices.sort((a, b) => {
      const d = composition.layers[a].inPoint - composition.layers[b].inPoint;
      return d !== 0 ? d : a - b;
    });
    let cursor = 0;
    for (const idx of indices) {
      const layer = composition.layers[idx];
      const duration = layer.outPoint - layer.inPoint;
      if (layer.inPoint !== cursor) {
        nextLayers[idx] = { ...layer, inPoint: cursor, outPoint: cursor + duration } as Layer;
        changed = true;
      }
      cursor += duration;
    }
  }

  if (!changed) return composition;
  return { ...composition, layers: nextLayers };
}
