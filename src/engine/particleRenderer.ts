import { ParticleEngine } from '../particles/engine';
import type { EmitterConfig } from '../particles/types';

const FRAME_RATE = 30;

class ParticleRendererManager {
  private engines: Map<string, { engine: ParticleEngine; configHash: string; canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }> = new Map();

  renderParticleLayer(
    layerId: string,
    emitterConfigJSON: string,
    seed: number,
    localFrame: number,
    width: number,
    height: number,
  ): OffscreenCanvas | null {
    let entry = this.engines.get(layerId);

    if (!entry || entry.configHash !== emitterConfigJSON) {
      let config: EmitterConfig;
      try {
        config = JSON.parse(emitterConfigJSON);
      } catch {
        return null;
      }

      const engine = new ParticleEngine(config, seed, FRAME_RATE);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      entry = { engine, configHash: emitterConfigJSON, canvas, ctx };
      this.engines.set(layerId, entry);
    }

    if (entry.canvas.width !== width || entry.canvas.height !== height) {
      entry.canvas.width = width;
      entry.canvas.height = height;
    }

    entry.engine.seekToFrame(localFrame);
    entry.engine.render(entry.ctx, width, height, width / 2, height / 2);

    return entry.canvas;
  }

  removeLayer(layerId: string) {
    this.engines.delete(layerId);
  }

  clear() {
    this.engines.clear();
  }
}

export const particleRenderer = new ParticleRendererManager();
