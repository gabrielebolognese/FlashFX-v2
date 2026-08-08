// Pure column-major 4×4 matrix + vec3 math for the 2.5D system (M0). No dependencies, no side effects —
// fully harness-testable. Convention: column-major (element [col*4 + row]); points are column vectors,
// so v' = M · v and a composite is P · V · M (projection outermost). Right-handed; the renderer's y-down
// handedness is reconciled at the projection/viewport step in M2, not here.

export type Mat4 = number[]; // length 16, column-major
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** out = a · b (column-major matrix product). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function multiplyAll(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

export function translate(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
export function scale(x: number, y: number, z: number): Mat4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}
export function rotateX(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
export function rotateY(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
export function rotateZ(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** m · [x,y,z,1] → [x',y',z',w'] (before perspective divide). */
export function transformPoint(m: Mat4, x: number, y: number, z: number): Vec4 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

// ---- vec3 helpers ----
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/** Right-handed lookAt (camera looks down -Z toward `target`). Column-major view matrix. */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, target));   // camera +Z points back from target
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}

/** Perspective projection, WebGPU depth convention (clip z ∈ [0,1]). fovY in radians. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ];
}

/** Compose a layer's local model matrix: T(pos) · Rz · Ry · Rx · S · T(-anchor). Rotations in radians;
 *  applied X→Y→Z (a point is rotated about X first, matching the AE-style rotation stack). */
export function composeModel(pos: Vec3, rot: Vec3, scl: Vec3, anchor: Vec3): Mat4 {
  return multiplyAll(
    translate(pos[0], pos[1], pos[2]),
    rotateZ(rot[2]), rotateY(rot[1]), rotateX(rot[0]),
    scale(scl[0], scl[1], scl[2]),
    translate(-anchor[0], -anchor[1], -anchor[2]),
  );
}
