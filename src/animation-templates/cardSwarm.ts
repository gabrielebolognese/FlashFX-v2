// B81 - 3D card swarm builder (r10 S10). Pure: turns a core/cardSwarm.ts layout into ordinary editable layers,
// no store / DOM / WebGPU. agent.addCardSwarm (src/agent/runtime.ts) validates the arguments, measures the pill
// labels in the real face and commits the result as ONE undo step (editor.applyLayerEdits).
//
// Structure (stack order, bottom first): the cluster = one 3D group (position = the volume centre, positionZ =
// its depth, rotationY = the yaw keys, rotationX = the pitch) flagged `orbitChildren`, so yawing it ORBITS every
// card about the centre (true 3D parenting, resolved in core/interpolation.ts); then each card: a 3D layer
// parented to the cluster at its layout position / tilt, followed by its decals (a placeholder card's accent
// chip, title bar and content block; a pill's label) parented to the card and flagged `sortWithParent`, so they
// depth-sort with their card and stay printed on it.

import { createGroupLayer, createImageLayer, createProperty, createRectangleLayer, createTextLayer, uid } from '../core/factory';
import { buildKeyframesFromSpecs, type KeyframeSpec } from '../core/keyframeSpecs';
import type { CardSwarmLayout, SwarmCard, SwarmVec3 } from '../core/cardSwarm';
import type { AnimatableProperty, ImageLayer, Layer, ShapeLayer, TextLayer, Transform, Vec4 } from '../core/types';

/** A source the cards cycle through: an existing layer (duplicated) or an imported image asset. */
export type SwarmSource =
  | { kind: 'layer'; layer: Layer; naturalWidth: number; naturalHeight: number }
  | { kind: 'image'; assetId: string; name: string; width: number; height: number; format: string; fileSize: number };

export interface SwarmPalette {
  light: { body: Vec4; bar: Vec4; block: Vec4 };
  dark: { body: Vec4; bar: Vec4; block: Vec4 };
  accents: Vec4[];
  pill: { fill: Vec4; stroke: Vec4; label: Vec4 };
}

/** r10 S10 colours: light #f7f5f5 / dark #1c1c1e cards, lime / blue / pink / violet accents, violet pills (#887cb6). */
export const SWARM_PALETTE: SwarmPalette = {
  light: { body: [0.969, 0.961, 0.961, 1], bar: [0.8, 0.79, 0.79, 1], block: [0.9, 0.89, 0.89, 1] },
  dark: { body: [0.11, 0.11, 0.118, 1], bar: [0.3, 0.3, 0.32, 1], block: [0.18, 0.18, 0.195, 1] },
  accents: [[0.776, 0.929, 0.271, 1], [0.29, 0.424, 0.941, 1], [0.91, 0.271, 0.604, 1], [0.478, 0.361, 0.941, 1]],
  pill: { fill: [0.16, 0.14, 0.23, 0.94], stroke: [0.533, 0.486, 0.714, 1], label: [0.94, 0.93, 0.98, 1] },
};

/** r10 S10 prompt pills. */
export const SWARM_PILL_LABELS = [
  'Build a finance dashboard', 'Build a project management app', 'Create a sales management app', 'Design a fitness tracker',
  'Make a team calendar', 'Build an analytics page', 'Create a CRM for my agency', 'Build a habit tracker',
  'Design a booking flow', 'Make an inventory app', 'Build a recipe planner', 'Create a portfolio site',
];

export interface SwarmClusterAnim {
  /** Yaw (rotationY, degrees) keys of the cluster; empty = static `yaw`. */
  yawKeys: KeyframeSpec[];
  yaw: number;
  pitchKeys: KeyframeSpec[];
  pitch: number;
}

export interface PlanCardSwarmOptions {
  layout: CardSwarmLayout;
  /** Volume centre (comp px): the cluster position / depth. */
  center: SwarmVec3;
  startFrame: number;
  /** Exclusive clip end. */
  endFrame: number;
  cluster: SwarmClusterAnim;
  /** Cards ("card" kind) cycle through these; empty = placeholder UI cards. */
  sources: SwarmSource[];
  /** Pill labels, cycled; null = pills without a label. */
  labels: string[] | null;
  /** Pill width per pill index (fits the measured label); falls back to the layout width. */
  pillWidths?: number[];
  labelFontSize?: number;
  labelFontFamily?: string;
  /** "plain" = bare cards / pills (one layer each, no decals or labels). Default "full". */
  detail?: 'full' | 'plain';
  palette?: SwarmPalette;
  name?: string;
}

export interface SwarmItemPlan {
  id: string;
  kind: string;
  index: number;
  /** Decal ids printed on the card (chip / title / block, or the pill label). */
  partIds: string[];
  /** Source used for this card (layer id or asset id), if any. */
  source?: string;
  position: SwarmVec3;
  rotation: SwarmVec3;
  width: number;
  height: number;
  variant: SwarmCard['variant'];
}

