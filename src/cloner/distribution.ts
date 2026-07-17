// Cloner — pure distribution engine.
//
// `computeInstanceTransforms(cloner, frameNumber, ctx?)` turns a ClonerLayer into
// an array of per-instance transforms. FRAME-PURITY IS NON-NEGOTIABLE: the result
// is a pure function of (cloner params, index) — no accumulated state, no mutable
// caches, and NO Math.random(). The timeline scrubs non-sequentially and must get
// byte-identical output every time. (frameNumber is accepted but unused here — the
// grid/radial/path math is time-invariant; it starts mattering once stagger lands,
// and is in the signature now so that addition is not a breaking change.)

import { evaluatePathAtProgress } from '../core/motionPath';
import { sampleFieldBilinear } from '../field-sampling/fields';
import { applyEffectorStack } from './effectors';
import { staggerDelays, DEFAULT_FPS } from './stagger';
import type {
  ClonerLayer,
  ClonerResolveContext,
  FieldDistribution,
  GridDistribution,
  InstanceTransform,
  PathDistribution,
  RadialDistribution,
  SourceAnimatedTransform,
  Vec3,
} from './types';

const RAD = Math.PI / 180;

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** Base-transform identity for the fields effectors modulate (fresh per instance). */
function identityColor(): { colorTint: { r: number; g: number; b: number }; opacity: number } {
  return { colorTint: { r: 1, g: 1, b: 1 }, opacity: 1 };
}

function makeBase(index: number, x: number, y: number, z: number, rotZ: number): InstanceTransform {
  return {
    index,
    position: v3(x, y, z),
    rotationDegrees: v3(0, 0, rotZ),
    scale: v3(1, 1, 1),
    ...identityColor(),
  };
}

/**
 * Decompose a linear index into 3D grid coordinates, row-major with X fastest,
 * then Y, then Z. (No existing index-decomposition primitive to reuse — the
 * stagger module's `gridSnake` is spatial row-detection from layer bounds, a
 * different problem — so this is the single canonical convention for cloners.)
 */
export function decomposeGridIndex(
  i: number,
  countX: number,
  countY: number,
): { ix: number; iy: number; iz: number } {
  const cx = Math.max(1, countX);
  const cy = Math.max(1, countY);
  const ix = i % cx;
  const iy = Math.floor(i / cx) % cy;
  const iz = Math.floor(i / (cx * cy));
  return { ix, iy, iz };
}

function gridInstances(d: GridDistribution, cap: number): InstanceTransform[] {
  const cx = Math.max(0, Math.floor(d.countX));
  const cy = Math.max(0, Math.floor(d.countY));
  const cz = Math.max(0, Math.floor(d.countZ));
  const total = Math.min(cx * cy * cz, cap);
  const out: InstanceTransform[] = [];
  for (let i = 0; i < total; i++) {
    const { ix, iy, iz } = decomposeGridIndex(i, cx, cy);
    // Geometric brick offset: shift odd rows in X (NOT timing stagger).
    const rowShift = (iy % 2) * d.rowOffset;
    out.push({
      index: i,
      position: v3(
        d.origin.x + ix * d.spacing.x + rowShift,
        d.origin.y + iy * d.spacing.y,
        d.origin.z + iz * d.spacing.z,
      ),
      rotationDegrees: v3(0, 0, 0),
      scale: v3(1, 1, 1),
      ...identityColor(),
    });
  }
  return out;
}

function radialInstances(d: RadialDistribution, cap: number): InstanceTransform[] {
  const count = Math.min(Math.max(0, Math.floor(d.count)), cap);
  const out: InstanceTransform[] = [];
  // Full circle: step = arc/count (evenly spaced, no duplicated seam at 0°/360°).
  // Partial arc: step = arc/(count-1) so both endpoints of the arc are populated.
  const isFullCircle = d.arcDegrees !== 0 && Math.abs(d.arcDegrees % 360) < 1e-9;
  const denom = isFullCircle ? count : Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    const angleDeg = d.startAngleDegrees + (d.arcDegrees / denom) * i;
    const a = angleDeg * RAD;
    out.push({
      index: i,
      position: v3(
        d.center.x + d.radius * Math.cos(a),
        d.center.y + d.radius * Math.sin(a),
        d.center.z,
      ),
      // Outward-facing: instance local +X points away from center along the radius.
      rotationDegrees: v3(0, 0, d.orientToCenter ? angleDeg : 0),
      scale: v3(1, 1, 1),
      ...identityColor(),
    });
  }
  return out;
}

function pathInstances(
  d: PathDistribution,
  cap: number,
  ctx?: ClonerResolveContext,
): InstanceTransform[] {
  const count = Math.min(Math.max(0, Math.floor(d.count)), cap);
  const path = ctx?.getMotionPath?.(d.pathRef);
  // Unresolved path ref → produce nothing (validation reports the dangling ref).
  if (!path || count === 0) return [];

  const out: InstanceTransform[] = [];
  const denom = Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    // Arc-length-corrected sample at t = i/(count-1). Reuses the existing motion-
    // path sampler; naive parametric-t is intentionally never used.
    const t = count === 1 ? 0 : i / denom;
    const { position, angle } = evaluatePathAtProgress(path, t);
    out.push({
      index: i,
      position: v3(position[0], position[1], 0),
      rotationDegrees: v3(0, 0, d.orientToPath ? angle : 0),
      scale: v3(1, 1, 1),
      ...identityColor(),
    });
  }
  return out;
}

