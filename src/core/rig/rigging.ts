// Character rigging (B25) - pure solvers (leaf module, no imports). The math for posing a 2D
// character: analytic 2-bone IK (arm/leg), FABRIK for N-bone chains (tails/spines), rubber-hose bendy
// limbs, and joystick pose blending (Character-Animator-style). All deterministic + unit-tested
// (verify:rig). Driving actual layers from a solved rig (binding + render) is the B25-rig consumer.

export type Pt = [number, number];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ── 2-bone IK (law of cosines) ─────────────────────────────────────────────────────────────────

export interface TwoBoneResult {
  /** Elbow/knee joint position. */
  joint: Pt;
  /** End effector (equals target when reachable). */
  end: Pt;
  reachable: boolean;
}

/**
 * Place a 2-bone chain (root -> joint -> end) of lengths len1,len2 so the end reaches `target`.
 * `bendSign` (+1/-1) picks the elbow side. Unreachable targets straighten toward the target; too-close
 * targets fold. Analytic (law of cosines), so it's exact and stable.
 */
export function solveTwoBone(root: Pt, target: Pt, len1: number, len2: number, bendSign = 1): TwoBoneResult {
  const d0 = dist(root, target);
  const maxReach = len1 + len2;
  const minReach = Math.abs(len1 - len2);
  const baseAngle = Math.atan2(target[1] - root[1], target[0] - root[0]);
  const reachable = d0 <= maxReach && d0 >= minReach;
  const d = clamp(d0 || 1e-6, minReach + 1e-6, maxReach - 1e-6);

  const cosA = clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
  const a = Math.acos(cosA);
  const jointAngle = baseAngle + bendSign * a;
  const joint: Pt = [root[0] + Math.cos(jointAngle) * len1, root[1] + Math.sin(jointAngle) * len1];

  if (!reachable && d0 >= maxReach) {
    return {
      joint: [root[0] + Math.cos(baseAngle) * len1, root[1] + Math.sin(baseAngle) * len1],
      end: [root[0] + Math.cos(baseAngle) * maxReach, root[1] + Math.sin(baseAngle) * maxReach],
      reachable: false,
    };
  }
  // second bone reaches from the joint toward the (clamped) target
  const ja = Math.atan2(target[1] - joint[1], target[0] - joint[0]);
  const end: Pt = reachable ? [target[0], target[1]] : [joint[0] + Math.cos(ja) * len2, joint[1] + Math.sin(ja) * len2];
  return { joint, end, reachable };
}

// ── FABRIK (N-bone) ──────────────────────────────────────────────────────────────────────────

/**
 * Move an N-segment chain so its end reaches `target`, keeping the root fixed and every segment length.
 * Forward-and-backward-reaching inverse kinematics (Aristidou & Lasenby). Returns the new joint
 * positions (input unchanged). Unreachable targets straighten the chain toward the target.
 */
export function solveFabrik(joints: Pt[], lengths: number[], target: Pt, iterations = 12, tol = 0.5): Pt[] {
  const pts: Pt[] = joints.map((p) => [p[0], p[1]] as Pt);
  if (pts.length < 2) return pts;
  const root: Pt = [pts[0][0], pts[0][1]];
  const total = lengths.reduce((a, b) => a + b, 0);

  if (dist(root, target) > total) {
    for (let i = 0; i < lengths.length; i++) {
      const r = dist(pts[i], target) || 1e-6;
      const l = lengths[i] / r;
      pts[i + 1] = [(1 - l) * pts[i][0] + l * target[0], (1 - l) * pts[i][1] + l * target[1]];
    }
    return pts;
  }

  const last = pts.length - 1;
  for (let iter = 0; iter < iterations; iter++) {
    // backward: end -> target, work toward the root
    pts[last] = [target[0], target[1]];
    for (let i = last - 1; i >= 0; i--) {
      const r = dist(pts[i], pts[i + 1]) || 1e-6;
      const l = lengths[i] / r;
      pts[i] = [(1 - l) * pts[i + 1][0] + l * pts[i][0], (1 - l) * pts[i + 1][1] + l * pts[i][1]];
    }
    // forward: root back, work toward the end
    pts[0] = [root[0], root[1]];
    for (let i = 0; i < last; i++) {
      const r = dist(pts[i], pts[i + 1]) || 1e-6;
      const l = lengths[i] / r;
      pts[i + 1] = [(1 - l) * pts[i][0] + l * pts[i + 1][0], (1 - l) * pts[i][1] + l * pts[i + 1][1]];
    }
    if (dist(pts[last], target) < tol) break;
  }
  return pts;
}

// ── Rubber-hose bendy limb ─────────────────────────────────────────────────────────────────────

/** A bendy limb from a to b as a quadratic bezier bulged perpendicular by `bend` (0 = straight). */
export function rubberHosePath(a: Pt, b: Pt, bend: number, segments = 16): Pt[] {
  const n = Math.max(1, Math.floor(segments));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const ctrl: Pt = [mx - dy * bend, my + dx * bend]; // perpendicular offset
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]]);
  }
  return out;
}

// ── Joystick pose blend ────────────────────────────────────────────────────────────────────────

export interface JoystickCorners { tl: number[]; tr: number[]; bl: number[]; br: number[] }

function lerpVec(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i] - v) * t);
}

/**
 * Bilinearly blend four corner poses by a joystick position (x,y in 0..1: 0,0 = top-left). Each pose is
 * a vector of the same driven parameters. Corners return exactly; the centre is the average.
 */
export function blendJoystick(x: number, y: number, corners: JoystickCorners): number[] {
  const cx = clamp(x, 0, 1), cy = clamp(y, 0, 1);
  const top = lerpVec(corners.tl, corners.tr, cx);
  const bot = lerpVec(corners.bl, corners.br, cx);
  return lerpVec(top, bot, cy);
}
