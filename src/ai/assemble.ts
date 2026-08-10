import type {
  Composition, Layer, Track, Transform, AnimatableProperty, Keyframe, Vec2, Vec4,
  ShapeGeometry, TextSpan, TextSpanStyle, ShapeLayer, TextLayer, GroupLayer, CameraLayer, PathVertex,
  SceneDocument, ImageColorCorrection,
} from '../core/types';
import type { SharedStyle } from '../core/styles';
import type { ClonerLayer } from '../cloner/types';
import type { PresetContext } from '../core/animationPresets';
import type { CoderFragment, StyleContractT as StyleContract, Panel } from '../schema';
import { hexToVec4 } from '../core/material';
import { EASING_TABLE } from '../schema';
import { PRESET_CATALOG, expandPreset } from './presetCatalog';

// FRAGMENT ASSEMBLY: panel fragments + the frame plan → a Composition indistinguishable from a
// hand-authored one, PLUS a report. Never throws: it produces a partial result and a list of
// complaints so a later stage (auto-fix) can act. Translation, in order of how much can go wrong:
// ids preserved → colors from roles → presets/easing/compact expansion (+ clamp) → cloners → structure
// → boundary reconciliation.

export interface Issue { severity: 'error' | 'warn'; code: string; message: string; layerId?: string; panelId?: string }
export interface AssemblyReport {
  ok: boolean;
  issues: Issue[];
  stats: { panels: number; layers: number; presetsExpanded: number; clonersBuilt: number; stylesRegistered: number; boundaryChecks: number };
}
export interface AssembleOptions {
  fps: number;
  format: 'landscape' | 'portrait' | 'square';
  seed: number;
  durationFrames: number;
  name?: string;
}
export interface AssembleResult {
  composition: Composition;
  styles: Record<string, SharedStyle>;
  document: SceneDocument;
  panels: Panel[];
  report: AssemblyReport;
}

const DIMS: Record<AssembleOptions['format'], [number, number]> = {
  landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080],
};

// ── deterministic ids (NEVER the timestamp uid) ──────────────────────────────────────────────
// Layer ids come straight from the Coder and are preserved verbatim. Property ids are minted
// deterministically from (layerId, property name) so a re-run from the same seed is byte-identical.
const pid = (layerId: string, name: string): string => `${layerId}~${name}`;

