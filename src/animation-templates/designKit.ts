import { createGroupLayer, createRectangleLayer, createTextLayer } from '../core/factory';
import { buildKeyframesFromSpecs } from '../core/keyframeSpecs';
import type { AnimatableProperty, Keyframe, Layer, ResolvedLayer, ResolvedTransform, ShapeLayer, TextLayer, Vec2, Vec4 } from '../core/types';
import { normalizeTextCounter, type TextCounter } from '../core/textCounter';

// B76 - design-tool UI kit (r11: an "animation dressed as a screen capture" of a vector app). Pure helpers
// (no store) that turn a TARGET layer's rendered geometry, sampled frame by frame through resolveFrame, into
// ordinary editable layers:
//   - a selection box: a 1 px outline rectangle that sits on the target's oriented bounds (it rotates and
//     resizes with it) plus 8 (or 4) square handles on its corners / edge midpoints;
//   - anchor squares: one small square on each chosen path vertex of the target (they ride point-pose
//     morphs, rotations, parents and motion paths, because the vertices come from the resolved frame);
//   - a number readout: a translucent tooltip whose lines (dX / dY / W / H / Angle...) count with the move.
//     Each value is a B75 counter span driven by a per-frame `samples` table, so the text is exactly the
//     measured delta on every frame, keeps its font, and stays editable;
//   - a smart-guide label: a small magenta word ("anchor", "center") with an optional pin line.
// Tracking is BAKED: the box / squares / tooltip carry one linear key per frame where the target moves (keys
// that a straight line already predicts are dropped). Re-run the action after re-timing the target.

/** One frame of the target's rendered geometry (comp px). */
export interface TargetSample {
  frame: number;
  /** Centre of the oriented box. */
  center: Vec2;
  /** Oriented box corners TL, TR, BR, BL (in the layer's own rotated frame). */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Box size along the layer's own axes (comp px, scale applied, unsigned). */
  width: number;
  height: number;
  /** The layer's world rotation in degrees. */
  rotation: number;
  /** Path vertices in comp px (polygon / outlined glyph targets; empty otherwise). */
  points: Vec2[];
  /** The layer's world position (its pivot, comp px). */
  position: Vec2;
}

const rad = (d: number): number => (d * Math.PI) / 180;

/** Local point -> comp px, the same mapping as the path vertex shader (store/pathTransform.ts localToComp). */
export function localToCompPoint(t: ResolvedTransform, p: Vec2): Vec2 {
  const a = rad(t.rotation);
  const c = Math.cos(a), s = Math.sin(a);
  const sx = p[0] * t.scaleX - t.anchorX, sy = p[1] * t.scaleY - t.anchorY;
  return [sx * c - sy * s + t.anchorX + t.positionX, sx * s + sy * c + t.anchorY + t.positionY];
}

/** The local-space box [minX, minY, maxX, maxY] of a resolved layer's drawn geometry, or null when it has none we can measure. */
export function localBoxOf(r: ResolvedLayer): [number, number, number, number] | null {
  const sh = r.shape;
  if (sh) {
    if (sh.renderType === 'polygon') {
      if (sh.vertices.length === 0) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const v of sh.vertices) {
        x0 = Math.min(x0, v.position[0]); y0 = Math.min(y0, v.position[1]);
        x1 = Math.max(x1, v.position[0]); y1 = Math.max(y1, v.position[1]);
      }
      return [x0, y0, x1, y1];
    }
    if (sh.renderType === 'star') return [-sh.outerRadius, -sh.outerRadius, sh.outerRadius, sh.outerRadius];
    if (sh.renderType === 'circle' && !(sh.width > 0 && sh.height > 0)) return [-sh.radius, -sh.radius, sh.radius, sh.radius];
    return [-sh.width / 2, -sh.height / 2, sh.width / 2, sh.height / 2];
  }
  if (r.image) {
    const im = r.image as unknown as { width?: number; height?: number };
    if (typeof im.width === 'number' && typeof im.height === 'number') return [-im.width / 2, -im.height / 2, im.width / 2, im.height / 2];
  }
  if (r.video) {
    const v = r.video as unknown as { width?: number; height?: number };
    if (typeof v.width === 'number' && typeof v.height === 'number') return [-v.width / 2, -v.height / 2, v.width / 2, v.height / 2];
  }
  return null;
}

