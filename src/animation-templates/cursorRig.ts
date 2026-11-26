import { createCircleLayer } from '../core/factory';
import type { AnimatableProperty, GroupLayer, Keyframe, Layer, ShapeLayer, Vec2, Vec4 } from '../core/types';
import { buildKeyframesFromSpecs, easeSpecError, type CubicBezierQuad, type KeyframeEaseSpec } from '../core/keyframeSpecs';
import { evaluateNumber, evaluateVec2 } from '../core/interpolation';
import { makeCursor, type CursorIcon } from './cursor';

// B51 - the agent-facing cursor rig. Builds on the template cursor (animation-templates/cursor.ts: the
// same stacked icon polygons, tip at the group origin) but writes SPARSE, editable keyframes on absolute
// comp frames instead of the template's baked per-frame waypoints:
//   - a move is two position keys (start = where the cursor is at that frame, end = the target) with a
//     ballistic ease-out and a gentle arc as spatial tangents (one curve, editable in the graph editor);
//   - a click is a scale squash (base -> squash at the click frame -> base) plus an optional ripple ring;
//   - an icon swap is a hold step on the icons' opacity.
// Pure (no store): the agent runtime commits each result as ONE undo step via editor.applyLayerEdits.

/** Icons the agent rig carries (one polygon layer each, one visible at a time). */
export const AGENT_CURSOR_ICONS = ['arrow', 'hand', 'ibeam'] as const satisfies readonly CursorIcon[];
export type AgentCursorIcon = (typeof AGENT_CURSOR_ICONS)[number];

/** Ballistic ease-out: the template rig's 1 - (1 - t)^2.6 (70% of the distance in the first ~38% of
 *  the time) fitted as a CSS cubic-bezier (rms error 0.001). */
export const BALLISTIC_EASE: CubicBezierQuad = [0.38, 1, 0.76, 1];

/** Natural icon height in px at scale 1 (the arrow outline). */
const ICON_PX = 20;

const isAgentIcon = (v: unknown): v is AgentCursorIcon => typeof v === 'string' && (AGENT_CURSOR_ICONS as readonly string[]).includes(v);

/** The template rig's move duration (190 ms + 0.32 ms per px, clamped to 220..450 ms) in frames. */
export function ballisticMoveFrames(distance: number, fps: number): number {
  const ms = Math.max(220, Math.min(450, 190 + distance * 0.32));
  return Math.max(4, Math.round((ms / 1000) * fps));
}

export interface AddCursorOptions {
  icon?: AgentCursorIcon;
  x: number;
  y: number;
  /** First frame the cursor is on screen. */
  frame: number;
  /** Clip end (exclusive), usually the composition length. */
  endFrame: number;
  color?: Vec4;
  /** Icon height in px (default 36). */
  size?: number;
  name?: string;
}

/** A new cursor: [group, ...icon layers]; the group position is the hotspot (the arrow tip). */
export function buildAgentCursor(opts: AddCursorOptions): Layer[] {
  const icon = opts.icon ?? 'arrow';
  if (!isAgentIcon(icon)) throw new Error(`"icon" must be one of ${AGENT_CURSOR_ICONS.join(', ')}`);
  const rig = makeCursor(opts.name ?? 'Cursor', opts.color ?? [1, 1, 1, 1], [opts.x, opts.y], 1, AGENT_CURSOR_ICONS);
  const k = (opts.size ?? 36) / ICON_PX;
  rig.group.transform.scale.defaultValue = [k, k];
  const out: Layer[] = [rig.group, ...rig.layers];
  for (const l of out) {
    l.inPoint = Math.round(opts.frame);
    l.outPoint = Math.max(l.inPoint + 1, Math.round(opts.endFrame));
  }
  for (const kind of AGENT_CURSOR_ICONS) {
    const shape = rig.icons[kind];
    if (shape) shape.transform.opacity.defaultValue = kind === icon ? 1 : 0;
  }
  return out;
}

export interface CursorRigRef {
  group: GroupLayer;
  icons: Partial<Record<AgentCursorIcon, ShapeLayer>>;
}

