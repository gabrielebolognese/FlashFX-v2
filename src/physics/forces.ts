import type { Vec2, MagnetConfig } from './types';

// Physics forces (B21) - pure force models (leaf module; imports only types). The bake applies these
// to the Rapier world (browser); the math is deterministic + unit-tested (verify:physics) so it can be
// trusted independent of the WASM sim. Covers magnet/attraction, Hooke spring (rope/chain segment),
// and a damped-spring integrator (soft-body jiggle / spring-to-rest).

/**
 * Force on a body at `pos` from a radial magnet. strength>0 pulls toward the magnet, <0 pushes away;
 * `radius`>0 gives a linear falloff to 0 at the radius (radius<=0 = infinite range). The 1/dist term
 * keeps a coincident body from exploding.
 */
export function magnetForce(pos: Vec2, m: MagnetConfig): Vec2 {
  const dx = m.x - pos.x;
  const dy = m.y - pos.y;
  const dist = Math.hypot(dx, dy) || 1e-4;
  const falloff = m.radius > 0 ? Math.max(0, 1 - dist / m.radius) : 1;
  const f = (m.strength * falloff) / dist;
  return { x: dx * f, y: dy * f };
}

/**
 * Hooke spring force ON body a toward/along the line to body b (a rope/chain segment). Zero at
 * `restLength`; pulls the two together when stretched, pushes apart when compressed. `damping` acts on
 * the relative velocity along the spring axis (opposes motion) for stability.
 */
export function springForce(a: Vec2, b: Vec2, restLength: number, stiffness: number, damping: number, velA: Vec2 = { x: 0, y: 0 }, velB: Vec2 = { x: 0, y: 0 }): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1e-4;
  const nx = dx / dist;
  const ny = dy / dist;
  const ext = dist - restLength;
  const relV = (velB.x - velA.x) * nx + (velB.y - velA.y) * ny;
  const f = stiffness * ext + damping * relV; // >0 pulls a toward b
  return { x: nx * f, y: ny * f };
}

/**
 * One damped-spring step toward `target` (soft-body jiggle / spring-to-rest). Semi-implicit Euler:
 * a = (target - pos)*stiffness - vel*damping. Returns the new pos + vel; oscillates then settles.
 */
export function dampedSpringStep(pos: Vec2, vel: Vec2, target: Vec2, stiffness: number, damping: number, dt: number): { pos: Vec2; vel: Vec2 } {
  const ax = (target.x - pos.x) * stiffness - vel.x * damping;
  const ay = (target.y - pos.y) * stiffness - vel.y * damping;
  const nvx = vel.x + ax * dt;
  const nvy = vel.y + ay * dt;
  return { pos: { x: pos.x + nvx * dt, y: pos.y + nvy * dt }, vel: { x: nvx, y: nvy } };
}