function prop(layerId: string, name: string, valueType: 'number' | 'vec2', defaultValue: number | Vec2, keyframes: Keyframe[] = []): AnimatableProperty {
  return { id: pid(layerId, name), name, valueType, defaultValue, keyframes };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function resolveEasing(name: keyof typeof EASING_TABLE | undefined): { interpolation: Keyframe['interpolation']; handleIn: Vec2; handleOut: Vec2 } {
  const e = EASING_TABLE[name ?? 'easeInOut'] ?? EASING_TABLE.easeInOut;
  return { interpolation: e.interpolation, handleIn: e.handleIn ?? [0, 0], handleOut: e.handleOut ?? [0, 0] };
}

// Expand a compact AI property (bare literal OR {keyframes:[...]}) into a full AnimatableProperty.
function expandNumber(layerId: string, name: string, ai: unknown, def: number, clamp = false): AnimatableProperty {
  const c = (v: number) => (clamp ? clamp01(v) : v);
  if (typeof ai === 'number') return prop(layerId, name, 'number', c(ai));
  if (ai && typeof ai === 'object' && Array.isArray((ai as { keyframes?: unknown }).keyframes)) {
    const kfs = (ai as { keyframes: { frame: number; value: number; easing?: keyof typeof EASING_TABLE }[] }).keyframes
      .map((k) => ({ frame: k.frame, value: c(k.value), ...resolveEasing(k.easing) } as Keyframe));
    return prop(layerId, name, 'number', kfs.length ? (kfs[0].value as number) : def, kfs);
  }
  return prop(layerId, name, 'number', c(def));
}
function expandVec2(layerId: string, name: string, ai: unknown, def: Vec2): AnimatableProperty {
  if (Array.isArray(ai) && ai.length === 2 && typeof ai[0] === 'number') return prop(layerId, name, 'vec2', ai as Vec2);
  if (ai && typeof ai === 'object' && Array.isArray((ai as { keyframes?: unknown }).keyframes)) {
    const kfs = (ai as { keyframes: { frame: number; value: Vec2; easing?: keyof typeof EASING_TABLE }[] }).keyframes
      .map((k) => ({ frame: k.frame, value: k.value, ...resolveEasing(k.easing) } as Keyframe));
    return prop(layerId, name, 'vec2', kfs.length ? (kfs[0].value as Vec2) : def, kfs);
  }
  return prop(layerId, name, 'vec2', def);
}

type AiTransform = Record<string, unknown> | undefined;
function expandTransform(layerId: string, t: AiTransform, compW: number, compH: number): Transform {
  const tr = (t ?? {}) as Record<string, unknown>;
  const out: Transform = {
    position: expandVec2(layerId, 'Position', tr.position, [compW / 2, compH / 2]),
    rotation: expandNumber(layerId, 'Rotation', tr.rotation, 0),
    scale: expandVec2(layerId, 'Scale', tr.scale, [1, 1]),
    anchorPoint: expandVec2(layerId, 'Anchor Point', tr.anchor, [0, 0]),
    opacity: expandNumber(layerId, 'Opacity', tr.opacity, 1, true), // clamp 0..1 (schema left it looser)
  };
  if (tr.positionZ !== undefined) out.positionZ = expandNumber(layerId, 'Z Position', tr.positionZ, 0);
  if (tr.rotationX !== undefined) out.rotationX = expandNumber(layerId, 'X Rotation', tr.rotationX, 0);
  if (tr.rotationY !== undefined) out.rotationY = expandNumber(layerId, 'Y Rotation', tr.rotationY, 0);
  return out;
}

export function assemble(fragments: CoderFragment[], panels: Panel[], style: StyleContract, opts: AssembleOptions): AssembleResult {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, extra: Partial<Issue> = {}) => issues.push({ severity, code, message, ...extra });
  const [compW, compH] = DIMS[opts.format];

  // ── colors: register the palette as linked color styles; build role → {styleId, literal} ──
  const styles: Record<string, SharedStyle> = {};
  const roleStyleId: Record<string, string> = {};
  const roleLiteral: Record<string, Vec4> = {};
  for (const entry of style.palette) {
    const id = `style:${entry.role}`;
    const color = hexToVec4(entry.color);
    styles[id] = { id, name: entry.role, type: 'color', value: { kind: 'color', color } };
    roleStyleId[entry.role] = id;
    roleLiteral[entry.role] = color;
  }
  const literalFor = (role: string | undefined, fallback: Vec4): Vec4 => (role && roleLiteral[role]) || fallback;

  const panelById = new Map(panels.map((p) => [p.id, p]));
  const built: Layer[] = [];
  let presetsExpanded = 0;
  let clonersBuilt = 0;
  // staggerReveal requests deferred until every child exists.
  const staggerReqs: { groupId: string; childPreset: string; start: number; duration: number; step: number; order: 'forward' | 'reverse'; panelId: string }[] = [];

  for (const frag of fragments) {
    const panel = panelById.get(frag.panelId);
    if (!panel) { add('error', 'panel-missing', `fragment references unknown panel ${frag.panelId}`, { panelId: frag.panelId }); continue; }

    for (const ai of frag.layers as unknown as Record<string, unknown>[]) {
      const id = ai.id as string;
      const transform = expandTransform(id, ai.transform as AiTransform, compW, compH);
      const inPoint = typeof ai.in === 'number' ? (ai.in as number) : panel.start;
      const outPoint = typeof ai.out === 'number' ? (ai.out as number) : panel.end;
      const common = {
        id, name: ai.name as string, parentId: (ai.parentId as string) ?? null, trackId: null as string | null,
        visible: ai.visible !== false, locked: false, blendMode: (ai.blendMode as ShapeLayer['blendMode']) ?? 'normal',
        transform, inPoint, outPoint,
      };
      const type = ai.type as string;
      let layer: Layer | null = null;

      if (type === 'shape') {
        const { geom, fillRole, strokeRole } = buildShape(id, ai, roleLiteral);
        const sl: ShapeLayer = { ...common, type: 'shape', shape: geom };
        if (fillRole && roleStyleId[fillRole]) sl.fillStyleId = roleStyleId[fillRole];
        if (strokeRole && roleStyleId[strokeRole]) sl.strokeStyleId = roleStyleId[strokeRole];
        layer = sl;
      } else if (type === 'text') {
        const spans = (ai.spans as Record<string, unknown>[]).map((s) => buildSpan(s, literalFor));
        const dominantRole = ((ai.spans as Record<string, unknown>[])[0]?.color as { role?: string } | undefined)?.role;
        const tl: TextLayer = {
          ...common, type: 'text', content: { spans },
          layoutConfig: buildTextLayout(ai),
          animOverrides: {
            fontSize: prop(id, 'Font Size', 'number', spans[0]?.style.fontSize ?? 48),
            letterSpacing: prop(id, 'Letter Spacing', 'number', 0),
            lineHeight: prop(id, 'Line Height', 'number', spans[0]?.style.lineHeight ?? 1.2),
            strokeWidth: prop(id, 'Stroke Width', 'number', 0),
          },
        };
        if (dominantRole && roleStyleId[dominantRole]) tl.fillStyleId = roleStyleId[dominantRole];
        layer = tl;
      } else if (type === 'group') {
        layer = { ...common, type: 'group', collapsed: false } as GroupLayer;
      } else if (type === 'cloner') {
        const cl = buildCloner(common, ai);
        if (cl.sourceRef.type === 'layer') {
          // sourceRef must resolve to another emitted layer (checked after the pass too).
        }
        layer = cl;
        clonersBuilt++;
      } else if (type === 'camera') {
        layer = buildCamera(common, ai);
      } else if (type === 'image' || type === 'video' || type === 'audio') {
        layer = buildMediaLayer(common, type, ai, add);
      } else {
        add('error', 'unknown-type', `layer ${id} has unsupported type ${type}`, { layerId: id });
        continue;
      }

      // Non-stagger presets → real keyframe tracks merged into the transform.
      const presets = (ai.presets as Record<string, unknown>[] | undefined) ?? [];
      for (const p of presets) {
        const name = p.preset as keyof typeof PRESET_CATALOG;
        const entry = PRESET_CATALOG[name];
        if (!entry) { add('error', 'unknown-preset', `layer ${id} names unknown preset ${String(name)}`, { layerId: id }); continue; }
        if (entry.groupStagger) {
          if (type !== 'group') { add('warn', 'stagger-nongroup', `staggerReveal on non-group layer ${id} ignored`, { layerId: id }); continue; }
          const pr = (p.params as Record<string, unknown>) ?? {};
          staggerReqs.push({ groupId: id, childPreset: (pr.childPreset as string) ?? 'fadeIn', start: p.start as number, duration: p.duration as number, step: (pr.stepFrames as number) ?? 4, order: ((pr.order as string) ?? 'forward') as 'forward' | 'reverse', panelId: frag.panelId });
          continue;
        }
        applyPreset(layer, name, (p.params as Record<string, unknown>) ?? {}, p.start as number, p.duration as number, compW, compH);
        presetsExpanded++;
      }
      built.push(layer);
    }
  }

  // ── staggerReveal post-pass: apply the child preset to each group child with a growing offset ──
  const childrenOf = (gid: string) => built.filter((l) => l.parentId === gid);
  for (const req of staggerReqs) {
    let kids = childrenOf(req.groupId);
    if (req.order === 'reverse') kids = [...kids].reverse();
    if (!kids.length) add('warn', 'stagger-empty', `staggerReveal group ${req.groupId} has no children`, { layerId: req.groupId });
    kids.forEach((kid, i) => {
      applyPreset(kid, req.childPreset as keyof typeof PRESET_CATALOG, {}, req.start + i * req.step, req.duration, compW, compH);
      presetsExpanded++;
    });
  }

  // ── referential sanity that is cheap here (full resolution is the semantic validator's job) ──
  const ids = new Set(built.map((l) => l.id));
  for (const l of built) {
    if (l.parentId && !ids.has(l.parentId)) add('error', 'dangling-parent', `layer ${l.id} parent ${l.parentId} missing`, { layerId: l.id });
    if (l.type === 'cloner') {
      const ref = (l as ClonerLayer).sourceRef;
      if (ref.type === 'layer' && !ids.has(ref.layerId)) add('error', 'cloner-source-missing', `cloner ${l.id} source ${ref.layerId} missing`, { layerId: l.id });
    }
  }

  // ── boundary reconciliation: panel N.outbound must match panel N+1.inbound (present set) ──
  let boundaryChecks = 0;
  const ordered = [...panels].sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length - 1; i++) {
    boundaryChecks++;
    const out = new Set(ordered[i].outbound.states.filter((s) => s.present).map((s) => s.layerId));
    const inn = new Set(ordered[i + 1].inbound.states.filter((s) => s.present).map((s) => s.layerId));
    const onlyOut = [...out].filter((x) => !inn.has(x));
    const onlyIn = [...inn].filter((x) => !out.has(x));
    if (onlyOut.length || onlyIn.length) {
      add('error', 'boundary-mismatch',
        `seam ${ordered[i].id}→${ordered[i + 1].id}: outbound-only [${onlyOut.join(',')}], inbound-only [${onlyIn.join(',')}]`,
        { panelId: ordered[i].id });
    }
  }

  // ── structure: one track per panel, layers grouped by panel then fragment order ──
  const tracks: Track[] = ordered.map((p) => ({ id: `track:${p.id}`, name: p.id, type: 'mixed', order: p.order, locked: false, visible: true }));
  const trackOfPanel = new Map(ordered.map((p) => [p.id, `track:${p.id}`]));
  // layer → its panel (by membership: the fragment it came from). Rebuild order: panels-in-order, fragments' order.
  const layerPanel = new Map<string, string>();
  for (const frag of fragments) for (const ai of frag.layers as unknown as Record<string, unknown>[]) layerPanel.set(ai.id as string, frag.panelId);
  built.forEach((l) => { const pidPanel = layerPanel.get(l.id); if (pidPanel) l.trackId = trackOfPanel.get(pidPanel) ?? null; });
  const orderedLayers = [...built].sort((a, b) => {
    const pa = ordered.findIndex((p) => p.id === layerPanel.get(a.id));
    const pb = ordered.findIndex((p) => p.id === layerPanel.get(b.id));
    if (pa !== pb) return pa - pb;
    return built.indexOf(a) - built.indexOf(b); // stable within a panel = fragment order
  });

  const bg = literalFor('background', [0.04, 0.05, 0.07, 1]);
  const composition: Composition = {
    id: 'ai-comp', name: opts.name ?? 'AI Generation',
    settings: { width: compW, height: compH, frameRate: opts.fps, durationFrames: Math.max(1, opts.durationFrames), backgroundColor: bg },
    layers: orderedLayers, tracks,
    background: { layers: [] },
    motionPaths: [],
    anchorEdges: [], physicsBindings: [], staggerBindings: [],
  };

  const document: SceneDocument = {
    version: 2, rootCompositionId: composition.id,
    compositions: { [composition.id]: composition },
    styles,
  };

  const report: AssemblyReport = {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    stats: { panels: panels.length, layers: built.length, presetsExpanded, clonersBuilt, stylesRegistered: Object.keys(styles).length, boundaryChecks },
  };
  return { composition, styles, document, panels, report };
}

