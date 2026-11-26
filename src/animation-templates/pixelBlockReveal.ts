// B54 - the agent-facing pixel-block reveal: builds the blocks mask (Mask.blocks, rendered per pixel by
// the mask WGSL, see core/pixelBlocks.ts) with its progress keys. Pure: the runtime appends the mask to
// the layer as ONE undo step. The mask combines by 'intersect', so it multiplies whatever the layer's
// other masks already show (alone, it starts from the full layer and shows only the visible blocks).

import { createMask, uid } from '../core/factory';
import type { Mask, PixelBlockOrder } from '../core/types';
import { normalizeBlockParams, pixelBlockProgressProperty } from '../core/pixelBlocks';

export interface PixelBlockRevealOptions {
  /** Block grid region (comp px, top-left origin): usually the layer's bounds. */
  region: { x: number; y: number; width: number; height: number };
  direction: 'in' | 'out';
  startFrame: number;
  durationFrames: number;
  blockSize?: number;
  order?: PixelBlockOrder;
  angle?: number;
  jitter?: number;
  seed?: number;
  /** Frames per progress step (1 = a new batch every frame; 2 = on twos). */
  stepFrames?: number;
  name?: string;
}

export function buildPixelBlockMask(opts: PixelBlockRevealOptions): Mask {
  const r = opts.region;
  // Whole pixels: the grid starts at the region's top-left corner, so integer corners keep the block
  // edges on pixel boundaries (crisp 8-bit squares).
  const x0 = Math.round(r.x), y0 = Math.round(r.y);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const params = normalizeBlockParams({
    size: opts.blockSize, seed: opts.seed, order: opts.order, angle: opts.angle, jitter: opts.jitter, direction: opts.direction,
  });
  params.size = Math.max(1, Math.round(params.size));
  const mask = createMask('rectangle', x0 + w / 2, y0 + h / 2, w, h);
  mask.name = opts.name ?? `Pixel blocks ${params.direction}`;
  mask.mode = 'intersect';
  mask.blocks = {
    ...params,
    progress: pixelBlockProgressProperty(uid(), { startFrame: opts.startFrame, durationFrames: opts.durationFrames, stepFrames: opts.stepFrames }),
  };
  return mask;
}
