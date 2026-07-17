import type { Composition, Layer, RenderFrame, ResolvedLayer } from '../core/types';
import { resolveLayer, resolveFrame } from '../core/interpolation';
import type { ResolveContext } from '../core/precomp';

export class TimelineEngine {
  private composition: Composition | null = null;
  private resolveContext: ResolveContext | undefined = undefined;

  setComposition(composition: Composition): void {
    this.composition = composition;
  }

  /** Supply the composition-registry lookup so precomp layers resolve their
   *  referenced sub-compositions (see core/precomp ResolveContext). */
  setResolveContext(ctx: ResolveContext | undefined): void {
    this.resolveContext = ctx;
  }

  evaluate(frame: number): RenderFrame | null {
    if (!this.composition) return null;
    return resolveFrame(this.composition, frame, this.resolveContext);
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
