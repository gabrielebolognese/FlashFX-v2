import type { Composition, Layer, RenderFrame, ResolvedLayer } from '../core/types';
import { resolveLayer, resolveFrame } from '../core/interpolation';
import type { ResolveContext } from '../core/precomp';

// Cap on memoized resolved frames (insertion-order LRU). Bounds memory - each entry is plain resolved
// data (no GPU handles), so ~a few MB for a typical comp; big comps evict sooner but still benefit.
const MAX_CACHED_FRAMES = 500;

export class TimelineEngine {
  private composition: Composition | null = null;
  private resolveContext: ResolveContext | undefined = undefined;
  // Memoized resolved frames keyed by frame number. resolveFrame is a PURE function of
  // (composition, frame, resolveContext), so a cached frame is byte-identical to a fresh resolve until
  // an input changes - and EVERY edit replaces `composition` (immutable store updates) or the ctx, both
  // of which land in the setters below and clear the cache. This turns repeated resolves of the same
  // frame (paused repaints, scrub revisits, loop playback, font/edit re-renders) from a full
  // whole-composition re-resolve into a map lookup. Bounded by MAX_CACHED_FRAMES.
  private frameCache = new Map<number, RenderFrame>();

  setComposition(composition: Composition): void {
    // Called only when a resolve input actually changes (the Viewport effect is keyed on
    // composition + styles; the store's immutable updates give a fresh composition ref per edit), so
    // clearing here invalidates the cache exactly on edits.
    this.composition = composition;
    this.frameCache.clear();
  }

  /** Supply the composition-registry lookup so precomp layers resolve their
   *  referenced sub-compositions (see core/precomp ResolveContext). */
  setResolveContext(ctx: ResolveContext | undefined): void {
    this.resolveContext = ctx;
    this.frameCache.clear();
  }

  evaluate(frame: number): RenderFrame | null {
    if (!this.composition) return null;
    const cached = this.frameCache.get(frame);
    if (cached) {
      this.frameCache.delete(frame); this.frameCache.set(frame, cached); // touch -> most-recently-used
      return cached;
    }
    const resolved = resolveFrame(this.composition, frame, this.resolveContext);
    if (resolved) {
      this.frameCache.set(frame, resolved);
      while (this.frameCache.size > MAX_CACHED_FRAMES) {
        const oldest = this.frameCache.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        this.frameCache.delete(oldest);
      }
    }
    return resolved;
  }

  getActiveLayersAt(frame: number): Layer[] {
    if (!this.composition) return [];
    return this.composition.layers.filter(
      (layer) => layer.visible && frame >= layer.inPoint && frame < layer.outPoint
    );
  }

  getLayerStateAt(layerId: string, frame: number): ResolvedLayer | null {
    if (!this.composition) return null;
    const layer = this.composition.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    return resolveLayer(layer, frame);
  }

  getComposition(): Composition | null {
    return this.composition;
  }
}

export const timelineEngine = new TimelineEngine();
