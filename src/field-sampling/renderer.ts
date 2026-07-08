import type { FieldSampledConfig, PathFieldDef } from './types';
import { rasterizeField } from './fields';
import { generateSamples } from './samplers';
import { renderMarks } from './marks';

interface RendererEntry {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  configHash: string;
  lastRenderedFrame: number;
  cachedResult: OffscreenCanvas | null;
  sdfCacheHash: string;
  sdfGrid: { data: Float32Array; width: number; height: number } | null;
}

const FRAME_SKIP = 2; // Only re-render every N frames during playback for performance

class FieldSampledRendererManager {
  private entries: Map<string, RendererEntry> = new Map();

  renderFieldLayer(
    layerId: string,
    configJSON: string,
    localFrame: number,
    fps: number,
    width: number,
    height: number,
  ): OffscreenCanvas | null {
    let config: FieldSampledConfig;
    try {
      config = JSON.parse(configJSON);
    } catch {
      return null;
    }

    let entry = this.entries.get(layerId);
    if (!entry || entry.canvas.width !== width || entry.canvas.height !== height) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      entry = {
        canvas,
        ctx,
        configHash: '',
        lastRenderedFrame: -999,
        cachedResult: null,
        sdfCacheHash: '',
        sdfGrid: null,
      };
      this.entries.set(layerId, entry);
    }

    // Check if we can return cached frame (frame skipping during playback)
    const frameDelta = Math.abs(localFrame - entry.lastRenderedFrame);
    if (frameDelta < FRAME_SKIP && entry.cachedResult && entry.configHash === configJSON) {
      return entry.cachedResult;
    }

    const time = localFrame / fps;
    const fieldW = Math.min(config.canvasWidth || width, 256);
    const fieldH = Math.min(config.canvasHeight || height, 256);

    // Cache SDF: only regenerate when field config changes (not per frame for static fields)
    const fieldHash = this.getFieldHash(config);
    const needsSdfRegen = entry.sdfCacheHash !== fieldHash || !entry.sdfGrid;
    const isAnimatedField = config.field.type === 'noise' && config.animation.noiseEvolution > 0;

    let grid: { data: Float32Array; width: number; height: number };
    if (needsSdfRegen || isAnimatedField) {
      grid = rasterizeField(config.field, fieldW, fieldH, time);
      if (!isAnimatedField) {
        entry.sdfGrid = grid;
        entry.sdfCacheHash = fieldHash;
      }
    } else {
      grid = entry.sdfGrid!;
    }

    const pathDef = config.field.type === 'path' ? config.field as PathFieldDef : undefined;
    const samples = generateSamples(grid, config.sampler, time, pathDef);

    renderMarks(entry.ctx, samples, config.mark, config.sampler, width, height);

    entry.configHash = configJSON;
    entry.lastRenderedFrame = localFrame;
    entry.cachedResult = entry.canvas;

    return entry.canvas;
  }

  removeLayer(layerId: string) {
    this.entries.delete(layerId);
  }

  clear() {
    this.entries.clear();
  }

  private getFieldHash(config: FieldSampledConfig): string {
    const f = config.field;
    if (f.type === 'glyph') return `g:${f.text}:${f.fontSize}:${f.fontFamily}:${f.fontWeight}`;
    if (f.type === 'path') return `p:${f.points.length}:${f.smoothing}:${f.closed}`;
    if (f.type === 'noise') return `n:${f.scale}:${f.octaves}:${f.seed}:${f.threshold}`;
    return 'composite';
  }
}

export const fieldSampledRenderer = new FieldSampledRendererManager();
