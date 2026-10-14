// Freeform path mask resolution + editing (B10c foundation, B10d-mask render/authoring). Pure helpers
// that evaluate a mask's optional bezier outline + per-vertex feather for the current frame, map it
// between the mask's local frame and composition space, and apply the path edits the mask overlay
// performs. The coverage itself is packed + mirrored in `maskCoverage.ts` and drawn by the WGSL in
// `engine/maskWgsl.ts`. Pure (types + other pure core leaves only) → node-harnessable
// (`verify:mask-path`).
//
// Coordinate convention (B10d-mask): a path mask's `vertices` (and every `pathKeyframes` pose) live in
// the mask's NORMALIZED LOCAL frame - [-0.5, 0.5] spans the mask's `size` - so the mask's existing
// position / size / rotation properties (their Inspector fields, keyframes, overlay box handles and the
// B10a reveal wipes) transform a path mask exactly like a parametric one:
//   comp = position + R(rotation) * (local.x * size.x, local.y * size.y)
// Handles are relative to their anchor and map through the same linear part. Feathers stay in px.

import type { PathVertex, PathKeyframe, Vec2, VertexType } from './types';
import { evalPathKeyframes } from './shapeModifiers';
import { evalCubic } from './bend';
import { insertPointOnSegment, applyVertexType } from './pathVertexOps';

/** The freeform-path fields of a Mask (the subset the path helpers read and patch). */
export interface MaskPathData {
  vertices?: PathVertex[];
  pathKeyframes?: PathKeyframe[];
  feathers?: number[];
}

/** A mask's placement in composition space (its evaluated position / size / rotation in degrees). */
export interface MaskFrame {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  rotation: number;
}

/** True when the mask carries a freeform outline (the UI labels it "Path"). */
export function isPathMask(m: MaskPathData): boolean {
  return (Array.isArray(m.vertices) && m.vertices.length > 0) || (Array.isArray(m.pathKeyframes) && m.pathKeyframes.length > 0);
}

function cloneVertex(v: PathVertex): PathVertex {
  return {
    position: [v.position[0], v.position[1]],
    handleIn: [v.handleIn[0], v.handleIn[1]],
    handleOut: [v.handleOut[0], v.handleOut[1]],
    vertexType: v.vertexType,
    ...(v.handleMode ? { handleMode: v.handleMode } : {}),
  };
}

function lerpVertex(a: PathVertex, b: PathVertex, t: number): PathVertex {
  const l = (x: number, y: number) => x + (y - x) * t;
  const src = t < 0.5 ? a : b;
  return {
    position: [l(a.position[0], b.position[0]), l(a.position[1], b.position[1])],
    handleIn: [l(a.handleIn[0], b.handleIn[0]), l(a.handleIn[1], b.handleIn[1])],
    handleOut: [l(a.handleOut[0], b.handleOut[0]), l(a.handleOut[1], b.handleOut[1])],
    vertexType: src.vertexType,
    ...(src.handleMode ? { handleMode: src.handleMode } : {}),
  };
}

/**
 * Evaluate an animated mask outline at `frame`. Between two poses with the SAME vertex count the
 * anchors and handles interpolate vertex-for-vertex (AE mask-path interpolation: beziers stay intact
 * and moving one vertex only moves its neighbouring edges). Poses with different counts, holds, and
 * frames at/outside a pose defer to B8b's `evalPathKeyframes` (arc-length resample morph).
 */
export function evalMaskPathKeyframes(kfs: PathKeyframe[], frame: number): PathVertex[] {
  if (kfs.length >= 2 && frame > kfs[0].frame && frame < kfs[kfs.length - 1].frame) {
    for (let j = 0; j < kfs.length - 1; j++) {
      const k0 = kfs[j];
      const k1 = kfs[j + 1];
      if (frame > k0.frame && frame < k1.frame) {
        if (k0.interpolation !== 'hold' && k0.vertices.length === k1.vertices.length && k0.vertices.length > 0) {
          const t = (frame - k0.frame) / (k1.frame - k0.frame);
          return k0.vertices.map((v, i) => lerpVertex(v, k1.vertices[i], t));
        }
        break;
      }
    }
  }
  return evalPathKeyframes(kfs, frame).vertices;
}

/**
 * The mask's outline at `frame`: the animated pose when `pathKeyframes` are present (≥1), else the
 * static `vertices` (or []). Masks are closed, so only the vertices are returned.
 */
export function resolveMaskVertices(vertices: PathVertex[] | undefined, pathKeyframes: PathKeyframe[] | undefined, frame: number): PathVertex[] {
  if (pathKeyframes && pathKeyframes.length > 0) return evalMaskPathKeyframes(pathKeyframes, frame);
  return vertices ? vertices.map((v) => v) : [];
}

/**
 * Per-vertex feather for `vertexCount` vertices: the authored `feathers` clamped ≥0 and padded/truncated
 * to the vertex count (missing entries use `fallback`, the mask's single feather). Absent → a uniform
 * `fallback` array. Non-negative so the coverage never inverts.
 */