/** Find a cursor rig by its group id (or the id of one of its icon layers). Throws when it is not one. */
export function findCursorRig(layers: readonly Layer[], id: string): CursorRigRef {
  let layer = layers.find((l) => l.id === id);
  if (!layer) throw new Error(`no layer with id "${id}"`);
  if (layer.type !== 'group' && layer.parentId) layer = layers.find((l) => l.id === layer!.parentId) ?? layer;
  if (layer.type !== 'group') throw new Error(`layer "${id}" is not a cursor (use the id agent.addCursor returned)`);
  const group = layer;
  const icons: Partial<Record<AgentCursorIcon, ShapeLayer>> = {};
  for (const l of layers) if (l.parentId === group.id && l.type === 'shape' && isAgentIcon(l.name)) icons[l.name] = l;
  if (!icons.arrow && !icons.hand && !icons.ibeam) throw new Error(`group "${id}" is not a cursor rig (no arrow / hand / ibeam icon children)`);
  return { group, icons };
}

/**
 * Splice a contiguous run of fresh keys into an existing list: existing keys strictly inside the run's
 * span are dropped; where a fresh boundary key lands on an existing key, the side of that key OUTSIDE the
 * run (the incoming ease / spatial tangent of the first key, the outgoing ones of the last) is kept, so
 * neighbouring moves keep their curves.
 */
export function spliceKeys(existing: readonly Keyframe[], fresh: readonly Keyframe[]): Keyframe[] {
  if (fresh.length === 0) return existing.map((k) => ({ ...k }));
  const first = fresh[0].frame;
  const last = fresh[fresh.length - 1].frame;
  const byFrame = new Map(existing.map((k) => [k.frame, k]));
  const kept = existing.filter((k) => k.frame < first || k.frame > last).map((k) => ({ ...k }));
  const merged = fresh.map((k, i) => {
    const old = byFrame.get(k.frame);
    const out: Keyframe = { ...k };
    if (!old) return out;
    if (i === 0) {
      out.handleIn = old.handleIn;
      if (old.spatialIn) out.spatialIn = old.spatialIn; else delete out.spatialIn;
    }
    if (i === fresh.length - 1 && fresh.length > 1) {
      out.interpolation = old.interpolation;
      out.handleOut = old.handleOut;
      if (old.easing) out.easing = old.easing; else delete out.easing;
      if (old.spatialOut) out.spatialOut = old.spatialOut; else delete out.spatialOut;
    }
    return out;
  });
  return [...kept, ...merged].sort((a, b) => a.frame - b.frame);
}

const withKeys = (prop: AnimatableProperty, keyframes: Keyframe[]): AnimatableProperty => ({ ...prop, keyframes });

export interface CursorMoveOptions {
  frame: number;
  to: Vec2;
  fps: number;
  durationFrames?: number;
  ease?: KeyframeEaseSpec;
  /** Bow of the path as a fraction of the distance (default 0.08; negative bows the other way; 0 = straight). */
  arc?: number;
}

export interface CursorMovePlan {
  group: GroupLayer;
  from: Vec2;
  to: Vec2;
  startFrame: number;
  endFrame: number;
}

/** Two position keys (ballistic by default, arced by spatial tangents) from where the cursor is at `frame` to `to`. */
export function planCursorMove(group: GroupLayer, opts: CursorMoveOptions): CursorMovePlan {
  const ease = opts.ease ?? BALLISTIC_EASE;
  const err = easeSpecError(ease);
  if (err) throw new Error(`ease: ${err}`);
  const start = Math.round(opts.frame);
  const from = evaluateVec2(group.transform.position, start);
  const to: Vec2 = [opts.to[0], opts.to[1]];
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const dist = Math.hypot(dx, dy);
  const dur = opts.durationFrames !== undefined ? Math.max(1, Math.round(opts.durationFrames)) : ballisticMoveFrames(dist, opts.fps);
  const end = start + dur;
  const fresh = buildKeyframesFromSpecs([{ frame: start, value: from, ease }, { frame: end, value: to }]);
  const arc = opts.arc ?? 0.08;
  if (arc !== 0 && dist > 1e-6) {
    // Quadratic arc through a control point off the midpoint, as the equivalent cubic spatial tangents.
    const cx = from[0] + dx / 2 - (dy / dist) * arc * dist;
    const cy = from[1] + dy / 2 + (dx / dist) * arc * dist;
    fresh[0].spatialOut = [(2 / 3) * (cx - from[0]), (2 / 3) * (cy - from[1])];
    fresh[0].spatialMode = 'bezier';
    fresh[1].spatialIn = [(2 / 3) * (cx - to[0]), (2 / 3) * (cy - to[1])];
    fresh[1].spatialMode = 'bezier';
  }
  const position = withKeys(group.transform.position, spliceKeys(group.transform.position.keyframes, fresh));
  return { group: { ...group, transform: { ...group.transform, position } }, from, to, startFrame: start, endFrame: end };
}

