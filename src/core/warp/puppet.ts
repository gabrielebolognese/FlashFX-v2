// Puppet / mesh warp (B24) - pure deformation (leaf module, no imports). Pins have a rest position and
// a (dragged) current position; any point is displaced by an inverse-distance-weighted blend of the
// pin offsets, so dragging a pin bulges the mesh smoothly around it. warpMesh applies it to a grid of
// vertices for the (GPU, browser-gated) mesh render. Pure + deterministic + unit-tested (verify:warp).

export type Pt = [number, number];

export interface Pin {
  /** Rest position (where the pin sits on the undeformed layer). */
  rest: Pt;
  /** Current (dragged) position. */
  pos: Pt;
}

/**
 * Warp a point by the pins. Each pin contributes its offset (pos - rest) weighted by 1/dist^power from
 * the point to the pin's REST position; the weighted-average offset is added to the point. No pins =
 * identity; one pin = a uniform translate; a point exactly on a pin's rest lands on that pin's pos.
 */
export function warpPoint(p: Pt, pins: Pin[], power = 2, eps = 1e-6): Pt {
  if (pins.length === 0) return [p[0], p[1]];
  let wsum = 0, ox = 0, oy = 0;
  for (const pin of pins) {
    const dx = p[0] - pin.rest[0];
    const dy = p[1] - pin.rest[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < eps) {
      // p sits on this pin's rest: its offset dominates -> land on pin.pos (+ the tiny residual).
      return [p[0] + (pin.pos[0] - pin.rest[0]), p[1] + (pin.pos[1] - pin.rest[1])];
    }
    const w = 1 / Math.pow(d2, power / 2);
    wsum += w;
    ox += w * (pin.pos[0] - pin.rest[0]);
    oy += w * (pin.pos[1] - pin.rest[1]);
  }
  return [p[0] + ox / wsum, p[1] + oy / wsum];
}

export interface WarpMesh {
  cols: number;
  rows: number;
  /** (cols+1)*(rows+1) grid vertices, row-major, in the given rest coords. */
  vertices: Pt[];
}

/** A rest mesh grid over the rect [-w/2,w/2] x [-h/2,h/2] with cols x rows cells. */
export function buildWarpMesh(width: number, height: number, cols: number, rows: number): WarpMesh {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const vertices: Pt[] = [];
  for (let j = 0; j <= r; j++) {
    for (let i = 0; i <= c; i++) {
      vertices.push([-width / 2 + (width * i) / c, -height / 2 + (height * j) / r]);
    }
  }
  return { cols: c, rows: r, vertices };
}

/** Apply the pins to every mesh vertex, returning the deformed mesh (rest mesh unchanged). */
export function warpMesh(mesh: WarpMesh, pins: Pin[], power = 2): WarpMesh {
  return { cols: mesh.cols, rows: mesh.rows, vertices: mesh.vertices.map((v) => warpPoint(v, pins, power)) };
}
