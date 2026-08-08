import {
  createRectangleLayer, createCircleLayer, createStarLayer, createTextLayer, createGroupLayer, createKeyframe,
} from '../core/factory';
import type { Layer, ShapeLayer, TextLayer, GroupLayer, Vec2, Vec4, FontWeight, AnimatableProperty } from '../core/types';

// Motion kit — the small vocabulary every template is written in, so authoring one is ~15–40 lines of
// choreography instead of raw keyframe plumbing. All frames are 0-based (rebased to the playhead on
// insert). Layers are authored in GROUP-LOCAL space around (0,0); the builder sets the group's
// position to ctx.center, so a child at local (dx,dy) renders at centre+(dx,dy) (matches the editor's
// createGroup local-coordinate convention).

// ---- Easing (the app's own handles, from menuDefinitions.ts) --------------------------------------
export interface Ease { interp: 'linear' | 'bezier' | 'hold' | 'spring'; handleIn?: Vec2; handleOut?: Vec2 }
export const LINEAR: Ease = { interp: 'linear' };
export const EASE_IN: Ease = { interp: 'bezier', handleIn: [1, 1], handleOut: [0.42, 0.001] };
export const EASE_OUT: Ease = { interp: 'bezier', handleIn: [0.58, 1], handleOut: [0.001, 0.001] };
export const EASE_IO: Ease = { interp: 'bezier', handleIn: [0.58, 1], handleOut: [0.42, 0.001] };
export const SPRING: Ease = { interp: 'spring' };

export interface KeyStep { f: number; v: number | Vec2; ease?: Ease }

/** Write a keyframe track onto an AnimatableProperty. */
export function setKeys(prop: AnimatableProperty, keys: KeyStep[]): void {
  prop.keyframes = keys.map((k) => {
    const e = k.ease ?? LINEAR;
    const kf = createKeyframe(k.f, k.v, e.interp);
    if (e.handleIn) kf.handleIn = e.handleIn;
    if (e.handleOut) kf.handleOut = e.handleOut;
    return kf;
  });
}

// ---- Layer builders (thin wrappers over the factories) --------------------------------------------
const DUR = 600; // clip length placeholder; the builder resets each layer's outPoint to the template's

export function card(pos: Vec2, w: number, h: number, radius: number, fill: Vec4): ShapeLayer {
  const l = createRectangleLayer('Card', pos[0], pos[1], w, h, fill, DUR);
  if (l.shape.type === 'rectangle') l.shape.borderRadius.defaultValue = radius;
  return l;
}

export function box(pos: Vec2, w: number, h: number, fill: Vec4): ShapeLayer {
  return createRectangleLayer('Box', pos[0], pos[1], w, h, fill, DUR);
}

export function dot(pos: Vec2, r: number, fill: Vec4): ShapeLayer {
  return createCircleLayer('Dot', pos[0], pos[1], r, fill, DUR);
}

export function star(pos: Vec2, points: number, outer: number, inner: number, fill: Vec4): ShapeLayer {
  return createStarLayer('Star', pos[0], pos[1], points, outer, inner, fill, DUR);
}

export interface TextOpts { size?: number; weight?: FontWeight; color?: Vec4; align?: 'left' | 'center' | 'right' }
export function label(text: string, pos: Vec2, opts: TextOpts = {}): TextLayer {
  const l = createTextLayer(text, pos[0], pos[1], text, DUR, opts.color ?? [1, 1, 1, 1]);
  const size = opts.size ?? 48;
  l.animOverrides.fontSize.defaultValue = size;
  l.content.spans[0].style.fontSize = size;
  if (opts.weight) l.content.spans[0].style.fontWeight = opts.weight;
  l.layoutConfig.horizontalAlign = opts.align ?? 'center';
  return l;
}

export function group(name: string, center: Vec2): GroupLayer {
  return createGroupLayer(name, center[0], center[1], DUR);
}

/** Parent top-level children to the group (children with an explicit parentId — e.g. nested pivots —
 *  are left alone) and stamp the whole set with the template's clip length. */
export function assemble(g: GroupLayer, children: Layer[], durationFrames: number): Layer[] {
  g.outPoint = durationFrames;
  for (const c of children) {
    if (!c.parentId) c.parentId = g.id;
    c.outPoint = durationFrames;
  }
  return [g, ...children];
}

// ---- Motion presets (compose keyframes onto a layer) ----------------------------------------------
export function fadeIn(l: Layer, at: number, dur = 8, ease: Ease = EASE_OUT): void {
  setKeys(l.transform.opacity, [{ f: at, v: 0 }, { f: at + dur, v: 1, ease }]);
}

