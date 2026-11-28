import { createCircleLayer } from '../core/factory';
import type { AnimatableProperty, GroupLayer, Keyframe, Layer, ShapeLayer, Vec2, Vec4 } from '../core/types';
import { buildKeyframesFromSpecs, easeSpecError, type CubicBezierQuad, type KeyframeEaseSpec } from '../core/keyframeSpecs';
import { evaluateNumber, evaluateVec2 } from '../core/interpolation';
import { cursorIconShape, makeCursor, makeCursorIcon, type CursorIcon } from './cursor';

// B51 - the agent-facing cursor rig. Builds on the template cursor (animation-templates/cursor.ts: the
// same stacked icon polygons, tip at the group origin) but writes SPARSE, editable keyframes on absolute
// comp frames instead of the template's baked per-frame waypoints:
//   - a move is two position keys (start = where the cursor is at that frame, end = the target) with a
//     ballistic ease-out and a gentle arc as spatial tangents (one curve, editable in the graph editor);
//   - a click is a scale squash (base -> squash at the click frame -> base) plus an optional ripple ring;
//   - an icon swap is a hold step on the icons' opacity.
// Pure (no store): the agent runtime commits each result as ONE undo step via editor.applyLayerEdits.

/** Icons every agent rig carries (one polygon layer each, one visible at a time). */
export const AGENT_CURSOR_ICONS = ['arrow', 'hand', 'ibeam'] as const satisfies readonly CursorIcon[];
/** B76 design-app tool icons: added to a rig on demand (agent.addCursor with one of them, or agent.cursorIcon). */
export const DESIGN_CURSOR_ICONS = ['pen', 'crosshair', 'rotate', 'directSelect', 'resize'] as const satisfies readonly CursorIcon[];
/** Every icon an agent rig may hold. */
export const ALL_AGENT_CURSOR_ICONS = [...AGENT_CURSOR_ICONS, ...DESIGN_CURSOR_ICONS] as const;
export type AgentCursorIcon = (typeof ALL_AGENT_CURSOR_ICONS)[number];

/** Ballistic ease-out: the template rig's 1 - (1 - t)^2.6 (70% of the distance in the first ~38% of
 *  the time) fitted as a CSS cubic-bezier (rms error 0.001). */
export const BALLISTIC_EASE: CubicBezierQuad = [0.38, 1, 0.76, 1];

/** Natural icon height in px at scale 1 (the arrow outline). */
const ICON_PX = 20;

const isAgentIcon = (v: unknown): v is AgentCursorIcon => typeof v === 'string' && (ALL_AGENT_CURSOR_ICONS as readonly string[]).includes(v);

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
  /** B76: icon outline colour (default near-black; white gives the macOS black-arrow-with-white-rim look). */
  rim?: Vec4;
  /** Icon height in px (default 36). */
  size?: number;
  name?: string;
}

/** B76: where an icon sits in the AGENT rig so its hotspot is the group origin (the template resize arrow is
 *  drawn from its left tip at (0, 8); in a design app the double arrow's hotspot is its centre). */
export function agentIconOffset(kind: AgentCursorIcon): Vec2 | null {
  if (kind === 'hand') return AGENT_HAND_OFFSET;
  if (kind === 'resize') return [-12, -5];
  return null;
}

/** B67 follow-up (r06): the hand icon's local position in the AGENT rig, so the index fingertip (the top of the
 *  finger, (4.5, 0) in the icon's own outline) sits on the group origin = the hotspot. The template rig keeps
 *  (2, 2), which put the fingertip down-right of the click point. */
export const AGENT_HAND_OFFSET: Vec2 = [-4.5, 0];

/** A new cursor: [group, ...icon layers]; the group position is the hotspot (the arrow tip, the hand's
 *  fingertip, the I-beam's centre). */
