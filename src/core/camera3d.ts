// 2.5D camera + 3D-layer world-matrix math (M1). Pure — no React/DOM/WebGPU — so the whole
// camera model is harness-testable. The renderer does not consume any of this yet (that is M2);
// M1 only produces the View/Projection matrices and per-3D-layer world matrices.
//
// Conventions (see mat4.ts): column-major, right-handed, points are column vectors, composite
// is P · V · M. Layers live around the z=0 plane; +Z moves a card AWAY from the camera (AE
// model). The camera sits in front at negative Z looking toward +Z. The renderer's y-down
// handedness is reconciled at the projection/viewport step in M2, not here.

import type { Mat4, Vec2, Vec3 } from './mat4';
import { identity, multiply, multiplyAll, perspective, lookAt, composeModel, translate, rotateX, rotateY, rotateZ, transformPoint } from './mat4';
import type { ResolvedTransform } from './types';

// The renderer's raster space is Y-DOWN (comp y=0 is the top; ndc.y=+1 is the top). A camera
// with a conventional +Y up vector would flip both screen axes vs. every existing 2D pipeline,
// so comp "up" is −Y here. With this, a flat card at z=0 under the default camera projects to
// EXACTLY the 2D map ndc=(2x/W−1, 1−2y/H) — the AE parity property, pinned in verify:camera3d.
const COMP_UP: Vec3 = [0, -1, 0];

export const deg2rad = (d: number): number => (d * Math.PI) / 180;

/** The camera's forward (look) direction for a one-node camera at the given orientation
 *  (degrees), i.e. the +Z axis rotated by Rz·Ry·Rx. Used to derive a two-node-style target. */
export function forwardVector(rotXDeg: number, rotYDeg: number, rotZDeg: number): Vec3 {
  const m = multiplyAll(rotateZ(deg2rad(rotZDeg)), rotateY(deg2rad(rotYDeg)), rotateX(deg2rad(rotXDeg)));
  const v = transformPoint(m, 0, 0, 1);
  return [v[0], v[1], v[2]];
}

/** A camera resolved to concrete matrices for a single frame — the payload M2's renderer reads. */
export interface ResolvedCamera {
  /** world → camera space. */
  view: Mat4;
  /** camera → clip space (WebGPU depth 0..1). */
  projection: Mat4;
  /** projection · view, precomputed (multiply by a layer's world matrix → MVP). */
  viewProjection: Mat4;
  eye: Vec3;
  target: Vec3;
  /** vertical field of view, radians. */
  fovY: number;
  /** AE-style zoom in pixels (distance at which 1px = 1 comp px). */
  zoom: number;
  aspect: number;
  /** Depth-of-field params (consumed in M5); null when DOF is off. */
  dof: { focusDistance: number; aperture: number; blurLevel: number } | null;
}

/** fovY (radians) for an AE-style zoom (px) framing a comp of the given height. */
export function fovYForZoom(zoom: number, compH: number): number {
  return 2 * Math.atan(compH / 2 / Math.max(1e-6, zoom));
}

/** Zoom (px) for a given vertical FOV — the inverse of {@link fovYForZoom}. */
export function zoomForFovY(fovY: number, compH: number): number {
  return compH / 2 / Math.tan(fovY / 2);
}

/**
 * Build a resolved camera from concrete params. `zoom` drives the FOV only; the eye/target are
 * the camera position and look-at point in composition space. Any zoom keeps a card at z=0 at
 * exactly its 2D size when eye is `zoom` in front of the plane (see {@link defaultCamera}).
 */
export function cameraFromParams(params: {
  eye: Vec3;
  target: Vec3;
  zoom: number;
  compW: number;
  compH: number;
  dof?: { focusDistance: number; aperture: number; blurLevel: number } | null;
}): ResolvedCamera {
  const { eye, target, zoom, compW, compH } = params;
  const aspect = compW / Math.max(1e-6, compH);
  const fovY = fovYForZoom(zoom, compH);
  // near/far bracket a generous depth range around the z=0 plane. compH-relative so it scales.
  const near = Math.max(1, zoom * 0.001);
  const far = zoom * 1000 + compH * 100;
  const view = lookAt(eye, target, COMP_UP);
  const projection = perspective(fovY, aspect, near, far);
  return {
    view,
    projection,
    viewProjection: multiply(projection, view),
    eye,
    target,
    fovY,
    zoom,
    aspect,
    dof: params.dof ?? null,
  };
}

/**
 * The default camera used when a comp has no camera layer. Matches AE's behavior: a layer at
 * z=0 renders at exactly its 2D size (toggling a lone layer to 3D is a no-op until it moves in
 * Z or a camera moves). Eye is centered, `DEFAULT_ZOOM_FACTOR·compH` in front of the plane.
 */