/** Append a fade-out (hold at 1, then 0), preserving any earlier opacity keyframes (e.g. a fade-in). */
export function fadeOut(l: Layer, at: number, dur = 8, ease: Ease = EASE_IN): void {
  const p = l.transform.opacity;
  const hold = createKeyframe(at, 1, 'linear');
  const end = createKeyframe(at + dur, 0, ease.interp);
  if (ease.handleIn) end.handleIn = ease.handleIn;
  if (ease.handleOut) end.handleOut = ease.handleOut;
  p.keyframes = [...p.keyframes.filter((k) => k.frame < at), hold, end];
}

export function popIn(l: Layer, at: number, dur = 12): void {
  setKeys(l.transform.scale, [{ f: at, v: [0, 0] }, { f: at + dur, v: [1, 1], ease: SPRING }]);
  setKeys(l.transform.opacity, [{ f: at, v: 0 }, { f: at + Math.min(4, dur), v: 1, ease: EASE_OUT }]);
}

/** Slide in from a local offset to the layer's resting position, fading as it arrives. */
export function flyIn(l: Layer, at: number, dur: number, from: Vec2, ease: Ease = EASE_OUT): void {
  const to = l.transform.position.defaultValue as Vec2;
  setKeys(l.transform.position, [{ f: at, v: [to[0] + from[0], to[1] + from[1]] }, { f: at + dur, v: to, ease }]);
  fadeIn(l, at, Math.min(dur, 8));
}

/** Looping breathe/heartbeat on scale, starting from rest. */
export function pulse(l: Layer, at: number, period = 30, amp = 0.08, cycles = 5): void {
  const keys: KeyStep[] = [];
  for (let i = 0; i < cycles; i++) {
    keys.push({ f: at + i * period, v: [1, 1], ease: EASE_IO });
    keys.push({ f: at + i * period + period / 2, v: [1 + amp, 1 + amp], ease: EASE_IO });
  }
  keys.push({ f: at + cycles * period, v: [1, 1], ease: EASE_IO });
  setKeys(l.transform.scale, keys);
}

export function rotateIn(l: Layer, at: number, dur: number, fromDeg: number, ease: Ease = EASE_OUT): void {
  setKeys(l.transform.rotation, [{ f: at, v: fromDeg }, { f: at + dur, v: 0, ease }]);
}

/** Grow a bar upward by keyframing height + position so the BOTTOM edge stays fixed (avoids anchor
 *  semantics). `bottomY` is the local y of the bar's bottom; `h` the final height. */
export function growUp(bar: ShapeLayer, bottomY: number, h: number, at: number, dur: number): void {
  if (bar.shape.type !== 'rectangle') return;
  setKeys(bar.shape.height, [{ f: at, v: 0 }, { f: at + dur, v: h, ease: EASE_OUT }]);
  setKeys(bar.transform.position, [
    { f: at, v: [(bar.transform.position.defaultValue as Vec2)[0], bottomY] },
    { f: at + dur, v: [(bar.transform.position.defaultValue as Vec2)[0], bottomY - h / 2], ease: EASE_OUT },
  ]);
}

// ---- Ambient loops (for looping scene motion: waves, clouds, sway, twinkle) -----------------------

/** Smooth elliptical drift around the resting position — dx horizontal, dy vertical, `cycles` loops. */
export function floatLoop(l: Layer, dx: number, dy: number, period: number, cycles: number, at = 0, phase = 0): void {
  const base = l.transform.position.defaultValue as Vec2;
  const keys: KeyStep[] = [];
  const steps = Math.max(1, Math.round(cycles * 4));
  for (let i = 0; i <= steps; i++) {
    const f = at + (i / 4) * period;
    const ph = phase + (i / 4) * Math.PI * 2;
    keys.push({ f, v: [base[0] + Math.sin(ph) * dx, base[1] + Math.cos(ph) * dy], ease: EASE_IO });
  }
  setKeys(l.transform.position, keys);
}

/** Rock back and forth around 0° by ±deg — a gentle sway (trees, boats). */
export function swayLoop(l: Layer, deg: number, period: number, cycles: number, at = 0): void {
  const keys: KeyStep[] = [{ f: at, v: 0, ease: EASE_IO }];
  for (let i = 0; i < cycles; i++) {
    const b = at + i * period;
    keys.push({ f: b + period * 0.25, v: deg, ease: EASE_IO });
    keys.push({ f: b + period * 0.5, v: 0, ease: EASE_IO });
    keys.push({ f: b + period * 0.75, v: -deg, ease: EASE_IO });
    keys.push({ f: b + period, v: 0, ease: EASE_IO });
  }
  setKeys(l.transform.rotation, keys);
}