// ── preset application: merge generated tracks into the layer's transform ──
function applyPreset(layer: Layer, name: keyof typeof PRESET_CATALOG, params: Record<string, unknown>, start: number, duration: number, compW: number, compH: number) {
  if (!('transform' in layer)) return;
  const t = layer.transform;
  const ctx: PresetContext = {
    position: t.position.defaultValue as Vec2,
    scale: t.scale.defaultValue as Vec2,
    rotation: t.rotation.defaultValue as number,
    opacity: t.opacity.defaultValue as number,
    compWidth: compW, compHeight: compH,
  };
  const tracks = expandPreset(name, params, ctx, start, duration);
  for (const tr of tracks) {
    const key = tr.propertyPath.replace('transform.', '') as keyof Transform;
    const p = t[key] as AnimatableProperty | undefined;
    if (!p) continue;
    let kfs = tr.keyframes;
    if (key === 'opacity') kfs = kfs.map((k) => ({ ...k, value: clamp01(k.value as number) }));
    p.keyframes = kfs;
    if (kfs.length) p.defaultValue = kfs[0].value;
  }
}

// ── per-type payload builders ──
function buildShape(id: string, ai: Record<string, unknown>, roleLit: Record<string, Vec4>): { geom: ShapeGeometry; fillRole?: string; strokeRole?: string } {
  const g = ai.shape as Record<string, unknown>;
  const fillRole = (ai.fill as { role?: string } | undefined)?.role;
  const strokeRole = (ai.stroke as { role?: string } | undefined)?.role;
  const fill: Vec4 = (fillRole && roleLit[fillRole]) || [0.6, 0.6, 0.6, 1];
  const stroke: Vec4 = (strokeRole && roleLit[strokeRole]) || [0, 0, 0, 1];
  const sw = expandNumber(id, 'Stroke Width', ai.strokeWidth, 0);
  const t = g.type as string;
  let geom: ShapeGeometry;
  if (t === 'circle') {
    geom = { type: 'circle', radius: expandNumber(id, 'Radius', g.radius, 50), fillColor: fill, strokeColor: stroke, strokeWidth: sw };
  } else if (t === 'star') {
    geom = { type: 'star', points: expandNumber(id, 'Points', g.points, 5), outerRadius: expandNumber(id, 'Outer', g.outerRadius, 60), innerRadius: expandNumber(id, 'Inner', g.innerRadius, 30), fillColor: fill, strokeColor: stroke, strokeWidth: sw };
  } else if (t === 'polygon') {
    const verts = (g.vertices as Record<string, unknown>[]).map((v): PathVertex => ({ position: v.position as Vec2, handleIn: (v.handleIn as Vec2) ?? [0, 0], handleOut: (v.handleOut as Vec2) ?? [0, 0], vertexType: (v.vertexType as PathVertex['vertexType']) ?? 'corner' }));
    geom = { type: 'polygon', vertices: verts, closed: g.closed !== false, fillColor: fill, strokeColor: stroke, strokeWidth: sw };
  } else {
    geom = { type: 'rectangle', width: expandNumber(id, 'Width', g.width, 100), height: expandNumber(id, 'Height', g.height, 100), fillColor: fill, strokeColor: stroke, strokeWidth: sw, borderRadius: expandNumber(id, 'Border Radius', g.borderRadius, 0) };
  }
  return { geom, fillRole, strokeRole };
}

