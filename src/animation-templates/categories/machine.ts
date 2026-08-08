import type { Layer, Vec2, Vec4, GroupLayer } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, assemble, setKeys, EASE_IN, EASE_OUT, LINEAR } from '../kit';

// The flagship: a Rube Goldberg chain reaction. Dominoes topple → a marble rolls down a ramp → hits a
// lever → the lever drops a weight into a bucket → the bucket dips and pulls a string → the string
// slides a gate open → 200 balls pour through a funnel. The 200 individually-animated balls are the
// point: trivial to GENERATE here, effectively impossible to hand-keyframe in After Effects without a
// paid physics plugin. Everything is choreographed keyframes (deterministic), not a live sim.

const BG: Vec4 = [0.1, 0.12, 0.16, 1];
const WOOD: Vec4 = [0.55, 0.4, 0.25, 1];
const DOMINO: Vec4 = [0.9, 0.92, 0.96, 1];
const MARBLE: Vec4 = [0.3, 0.62, 0.98, 1];
const METAL: Vec4 = [0.62, 0.65, 0.72, 1];
const WEIGHT: Vec4 = [0.24, 0.26, 0.32, 1];
const BUCKET: Vec4 = [0.5, 0.35, 0.2, 1];
const ROPE: Vec4 = [0.82, 0.76, 0.62, 1];
const GATE: Vec4 = [0.75, 0.32, 0.32, 1];
const FUNNEL: Vec4 = [0.42, 0.45, 0.52, 1];
const BALLS: Vec4[] = [
  [0.95, 0.35, 0.4, 1], [0.35, 0.72, 1, 1], [1, 0.8, 0.3, 1], [0.5, 0.9, 0.55, 1],
  [0.85, 0.5, 1, 1], [1, 0.6, 0.35, 1], [0.4, 0.85, 0.85, 1],
];

const DUR = 360;