/** Continuous full rotation, `cycles` turns over the clip (sun rays, spinners). */
export function spinLoop(l: Layer, period: number, cycles: number, at = 0): void {
  const keys: KeyStep[] = [];
  for (let i = 0; i <= cycles; i++) keys.push({ f: at + i * period, v: i * 360 });
  setKeys(l.transform.rotation, keys);
}

/** Constant-speed circular/elliptical orbit around the resting position (planets, satellites). */
export function orbit(l: Layer, radius: number, radiusY: number, period: number, cycles: number, phase = 0): void {
  const base = l.transform.position.defaultValue as Vec2;
  const keys: KeyStep[] = [];
  const per = 16; // samples per revolution — smooth circle, linear between for constant speed
  const total = Math.max(1, Math.round(cycles * per));
  for (let i = 0; i <= total; i++) {
    const f = (i / per) * period;
    const a = phase + (i / per) * Math.PI * 2;
    keys.push({ f, v: [base[0] + Math.cos(a) * radius, base[1] + Math.sin(a) * radiusY] });
  }
  setKeys(l.transform.position, keys);
}

/** Repeatedly travel `dist` from the resting position (down for rain/snow, negative for rising
 *  steam), fading in near the start and out near the end so the wrap is invisible. `drift` skews the
 *  sideways travel. */
export function fallLoop(l: Layer, dist: number, period: number, cycles: number, at = 0, drift = 0): void {
  const base = l.transform.position.defaultValue as Vec2;
  const pos: KeyStep[] = [];
  const op: KeyStep[] = [];
  for (let i = 0; i < cycles; i++) {
    const b = at + i * period;
    pos.push({ f: b, v: [base[0] - drift, base[1]] });
    pos.push({ f: b + period - 1, v: [base[0] + drift, base[1] + dist], ease: LINEAR });
    op.push({ f: b, v: 0 });
    op.push({ f: b + 3, v: 1 });
    op.push({ f: b + Math.max(4, period - 6), v: 1 });
    op.push({ f: b + period - 1, v: 0 });
  }
  setKeys(l.transform.position, pos);
  setKeys(l.transform.opacity, op);
}

/** Fly a particle outward from its position along an angle, growing faint + small — firework sparks. */
export function burstOut(l: Layer, at: number, angleDeg: number, dist: number, dur = 18): void {
  const base = l.transform.position.defaultValue as Vec2;
  const a = (angleDeg * Math.PI) / 180;
  const end: Vec2 = [base[0] + Math.cos(a) * dist, base[1] + Math.sin(a) * dist];
  setKeys(l.transform.position, [{ f: at, v: base }, { f: at + dur, v: end, ease: EASE_OUT }]);
  setKeys(l.transform.opacity, [{ f: at, v: 0 }, { f: at + 2, v: 1 }, { f: at + dur * 0.55, v: 1 }, { f: at + dur, v: 0, ease: EASE_IN }]);
  setKeys(l.transform.scale, [{ f: at, v: [1, 1] }, { f: at + dur, v: [0.3, 0.3], ease: EASE_OUT }]);
}

/** Opacity flicker between 1 and `min` — twinkling stars. */
export function twinkle(l: Layer, period: number, cycles: number, at = 0, min = 0.3): void {
  const keys: KeyStep[] = [];
  for (let i = 0; i <= cycles * 2; i++) keys.push({ f: at + (i / 2) * period, v: i % 2 === 0 ? 1 : min, ease: EASE_IO });
  setKeys(l.transform.opacity, keys);
}

/** Attach an outer glow to a shape (renders as a real bloom pass). */
export function glow(l: ShapeLayer, color: Vec4, intensity = 1, radius = 24): ShapeLayer {
  l.glow = { enabled: true, mode: 'outer', onlyGlow: false, color, intensity, radius, threshold: 0.15 };
  return l;
}

/** Make a circle render as a wide, flat ellipse (waves, clouds, hills). */
export function ellipse(l: ShapeLayer, scaleX: number, scaleY: number): ShapeLayer {
  l.transform.scale.defaultValue = [scaleX, scaleY];
  return l;
}

/** Reveal a horizontal bar left-to-right by keyframing width + position (left edge fixed at leftX). */
export function growRight(bar: ShapeLayer, leftX: number, w: number, at: number, dur: number): void {
  if (bar.shape.type !== 'rectangle') return;
  setKeys(bar.shape.width, [{ f: at, v: 0 }, { f: at + dur, v: w, ease: EASE_OUT }]);
  setKeys(bar.transform.position, [
    { f: at, v: [leftX, (bar.transform.position.defaultValue as Vec2)[1]] },
    { f: at + dur, v: [leftX + w / 2, (bar.transform.position.defaultValue as Vec2)[1]], ease: EASE_OUT },
  ]);
}