/**
 * One frame's sample from the target's resolved layer (null when it draws nothing measurable). `anchors`
 * (layer-local) overrides the path points: an arc-length shape morph draws resampled points between poses,
 * so the caller passes the logical anchors (shapeModifiers evalPathAnchors) to keep squares on the anchors.
 */
export function sampleFromResolved(r: ResolvedLayer, frame: number, anchors?: Vec2[] | null): TargetSample | null {
  const box = localBoxOf(r);
  if (!box) return null;
  const t = r.transform;
  const [x0, y0, x1, y1] = box;
  const corners: [Vec2, Vec2, Vec2, Vec2] = [
    localToCompPoint(t, [x0, y0]), localToCompPoint(t, [x1, y0]), localToCompPoint(t, [x1, y1]), localToCompPoint(t, [x0, y1]),
  ];
  // A mirrored scale flips the box's own axes; keep TL..BL in screen order of the rotated frame.
  const center: Vec2 = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
  const points = anchors ? anchors.map((p) => localToCompPoint(t, p))
    : r.shape && r.shape.renderType === 'polygon' ? r.shape.vertices.map((v) => localToCompPoint(t, v.position)) : [];
  return {
    frame, center, corners,
    width: Math.abs((x1 - x0) * t.scaleX), height: Math.abs((y1 - y0) * t.scaleY),
    rotation: t.rotation, points, position: [t.positionX, t.positionY],
  };
}

// ---------------------------------------------------------------- keys

const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

/**
 * Per-frame values -> sparse linear keys: a key on the first and last frame, plus every frame whose value a
 * straight line between its kept neighbours does not already predict (within eps). Constant runs collapse
 * to their two ends; a constant track has no keys at all (returns []), the caller sets defaultValue.
 */
export function sparseLinearKeys(frames: number[], values: number[][], eps = 0.01): { frame: number; value: number[] }[] {
  const n = frames.length;
  if (n === 0) return [];
  const allSame = values.every((v) => v.every((c, i) => near(c, values[0][i], eps)));
  if (allSame) return [];
  const keep: number[] = [0];
  for (let i = 1; i < n - 1; i++) {
    const a = keep[keep.length - 1];
    const fa = frames[a], fb = frames[i + 1];
    const u = (frames[i] - fa) / (fb - fa || 1);
    const predicted = values[a].map((c, k) => c + (values[i + 1][k] - c) * u);
    if (!predicted.every((p, k) => near(p, values[i][k], eps))) keep.push(i);
  }
  if (n > 1) keep.push(n - 1);
  return keep.map((i) => ({ frame: frames[i], value: values[i] }));
}

function keyed(prop: AnimatableProperty, frames: number[], values: number[][], eps = 0.01): AnimatableProperty {
  const keys = sparseLinearKeys(frames, values, eps);
  const dim = values[0]?.length ?? 1;
  const def = dim === 1 ? values[0]?.[0] ?? 0 : (values[0] ?? [0, 0]);
  if (keys.length === 0) return { ...prop, defaultValue: def as AnimatableProperty['defaultValue'], keyframes: [] };
  const built: Keyframe[] = buildKeyframesFromSpecs(keys.map((k) => ({ frame: k.frame, value: (dim === 1 ? k.value[0] : [k.value[0], k.value[1]]) as Keyframe['value'], ease: 'linear' as const })));
  return { ...prop, defaultValue: def as AnimatableProperty['defaultValue'], keyframes: built };
}

/** Unwrap a rotation series so a +179 -> -179 step stays a 2 degree turn (resolved rotation is continuous anyway). */
function unwrapDegrees(v: number[]): number[] {
  const out = v.slice();
  for (let i = 1; i < out.length; i++) {
    let d = out[i] - out[i - 1];
    while (d > 180) { out[i] -= 360; d -= 360; }
    while (d < -180) { out[i] += 360; d += 360; }
  }
  return out;
}