export function buildAgentCursor(opts: AddCursorOptions): Layer[] {
  const icon = opts.icon ?? 'arrow';
  if (!isAgentIcon(icon)) throw new Error(`"icon" must be one of ${ALL_AGENT_CURSOR_ICONS.join(', ')}`);
  // B76: a design-tool icon joins the three base icons only when asked for (old rigs keep their 3 children).
  const kinds: AgentCursorIcon[] = [...AGENT_CURSOR_ICONS, ...((DESIGN_CURSOR_ICONS as readonly string[]).includes(icon) ? [icon] : [])];
  const rig = makeCursor(opts.name ?? 'Cursor', opts.color ?? [1, 1, 1, 1], [opts.x, opts.y], 1, kinds);
  const k = (opts.size ?? 36) / ICON_PX;
  rig.group.transform.scale.defaultValue = [k, k];
  for (const kind of kinds) {
    const shape = rig.icons[kind];
    const off = agentIconOffset(kind);
    if (shape && off) shape.transform.position.defaultValue = [off[0], off[1]];
    if (shape && opts.rim && shape.shape.type === 'polygon') shape.shape.strokeColor = [opts.rim[0], opts.rim[1], opts.rim[2], opts.rim[3]];
  }
  const out: Layer[] = [rig.group, ...rig.layers];
  for (const l of out) {
    l.inPoint = Math.round(opts.frame);
    l.outPoint = Math.max(l.inPoint + 1, Math.round(opts.endFrame));
  }
  for (const kind of kinds) {
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
  const children = layers.filter((l): l is ShapeLayer => l.parentId === group.id && l.type === 'shape');
  // Name first (the rig's own names), then B70: an icon the user renamed is still found by its outline.
  for (const l of children) if (isAgentIcon(l.name) && !icons[l.name]) icons[l.name] = l;
  for (const l of children) {
    if (isAgentIcon(l.name)) continue;
    const kind = cursorIconKindByGeometry(l);
    if (kind && !icons[kind]) icons[kind] = l;
  }
  if (!icons.arrow && !icons.hand && !icons.ibeam) throw new Error(`group "${id}" is not a cursor rig (no arrow / hand / ibeam icon children; use the cursorId agent.addCursor returned)`);
  return { group, icons };
}

let iconSignatures: { kind: AgentCursorIcon; pts: Vec2[] }[] | null = null;

/** B70: which agent-rig icon a shape layer is, from its polygon outline (rename-proof); null when it is none. */
export function cursorIconKindByGeometry(layer: ShapeLayer): AgentCursorIcon | null {
  if (layer.shape.type !== 'polygon') return null;
  const verts = layer.shape.vertices;
  iconSignatures ??= ALL_AGENT_CURSOR_ICONS.map((kind) => {
    const ref = cursorIconShape(kind, [1, 1, 1, 1]).shape;
    return { kind, pts: ref.type === 'polygon' ? ref.vertices.map((v) => v.position) : [] };
  });
  for (const sig of iconSignatures) {
    if (sig.pts.length !== verts.length) continue;
    if (sig.pts.every((p, i) => Math.abs(p[0] - verts[i].position[0]) < 1e-3 && Math.abs(p[1] - verts[i].position[1]) < 1e-3)) return sig.kind;
  }
  return null;
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

/**
 * B76: a design-tool icon this rig does not hold yet, as a new hidden child (opacity 0, sized and coloured like
 * the rig's arrow) so planCursorIcon can show it. Null when the rig already has it.
 */
export function buildMissingCursorIcon(rig: CursorRigRef, icon: AgentCursorIcon): ShapeLayer | null {
  if (rig.icons[icon]) return null;
  const ref = rig.icons.arrow ?? rig.icons.hand ?? rig.icons.ibeam;
  const color: Vec4 = ref && ref.shape.type === 'polygon' ? [...ref.shape.fillColor] as Vec4 : [1, 1, 1, 1];
  const s = makeCursorIcon(icon, color, rig.group.id);
  if (ref && ref.shape.type === 'polygon' && s.shape.type === 'polygon') s.shape.strokeColor = [...ref.shape.strokeColor] as Vec4;
  const off = agentIconOffset(icon);
  if (off) s.transform.position.defaultValue = [off[0], off[1]];
  s.transform.opacity.defaultValue = 0;
  if (ref) { s.inPoint = ref.inPoint; s.outPoint = ref.outPoint; } else { s.inPoint = rig.group.inPoint; s.outPoint = rig.group.outPoint; }
  return s;
}

/** The icon showing at a frame (the most opaque one). */
export function cursorIconAt(rig: CursorRigRef, frame: number): AgentCursorIcon | null {
  let best: AgentCursorIcon | null = null, bestOp = -1;
  for (const kind of ALL_AGENT_CURSOR_ICONS) {
    const l = rig.icons[kind];
    if (!l) continue;
    const op = evaluateNumber(l.transform.opacity, frame);
    if (op > bestOp) { bestOp = op; best = kind; }
  }
  return best;
}

/** Hold-step the icons' opacity so `icon` shows from `frame` on (the others hide). Returns the changed icon layers. */
export function planCursorIcon(rig: CursorRigRef, frame: number, icon: AgentCursorIcon): ShapeLayer[] {
  if (!isAgentIcon(icon)) throw new Error(`"icon" must be one of ${ALL_AGENT_CURSOR_ICONS.join(', ')}`);
  if (!rig.icons[icon]) throw new Error(`this cursor has no "${icon}" icon`);
  const f = Math.round(frame);
  const out: ShapeLayer[] = [];
  for (const kind of ALL_AGENT_CURSOR_ICONS) {
    const l = rig.icons[kind];
    if (!l) continue;
    const prev = evaluateNumber(l.transform.opacity, f - 1);
    const fresh = buildKeyframesFromSpecs([{ frame: f - 1, value: prev, ease: 'hold' }, { frame: f, value: kind === icon ? 1 : 0, ease: 'hold' }]);
    const opacity = withKeys(l.transform.opacity, spliceKeys(l.transform.opacity.keyframes, fresh));
    out.push({ ...l, transform: { ...l.transform, opacity } });
  }
  return out;
}