function buildSpan(s: Record<string, unknown>, literalFor: (role: string | undefined, fb: Vec4) => Vec4): TextSpan {
  const role = (s.color as { role?: string } | undefined)?.role;
  const style: TextSpanStyle = {
    fontFamily: (s.fontFamily as string) ?? 'Inter, system-ui, sans-serif',
    fontWeight: (s.fontWeight as TextSpanStyle['fontWeight']) ?? 400,
    fontStyle: (s.fontStyle as 'normal' | 'italic') ?? 'normal',
    fontSize: (s.fontSize as number) ?? 48,
    color: literalFor(role, [1, 1, 1, 1]),
    letterSpacing: (s.letterSpacing as number) ?? 0,
    lineHeight: (s.lineHeight as number) ?? 1.2,
    strokeColor: [0, 0, 0, 1], strokeWidth: 0, underline: false, strikethrough: false, textTransform: 'none',
  };
  return { text: s.text as string, style };
}

function buildTextLayout(ai: Record<string, unknown>): TextLayer['layoutConfig'] {
  const box = ai.box;
  const boundingBox: TextLayer['layoutConfig']['boundingBox'] =
    box && typeof box === 'object' ? { type: 'fixed', width: (box as { width: number }).width, height: (box as { height: number }).height } : { type: 'auto' };
  return {
    boundingBox,
    horizontalAlign: (ai.align as 'left' | 'center' | 'right') ?? 'left',
    verticalAlign: (ai.valign as 'top' | 'middle' | 'bottom') ?? 'top',
    overflow: 'visible', baselineShift: 0, perGlyphAnimation: false,
  };
}