/**
 * Field-driven distribution: evaluate the resolved field over a base grid, keep
 * candidates above `threshold`, capped at `maxCount` (distinct from renderCount).
 * Pure and frameNumber-independent — identical field + params → identical positions
 * every time, any order. Reads a pre-resolved FieldGrid via ctx.getField (never async).
 */
function fieldInstances(d: FieldDistribution, ctx?: ClonerResolveContext): InstanceTransform[] {
  const grid = ctx?.getField?.(d.fieldRef);
  if (!grid) return [];
  const res = Math.max(1, Math.floor(d.sampleResolution));
  const maxCandidates = Math.max(0, Math.floor(d.maxCount));
  const out: InstanceTransform[] = [];
  let index = 0;
  for (let j = 0; j < res && out.length < maxCandidates; j++) {
    for (let i = 0; i < res && out.length < maxCandidates; i++) {
      const u = (i + 0.5) / res;
      const v = (j + 0.5) / res;
      if (sampleFieldBilinear(grid, u * grid.width, v * grid.height) > d.threshold) {
        out.push(makeBase(index, d.origin.x + u * d.size.x, d.origin.y + v * d.size.y, d.origin.z, 0));
        index++;
      }
    }
  }
  return out;
}

/** Compose the source layer's animated transform (at a staggered local frame) on
 * top of the distribution+effector transform: position/rotation ADD, scale/opacity/
 * color MULTIPLY. Missing source channels are identity. */
function composeSource(t: InstanceTransform, src: SourceAnimatedTransform): InstanceTransform {
  return {
    index: t.index,
    position: src.position
      ? { x: t.position.x + src.position.x, y: t.position.y + src.position.y, z: t.position.z + src.position.z }
      : t.position,
    rotationDegrees: src.rotationDegrees
      ? {
          x: t.rotationDegrees.x + src.rotationDegrees.x,
          y: t.rotationDegrees.y + src.rotationDegrees.y,
          z: t.rotationDegrees.z + src.rotationDegrees.z,
        }
      : t.rotationDegrees,
    scale: src.scale
      ? { x: t.scale.x * src.scale.x, y: t.scale.y * src.scale.y, z: t.scale.z * src.scale.z }
      : t.scale,
    colorTint: src.colorTint
      ? { r: t.colorTint.r * src.colorTint.r, g: t.colorTint.g * src.colorTint.g, b: t.colorTint.b * src.colorTint.b }
      : t.colorTint,
    opacity: src.opacity !== undefined ? t.opacity * src.opacity : t.opacity,
  };
}

/**
 * The pure engine. Returns per-instance transforms for a cloner at a frame:
 * base distribution → effector stack (at global `frameNumber`) → the source's own
 * animation evaluated at each instance's STAGGERED local frame (via ctx). Fully
 * deterministic and scrub-order independent; `renderCount` is enforced (truncate to
 * the lowest-index `renderCount` entries) so a huge count cannot crash a render.
 */
export function computeInstanceTransforms(
  cloner: ClonerLayer,
  frameNumber: number,
  ctx?: ClonerResolveContext,
): InstanceTransform[] {
  const cap = Math.max(0, Math.floor(cloner.renderCount));
  if (cap === 0) return [];

  const d = cloner.distribution;
  let base: InstanceTransform[];
  switch (d.type) {
    case 'grid':
      base = gridInstances(d, cap);
      break;
    case 'radial':
      base = radialInstances(d, cap);
      break;
    case 'path':
      base = pathInstances(d, cap, ctx);
      break;
    case 'field':
      // field self-caps at maxCount; renderCount is enforced by the slice below.
      base = fieldInstances(d, ctx);
      break;
    default:
      base = []; // unreachable given the union; keeps this total if it widens later.
  }
  // renderCount is the final cap for every mode (field's maxCount is a separate,
  // earlier cap on candidate generation).
  if (base.length > cap) base = base.slice(0, cap);

  const effectors = cloner.effectors;
  const hasEffectors = effectors.length > 0;
  const getField = ctx?.getField;
  const evalSource = ctx?.evaluateSourceTransform;
  // Per-instance stagger delays are only needed to shift the source's local clock.
  const delays = evalSource ? staggerDelays(cloner.stagger, base.length, ctx?.fps ?? DEFAULT_FPS) : null;

  if (!hasEffectors && !evalSource) return base;

  return base.map((b) => {
    let inst = hasEffectors ? applyEffectorStack(b, effectors, b.index, frameNumber, getField) : b;
    if (evalSource && delays) {
      inst = composeSource(inst, evalSource(frameNumber - delays[b.index]));
    }
    return inst;
  });
}
