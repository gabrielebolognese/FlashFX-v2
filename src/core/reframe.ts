import type { Vec2 } from './types';

// M14 — multi-format reframe constraints. Per-layer pin/scale rules so resizing the
// composition frame (16:9 ↔ 9:16 ↔ 1:1) reflows every top-level layer at once — the most
// transferable auto-layout idea for a short-form tool. Figma/Sketch semantics, one-shot bake
// on resize (not a live expression). Pure (imports only `type Vec2`), proven by
// scripts/verify-reframe.mjs.
//
// Convention: transform.position IS the box CENTRE (the whole snap/overlay system treats it
// so). For a leaf layer box centre == position; for a group the box centre differs from the
// group's own position, handled by the (centre − pos) term in axisOp.

export type ReframeAxisMode = 'min' | 'max' | 'center' | 'stretch' | 'scale';
// horizontal: min = Left, max = Right, stretch = Left&Right ; vertical: min = Top, max = Bottom, stretch = Top&Bottom.

export interface LayerConstraints { h: ReframeAxisMode; v: ReframeAxisMode }

/** Centre/centre — re-centres content on resize (best default for centred hero content). */
export const DEFAULT_CONSTRAINTS: LayerConstraints = { h: 'center', v: 'center' };

export interface ReframeBox { x: number; y: number; w: number; h: number }

export interface ReframeInput {
  id: string;
  constraints: LayerConstraints;
  box: ReframeBox;   // measured at the reframe frame, comp space (top-left origin)
  position: Vec2;    // layer's evaluated position at that frame (== box centre for leaf layers)
  scale: Vec2;       // base scale
}

/** Affine remap of a stored component value: v → v*positionMul + positionAdd; s → s*scaleMul. */
export interface AxisOp { positionMul: number; positionAdd: number; scaleMul: number }

export interface ReframeResult {
  id: string;
  h: AxisOp;
  v: AxisOp;
  position: Vec2; // ops applied to the sampled input (correct new base for STATIC layers)
  scale: Vec2;
}

/**
 * Per-axis remap for one constraint mode. oldD/newD are the parent dimension before/after;
 * `center` is the box centre on this axis, `size` the box extent, `pos` the stored position
 * component. Returns the affine op to apply to the stored position and scale components.
 */
function axisOp(mode: ReframeAxisMode, oldD: number, newD: number, center: number, size: number, pos: number): AxisOp {
  const s = oldD > 1e-6 ? newD / oldD : 1;
  const d = newD - oldD;
  let positionMul = 1;
  let scaleMul = 1;
  let newCenter = center;
  switch (mode) {
    case 'min': newCenter = center; break;                 // Left/Top — edge fixed, centre stays
    case 'max': newCenter = center + d; break;             // Right/Bottom — trailing edge fixed
    case 'center': newCenter = center + d / 2; break;      // fixed absolute offset from parent centre
    case 'stretch': {                                      // Left&Right / Top&Bottom — both margins fixed
      newCenter = center + d / 2;
      const ns = Math.max(1e-3, size + d);
      scaleMul = size > 1e-3 ? ns / size : 1;
      break;
    }
    case 'scale':                                          // everything scales by newD/oldD
      positionMul = s; scaleMul = s; newCenter = center * s; break;
  }
  // pos' = newCentre − (centre − pos)*scaleMul, expressed as pos*positionMul + positionAdd.
  const positionAdd = newCenter - pos * positionMul - (center - pos) * scaleMul;
  return { positionMul, positionAdd: positionAdd + 0, scaleMul };
}

/** Compute the reframe ops + new base transforms for each top-level layer. Pure/deterministic. */
export function computeReframe(inputs: ReframeInput[], oldW: number, oldH: number, newW: number, newH: number): ReframeResult[] {
  return inputs.map((it) => {
    const cx = it.box.x + it.box.w / 2;
    const cy = it.box.y + it.box.h / 2;
    const h = axisOp(it.constraints.h, oldW, newW, cx, it.box.w, it.position[0]);
    const v = axisOp(it.constraints.v, oldH, newH, cy, it.box.h, it.position[1]);
    const position: Vec2 = [
      it.position[0] * h.positionMul + h.positionAdd + 0,
      it.position[1] * v.positionMul + v.positionAdd + 0,
    ];
    const scale: Vec2 = [it.scale[0] * h.scaleMul + 0, it.scale[1] * v.scaleMul + 0];
    return { id: it.id, h, v, position, scale };
  });
}

/** Apply an axis op to a stored position component (defaultValue or a keyframe value). */
export function applyAxisPosition(v: number, op: AxisOp): number {
  return v * op.positionMul + op.positionAdd + 0;
}
/** Apply an axis op to a stored scale component. */
export function applyAxisScale(v: number, op: AxisOp): number {
  return v * op.scaleMul + 0;
}