export function resolveMaskFeathers(feathers: number[] | undefined, vertexCount: number, fallback: number): number[] {
  const base = Math.max(0, fallback);
  if (!feathers || feathers.length === 0) return new Array(Math.max(0, vertexCount)).fill(base);
  const out: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const f = feathers[i];
    out.push(Math.max(0, typeof f === 'number' && Number.isFinite(f) ? f : base));
  }
  return out;
}

// ── Local frame <-> composition space ──

/** A local point → composition space. */
export function maskLocalToComp(p: Vec2, f: MaskFrame): Vec2 {
  const x = p[0] * f.sx;
  const y = p[1] * f.sy;
  const r = (f.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [f.cx + x * c - y * s, f.cy + x * s + y * c];
}

/** A local vector (a handle) → composition space (linear part only). */
export function maskVecToComp(v: Vec2, f: MaskFrame): Vec2 {
  const x = v[0] * f.sx;
  const y = v[1] * f.sy;
  const r = (f.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

// A size axis can be keyframed to ~0 (reveal wipes); keep the inverse finite.
function safeAxis(s: number): number {
  return Math.abs(s) < 1e-6 ? (s < 0 ? -1e-6 : 1e-6) : s;
}

/** A composition-space vector → local (inverse of maskVecToComp). */
export function maskVecToLocal(v: Vec2, f: MaskFrame): Vec2 {
  const r = (f.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [(v[0] * c + v[1] * s) / safeAxis(f.sx), (-v[0] * s + v[1] * c) / safeAxis(f.sy)];
}

/** A composition-space point → local (inverse of maskLocalToComp). */
export function maskCompToLocal(p: Vec2, f: MaskFrame): Vec2 {
  return maskVecToLocal([p[0] - f.cx, p[1] - f.cy], f);
}

/** The whole outline in composition space (anchors mapped, relative handles mapped linearly). */
export function maskPathToComp(vertices: PathVertex[], f: MaskFrame): PathVertex[] {
  return vertices.map((v) => ({
    ...cloneVertex(v),
    position: maskLocalToComp(v.position, f),
    handleIn: maskVecToComp(v.handleIn, f),
    handleOut: maskVecToComp(v.handleOut, f),
  }));
}

/** Tight-ish bounds of a closed bezier outline (each segment sampled), any space. */
export function closedPathBounds(vertices: PathVertex[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    for (let k = 0; k < 16; k++) {
      const p = evalCubic(a, b, k / 16);
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (n === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Turn a pen-drawn composition-space outline into a path mask: the frame is the outline's bounding
 * box (position = its centre, size = its extent, rotation 0) and the vertices are re-expressed in that
 * frame's normalized local space. Round-trips through maskPathToComp to the drawn outline.
 */
export function pathMaskFromComp(compVerts: PathVertex[]): { center: Vec2; size: Vec2; vertices: PathVertex[] } {
  const b = closedPathBounds(compVerts);
  const center: Vec2 = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const size: Vec2 = [Math.max(1, b.maxX - b.minX), Math.max(1, b.maxY - b.minY)];
  const f: MaskFrame = { cx: center[0], cy: center[1], sx: size[0], sy: size[1], rotation: 0 };
  const vertices = compVerts.map((v) => ({
    ...cloneVertex(v),
    position: maskCompToLocal(v.position, f),
    handleIn: maskVecToLocal(v.handleIn, f),
    handleOut: maskVecToLocal(v.handleOut, f),
  }));
  return { center, size, vertices };
}

// ── Path edits (each returns the patch to apply to the Mask) ──

/** The editable outline at `frame` - what the overlay shows and edits. */
export function maskPathAt(m: MaskPathData, frame: number): PathVertex[] {
  return resolveMaskVertices(m.vertices, m.pathKeyframes, frame);
}

/**
 * Whether the outline at `frame` has editable anchors. False only strictly between two poses with
 * different vertex counts, where the outline is a dense resampled morph (editing it would key a
 * polyline of dozens of corners). Static paths, poses, holds and equal-count morphs are editable.
 */
export function maskPathEditableAt(m: MaskPathData, frame: number): boolean {
  const kfs = m.pathKeyframes;
  if (!kfs || kfs.length < 2) return true;
  for (let j = 0; j < kfs.length - 1; j++) {
    const k0 = kfs[j];
    const k1 = kfs[j + 1];
    if (frame > k0.frame && frame < k1.frame) {
      return k0.interpolation === 'hold' || k0.vertices.length === k1.vertices.length;
    }
  }
  return true;
}

/**
 * Write an edited outline at `frame`. A static path replaces `vertices`; an animated path sets the pose
 * at `frame`, adding a keyframe there when none exists (AE: editing an animated mask path keys it).
 */
export function writeMaskPathAt(m: MaskPathData, vertices: PathVertex[], frame: number): MaskPathData {
  if (!m.pathKeyframes || m.pathKeyframes.length === 0) return { vertices };
  const kfs = m.pathKeyframes.slice();
  const i = kfs.findIndex((k) => k.frame === frame);
  if (i >= 0) kfs[i] = { ...kfs[i], vertices };
  else {
    kfs.push({ frame, vertices, closed: true });
    kfs.sort((a, b) => a.frame - b.frame);
  }
  return { pathKeyframes: kfs };
}

/**
 * The path stopwatch / keyframe diamond at `frame`. Static → animated (first pose = the static path).
 * No pose here → add one (the current evaluated outline). A pose here → remove it; removing the LAST
 * pose turns the path static again (its vertices become the static outline). Keys left `undefined`
 * in the patch are meant to be deleted from the mask.
 */
export function toggleMaskPathKeyframe(m: MaskPathData, frame: number): MaskPathData {
  const kfs = m.pathKeyframes ?? [];
  if (kfs.length === 0) {
    return { pathKeyframes: [{ frame, vertices: (m.vertices ?? []).map(cloneVertex), closed: true }] };
  }
  const i = kfs.findIndex((k) => k.frame === frame);
  if (i < 0) {
    const pose = maskPathAt(m, frame).map(cloneVertex);
    const next = [...kfs, { frame, vertices: pose, closed: true }].sort((a, b) => a.frame - b.frame);
    return { pathKeyframes: next };
  }
  if (kfs.length === 1) return { vertices: kfs[0].vertices.map(cloneVertex), pathKeyframes: undefined };
  return { pathKeyframes: kfs.filter((_, j) => j !== i) };
}

/**
 * Insert a vertex on segment `seg` at parameter `t` (De Casteljau split - the outline is unchanged).
 * Applied to the static path AND every keyframe pose so pose vertex counts stay equal (clean
 * vertex-for-vertex morphs). Per-vertex feathers get an interpolated entry. Null when out of range.
 */
export function insertMaskVertex(m: MaskPathData, seg: number, t: number): MaskPathData | null {
  const split = (verts: PathVertex[]): PathVertex[] => {
    const n = verts.length;
    if (seg < 0 || seg >= n || n < 2) return verts;
    return insertPointOnSegment(verts, seg, verts[seg], verts[(seg + 1) % n], t, true) ?? verts;
  };
  const patch: MaskPathData = {};
  let changed = false;
  if (m.vertices && m.vertices.length >= 2 && seg >= 0 && seg < m.vertices.length) {
    patch.vertices = split(m.vertices);
    changed = true;
  }
  if (m.pathKeyframes && m.pathKeyframes.length > 0) {
    patch.pathKeyframes = m.pathKeyframes.map((k) => ({ ...k, vertices: split(k.vertices) }));
    changed = true;
  }
  if (!changed) return null;
  if (m.feathers && m.feathers.length > 0) {
    const n = m.feathers.length;
    const a = m.feathers[seg] ?? 0;
    const b = m.feathers[(seg + 1) % n] ?? a;
    const tt = Math.min(0.999, Math.max(0.001, t));
    const f = m.feathers.slice();
    f.splice(seg + 1, 0, a + (b - a) * tt);
    patch.feathers = f;
  }
  return patch;
}

/**
 * Delete vertex `index` from the static path and every pose. Null when that would leave any outline
 * with fewer than 3 vertices (a mask must enclose an area).
 */
export function deleteMaskVertex(m: MaskPathData, index: number): MaskPathData | null {
  const outlines = [m.vertices ?? null, ...(m.pathKeyframes ?? []).map((k) => k.vertices)].filter((v): v is PathVertex[] => !!v && v.length > 0);
  if (outlines.length === 0) return null;
  if (outlines.some((v) => v.length <= 3 || index < 0 || index >= v.length)) return null;
  const drop = (verts: PathVertex[]) => verts.filter((_, i) => i !== index);
  const patch: MaskPathData = {};
  if (m.vertices && m.vertices.length > 0) patch.vertices = drop(m.vertices);
  if (m.pathKeyframes && m.pathKeyframes.length > 0) patch.pathKeyframes = m.pathKeyframes.map((k) => ({ ...k, vertices: drop(k.vertices) }));
  if (m.feathers && m.feathers.length > index) patch.feathers = m.feathers.filter((_, i) => i !== index);
  return patch;
}

/** Corner <-> smooth for vertex `index` of the outline at `frame` (auto tangents from neighbours). */
export function setMaskVertexType(m: MaskPathData, index: number, type: VertexType, frame: number): MaskPathData | null {
  const verts = maskPathAt(m, frame);
  if (index < 0 || index >= verts.length) return null;
  return writeMaskPathAt(m, applyVertexType(verts, index, type, true), frame);
}

/**
 * Set one vertex's feather (px, ≥0). The first per-vertex edit materializes the array with the mask's
 * current single feather for every vertex, so the others keep rendering exactly as before.
 */
export function setMaskVertexFeather(m: MaskPathData, index: number, value: number, vertexCount: number, fallback: number): MaskPathData | null {
  if (index < 0 || index >= vertexCount) return null;
  const f = resolveMaskFeathers(m.feathers, vertexCount, fallback);
  f[index] = Math.max(0, Number.isFinite(value) ? value : 0);
  return { feathers: f };
}
