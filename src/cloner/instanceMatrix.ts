// Cloner — GPU-prep (Prompt 3, Deliverable 1, CPU side).
//
// Turns Prompt 2's pure InstanceTransform[] into the per-instance data a future
// instanced draw call consumes. This is the one piece of the GPU path that is pure
// and verifiable without a GPU, so it lives here (tested by scripts/verify-cloner.mjs)
// and the pipeline/shaders/scene-graph wiring build on top of it.
//
// IMPORTANT — matrix convention. This 2D renderer has NO existing mat4 model-matrix
// convention: every vertex shader composes the transform inline as
//     rotated = (rel.x·cos − rel.y·sin, rel.x·sin + rel.y·cos)   // Y-down CCW
//     worldPos = rotated + position
// so this module matches THAT sign/order (rotate∘scale then translate) rather than
// inventing a different one — an instanced draw using these matrices reproduces the
// non-instanced path pixel-for-pixel. Matrices are column-major (WGSL mat4x4<f32>).

import type { InstanceTransform } from './types';

/**
 * Column-major 4x4 affine model matrix for one instance:
 *   world = Translate(position) · Rotate(rotationDegrees.z) · Scale(scale) · localVertex
 * Only Z-rotation is meaningful in 2D; z scale/position pass through untouched.
 */
export function composeInstanceMatrix(t: InstanceTransform): number[] {
  const a = (t.rotationDegrees.z * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const sx = t.scale.x;
  const sy = t.scale.y;
  const sz = t.scale.z;
  const { x: px, y: py, z: pz } = t.position;
  // Columns (col-major): R·S in the upper-left 2x2, translation in the last column.
  // Acting on local (lx,ly): (c·sx·lx − s·sy·ly + px, s·sx·lx + c·sy·ly + py).
  return [
    c * sx, s * sx, 0, 0, // col0
    -s * sy, c * sy, 0, 0, // col1
    0, 0, sz, 0, // col2
    px, py, pz, 1, // col3
  ];
}

/** Floats per instance in the packed buffer: mat4 (16) + colorTint/opacity vec4 (4). */
export const INSTANCE_FLOAT_COUNT = 20;
/** Byte stride of one instance record (for an instance-step vertex buffer layout). */
export const INSTANCE_STRIDE_BYTES = INSTANCE_FLOAT_COUNT * 4; // 80

/**
 * Pack InstanceTransform[] into one interleaved Float32Array for an instance-step
 * vertex buffer, matching WGSL `struct InstanceData { modelMatrix: mat4x4<f32>,
 * colorTint: vec4<f32> }`: [ 16 matrix floats | r, g, b, opacity ] per instance.
 *
 * Sized strictly from the (already renderCount-capped) array length — a second line
 * of defense on the cap at the GPU-resource level (Deliverable 5): even a caller
 * that bypassed Prompt 1's truncation cannot make this allocate more than it is fed.
 */
export function packInstanceBuffer(instances: InstanceTransform[]): Float32Array {
  const out = new Float32Array(instances.length * INSTANCE_FLOAT_COUNT);
  for (let i = 0; i < instances.length; i++) {
    const t = instances[i];
    const base = i * INSTANCE_FLOAT_COUNT;
    out.set(composeInstanceMatrix(t), base);
    out[base + 16] = t.colorTint.r;
    out[base + 17] = t.colorTint.g;
    out[base + 18] = t.colorTint.b;
    out[base + 19] = t.opacity;
  }
  return out;
}
