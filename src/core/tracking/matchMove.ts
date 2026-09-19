// Match-move & stabilize (B27) - pure transform math (leaf module, no imports). Turns tracked feature
// positions into layer transforms: a 1-point track -> a position offset (match-move / pin), a 2-point
// track -> position + rotation + scale (rigid+uniform), and a shaky track -> a smoothing correction
// (warp-stabilize). Deterministic + unit-tested (verify:tracking). The tracker that produces the
// per-frame positions is browser image analysis (B27-track).

export type Pt = [number, number];

/** Match-move a layer from ONE tracked point: the offset that moves `rest` to `cur`. */
export function onePointOffset(rest: Pt, cur: Pt): Pt {
  return [cur[0] - rest[0], cur[1] - rest[1]];
}

export interface RigidTransform {
  /** Translation so the transform maps restA -> curA (about the pivot). */
  position: Pt;
  /** Rotation in degrees. */
  rotation: number;
  /** Uniform scale. */
  scale: number;
  /** Rest pivot (restA) the rotation/scale are applied about. */
  pivot: Pt;
}

const DEG = 180 / Math.PI;

/**
 * Rigid+uniform-scale transform from TWO tracked points: a point p maps to
 *   curA + scale * R(rotation) * (p - restA)
 * so restA->curA and restB->curB exactly. This is 2-point match-move (position + rotation + scale).
 */
export function twoPointTransform(restA: Pt, restB: Pt, curA: Pt, curB: Pt): RigidTransform {
  const rdx = restB[0] - restA[0], rdy = restB[1] - restA[1];
  const cdx = curB[0] - curA[0], cdy = curB[1] - curA[1];
  const restLen = Math.hypot(rdx, rdy) || 1e-6;
  const curLen = Math.hypot(cdx, cdy);
  const scale = curLen / restLen;
  const rotation = (Math.atan2(cdy, cdx) - Math.atan2(rdy, rdx)) * DEG;
  return { position: [curA[0], curA[1]], rotation, scale, pivot: [restA[0], restA[1]] };
}

/** Apply a RigidTransform to a point (for verification / warping). */
export function applyRigid(t: RigidTransform, p: Pt): Pt {
  const rad = t.rotation / DEG;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = (p[0] - t.pivot[0]) * t.scale, dy = (p[1] - t.pivot[1]) * t.scale;
  return [t.position[0] + dx * cos - dy * sin, t.position[1] + dx * sin + dy * cos];
}

/** Moving-average smooth of a point track (odd window; clamped at the ends). */
export function smoothTrack(track: Pt[], window: number): Pt[] {
  const n = track.length;
  if (n === 0) return [];
  const half = Math.max(0, Math.floor(window / 2));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let j = i - half; j <= i + half; j++) {
      const k = j < 0 ? 0 : j >= n ? n - 1 : j;
      sx += track[k][0]; sy += track[k][1]; c++;
    }
    out.push([sx / c, sy / c]);
  }
  return out;
}

/**
 * Warp-stabilize corrections: per frame, the offset to add to the layer so the shaky `track` follows
 * its SMOOTHED path instead (correction = smoothed - raw). Applying it cancels the high-frequency
 * shake while keeping the intended slow motion.
 */
export function stabilizeCorrections(track: Pt[], window: number): Pt[] {
  const smooth = smoothTrack(track, window);
  return track.map((p, i) => [smooth[i][0] - p[0], smooth[i][1] - p[1]] as Pt);
}