export interface CursorClickOptions {
  frame: number;
  /** Scale factor at the click frame (default 0.82). */
  squash?: number;
  /** Frames of the press before the click (default 2) and of the release after it (default 4). */
  pressFrames?: number;
  releaseFrames?: number;
}

/** Scale squash: base at frame - press, base * squash AT the click frame, back to base at frame + release. */
export function planCursorClick(group: GroupLayer, opts: CursorClickOptions): GroupLayer {
  const f = Math.round(opts.frame);
  const press = Math.max(1, Math.round(opts.pressFrames ?? 2));
  const release = Math.max(1, Math.round(opts.releaseFrames ?? 4));
  const squash = opts.squash ?? 0.82;
  if (!(squash > 0)) throw new Error('"squash" must be a positive scale factor');
  const base = evaluateVec2(group.transform.scale, f - press);
  const fresh = buildKeyframesFromSpecs([
    { frame: f - press, value: base, ease: 'cubicOut' },
    { frame: f, value: [base[0] * squash, base[1] * squash], ease: 'cubicOut' },
    { frame: f + release, value: base },
  ]);
  const scale = withKeys(group.transform.scale, spliceKeys(group.transform.scale.keyframes, fresh));
  return { ...group, transform: { ...group.transform, scale } };
}

/** A ring that expands and fades at the cursor hotspot on the click frame (its own editable layer). */
export function buildClickRipple(group: GroupLayer, frame: number, opts: { color?: Vec4; radius?: number; durationFrames?: number } = {}): ShapeLayer {
  const f = Math.round(frame);
  const dur = Math.max(2, Math.round(opts.durationFrames ?? 12));
  const pos = evaluateVec2(group.transform.position, f);
  const k = evaluateVec2(group.transform.scale, f)[0];
  const radius = opts.radius ?? (ICON_PX * 0.8 * Math.abs(k || 1));
  const color = opts.color ?? [1, 1, 1, 0.9];
  const ring = createCircleLayer('Click ripple', pos[0], pos[1], radius, [color[0], color[1], color[2], 0], dur + 1);
  ring.parentId = group.parentId;
  if (ring.shape.type === 'circle') {
    ring.shape.strokeColor = [color[0], color[1], color[2], color[3]];
    ring.shape.strokeWidth.defaultValue = Math.max(2, radius * 0.12);
  }
  ring.inPoint = f;
  ring.outPoint = f + dur + 1;
  ring.transform.scale.keyframes = buildKeyframesFromSpecs([{ frame: f, value: [0.25, 0.25], ease: 'cubicOut' }, { frame: f + dur, value: [1, 1] }]);
  // Transparent before the click (a hold key one frame early), so the ring may sit on a longer clip.
  ring.transform.opacity.keyframes = buildKeyframesFromSpecs([{ frame: f - 1, value: 0, ease: 'hold' }, { frame: f, value: 1, ease: 'quadIn' }, { frame: f + dur, value: 0 }]);
  return ring;
}

/** The icon showing at a frame (the most opaque one). */
export function cursorIconAt(rig: CursorRigRef, frame: number): AgentCursorIcon | null {
  let best: AgentCursorIcon | null = null, bestOp = -1;
  for (const kind of AGENT_CURSOR_ICONS) {
    const l = rig.icons[kind];
    if (!l) continue;
    const op = evaluateNumber(l.transform.opacity, frame);
    if (op > bestOp) { bestOp = op; best = kind; }
  }
  return best;
}

/** Hold-step the icons' opacity so `icon` shows from `frame` on (the others hide). Returns the changed icon layers. */
export function planCursorIcon(rig: CursorRigRef, frame: number, icon: AgentCursorIcon): ShapeLayer[] {
  if (!isAgentIcon(icon)) throw new Error(`"icon" must be one of ${AGENT_CURSOR_ICONS.join(', ')}`);
  if (!rig.icons[icon]) throw new Error(`this cursor has no "${icon}" icon`);
  const f = Math.round(frame);
  const out: ShapeLayer[] = [];
  for (const kind of AGENT_CURSOR_ICONS) {
    const l = rig.icons[kind];
    if (!l) continue;
    const prev = evaluateNumber(l.transform.opacity, f - 1);
    const fresh = buildKeyframesFromSpecs([{ frame: f - 1, value: prev, ease: 'hold' }, { frame: f, value: kind === icon ? 1 : 0, ease: 'hold' }]);
    const opacity = withKeys(l.transform.opacity, spliceKeys(l.transform.opacity.keyframes, fresh));
    out.push({ ...l, transform: { ...l.transform, opacity } });
  }
  return out;
}