export const DEFAULT_ZOOM_FACTOR = 1; // eye distance = compH → fovY ≈ 53.13°; any factor keeps 1:1
export function defaultCamera(compW: number, compH: number): ResolvedCamera {
  const cx = compW / 2;
  const cy = compH / 2;
  const zoom = DEFAULT_ZOOM_FACTOR * compH;
  return cameraFromParams({
    eye: [cx, cy, -zoom],
    target: [cx, cy, 0],
    zoom,
    compW,
    compH,
  });
}

/** MVP for a 3D layer: camera.viewProjection · worldMatrix. Multiply a local corner (px, z=0)
 *  by this and do the perspective divide to get clip space — the M2 renderer's vertex path. */
export function mvp(camera: ResolvedCamera, worldMatrix: Mat4): Mat4 {
  return multiply(camera.viewProjection, worldMatrix);
}

/**
 * MVP for a renderer "card": the matrix the vertex shader multiplies the LOCAL quad corner by
 * (corner already scaled — quadSize carries scale, exactly as the 2D path). It reproduces the
 * renderer's 2D placement `world = R(local − pivot) + pivot + pos` — i.e.
 *   A3D = T(pos) · T(pivot) · Rz · Ry · Rx · T(−pivot)
 * extended into 3D (pos.z, X/Y rotation) — then projects through the camera: `P·V·A3D`. When
 * rotX=rotY=posZ=0 under the default camera this equals the 2D map (parity). `pivot`/`pos.xy`
 * are the SAME anchor/position values the pipeline's uniform packer already writes.
 */
export function cardMVP(camera: ResolvedCamera, pos: Vec3, pivot: Vec2, rotDegXYZ: Vec3): Mat4 {
  const R = multiplyAll(rotateZ(deg2rad(rotDegXYZ[2])), rotateY(deg2rad(rotDegXYZ[1])), rotateX(deg2rad(rotDegXYZ[0])));
  const a3d = multiplyAll(
    translate(pos[0], pos[1], pos[2]),
    translate(pivot[0], pivot[1], 0),
    R,
    translate(-pivot[0], -pivot[1], 0),
  );
  return multiply(camera.viewProjection, a3d);
}

/** Camera-space depth of a layer's origin (local 0,0,0 → world → view). The camera looks down
 *  −Z, so points in front are negative and FARTHER points are MORE negative. Painter's order
 *  draws ascending (most-negative/farthest first). */
export function cameraSpaceDepth(camera: ResolvedCamera, worldMatrix: Mat4): number {
  const w = transformPoint(worldMatrix, 0, 0, 0);
  const iw = w[3] || 1;
  const v = transformPoint(camera.view, w[0] / iw, w[1] / iw, w[2] / iw);
  return v[2];
}

export interface DepthSortItem { is3D: boolean; depth: number }

/**
 * Painter's composite order (AE Classic-3D model). Returns a permutation of input indices:
 * runs of *consecutive* 3D layers are sorted far→near (ascending camera-space depth); 2D layers
 * pin the order — they split the 3D runs and never move. Stable within equal depths. This is the
 * exact AE rule (2D layers act as dividers; 3D layers only sort among their contiguous group).
 */
export function painterOrder(items: DepthSortItem[]): number[] {
  const out: number[] = [];
  let run: number[] = [];
  const flush = () => {
    // stable sort, farthest (most negative depth) first
    run.sort((a, b) => items[a].depth - items[b].depth);
    for (const idx of run) out.push(idx);
    run = [];
  };
  for (let i = 0; i < items.length; i++) {
    if (items[i].is3D) run.push(i);
    else { flush(); out.push(i); }
  }
  flush();
  return out;
}

/** A single 3D layer's local model matrix from its resolved transform (rotations in degrees). */
export function localModelMatrix(t: ResolvedTransform): Mat4 {
  return composeModel(
    [t.positionX, t.positionY, t.positionZ],
    [deg2rad(t.rotationX), deg2rad(t.rotationY), deg2rad(t.rotation)],
    [t.scaleX, t.scaleY, 1],
    [t.anchorX, t.anchorY, 0],
  );
}

/**
 * Compose a parent→child chain of local model matrices into a world matrix (root first, leaf
 * last): world = M_root · … · M_leaf, so a child inherits its ancestors' 3D transforms. This is
 * the 3D analogue of the 2D `composeTransforms` affine chain.
 */
export function composeWorldMatrix(localChainRootFirst: Mat4[]): Mat4 {
  let world = identity();
  for (const m of localChainRootFirst) world = multiply(world, m);
  return world;
}
