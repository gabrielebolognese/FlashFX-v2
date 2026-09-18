// Plexus (B20) - pure proximity-graph (leaf module, no imports). Given a set of moving points,
// connect every pair within `connectDistance` with an edge whose alpha fades with distance (1 when
// coincident, 0 at the connect radius). This is the classic "network / constellation" look. The
// points come from the frame-pure particle simulation, so the graph is frame-pure too; this module is
// just the geometry (deterministic + unit-tested, verify:plexus). The line drawing is 2D-canvas work
// in the particle renderer.

export type Pt = [number, number];

export interface Edge {
  /** Indices into the points array (always a < b, no self-edges, no duplicates). */
  a: number;
  b: number;
  dist: number;
  /** 1 at coincident, 0 at `connectDistance` (linear falloff). */
  alpha: number;
}

/**
 * Edges between all point pairs within `connectDistance`. O(n^2) (fine for particle counts); capped at
 * `maxEdges` (scan order) so a dense cloud can't explode the draw list. Empty when the distance is <= 0.
 */
export function computeEdges(points: Pt[], connectDistance: number, maxEdges = 4000): Edge[] {
  const out: Edge[] = [];
  if (connectDistance <= 0) return out;
  const d2 = connectDistance * connectDistance;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const pi = points[i];
    for (let j = i + 1; j < n; j++) {
      const pj = points[j];
      const dx = pi[0] - pj[0];
      const dy = pi[1] - pj[1];
      const dsq = dx * dx + dy * dy;
      if (dsq <= d2) {
        const dist = Math.sqrt(dsq);
        out.push({ a: i, b: j, dist, alpha: 1 - dist / connectDistance });
        if (out.length >= maxEdges) return out;
      }
    }
  }
  return out;
}

/** How many edges a point participates in (for optional node sizing). */
export function edgeDegrees(edges: Edge[], pointCount: number): number[] {
  const deg = new Array(pointCount).fill(0);
  for (const e of edges) { deg[e.a]++; deg[e.b]++; }
  return deg;
}