// A pivot group at `at`; children parented to it rotate around that point.
function hinge(name: string, at: Vec2): GroupLayer {
  return group(name, at);
}

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Chain Reaction', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, BG));

  // ---- 1. Dominoes (top-left), toppling right in sequence ----
  c.push(box([-720, -250], 440, 16, WOOD)); // shelf
  const DOM_BASE = -262;
  for (let i = 0; i < 8; i++) {
    const x = -900 + i * 48;
    const piv = hinge(`domino-${i}`, [x, DOM_BASE]);
    const at = i * 5;
    setKeys(piv.transform.rotation, [{ f: at, v: 0 }, { f: at + 12, v: 82, ease: EASE_IN }]);
    c.push(piv);
    const d = box([0, -30], 14, 60, DOMINO);
    d.parentId = piv.id;
    c.push(d);
  }

  // ---- 2. Ramp + marble rolling down ----
  const ramp = box([-450, -215], 300, 12, WOOD);
  ramp.transform.rotation.defaultValue = 24;
  c.push(ramp);
  const marble = dot([-548, -300], 16, MARBLE);
  setKeys(marble.transform.position, [
    { f: 0, v: [-548, -300] }, { f: 44, v: [-548, -300] },
    { f: 60, v: [-500, -258], ease: EASE_IN }, { f: 92, v: [-372, -176], ease: LINEAR },
  ]);
  setKeys(marble.transform.rotation, [{ f: 44, v: 0 }, { f: 92, v: 520 }]);
  c.push(marble);

  // ---- 3. Lever tips when the marble lands on its left end ----
  c.push(box([-260, -150], 40, 44, METAL)); // fulcrum
  const lever = hinge('lever', [-260, -172]);
  setKeys(lever.transform.rotation, [{ f: 88, v: 0 }, { f: 104, v: -20, ease: EASE_OUT }]);
  c.push(lever);
  const beam = box([0, 0], 280, 14, WOOD);
  beam.parentId = lever.id;
  c.push(beam);

  // ---- 4. Weight flicked off the rising right end, arcs into a bucket ----
  const weight = box([-128, -186], 40, 40, WEIGHT);
  setKeys(weight.transform.position, [
    { f: 0, v: [-128, -186] }, { f: 100, v: [-128, -186] },
    { f: 118, v: [-70, -238], ease: EASE_OUT }, { f: 146, v: [30, 30], ease: EASE_IN },
  ]);
  setKeys(weight.transform.rotation, [{ f: 100, v: 0 }, { f: 146, v: 160 }]);
  c.push(weight);

  // ---- 5. Bucket dips + string over a pulley slides the gate open ----
  const bucket = hinge('bucket', [30, 60]);
  setKeys(bucket.transform.position, [{ f: 0, v: [30, 60] }, { f: 146, v: [30, 60] }, { f: 166, v: [30, 108], ease: EASE_OUT }]);
  c.push(bucket);
  for (const part of [box([0, 34], 96, 12, BUCKET), box([-42, 4], 12, 72, BUCKET), box([42, 4], 12, 72, BUCKET)]) {
    part.parentId = bucket.id;
    c.push(part);
  }
  c.push(dot([190, -170], 22, METAL)); // pulley
  c.push(box([40, -60], 8, 220, ROPE)); // rope: bucket side
  c.push(box([340, -60], 8, 90, ROPE)); // rope: gate side

  // ---- The funnel + 200 balls (right side) ----
  const NECK_X = 400, NECK_Y = 132;
  // Container walls holding the packed balls
  c.push(box([292, -110], 12, 200, FUNNEL));
  c.push(box([508, -110], 12, 200, FUNNEL));

  // 200 balls, released bottom-first when the gate opens, converging through the neck and streaming out.
  let count = 0;
  for (let r = 0; r < 13 && count < 200; r++) {
    for (let col = 0; col < 16 && count < 200; col++) {
      const gx = 302 + col * 13;
      const gy = -40 - r * 13;
      const rt = 168 + r * 3 + (col % 4);
      const jx = ((col * 7 + r * 3) % 20) - 10;
      const jx2 = ((col * 11 + r * 5) % 44) - 22;
      const ball = dot([gx, gy], 6, BALLS[(col + r) % BALLS.length]);
      setKeys(ball.transform.position, [
        { f: 0, v: [gx, gy] },
        { f: rt, v: [gx, gy] },
        { f: rt + 26, v: [NECK_X + jx, NECK_Y], ease: EASE_IN },
        { f: rt + 60, v: [NECK_X + jx2, 600], ease: LINEAR },
      ]);
      setKeys(ball.transform.rotation, [{ f: rt, v: 0 }, { f: rt + 60, v: col % 2 ? 240 : -240 }]);
      c.push(ball);
      count++;
    }
  }

  // Funnel walls (over the balls, so they tuck behind) + spout
  const lWall = box([332, 40], 16, 200, FUNNEL); lWall.transform.rotation.defaultValue = -34; c.push(lWall);
  const rWall = box([468, 40], 16, 200, FUNNEL); rWall.transform.rotation.defaultValue = 34; c.push(rWall);
  c.push(box([384, 176], 10, 90, FUNNEL));
  c.push(box([416, 176], 10, 90, FUNNEL));

  // Sluice gate: holds the balls, then slides right (pulled by the string) to release them.
  const gate = box([400, -18], 216, 16, GATE);
  setKeys(gate.transform.position, [{ f: 0, v: [400, -18] }, { f: 150, v: [400, -18] }, { f: 166, v: [690, -18], ease: EASE_IN }]);
  c.push(gate);

  return assemble(g, c, DUR);
}

export const chainReaction: AnimationTemplate = {
  id: 'chain-reaction',
  name: 'Chain Reaction',
  category: 'showcase',
  description: 'Dominoes → marble → lever → weight → bucket → string → 200 balls pour through a funnel.',
  tags: ['rube goldberg', 'chain reaction', 'physics', 'dominoes', 'marble', 'balls', 'machine', 'showcase'],
  durationFrames: DUR,
  authorFps: 30,
  build,
};