export interface CardSwarmPlan {
  layers: Layer[];
  clusterId: string;
  items: SwarmItemPlan[];
}

const num = (name: string, v: number): AnimatableProperty => createProperty(name, 'number', v);
const r2 = (n: number): number => Math.round(n * 100) / 100;

function isAnimatable(o: Record<string, unknown>): boolean {
  return typeof o.id === 'string' && Array.isArray(o.keyframes) && typeof o.valueType === 'string';
}
/** Fresh ids for every animatable property of a cloned layer (a copy never shares identity with its source). */
function reIdAnimatables(node: unknown): void {
  if (Array.isArray(node)) { for (const n of node) reIdAnimatables(n); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (isAnimatable(o)) o.id = uid();
  for (const k of Object.keys(o)) reIdAnimatables(o[k]);
}

/** A static 3D transform: local position / depth / tilt / uniform scale; keeps the source opacity property. */
function cardTransform(base: Transform | null, pos: SwarmVec3, rot: SwarmVec3, scale: number): Transform {
  return {
    position: createProperty('Position', 'vec2', [pos[0], pos[1]]),
    rotation: num('Rotation', rot[2]),
    scale: createProperty('Scale', 'vec2', [scale, scale]),
    anchorPoint: createProperty('Anchor Point', 'vec2', [0, 0]),
    opacity: base ? base.opacity : num('Opacity', 1),
    positionZ: num('Z Position', pos[2]),
    rotationX: num('X Rotation', rot[0]),
    rotationY: num('Y Rotation', rot[1]),
  };
}
function make3D<T extends Layer>(l: T, parentId: string, role: string, start: number, end: number): T {
  l.parentId = parentId;
  l.is3D = true;
  l.rigRole = role;
  l.inPoint = start;
  l.outPoint = end;
  l.trackId = null;
  if (!l.transform.positionZ) l.transform = { ...l.transform, positionZ: num('Z Position', 0) };
  if (!l.transform.rotationX) l.transform = { ...l.transform, rotationX: num('X Rotation', 0) };
  if (!l.transform.rotationY) l.transform = { ...l.transform, rotationY: num('Y Rotation', 0) };
  return l;
}
function rect(name: string, x: number, y: number, w: number, h: number, fill: Vec4, radius: number, end: number): ShapeLayer {
  const l = createRectangleLayer(name, r2(x), r2(y), r2(w), r2(h), [fill[0], fill[1], fill[2], fill[3]], end);
  if (l.shape.type === 'rectangle') l.shape.borderRadius = { ...l.shape.borderRadius, defaultValue: r2(radius) };
  return l;
}
function keyedNumber(prop: AnimatableProperty, value: number, keys: KeyframeSpec[]): AnimatableProperty {
  if (keys.length === 0) return { ...prop, defaultValue: value, keyframes: [] };
  const kfs = buildKeyframesFromSpecs(keys, { expected: 'number' });
  return { ...prop, defaultValue: typeof keys[0].value === 'number' ? keys[0].value : value, keyframes: kfs };
}

/** Build the swarm layers (cluster first, then each card followed by its decals). */
export function planCardSwarm(o: PlanCardSwarmOptions): CardSwarmPlan {
  const pal = o.palette ?? SWARM_PALETTE;
  const start = Math.round(o.startFrame), end = Math.round(o.endFrame);
  if (!(end > start)) throw new Error('endFrame must be after startFrame');
  const full = (o.detail ?? 'full') === 'full';
  const name = o.name ?? 'Card swarm';

  const cluster: Layer = createGroupLayer(name, o.center[0], o.center[1], end);
  cluster.inPoint = start;
  cluster.outPoint = end;
  cluster.is3D = true;
  cluster.orbitChildren = true;
  cluster.rigRole = 'swarm.cluster';
  cluster.transform = {
    ...cluster.transform,
    positionZ: num('Z Position', o.center[2]),
    rotationX: keyedNumber(num('X Rotation', 0), o.cluster.pitch, o.cluster.pitchKeys),
    rotationY: keyedNumber(num('Y Rotation', 0), o.cluster.yaw, o.cluster.yawKeys),
  };

  const layers: Layer[] = [cluster];
  const items: SwarmItemPlan[] = [];
  let cardSeq = 0, pillSeq = 0;
  for (const c of o.layout.cards) {
    const parts: Layer[] = [];
    let card: Layer;
    let width = c.width, height = c.height;
    let sourceRef: string | undefined;
    if (c.kind === 'pill') {
      const pi = pillSeq++;
      width = Math.max(c.width, o.pillWidths?.[pi] ?? 0);
      const pill = rect(`${name} pill ${pi + 1}`, 0, 0, width, height, pal.pill.fill, height / 2, end);
      if (pill.shape.type === 'rectangle') {
        pill.shape.strokeColor = [pal.pill.stroke[0], pal.pill.stroke[1], pal.pill.stroke[2], pal.pill.stroke[3]];
        pill.shape.strokeWidth = { ...pill.shape.strokeWidth, defaultValue: Math.max(1, r2(height * 0.04)) };
      }
      pill.transform = cardTransform(null, c.position, c.rotation, 1);
      card = make3D(pill, cluster.id, 'swarm.pill', start, end);
      const label = o.labels && o.labels.length > 0 ? o.labels[pi % o.labels.length] : null;
      if (full && label) {
        const fs = o.labelFontSize ?? r2(height * 0.34);
        // The ink of line-box-centred mixed-case text sits ~0.3 x size high (measured, Inter): nudge it down to centre it optically.
        const t: TextLayer = createTextLayer(`${name} pill ${pi + 1} label`, 0, r2(fs * 0.28), label, end, [pal.pill.label[0], pal.pill.label[1], pal.pill.label[2], pal.pill.label[3]]);
        t.content = { spans: [{ text: label, style: { ...t.content.spans[0].style, fontSize: fs, fontFamily: o.labelFontFamily ?? 'Inter', fontWeight: 500 } }] };
        t.animOverrides = { ...t.animOverrides, fontSize: { ...t.animOverrides.fontSize, defaultValue: fs } };
        // Point text: the raster is centred on the layer position (the pill centre).
        t.layoutConfig = { ...t.layoutConfig, boundingBox: { type: 'auto' }, horizontalAlign: 'center' };
        parts.push(t);
      }
    } else {
      const ci = cardSeq++;
      const src = o.sources.length > 0 ? o.sources[ci % o.sources.length] : null;
      if (src) {
        let l: Layer;
        let natW: number, natH: number;
        if (src.kind === 'image') {
          l = createImageLayer(`${name} card ${ci + 1} (${src.name})`, 0, 0, src.assetId, src.width, src.height, src.format, src.fileSize, end) as ImageLayer;
          natW = src.width; natH = src.height;
          sourceRef = src.assetId;
        } else {
          l = structuredClone(src.layer);
          reIdAnimatables(l);
          l.id = uid();
          l.name = `${name} card ${ci + 1} (${src.layer.name})`;
          natW = src.naturalWidth; natH = src.naturalHeight;
          sourceRef = src.layer.id;
          // Corner pin / track matte / glass would override or fight the 3D card placement: dropped on the copy.
          delete l.cornerPin; delete l.rigRole;
          if ('trackMatte' in l) delete (l as { trackMatte?: unknown }).trackMatte;
          if (l.type === 'shape') delete l.glass;
        }
        const s = natW > 0 ? c.width / natW : 1;
        width = c.width;
        height = natH * s;
        l.transform = cardTransform(l.transform, c.position, c.rotation, r2(s * 10000) / 10000);
        l.visible = true;
        card = make3D(l, cluster.id, 'swarm.card', start, end);
      } else {
        const p = c.variant === 'light' ? pal.light : pal.dark;
        const body = rect(`${name} card ${ci + 1}`, 0, 0, width, height, p.body, Math.min(width, height) * 0.06, end);
        body.transform = cardTransform(null, c.position, c.rotation, 1);
        card = make3D(body, cluster.id, 'swarm.card', start, end);
        if (full) {
          const pad = Math.min(width, height) * 0.09;
          const chipW = width * 0.16, chipH = height * 0.14;
          const chipX = -width / 2 + pad + chipW / 2, chipY = -height / 2 + pad + chipH / 2;
          const accent = pal.accents[Math.floor(c.style * pal.accents.length) % pal.accents.length];
          parts.push(rect(`${name} card ${ci + 1} chip`, chipX, chipY, chipW, chipH, accent, chipH * 0.3, end));
          const titleW = width * (0.28 + 0.3 * c.style), titleH = height * 0.07;
          parts.push(rect(`${name} card ${ci + 1} title`, chipX + chipW / 2 + pad * 0.7 + titleW / 2, chipY, titleW, titleH, p.bar, titleH / 2, end));
          const blockW = width - 2 * pad, blockH = height * 0.46;
          parts.push(rect(`${name} card ${ci + 1} block`, 0, height / 2 - pad - blockH / 2, blockW, blockH, p.block, Math.min(width, height) * 0.035, end));
        }
      }
    }
    layers.push(card);
    const roles = card.rigRole === 'swarm.pill' ? ['swarm.pill.label'] : ['swarm.card.chip', 'swarm.card.title', 'swarm.card.block'];
    parts.forEach((d, i) => {
      make3D(d, card.id, roles[i] ?? 'swarm.card.part', start, end);
      d.sortWithParent = true;
      layers.push(d);
    });
    items.push({
      id: card.id, kind: c.kind, index: c.index, partIds: parts.map((d) => d.id), ...(sourceRef ? { source: sourceRef } : {}),
      position: c.position, rotation: c.rotation, width: r2(width), height: r2(height), variant: c.variant,
    });
  }
  return { layers, clusterId: cluster.id, items };
}