type Common = Pick<ShapeLayer, 'id' | 'name' | 'parentId' | 'trackId' | 'visible' | 'locked' | 'blendMode' | 'transform' | 'inPoint' | 'outPoint'>;

function buildCloner(common: Common, ai: Record<string, unknown>): ClonerLayer {
  return {
    ...common, type: 'cloner',
    sourceRef: ai.sourceRef as ClonerLayer['sourceRef'],
    distribution: ai.distribution as ClonerLayer['distribution'],
    effectors: (ai.effectors as ClonerLayer['effectors']) ?? [],
    stagger: (ai.stagger as ClonerLayer['stagger']) ?? { delaySeconds: 0 },
    renderCount: ai.renderCount as number,
    ...(ai.dataBinding ? { dataBinding: ai.dataBinding as ClonerLayer['dataBinding'] } : {}),
  };
}

function buildCamera(common: Common, ai: Record<string, unknown>): CameraLayer {
  const c = (ai.camera as Record<string, unknown>) ?? {};
  const id = common.id;
  return {
    ...common, type: 'camera', is3D: true,
    camera: {
      mode: (c.mode as 'one-node' | 'two-node') ?? 'two-node',
      pointOfInterest: prop(id, 'Point of Interest', 'vec2', (c.pointOfInterest as Vec2) ?? [common.transform.position.defaultValue as Vec2][0]),
      pointOfInterestZ: prop(id, 'POI Z', 'number', 0),
      zoom: expandNumber(id, 'Zoom', c.zoom, 1777),
      dofEnabled: c.dofEnabled === true,
      focusDistance: prop(id, 'Focus Distance', 'number', 1777),
      aperture: prop(id, 'Aperture', 'number', 25),
      blurLevel: prop(id, 'Blur Level', 'number', 1),
    },
  };
}

