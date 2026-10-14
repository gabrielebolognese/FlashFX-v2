// Layer Blur effect uniforms (B11b-gpu fix, pure leaf - imports types only): the CPU packer for
// BLUR_EFFECT_SHADER's `BlurFxU` and the per-frame uniform-slot plan for its passes.
//
// WGSL layout (uniform address space): resolution vec2f @0, params vec4f @16 (a vec4 aligns to 16
// bytes, so floats 2..3 are padding), center vec2f @32, extra vec2f @40 = 12 floats / 48 bytes.
// Before B11b-gpu the renderer wrote params at float 2, so the shader read `strength` as the gaussian
// radius, the centre X as the directional strength and 0 as every kawase pass index.
//
// Slots: queue.writeBuffer lands BEFORE any command of the frame's single submit runs, so a slot that
// is rewritten between passes only ever holds its last value. The old in-loop rewrites (a zeroed
// "passthrough" slot after a directional / radial pass, one rewrite per kawase pass) therefore zeroed
// the directional / radial pass itself and gave every kawase pass the same index. The plan below
// gives every distinct uniform its own slot, written once.

import type { ResolvedBlur } from '../types';

export const BLURFX_UNIFORM_FLOATS = 12;
export const BLURFX_MODE: Record<ResolvedBlur['type'], number> = { gaussian: 0, directional: 1, radial: 2, kawase: 3 };
export const BLURFX_MAX_KAWASE_PASSES = 8;

/**
 * Pack one BlurFxU at `out[offset..offset + 12)`. `blur` null packs the PASSTHROUGH uniform (radius
 * and strength 0: the gaussian V entry then copies its input unchanged). `passIndex` is the kawase
 * pass offset (the shader samples at (passIndex + 0.5) texels).
 */
export function packBlurFx(out: Float32Array, offset: number, blur: ResolvedBlur | null, compW: number, compH: number, passIndex = 0): void {
  out.fill(0, offset, offset + BLURFX_UNIFORM_FLOATS);
  out[offset] = compW;
  out[offset + 1] = compH;
  if (!blur) return;
  out[offset + 4] = blur.radius;                    // params.x
  out[offset + 5] = (blur.angle * Math.PI) / 180;   // params.y (radians)
  out[offset + 6] = blur.strength;                  // params.z
  out[offset + 7] = BLURFX_MODE[blur.type] ?? 0;    // params.w
  out[offset + 8] = blur.centerX;                   // center.x
  out[offset + 9] = blur.centerY;                   // center.y
  out[offset + 10] = passIndex;                     // extra.x
  out[offset + 11] = blur.passes;                   // extra.y
}

export function kawasePassCount(passes: number): number {
  const n = Math.round(Number.isFinite(passes) ? passes : 1);
  return Math.max(1, Math.min(n, BLURFX_MAX_KAWASE_PASSES));
}

export interface BlurFxSlotPlan {
  /** Per blur, the slot of its main uniform (-1 = out of capacity: draw it unblurred). */
  main: number[];
  /** The shared passthrough slot (a copy back into the layer texture), or -1 when nothing needs it. */
  passthrough: number;
  /** Per blur, its kawase pass slots in order (empty for the other types). */
  kawase: number[][];
  /** Slots used. */
  total: number;
}

/**
 * Assign uniform slots for this frame's blurs (in draw order) within `capacity` slots: one main slot
 * per blur, one shared passthrough slot (directional, radial and odd-pass kawase copy their result
 * back with it), and one slot per kawase pass (pass index 1..n, as the shader expects). Blurs that do
 * not fit get main = -1; a kawase blur keeps as many passes as fit (at least one, else main = -1).
 */
export function planBlurFxSlots(blurs: readonly Pick<ResolvedBlur, 'type' | 'passes'>[], capacity: number): BlurFxSlotPlan {
  const needsPass = blurs.some((b) => b.type !== 'gaussian');
  const reserve = needsPass ? 1 : 0;
  const mainCap = Math.max(0, capacity - reserve);
  const main = blurs.map((_, k) => (k < mainCap ? k : -1));
  const usedMain = Math.min(blurs.length, mainCap);
  const passthrough = needsPass && capacity > 0 ? usedMain : -1;
  let next = usedMain + (passthrough >= 0 ? 1 : 0);
  const kawase = blurs.map((b, k) => {
    if (b.type !== 'kawase' || main[k] < 0) return [];
    const want = kawasePassCount(b.passes);
    const n = Math.min(want, Math.max(0, capacity - next));
    const slots = Array.from({ length: n }, (_, i) => next + i);
    next += n;
    if (n === 0) main[k] = -1;
    return slots;
  });
  return { main, passthrough, kawase, total: next };
}
