import type { Layer } from './types';
import { applyOverrides, type OverrideMap } from './overrides';

// M13 — Replace Source (AE alt-drag-replace / Illustrator relink): swap a layer's media
// handle while preserving EVERYTHING else (transform, keyframes, effects, masks, timing,
// blend mode, parenting). v1 is SAME-KIND only (image←image, video←video, precomp←precomp);
// cross-kind footage swap would need a layer-type rebuild + re-tracking (future).
//
// Pure: expresses the swap as a dot-path override map fed to core/overrides.ts applyOverrides
// (which deep-clones, so the input is never mutated). Every swapped field is a plain scalar,
// so applyOverrides assigns it directly. Proven by scripts/verify-replacesource.mjs.

export type ReplaceSource =
  | { kind: 'image'; assetId: string; sourceWidth: number; sourceHeight: number; format?: string; fileSize?: number }
  | { kind: 'video'; assetId: string; sourceWidth: number; sourceHeight: number; sourceDuration: number; sourceFrameRate: number }
  | { kind: 'precomp'; compositionId: string };

/** The replace-source kind a layer supports, or null if it has no swappable media handle. */
export function sourceKindForLayer(layer: Layer): ReplaceSource['kind'] | null {
  if (layer.type === 'image') return 'image';
  if (layer.type === 'video') return 'video';
  if (layer.type === 'precomp') return 'precomp';
  return null;
}

/** Extract a portable source descriptor from an image/video/precomp layer (the clipboard path);
 *  null for any other layer type. */
export function sourceFromLayer(layer: Layer): ReplaceSource | null {
  if (layer.type === 'image') {
    const i = layer.image;
    return { kind: 'image', assetId: i.assetId, sourceWidth: i.sourceWidth, sourceHeight: i.sourceHeight, format: i.format, fileSize: i.fileSize };
  }
  if (layer.type === 'video') {
    const v = layer.video;
    return { kind: 'video', assetId: v.assetId, sourceWidth: v.sourceWidth, sourceHeight: v.sourceHeight, sourceDuration: v.sourceDuration, sourceFrameRate: v.sourceFrameRate };
  }
  if (layer.type === 'precomp') return { kind: 'precomp', compositionId: layer.compositionId };
  return null;
}

/** Return a deep clone of `layer` pointing at `source`, preserving all other properties. If the
 *  source kind doesn't match the layer kind, the layer is returned unchanged (same reference). */
export function applyReplaceSource(layer: Layer, source: ReplaceSource): Layer {
  if (sourceKindForLayer(layer) !== source.kind) return layer;
  const map: OverrideMap = {};
  if (source.kind === 'image') {
    map['image.assetId'] = source.assetId;
    map['image.sourceWidth'] = source.sourceWidth;
    map['image.sourceHeight'] = source.sourceHeight;
    if (source.format !== undefined) map['image.format'] = source.format;
    if (source.fileSize !== undefined) map['image.fileSize'] = source.fileSize;
  } else if (source.kind === 'video') {
    map['video.assetId'] = source.assetId;
    map['video.sourceWidth'] = source.sourceWidth;
    map['video.sourceHeight'] = source.sourceHeight;
    map['video.sourceDuration'] = source.sourceDuration;
    map['video.sourceFrameRate'] = source.sourceFrameRate;
  } else {
    map['compositionId'] = source.compositionId;
  }
  return applyOverrides(layer, map);
}