function buildMediaLayer(common: Common, type: 'image' | 'video' | 'audio', ai: Record<string, unknown>, add: (s: Issue['severity'], code: string, msg: string, extra?: Partial<Issue>) => void): Layer {
  add('warn', 'asset-layer', `${type} layer ${common.id} needs its asset registered in the asset manager to render`, { layerId: common.id });
  if (type === 'image') {
    const img = ai.image as { assetId: string };
    return { ...common, type: 'image', image: { assetId: img.assetId, sourceWidth: 0, sourceHeight: 0, format: '', fileSize: 0 },
      filters: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, gamma: 1 },
      colorCorrection: emptyColorCorrection() } as Layer;
  }
  if (type === 'video') {
    const v = ai.video as { assetId: string; startOffset?: number; playbackRate?: number; muted?: boolean };
    return { ...common, type: 'video', video: { assetId: v.assetId, sourceWidth: 0, sourceHeight: 0, sourceDuration: 0, sourceFrameRate: 30, startOffset: v.startOffset ?? 0, playbackRate: v.playbackRate ?? 1, muted: v.muted ?? false, playbackMode: 'wait', proxyScale: 1 } } as Layer;
  }
  const a = ai.audio as { assetId: string; startOffset?: number; muted?: boolean };
  return { ...common, type: 'audio', audio: { assetId: a.assetId, sourceDuration: 0, sampleRate: 48000, channels: 2, startOffset: a.startOffset ?? 0, muted: a.muted ?? false, volume: prop(common.id, 'Volume', 'number', 1), pitch: prop(common.id, 'Pitch', 'number', 0) } } as Layer;
}

function emptyColorCorrection(): ImageColorCorrection {
  const wheel = { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 };
  return { lift: { ...wheel }, gamma: { ...wheel }, gain: { ...wheel }, offset: { ...wheel }, temperature: 0, tint: 0, vibrance: 0, saturation: 0, contrast: 0, pivot: 0.5 };
}
