import type { Vec2, PathVertex } from './types';

// M17 — Text → vector paths. Pure geometry: convert a font glyph's outline commands (from
// opentype.js getPath/getPaths, already scaled + positioned in layer pixels, y-down) into
// closed cubic-bezier contours (PathVertex[][]) for a PolygonShape. Fonts express curves as
// QUADRATIC (one off-curve control); PathVertex handles are CUBIC, so quads are degree-elevated
// with the exact 2/3 rule. Dependency-free (only ./types) so scripts/verify-textoutline.mjs
// bundles with no engine/DOM stub. The impure font loading + layout lives in src/text/.

/** A subset of opentype.js Path command shapes (M/L/Q/C/Z). Coordinates are absolute. */
export interface OutlineCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number; y?: number;   // endpoint (M/L/Q/C)
  x1?: number; y1?: number; // first control (Q/C)
  x2?: number; y2?: number; // second control (C)
}

const EPS = 1e-4;
const v = (x: number, y: number): Vec2 => [x + 0, y + 0];
function corner(pos: Vec2): PathVertex {
  return { position: pos, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' };
}

/**
 * Split a glyph's outline commands into closed cubic contours. Each `M` starts a contour; `Z`
 * (or the next `M`) closes it. A segment sets the OUTgoing handle of its start vertex and the
 * INcoming handle of its end vertex (handles are relative to their anchor). A closing point
 * coincident with the contour's start is merged into it (its incoming handle carries over).
 */
export function commandsToContours(commands: OutlineCommand[]): PathVertex[][] {
  const contours: PathVertex[][] = [];
  let cur: PathVertex[] = [];

  const finish = () => {
    if (cur.length === 0) return;
    // Merge a trailing vertex that lands back on the start point (common: explicit close segment).
    if (cur.length > 1) {
      const first = cur[0], last = cur[cur.length - 1];
      if (Math.abs(first.position[0] - last.position[0]) < EPS && Math.abs(first.position[1] - last.position[1]) < EPS) {
        first.handleIn = [last.handleIn[0], last.handleIn[1]];
        if (last.handleIn[0] || last.handleIn[1]) first.vertexType = 'bezier';
        cur.pop();
      }
    }
    if (cur.length >= 2) contours.push(cur);
    cur = [];
  };

  for (const c of commands) {
    if (c.type === 'M') {
      finish();
      cur = [corner(v(c.x!, c.y!))];
    } else if (c.type === 'L') {
      cur.push(corner(v(c.x!, c.y!)));
    } else if (c.type === 'Q') {
      const prev = cur[cur.length - 1];
      const p0 = prev.position, cx = c.x1!, cy = c.y1!, px = c.x!, py = c.y!;
      // Elevate quadratic → cubic: control near start/end = P + (2/3)(C − P), stored relative.
      prev.handleOut = v((2 / 3) * (cx - p0[0]), (2 / 3) * (cy - p0[1]));
      prev.vertexType = 'bezier';
      cur.push({ position: v(px, py), handleIn: v((2 / 3) * (cx - px), (2 / 3) * (cy - py)), handleOut: [0, 0], vertexType: 'bezier' });
    } else if (c.type === 'C') {
      const prev = cur[cur.length - 1];
      const p0 = prev.position, px = c.x!, py = c.y!;
      prev.handleOut = v(c.x1! - p0[0], c.y1! - p0[1]);
      prev.vertexType = 'bezier';
      cur.push({ position: v(px, py), handleIn: v(c.x2! - px, c.y2! - py), handleOut: [0, 0], vertexType: 'bezier' });
    } else if (c.type === 'Z') {
      finish();
    }
  }
  finish();
  return contours;
}

/** Axis-aligned bounding box of all contour anchor points (handles ignored — glyph metrics
 *  are anchor-driven and this only needs to be stable, not tight). */
export function contoursBBox(contours: PathVertex[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (const p of c) {
    if (p.position[0] < minX) minX = p.position[0];
    if (p.position[0] > maxX) maxX = p.position[0];
    if (p.position[1] < minY) minY = p.position[1];
    if (p.position[1] > maxY) maxY = p.position[1];
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Recenter contours so their bbox center sits at the origin; returns the removed center (the
 *  glyph's position in its parent) and the recentered contours (mirrors pathOps' polygon
 *  convention: a shape's `position` is its center, `vertices` are relative to it). */
export function recenterContours(contours: PathVertex[][]): { center: Vec2; contours: PathVertex[][] } {
  const bb = contoursBBox(contours);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const out = contours.map((c) => c.map((p): PathVertex => ({
    position: v(p.position[0] - cx, p.position[1] - cy),
    handleIn: [p.handleIn[0], p.handleIn[1]],
    handleOut: [p.handleOut[0], p.handleOut[1]],
    vertexType: p.vertexType,
    ...(p.handleMode ? { handleMode: p.handleMode } : {}),
  })));
  return { center: v(cx, cy), contours: out };
}