const clipTo = (l: Layer, start: number, end: number): void => { l.inPoint = start; l.outPoint = Math.max(start + 1, end); };
/** Mark a kit part (LayerDecorations.rigRole, persisted). */
const tag = (l: Layer, role: string): void => { l.rigRole = role; };

// ---------------------------------------------------------------- selection box

export const DESIGN_BLUE: Vec4 = [0.2, 0.52, 1, 1];
export const GUIDE_MAGENTA: Vec4 = [0.86, 0.16, 0.82, 1];

export interface SelectionBoxOptions {
  /** 'all' = 4 corners + 4 edge midpoints (default), 'corners' = 4, 'none' = outline only. */
  handles?: 'all' | 'corners' | 'none';
  color?: Vec4;
  /** Handle square side in px (default 7). */
  handleSize?: number;
  /** Outline width in px (default 1). */
  strokeWidth?: number;
  /** Extra space around the target on every side, px (default 0). */
  padding?: number;
  name?: string;
  /** Clip end (exclusive); default last sample + 1. */
  endFrame?: number;
}

export interface SelectionBoxPlan {
  layers: Layer[];
  groupId: string;
  outlineId: string;
  handleIds: string[];
}

/** Handle offsets from the box centre in the box's own axes for w x h: TL, TR, BR, BL, then T, R, B, L. */
export function handleOffsets(w: number, h: number, mode: 'all' | 'corners'): Vec2[] {
  const hw = w / 2, hh = h / 2;
  const c: Vec2[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return mode === 'corners' ? c : [...c, [0, -hh], [hw, 0], [0, hh], [-hw, 0]];
}

/**
 * A selection box that follows the samples: a group at the target's box centre, rotated with it; inside, a
 * stroke-only rectangle sized to the box and the handle squares at its corners (/ edge midpoints). Rotation
 * keeps the squares square, so only the group's position / rotation and the outline's size / the handles'
 * offsets are keyed.
 */
export function planSelectionBox(samples: TargetSample[], opts: SelectionBoxOptions = {}): SelectionBoxPlan {
  if (samples.length === 0) throw new Error('the target draws nothing measurable over that range');
  const color = opts.color ?? DESIGN_BLUE;
  const pad = Math.max(0, opts.padding ?? 0);
  const hs = Math.max(1, opts.handleSize ?? 7);
  const sw = Math.max(0.5, opts.strokeWidth ?? 1);
  const mode = opts.handles ?? 'all';
  const start = samples[0].frame;
  const end = opts.endFrame ?? samples[samples.length - 1].frame + 1;
  const frames = samples.map((s) => s.frame);
  const sizes = samples.map((s) => [s.width + pad * 2, s.height + pad * 2]);

  const group = createGroupLayer(opts.name ?? 'Selection box', samples[0].center[0], samples[0].center[1], end);
  tag(group, 'design.selection');
  group.transform.position = keyed(group.transform.position, frames, samples.map((s) => [s.center[0], s.center[1]]));
  group.transform.rotation = keyed(group.transform.rotation, frames, unwrapDegrees(samples.map((s) => s.rotation)).map((r) => [r]), 0.0005);

  const outline = createRectangleLayer('Selection outline', 0, 0, sizes[0][0], sizes[0][1], [0, 0, 0, 0], end);
  outline.parentId = group.id;
  tag(outline, 'design.selection.outline');
  if (outline.shape.type === 'rectangle') {
    outline.shape.strokeColor = [color[0], color[1], color[2], color[3]];
    outline.shape.strokeWidth = { ...outline.shape.strokeWidth, defaultValue: sw };
    outline.shape.width = keyed(outline.shape.width, frames, sizes.map((s) => [s[0]]));
    outline.shape.height = keyed(outline.shape.height, frames, sizes.map((s) => [s[1]]));
  }
  const layers: Layer[] = [group, outline];
  const handleIds: string[] = [];
  if (mode !== 'none') {
    const count = mode === 'corners' ? 4 : 8;
    const names = ['TL', 'TR', 'BR', 'BL', 'T', 'R', 'B', 'L'];
    for (let i = 0; i < count; i++) {
      const offs = sizes.map((s) => handleOffsets(s[0], s[1], mode)[i]);
      const h = createRectangleLayer(`Handle ${names[i]}`, offs[0][0], offs[0][1], hs, hs, [1, 1, 1, 1], end);
      h.parentId = group.id;
      tag(h, `design.selection.handle.${names[i]}`);
      if (h.shape.type === 'rectangle') {
        h.shape.strokeColor = [color[0], color[1], color[2], color[3]];
        h.shape.strokeWidth = { ...h.shape.strokeWidth, defaultValue: sw };
      }
      h.transform.position = keyed(h.transform.position, frames, offs.map((o) => [o[0], o[1]]));
      layers.push(h);
      handleIds.push(h.id);
    }
  }
  for (const l of layers) clipTo(l, start, end);
  return { layers, groupId: group.id, outlineId: outline.id, handleIds };
}

// ---------------------------------------------------------------- anchor squares

export interface AnchorSquaresOptions {
  /** Vertex indices (default every vertex). */
  points?: number[];
  /** Indices drawn filled with the colour (the selected / dragged anchor). */
  highlight?: number[];
  color?: Vec4;
  /** Square side in px (default 7). */
  size?: number;
  strokeWidth?: number;
  name?: string;
  endFrame?: number;
}

export interface AnchorSquaresPlan {
  layers: Layer[];
  groupId: string;
  squareIds: string[];
  points: number[];
}

/** One square per chosen vertex, keyed to the vertex's comp position on every sampled frame. */
export function planAnchorSquares(samples: TargetSample[], opts: AnchorSquaresOptions = {}): AnchorSquaresPlan {
  if (samples.length === 0) throw new Error('the target draws nothing measurable over that range');
  const nPts = samples[0].points.length;
  if (nPts === 0) throw new Error('the target has no path points (anchor squares need a path / polygon layer: outline text with editor.outlineTextLayer)');
  const idx = (opts.points && opts.points.length > 0 ? opts.points : Array.from({ length: nPts }, (_, i) => i)).map((i) => Math.round(i));
  for (const i of idx) if (i < 0 || i >= nPts) throw new Error(`point ${i} is out of range (the target has ${nPts} points, 0..${nPts - 1})`);
  const hi = new Set((opts.highlight ?? []).map((i) => Math.round(i)));
  const color = opts.color ?? DESIGN_BLUE;
  const size = Math.max(1, opts.size ?? 7);
  const sw = Math.max(0.5, opts.strokeWidth ?? 1);
  const start = samples[0].frame;
  const end = opts.endFrame ?? samples[samples.length - 1].frame + 1;
  const frames = samples.map((s) => s.frame);
  const group = createGroupLayer(opts.name ?? 'Anchor points', 0, 0, end);
  tag(group, 'design.anchors');
  const layers: Layer[] = [group];
  const squareIds: string[] = [];
  for (const i of idx) {
    const pos = samples.map((s) => s.points[i] ?? s.points[s.points.length - 1]);
    const sq = createRectangleLayer(`Anchor ${i}`, pos[0][0], pos[0][1], size, size, hi.has(i) ? [color[0], color[1], color[2], color[3]] : [1, 1, 1, 1], end);
    sq.parentId = group.id;
    tag(sq, `design.anchor.${i}`);
    if (sq.shape.type === 'rectangle') {
      sq.shape.strokeColor = [color[0], color[1], color[2], color[3]];
      sq.shape.strokeWidth = { ...sq.shape.strokeWidth, defaultValue: sw };
    }
    sq.transform.position = keyed(sq.transform.position, frames, pos.map((p) => [p[0], p[1]]));
    layers.push(sq);
    squareIds.push(sq.id);
  }
  for (const l of layers) clipTo(l, start, end);
  return { layers, groupId: group.id, squareIds, points: idx };
}

// ---------------------------------------------------------------- readout tooltip

export const READOUT_QUANTITIES = ['dx', 'dy', 'x', 'y', 'w', 'h', 'angle', 'dangle', 'scale'] as const;
export type ReadoutQuantity = (typeof READOUT_QUANTITIES)[number];

export interface ReadoutLine {
  label: string;
  quantity: ReadoutQuantity;
  unit?: string;
  /** Measure this path vertex instead of the box centre (dx / dy / x / y). */
  point?: number;
}

/** Ready-made line sets (r11's three tooltips). */
export const READOUT_PRESETS: Record<'move' | 'size' | 'angle' | 'position', ReadoutLine[]> = {
  move: [{ label: 'dX: ', quantity: 'dx', unit: ' px' }, { label: 'dY: ', quantity: 'dy', unit: ' px' }],
  size: [{ label: 'W: ', quantity: 'w', unit: ' px' }, { label: 'H: ', quantity: 'h', unit: ' px' }],
  angle: [{ label: 'Angle: ', quantity: 'dangle', unit: '°' }],
  position: [{ label: 'X: ', quantity: 'x', unit: ' px' }, { label: 'Y: ', quantity: 'y', unit: ' px' }],
};

/** The value a readout line shows for one sample (deltas are against the first sample). */
export function readoutValue(line: ReadoutLine, s: TargetSample, first: TargetSample): number {
  const pt = (smp: TargetSample): Vec2 => (line.point !== undefined ? smp.points[line.point] ?? smp.center : smp.center);
  switch (line.quantity) {
    case 'dx': return pt(s)[0] - pt(first)[0];
    case 'dy': return pt(s)[1] - pt(first)[1];
    case 'x': return pt(s)[0];
    case 'y': return pt(s)[1];
    case 'w': return s.width;
    case 'h': return s.height;
    case 'angle': return s.rotation;
    case 'dangle': return s.rotation - first.rotation;
    case 'scale': return first.width > 0 ? (s.width / first.width) * 100 : 100;
  }
}

/** Format like the counter does (so measuring widths uses the real strings). */
export function readoutCounter(samples: number[], startFrame: number, decimals: number, decimalMark: '.' | ',', spanIndex: number): TextCounter {
  const c = normalizeTextCounter({ from: samples[0] ?? 0, to: samples[samples.length - 1] ?? 0, startFrame, endFrame: startFrame + Math.max(0, samples.length - 1), decimals, decimalMark, separator: '', spanIndex, samples });
  if (!c) throw new Error('readout counter: invalid samples');
  return c;
}

export interface ReadoutOptions {
  lines: ReadoutLine[];
  decimals?: number;
  decimalMark?: '.' | ',';
  fontSize?: number;
  fontFamily?: string;
  textColor?: Vec4;
  background?: Vec4;
  /** Padding inside the tooltip, px (default 0.5 x fontSize). */
  padding?: number;
  /** Where the tooltip's top-left corner sits per frame, comp px (one per sample). */
  anchors: Vec2[];
  /** Widest text width per line in px (the caller measures the real strings), for the background size. */
  lineWidths: number[];
  name?: string;
  endFrame?: number;
}

export interface ReadoutPlan {
  layers: Layer[];
  groupId: string;
  backgroundId: string;
  textIds: string[];
  /** Per line, the value on every sampled frame. */
  values: number[][];
  size: { width: number; height: number };
}

/**
 * The tooltip: a group (position keyed to `anchors`, the top-left corner) holding a rounded translucent
 * rectangle and one text layer per line. Each line is [label][value][unit] spans; the value span is a B75
 * counter whose samples table holds the measured value of every frame (frame-pure, editable).
 */
export function planReadout(samples: TargetSample[], opts: ReadoutOptions): ReadoutPlan {
  if (samples.length === 0) throw new Error('the target draws nothing measurable over that range');
  if (opts.lines.length === 0) throw new Error('"lines" must hold at least one line');
  if (opts.anchors.length !== samples.length) throw new Error('readout: one anchor per sample');
  const fs = Math.max(4, opts.fontSize ?? 15);
  const pad = Math.max(0, opts.padding ?? Math.round(fs * 0.5));
  const lineH = Math.round(fs * 1.25);
  const decimals = Math.min(6, Math.max(0, Math.round(opts.decimals ?? 2)));
  const mark = opts.decimalMark ?? ',';
  const textColor = opts.textColor ?? [0.24, 0.25, 0.27, 1];
  const bg = opts.background ?? [0.82, 0.83, 0.85, 0.85];
  const start = samples[0].frame;
  const end = opts.endFrame ?? samples[samples.length - 1].frame + 1;
  const frames = samples.map((s) => s.frame);
  const innerW = Math.ceil(Math.max(...opts.lineWidths, fs));
  const width = innerW + pad * 2;
  const height = lineH * opts.lines.length + pad * 2;

  const group = createGroupLayer(opts.name ?? 'Readout', opts.anchors[0][0], opts.anchors[0][1], end);
  tag(group, 'design.readout');
  group.transform.position = keyed(group.transform.position, frames, opts.anchors.map((a) => [a[0], a[1]]));
  const back = createRectangleLayer('Readout background', width / 2, height / 2, width, height, [bg[0], bg[1], bg[2], bg[3]], end);
  back.parentId = group.id;
  tag(back, 'design.readout.background');
  if (back.shape.type === 'rectangle') back.shape.borderRadius = { ...back.shape.borderRadius, defaultValue: Math.round(fs * 0.2) };
  const layers: Layer[] = [group, back];
  const textIds: string[] = [];
  const values: number[][] = [];
  opts.lines.forEach((line, li) => {
    const vals = samples.map((s) => readoutValue(line, s, samples[0]));
    values.push(vals);
    const t: TextLayer = createTextLayer(`Readout ${line.label.trim().replace(/[:\s]+$/, '') || line.quantity}`, pad + innerW / 2, pad + lineH * li + lineH / 2, line.label, end, [textColor[0], textColor[1], textColor[2], textColor[3]]);
    t.parentId = group.id;
    tag(t, `design.readout.line.${li}`);
    const base = t.content.spans[0].style;
    const style = { ...base, fontSize: fs, fontFamily: opts.fontFamily ?? 'Inter', fontWeight: 400 as const, lineHeight: 1.2 };
    t.content = { spans: [{ text: line.label, style }, { text: '0', style: { ...style } }, { text: line.unit ?? '', style: { ...style } }] };
    t.animOverrides = { ...t.animOverrides, fontSize: { ...t.animOverrides.fontSize, defaultValue: fs } };
    t.layoutConfig = { ...t.layoutConfig, boundingBox: { type: 'fixed', width: innerW, height: lineH }, horizontalAlign: 'left', verticalAlign: 'middle' };
    t.counter = readoutCounter(vals, start, decimals, mark, 1);
    layers.push(t);
    textIds.push(t.id);
  });
  for (const l of layers) clipTo(l, start, end);
  return { layers, groupId: group.id, backgroundId: back.id, textIds, values, size: { width, height } };
}

// ---------------------------------------------------------------- guide line

export interface GuideLineOptions {
  /** Per-frame ends, comp px (one entry per frame). */
  from: Vec2[];
  to: Vec2[];
  frames: number[];
  color?: Vec4;
  /** Line width px (default 1). */
  width?: number;
  name?: string;
  endFrame?: number;
}

/** A thin line whose ends follow per-frame points: a pen rubber band (last anchor -> cursor), a "Line Extension"
 *  or centre smart guide. One rectangle layer keyed on position / rotation / height (sparse linear keys). */
export function planGuideLine(opts: GuideLineOptions): { layers: Layer[]; lineId: string } {
  const n = opts.frames.length;
  if (n === 0 || opts.from.length !== n || opts.to.length !== n) throw new Error('guide line: one from / to point per frame');
  const color = opts.color ?? DESIGN_BLUE;
  const w = Math.max(0.5, opts.width ?? 1);
  const start = opts.frames[0];
  const end = opts.endFrame ?? opts.frames[n - 1] + 1;
  const mid = opts.from.map((f, i): number[] => [(f[0] + opts.to[i][0]) / 2, (f[1] + opts.to[i][1]) / 2]);
  const len = opts.from.map((f, i) => Math.hypot(opts.to[i][0] - f[0], opts.to[i][1] - f[1]));
  const ang = unwrapDegrees(opts.from.map((f, i) => (Math.atan2(opts.to[i][1] - f[1], opts.to[i][0] - f[0]) * 180) / Math.PI - 90));
  const ln: ShapeLayer = createRectangleLayer(opts.name ?? 'Guide line', mid[0][0], mid[0][1], w, len[0], [color[0], color[1], color[2], color[3]], end);
  tag(ln, 'design.guide.line');
  ln.transform.position = keyed(ln.transform.position, opts.frames, mid);
  // Rotation keys are simplified at 0.0005 deg: a 0.01 deg error would move the far end of a long line by ~0.05 px.
  ln.transform.rotation = keyed(ln.transform.rotation, opts.frames, ang.map((a) => [a]), 0.0005);
  if (ln.shape.type === 'rectangle') ln.shape.height = keyed(ln.shape.height, opts.frames, len.map((l) => [l]));
  clipTo(ln, start, end);
  return { layers: [ln], lineId: ln.id };
}

// ---------------------------------------------------------------- smart-guide label

export interface GuideLabelOptions {
  text: string;
  /** Per-frame label position (the text's centre), comp px; one entry = static. */
  positions: Vec2[];
  frames: number[];
  color?: Vec4;
  fontSize?: number;
  fontFamily?: string;
  /** Optional pin line from the label down to the point it names: per-frame [from, to] in comp px. */
  line?: { from: Vec2[]; to: Vec2[] };
  name?: string;
  endFrame?: number;
}

export interface GuideLabelPlan {
  layers: Layer[];
  labelId: string;
  lineId: string | null;
}

/** A small coloured word (default magenta 12 px Inter medium) that can follow a point, plus an optional 1 px pin line. */
export function planGuideLabel(opts: GuideLabelOptions): GuideLabelPlan {
  if (!opts.text) throw new Error('"text" must be a non-empty string');
  if (opts.positions.length === 0 || opts.positions.length !== opts.frames.length) throw new Error('guide label: one position per frame');
  const color = opts.color ?? GUIDE_MAGENTA;
  const fs = Math.max(4, opts.fontSize ?? 13);
  const start = opts.frames[0];
  const end = opts.endFrame ?? opts.frames[opts.frames.length - 1] + 1;
  const t = createTextLayer(opts.name ?? `Guide ${opts.text}`, opts.positions[0][0], opts.positions[0][1], opts.text, end, [color[0], color[1], color[2], color[3]]);
  tag(t, 'design.guide.label');
  t.content = { spans: [{ text: opts.text, style: { ...t.content.spans[0].style, fontSize: fs, fontFamily: opts.fontFamily ?? 'Inter', fontWeight: 500 } }] };
  t.animOverrides = { ...t.animOverrides, fontSize: { ...t.animOverrides.fontSize, defaultValue: fs } };
  t.transform.position = keyed(t.transform.position, opts.frames, opts.positions.map((p) => [p[0], p[1]]));
  const layers: Layer[] = [];
  let lineId: string | null = null;
  if (opts.line) {
    const { from, to } = opts.line;
    const len = from.map((f, i) => Math.hypot(to[i][0] - f[0], to[i][1] - f[1]));
    const mid = from.map((f, i) => [(f[0] + to[i][0]) / 2, (f[1] + to[i][1]) / 2]);
    const ang = unwrapDegrees(from.map((f, i) => (Math.atan2(to[i][1] - f[1], to[i][0] - f[0]) * 180) / Math.PI - 90));
    const ln: ShapeLayer = createRectangleLayer(`${opts.name ?? `Guide ${opts.text}`} line`, mid[0][0], mid[0][1], 1, len[0], [color[0], color[1], color[2], color[3]], end);
    tag(ln, 'design.guide.line');
    ln.transform.position = keyed(ln.transform.position, opts.frames, mid);
    ln.transform.rotation = keyed(ln.transform.rotation, opts.frames, ang.map((a) => [a]), 0.0005);
    if (ln.shape.type === 'rectangle') ln.shape.height = keyed(ln.shape.height, opts.frames, len.map((l) => [l]));
    layers.push(ln);
    lineId = ln.id;
  }
  layers.push(t);
  for (const l of layers) clipTo(l, start, end);
  return { layers, labelId: t.id, lineId };
}
