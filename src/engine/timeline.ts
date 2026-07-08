import type { Composition, Layer, RenderFrame, ResolvedLayer } from '../core/types';
import { resolveLayer, resolveFrame } from '../core/interpolation';

export class TimelineEngine {
  private composition: Composition | null = null;

  setComposition(composition: Composition): void {
    this.composition = composition;
  }

  evaluate(frame: number): RenderFrame | null {
    if (!this.composition) return null;
    return resolveFrame(this.composition, frame);
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
