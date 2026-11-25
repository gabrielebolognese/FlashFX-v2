// Agent-mode runtime: installs `window.__ffxAgent` so an automated agent driving this tab (over CDP,
// an MCP bridge, or the devtools console) can discover what FlashFX does and do it through the SAME
// store actions the UI uses.
//
//   __ffxAgent.listFeatures()        -> manifest (features + action specs + live catalogs)
//   __ffxAgent.getState()            -> compact summary of the active composition
//   __ffxAgent.run(actionId, args)   -> dispatch ONE whitelisted action
//
// Safety: run() only accepts action ids declared in src/agent/featureManifest.ts (AGENT_ACTIONS);
// there is no eval and no arbitrary method lookup. Editor actions already push their own history
// commands; the composite helpers below either delegate to an undoable editor action or wrap their
// change in a history Command, so every undoable action is one Ctrl+Z.

import { useEditorStore } from '../store/editor';
import { useHistoryStore } from '../store/history';
import { useExpressionStore } from '../expressions/store';
import { expressionManager } from '../expressions/manager';
import { TEXT_ANIMATOR_PRESETS, createTextDecode, buildTextAnimatorPreset } from '../core/textAnimatorPresets';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { loadProjectScene } from '../project-system/services/projects';
import { buildProjectBundle } from '../project-system/services/ffx';
import { mediaAssetManager } from '../engine/media/assetManager';
import { useOnboardingStore } from '../onboarding/store';
import { usePanelStore, type UiMode } from '../store/panels';
import { playbackController, useTimelineStore } from '../store/timeline';
import { exportToMp4, type ExportSettings } from '../codec/exporter';
import { collectExportVideoDecodes } from '../codec/exportMath';
import { WebGPURenderer } from '../engine/renderer';
import { EXPORT_MOTION_BLUR_SAMPLES } from '../store/preview';
import { videoDecoderPool } from '../engine/video/videoDecoderPool';
import { frameScheduler } from '../engine/video/frameScheduler';
import { PARTICLE_PRESETS } from '../particles/presets';
import { resolveFrame } from '../core/interpolation';
import { getTextLayout, measureStringWidth } from '../engine/textAtlas';
import type { Layer, ParticleLayer, ResolvedText, TextLayer } from '../core/types';
import {
  AGENT_ACTIONS,
  AGENT_MANIFEST_SCHEMA_VERSION,
  buildAgentManifest,
  type AgentActionSpec,
  type AgentHelperMethod,
  type AgentManifest,
} from './featureManifest';
import { buildAgentCatalogs, type AgentCatalogs } from './catalogs';
import {
  buildAgentCursor, findCursorRig, planCursorMove, planCursorClick, buildClickRipple, planCursorIcon, cursorIconAt,
  AGENT_CURSOR_ICONS, type AgentCursorIcon,
} from '../animation-templates/cursorRig';
import type { KeyframeEaseSpec } from '../core/keyframeSpecs';
import { normalizeTextCaret } from '../core/textCaret';

export interface AgentLayerSummary {
  id: string;
  name: string;
  type: Layer['type'];
  parentId: string | null;
  visible: boolean;
  inPoint?: number;
  outPoint?: number;
  text?: string;
  maskIds?: string[];
  /** Timeline track the layer's clip sits on (null = none). */
  trackId?: string | null;
  /** Properties with animated overrides (B33/B47/B50), e.g. ["fillColor", "glowIntensity", "effect 170_0"]. */
  animProps?: string[];
}

export interface AgentBackgroundSummary {
  id: string;
  type: string;
  enabled: boolean;
  opacity: number;
}

export interface AgentTrackSummary {
  id: string;
  name: string;
  type: string;
  order: number;
  visible: boolean;
  locked: boolean;
}

export interface AgentStateSummary {
  compositionId: string;
  compositionName: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  currentFrame: number;
  isPlaying: boolean;
  selectedIds: string[];
  activeLayerId: string | null;
  layers: AgentLayerSummary[];
  /** The composition background stack, bottom first (edit with editor.updateBackgroundLayer). */
  background: AgentBackgroundSummary[];
  /** Timeline tracks (order 0 = top of the timeline). */
  tracks: AgentTrackSummary[];
  canUndo: boolean;
  canRedo: boolean;
}

export type AgentRunResult =
  | { ok: true; actionId: string; result: unknown; activeLayerId: string | null; undoDepth: number }
  | { ok: false; actionId: string; error: string };

export interface AgentExportChunk {
  /** Base64 of bytes [offset, offset + length) of the exported file. */
  base64: string;
  offset: number;
  length: number;
  total: number;
}

export interface FfxAgentApi {
  version: string;
  listFeatures: () => AgentManifest & { catalogs: AgentCatalogs };
  getState: () => AgentStateSummary;
  run: (actionId: string, args?: unknown) => Promise<AgentRunResult>;
  /** Read a slice of a finished `agent.exportMp4` / `agent.exportProject` file (so a CDP / MCP bridge can stream it out). */
  readExport: (exportId: string, offset: number, length: number) => Promise<AgentExportChunk>;
  /** Free a finished export's bytes. Returns false when the id is unknown. */
  releaseExport: (exportId: string) => boolean;
}

declare global {
  interface Window {
    __ffxAgent?: FfxAgentApi;
  }
}

const ACTIONS_BY_ID: ReadonlyMap<string, AgentActionSpec> = new Map(AGENT_ACTIONS.map((a) => [a.id, a]));

function summarizeLayer(layer: Layer): AgentLayerSummary {
  const out: AgentLayerSummary = {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    parentId: layer.parentId,
    visible: layer.visible,
  };
  if ('inPoint' in layer && typeof layer.inPoint === 'number') out.inPoint = layer.inPoint;
  if ('outPoint' in layer && typeof layer.outPoint === 'number') out.outPoint = layer.outPoint;
  if (layer.type === 'text') out.text = layer.content.spans.map((s) => s.text).join('');
  if ('masks' in layer && Array.isArray(layer.masks) && layer.masks.length) out.maskIds = layer.masks.map((m) => m.id);
  if ('trackId' in layer) out.trackId = (layer as { trackId?: string | null }).trackId ?? null;
  const anim = (layer as { animProps?: Record<string, unknown> }).animProps;
  if (anim) {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(anim)) {
      if (k === 'effectParams' && v && typeof v === 'object') keys.push(...Object.keys(v).map((e) => `effect ${e}`));
      else if (v) keys.push(k);
    }
    if (keys.length) out.animProps = keys;
  }
  return out;
}

export function getAgentState(): AgentStateSummary {
  const ed = useEditorStore.getState();
  const hist = useHistoryStore.getState();
  const comp = ed.composition;
  return {
    compositionId: comp.id,
    compositionName: comp.name,
    width: comp.settings.width,
    height: comp.settings.height,
    fps: comp.settings.frameRate,
    durationFrames: comp.settings.durationFrames,
    // The real playhead lives in the timeline store / playbackController (the editor store's
    // currentFrame / isPlaying fields are not what the preview follows).
    currentFrame: useTimelineStore.getState().currentFrame,
    isPlaying: useTimelineStore.getState().isPlaying,
    selectedIds: [...ed.selection.selectedIds],
    activeLayerId: ed.selection.activeId,
    layers: comp.layers.map(summarizeLayer),
    background: (comp.background?.layers ?? []).map((b) => ({ id: b.id, type: b.type, enabled: b.enabled, opacity: b.opacity })),
    tracks: comp.tracks.map((t) => ({ id: t.id, name: t.name, type: t.type, order: t.order, visible: t.visible, locked: t.locked })),
    canUndo: hist.undoStack.length > 0,
    canRedo: hist.redoStack.length > 0,
  };
}

/** Map `args` (object keyed by param name, positional array, or nothing) onto the spec's params. */
export function normalizeArgs(spec: AgentActionSpec, args: unknown): unknown[] {
  let positional: unknown[];
  if (args === undefined || args === null) positional = [];
  else if (Array.isArray(args)) positional = args;
  else if (typeof args === 'object') {
    const obj = args as Record<string, unknown>;
    const known = new Set(spec.params.map((p) => p.name));
    const unknownKeys = Object.keys(obj).filter((k) => !known.has(k));
    if (unknownKeys.length) throw new Error(`unknown argument(s) ${unknownKeys.join(', ')}; expected ${spec.params.map((p) => p.name).join(', ') || 'none'}`);
    positional = spec.params.map((p) => obj[p.name]);
  } else throw new Error('args must be an object keyed by param name or a positional array');

  if (positional.length > spec.params.length) {
    throw new Error(`too many arguments: ${spec.id} takes ${spec.params.length}`);
  }
  spec.params.forEach((p, i) => {
    const v = positional[i];
    if (v === undefined) {
      if (!p.optional && !p.type.includes('undefined')) throw new Error(`missing required argument "${p.name}" (${p.type})`);
      return;
    }
    if (v === null && p.type.includes('null')) return;
    if (p.values && !p.values.includes(v as string)) {
      throw new Error(`"${p.name}" must be one of ${p.values.join(', ')}`);
    }
  });
  // Trim trailing undefineds so optional params keep their defaults.
  let end = positional.length;
  while (end > 0 && positional[end - 1] === undefined) end--;
  return positional.slice(0, end);
}

function requireLayer(layerId: unknown): Layer {
  const layer = useEditorStore.getState().composition.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`no layer with id "${String(layerId)}"`);
  return layer;
}

function requireTextLayer(layerId: unknown): TextLayer {
  const layer = requireLayer(layerId);
  if (layer.type !== 'text') throw new Error(`layer "${String(layerId)}" is a ${layer.type}, not a text layer`);
  return layer;
}

const PROJECT_FORMATS = {
  long: { width: 1920, height: 1080 },
  short: { width: 1080, height: 1920 },
} as const;

// rAF is paused in hidden / occluded tabs (a headed automation window behind others), so never wait on
// it alone: whichever comes first, the next frame or a short timeout.
const nextFrame = () => new Promise<void>((r) => { requestAnimationFrame(() => r()); setTimeout(r, 100); });
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Finished exports (MP4 renders and .ffx project bundles) held for readExport (keyed by a counter id, never by time). */
const finishedExports = new Map<string, Blob>();
let exportSeq = 0;

/** Decode base64 (optionally a data: URL) into bytes. */
function base64ToBytes(data: unknown): Uint8Array<ArrayBuffer> {
  if (typeof data !== 'string' || !data) throw new Error('"data" must be a non-empty base64 string');
  const comma = data.startsWith('data:') ? data.indexOf(',') : -1;
  const binary = atob(comma >= 0 ? data.slice(comma + 1) : data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
};

/** SVG cannot go through createImageBitmap(blob): rasterize it to a PNG whose longest side is `size` px. */
async function rasterizeSvg(svg: Blob, size: number): Promise<Blob> {
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || size;
    const nh = img.naturalHeight || size;
    const k = size / Math.max(nw, nh);
    const w = Math.max(1, Math.round(nw * k));
    const h = Math.max(1, Math.round(nh * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas to rasterize the SVG');
    ctx.drawImage(img, 0, 0, w, h);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function requireActiveProjectId(): string {
  const { activeProjectId, view } = useProjectStore.getState();
  if (!activeProjectId || view !== 'editor') throw new Error('no project is open (call agent.createProject first)');
  return activeProjectId;
}

/** The Viewport attaches its WebGPU renderer asynchronously (after the project opens and the device
 *  initializes). Until then a seek renders nothing and a screenshot is black, so wait for it. */
async function waitForRenderer(timeoutMs = 30000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs && !playbackController.getRenderer(); waited += 50) await delay(50);
  return playbackController.getRenderer() !== null;
}

/** Wait until the editor holds the document of `projectId` (ProjectApp installs it asynchronously). */
async function waitForOpenedProject(projectId: string): Promise<void> {
  const doc = await loadProjectScene(projectId);
  if (!doc) throw new Error('the project scene could not be read back');
  for (let i = 0; i < 200 && useEditorStore.getState().rootCompositionId !== doc.rootCompositionId; i++) await delay(50);
  if (useEditorStore.getState().rootCompositionId !== doc.rootCompositionId) throw new Error('timed out waiting for the editor to open the project');
  await waitForRenderer();
  await nextFrame();
  await nextFrame();
  playbackController.renderCurrentFrame();
}

// ---------------------------------------------------------------------------------------------
// B48: full-resolution frame renders (pixel-true checks and side-by-sides with reference videos)
// ---------------------------------------------------------------------------------------------

/** One offscreen renderer reused across renderFrame calls (re-created when the size changes). */
let frameRenderer: { renderer: WebGPURenderer; width: number; height: number } | null = null;
/** Serialize frame renders: they share the renderer and its canvas. */
let frameRenderChain: Promise<unknown> = Promise.resolve();

const MAX_RENDER_SIDE = 4096;

function renderSize(width: unknown, height: unknown): { w: number; h: number } {
  const comp = useEditorStore.getState().composition;
  const cw = comp.settings.width, ch = comp.settings.height;
  let w = typeof width === 'number' && width > 0 ? Math.round(width) : 0;
  let h = typeof height === 'number' && height > 0 ? Math.round(height) : 0;
  if (!w && !h) { w = cw; h = ch; } else if (!h) h = Math.round((w * ch) / cw); else if (!w) w = Math.round((h * cw) / ch);
  if (w > MAX_RENDER_SIDE || h > MAX_RENDER_SIDE) throw new Error(`render size ${w}x${h} exceeds ${MAX_RENDER_SIDE} px`);
  return { w: Math.max(2, w), h: Math.max(2, h) };
}

/**
 * Render one composition frame through an offscreen WebGPURenderer exactly like the MP4 exporter does
 * (same resolve context, export-quality motion blur, full-resolution video decode, images resident),
 * then copy it to a fresh canvas. Never touches the DOM or the preview.
 */
async function renderCompFrame(frame: number, w: number, h: number): Promise<OffscreenCanvas> {
  const job = frameRenderChain.then(async () => {
    if (!frameRenderer || frameRenderer.width !== w || frameRenderer.height !== h) {
      frameRenderer?.renderer.destroy();
      frameRenderer = null;
      const r = new WebGPURenderer();
      if (!(await r.initializeOffscreen(w, h))) throw new Error('WebGPU is not available for an offscreen render');
      r.setMotionBlurSamples(EXPORT_MOTION_BLUR_SAMPLES);
      r.setExportMode(true);
      frameRenderer = { renderer: r, width: w, height: h };
    }
    const r = frameRenderer.renderer;
    const ed = useEditorStore.getState();
    const comp = ed.composition;
    const f = Math.max(0, Math.min(comp.settings.durationFrames - 1, Math.round(frame)));
    const data = resolveFrame(comp, f, { getComposition: ed.getComposition, depth: 0, visited: new Set() });
    // Full-resolution source frames (the exporter's path), never a buffered half-res preview proxy.
    const decodes = collectExportVideoDecodes(data.layers);
    if (decodes.length) {
      frameScheduler.releaseBufferedFrames();
      await Promise.all(decodes.map(async ({ assetId, frame: sf }) => {
        if (frameScheduler.getFrame(assetId, sf)) return;
        frameScheduler.injectFrame(assetId, sf, await videoDecoderPool.decodeFrameForExport(assetId, sf));
      }));
    }
    await Promise.all(data.layers.filter((l) => l.layerType === 'image' && l.image?.assetId).map((l) => mediaAssetManager.ensureImageBitmap(l.image!.assetId)));
    try {
      await r.renderFrameAsync(data, 'offscreen');
    } finally {
      // Like the exporter's cleanup: do not leave full-resolution frames in the shared scheduler.
      if (decodes.length) frameScheduler.releaseBufferedFrames();
    }
    const src = r.getOffscreenCanvas();
    if (!src) throw new Error('the offscreen renderer has no canvas');
    const copy = new OffscreenCanvas(w, h);
    const g = copy.getContext('2d');
    if (!g) throw new Error('no 2D canvas to read the frame back');
    g.drawImage(src, 0, 0);
    return copy;
  });
  frameRenderChain = job.catch(() => undefined);
  return job;
}

async function keepPng(canvas: OffscreenCanvas): Promise<{ exportId: string; bytes: number }> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const exportId = `export-${++exportSeq}`;
  finishedExports.set(exportId, blob);
  return { exportId, bytes: blob.size };
}

/** Composite helpers: each is one undoable step built on real store actions / history commands.
 *  (createProject / exportMp4 are session-level and not undoable, like their UI counterparts.) */
const HELPERS: Record<AgentHelperMethod, (...args: unknown[]) => unknown> = {
  setTextContent: (layerId, text) => {
    const layer = requireTextLayer(layerId);
    if (typeof text !== 'string') throw new Error('"text" must be a string');
    const first = layer.content.spans[0];
    if (!first) throw new Error('text layer has no span to take the style from');
    useEditorStore.getState().updateLayerProperty(layer.id, 'content.spans', [{ ...first, text }]);
    return layer.id;
  },

  applyTextAnimatorPreset: (layerId, presetId, startFrame, durationFrames, replace) => {
    const layer = requireTextLayer(layerId);
    const preset = TEXT_ANIMATOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error(`unknown text animator preset "${String(presetId)}"; try ${TEXT_ANIMATOR_PRESETS.map((p) => p.id).join(', ')}`);
    const start = typeof startFrame === 'number' ? startFrame : 0;
    const dur = typeof durationFrames === 'number' ? durationFrames : 30;
    const existing = replace === true ? [] : (layer.animators ?? []);
    const added = buildTextAnimatorPreset(preset.build, start, dur);
    const next = [...existing, ...added];
    useEditorStore.getState().updateLayerProperty(layer.id, 'animators', next);
    return { animatorIndex: next.length - 1, added: added.length };
  },

  applyTextDecode: (layerId, startFrame, durationFrames) => {
    const layer = requireTextLayer(layerId);
    const start = typeof startFrame === 'number' ? startFrame : 0;
    const dur = typeof durationFrames === 'number' ? durationFrames : 30;
    useEditorStore.getState().updateLayerProperty(layer.id, 'decode', createTextDecode(start, dur));
    return layer.id;
  },

  setExpression: async (layerId, propertyName, code) => {
    const layer = requireLayer(layerId);
    if (typeof propertyName !== 'string' || !propertyName) throw new Error('"propertyName" must be a non-empty string');
    if (typeof code !== 'string' || !code.trim()) throw new Error('"code" must be a non-empty string');
    const trimmed = code.trim();
    const exprStore = useExpressionStore.getState();
    const prev = exprStore.getExpression(layer.id, propertyName);
    useHistoryStore.getState().execute({
      label: `Set expression on ${propertyName}`,
      execute: () => {
        useExpressionStore.getState().setExpression(layer.id, propertyName, trimmed);
        expressionManager.clearCache(layer.id);
      },
      undo: () => {
        const s = useExpressionStore.getState();
        if (prev) {
          s.setExpression(layer.id, propertyName, prev.code);
          s.setEnabled(layer.id, propertyName, prev.enabled);
        } else {
          s.removeExpression(layer.id, propertyName);
        }
        expressionManager.clearCache(layer.id);
      },
    });
    const validationError = await expressionManager.validate(trimmed);
    return { validationError };
  },

  seek: async (frame) => {
    if (typeof frame !== 'number' || !Number.isFinite(frame)) throw new Error('"frame" must be a number');
    if (!playbackController.getRenderer() && !(await waitForRenderer())) throw new Error('the preview renderer is not ready (WebGPU did not initialize)');
    useTimelineStore.getState().seekTo(Math.round(frame)); // clamps + renders, like dragging the playhead
    await nextFrame();
    return useTimelineStore.getState().currentFrame;
  },

  play: () => {
    useTimelineStore.getState().play();
    return useTimelineStore.getState().isPlaying;
  },

  pause: () => {
    useTimelineStore.getState().pause();
    return useTimelineStore.getState().currentFrame;
  },

  createProject: async (name, format, frameRate, durationFrames, uiMode) => {
    const fmt = format === undefined ? 'long' : format;
    if (fmt !== 'long' && fmt !== 'short') throw new Error('"format" must be long or short');
    const size = PROJECT_FORMATS[fmt];
    const fps = typeof frameRate === 'number' && frameRate > 0 ? frameRate : 30;
    const frames = typeof durationFrames === 'number' && durationFrames > 0 ? Math.round(durationFrames) : 150;
    const projectName = typeof name === 'string' && name.trim() ? name.trim() : 'Agent project';
    // A first-run onboarding wizard replaces the whole app; an agent creating a project skips it.
    if (useOnboardingStore.getState().active) useOnboardingStore.getState().complete();
    const projects = useProjectStore.getState();
    if (projects.view === 'editor') await projects.closeProject(); // saves the open project first
    await useProjectStore.getState().createAndOpenProject({
      name: projectName, width: size.width, height: size.height, frameRate: fps, durationFrames: frames, videoFormat: fmt,
    });
    const projectId = useProjectStore.getState().activeProjectId;
    if (!projectId || useProjectStore.getState().view !== 'editor') throw new Error('the project was created but could not be opened');
    if (uiMode === 'starter' || uiMode === 'pro') usePanelStore.getState().setUiMode(uiMode as UiMode);
    // ProjectApp installs the saved document asynchronously: wait until the editor holds it.
    await waitForOpenedProject(projectId);
    const comp = useEditorStore.getState().composition;
    return { projectId, compositionId: comp.id, width: comp.settings.width, height: comp.settings.height, fps: comp.settings.frameRate, durationFrames: comp.settings.durationFrames };
  },

  exportMp4: async (width, height, frameRate, bitrate, includeAudio) => {
    const ed = useEditorStore.getState();
    const settings: Partial<ExportSettings> = {};
    if (typeof width === 'number') settings.width = width;
    if (typeof height === 'number') settings.height = height;
    if (typeof frameRate === 'number') settings.frameRate = frameRate;
    if (typeof bitrate === 'number') settings.bitrate = bitrate;
    settings.includeAudio = includeAudio !== false;
    // The same exporter + registry lookup the Export modal uses (precomps resolve, audio is mixed).
    const { blob, audioDropped } = await exportToMp4(ed.composition, settings, undefined, undefined, ed.getComposition);
    const exportId = `export-${++exportSeq}`;
    finishedExports.set(exportId, blob);
    return { exportId, bytes: blob.size, mimeType: blob.type || 'video/mp4', audioDropped };
  },

  configureParticles: (layerId, presetId, overrides, seed) => {
    const layer = requireLayer(layerId);
    if (layer.type !== 'particle') throw new Error(`layer "${String(layerId)}" is a ${layer.type}, not a particle layer`);
    const particle = (layer as ParticleLayer).particle;
    let base: Record<string, unknown>;
    let preset = particle.preset;
    if (presetId !== undefined && presetId !== null) {
      const make = typeof presetId === 'string' ? PARTICLE_PRESETS[presetId] : undefined;
      if (!make) throw new Error(`unknown particle preset "${String(presetId)}"; try ${Object.keys(PARTICLE_PRESETS).join(', ')}`);
      base = make() as unknown as Record<string, unknown>;
      preset = presetId as string;
    } else {
      try { base = JSON.parse(particle.emitterConfig) as Record<string, unknown>; } catch { base = {}; }
    }
    if (overrides !== undefined && (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))) {
      throw new Error('"overrides" must be an object of EmitterConfig fields (src/particles/types.ts)');
    }
    const next = { ...base, ...(overrides as Record<string, unknown> | undefined) };
    const nextSeed = typeof seed === 'number' && Number.isFinite(seed) ? Math.round(seed) : particle.seed;
    // One field write = one undo step (preset name, seed and the emitter JSON change together).
    useEditorStore.getState().updateLayerProperty(layer.id, 'particle', { preset, seed: nextSeed, emitterConfig: JSON.stringify(next) });
    return { preset, seed: nextSeed, config: next };
  },

  measureText: (layerId, frame) => {
    const layer = requireTextLayer(layerId);
    const ed = useEditorStore.getState();
    const f = typeof frame === 'number' && Number.isFinite(frame) ? Math.round(frame) : useTimelineStore.getState().currentFrame;
    // Resolve exactly like the renderer, with animators / decode stripped and the spans collapsed to the
    // base style so the layer resolves to ONE text quad (animated or mixed-style text otherwise expands
    // into per-glyph stamps). An accent word in another face can shift the real width slightly.
    const fullText = layer.content.spans.map((sp) => sp.text).join('');
    const first = layer.content.spans[0];
    const content = first ? { ...layer.content, spans: [{ ...first, text: fullText }] } : layer.content;
    const probe = { ...layer, content, animators: [], decode: undefined, masks: [], textPath: undefined, inPoint: Math.min(layer.inPoint, f), outPoint: Math.max(layer.outPoint, f + 1) };
    const comp = { ...ed.composition, layers: ed.composition.layers.map((l) => (l.id === layer.id ? probe : l)) };
    const resolved = resolveFrame(comp, f, { getComposition: ed.getComposition }).layers.find((l) => l.id === layer.id);
    if (!resolved?.text) throw new Error('the text did not resolve at this frame');
    const layout = getTextLayout(resolved.text);
    const lineWidths = layout.lines.map((line) => measureStringWidth(resolved.text!, line));
    const t = resolved.transform;
    const inkWidth = Math.max(0, ...lineWidths);
    const inkHeight = layout.lines.length * layout.lineHeightPx;
    // The renderer centres the text quad on the layer position (scale 1, no rotation assumed here).
    const cx = t.positionX;
    const cy = t.positionY;
    return {
      frame: f,
      center: [cx, cy],
      box: { width: layout.canvasWidth, height: layout.canvasHeight, left: cx - layout.canvasWidth / 2, top: cy - layout.canvasHeight / 2 },
      ink: { width: inkWidth, height: inkHeight, left: cx - inkWidth / 2, right: cx + inkWidth / 2, top: cy - inkHeight / 2, bottom: cy + inkHeight / 2 },
      lines: layout.lines,
      lineWidths,
      lineHeightPx: layout.lineHeightPx,
      fontSize: resolved.text.fontSize,
      scale: [t.scaleX, t.scaleY],
      rotation: t.rotation,
    };
  },

  measureString: (text, fontFamily, fontSize, fontWeight, fontStyle, letterSpacing, lineHeight) => {
    // Measure without a layer: a throwaway ResolvedText laid out by the SAME code the renderer uses.
    if (typeof text !== 'string') throw new Error('"text" must be a string');
    const size = typeof fontSize === 'number' && fontSize > 0 ? fontSize : 48;
    const probe: ResolvedText = {
      content: text,
      mode: 'point',
      boxWidth: 300,
      boxHeight: 200,
      fontFamily: typeof fontFamily === 'string' && fontFamily ? fontFamily : 'Inter',
      fontWeight: typeof fontWeight === 'number' ? fontWeight : 400,
      fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
      fontSize: size,
      lineHeight: typeof lineHeight === 'number' && lineHeight > 0 ? lineHeight : 1.2,
      letterSpacing: typeof letterSpacing === 'number' ? letterSpacing : 0,
      fillColor: [1, 1, 1, 1],
      strokeColor: [0, 0, 0, 0],
      strokeWidth: 0,
      textAlign: 'center',
      underline: false,
      strikethrough: false,
      measuredWidth: 0,
      measuredHeight: 0,
    };
    const layout = getTextLayout(probe);
    const lineWidths = layout.lines.map((line) => measureStringWidth(probe, line));
    return {
      width: Math.max(0, ...lineWidths),
      height: layout.lines.length * layout.lineHeightPx,
      lines: layout.lines,
      lineWidths,
      lineHeightPx: layout.lineHeightPx,
      box: { width: layout.canvasWidth, height: layout.canvasHeight },
      fontFamily: probe.fontFamily,
      fontSize: size,
    };
  },

  renderFrame: async (frame, width, height) => {
    const f = typeof frame === 'number' && Number.isFinite(frame) ? frame : useTimelineStore.getState().currentFrame;
    const { w, h } = renderSize(width, height);
    const canvas = await renderCompFrame(f, w, h);
    const kept = await keepPng(canvas);
    return { ...kept, frame: Math.round(f), width: w, height: h, mimeType: 'image/png' };
  },

  renderStrip: async (frames, columns, tileWidth, labels) => {
    if (!Array.isArray(frames) || frames.length === 0 || !frames.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error('"frames" must be a non-empty array of frame numbers');
    if (frames.length > 64) throw new Error('at most 64 frames per strip');
    const comp = useEditorStore.getState().composition;
    const tw = typeof tileWidth === 'number' && tileWidth > 0 ? Math.round(tileWidth) : Math.min(480, comp.settings.width);
    const { w, h } = renderSize(tw, undefined);
    const cols = typeof columns === 'number' && columns > 0 ? Math.min(Math.round(columns), frames.length) : Math.min(frames.length, 4);
    const rows = Math.ceil(frames.length / cols);
    const gap = 4;
    const sheet = new OffscreenCanvas(cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap);
    const g = sheet.getContext('2d');
    if (!g) throw new Error('no 2D canvas for the strip');
    g.fillStyle = '#202020';
    g.fillRect(0, 0, sheet.width, sheet.height);
    for (let i = 0; i < frames.length; i++) {
      const tile = await renderCompFrame(frames[i] as number, w, h);
      const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + gap);
      g.drawImage(tile, x, y);
      if (labels !== false) {
        const label = `f${Math.round(frames[i] as number)}`;
        g.font = `${Math.max(11, Math.round(h / 14))}px monospace`;
        const m = g.measureText(label);
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(x, y, m.width + 10, Math.max(11, Math.round(h / 14)) + 8);
        g.fillStyle = '#ffffff';
        g.fillText(label, x + 5, y + Math.max(11, Math.round(h / 14)) + 2);
      }
    }
    const kept = await keepPng(sheet);
    return { ...kept, frames: frames.map((x) => Math.round(x as number)), columns: cols, tileWidth: w, tileHeight: h, width: sheet.width, height: sheet.height, mimeType: 'image/png' };
  },

  getLayer: (layerId) => {
    // Read-only: the full layer JSON (every property path an agent can set or keyframe), deep-copied
    // so the caller can never mutate store state through it.
    return structuredClone(requireLayer(layerId));
  },

  saveProject: async () => {
    const projectId = requireActiveProjectId();
    await useProjectStore.getState().saveCurrentProject();
    return { projectId, compositions: Object.keys(useEditorStore.getState().getDocument().compositions).length };
  },

  exportProject: async () => {
    const projectId = requireActiveProjectId();
    // Persist first (so IndexedDB matches), then bundle the LIVE document: every composition, the
    // project's media binaries and the preview, exactly what File > Download Project (.ffx) writes.
    await useProjectStore.getState().saveCurrentProject();
    const { blob, fileName } = await buildProjectBundle(projectId, useEditorStore.getState().getDocument());
    const exportId = `export-${++exportSeq}`;
    finishedExports.set(exportId, blob);
    return { exportId, bytes: blob.size, fileName, projectId, mimeType: 'application/json' };
  },

  importProject: async (data, fileName) => {
    const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'project.ffx';
    const file = new File([base64ToBytes(data)], name, { type: 'application/json' });
    if (useOnboardingStore.getState().active) useOnboardingStore.getState().complete();
    const projects = useProjectStore.getState();
    if (projects.view === 'editor') await projects.closeProject(); // saves the open project first
    const metadata = await useProjectStore.getState().importProject(file);
    await useProjectStore.getState().openProject(metadata.id);
    if (useProjectStore.getState().activeProjectId !== metadata.id) throw new Error('the project was imported but could not be opened');
    await waitForOpenedProject(metadata.id);
    const comp = useEditorStore.getState().composition;
    return { projectId: metadata.id, name: metadata.name, compositionId: comp.id, layers: comp.layers.length, width: comp.settings.width, height: comp.settings.height };
  },

  importImage: async (data, fileName, mimeType, rasterSize) => {
    const projectId = requireActiveProjectId();
    const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'image.png';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const type = typeof mimeType === 'string' && mimeType ? mimeType : IMAGE_MIME_BY_EXT[ext];
    if (!type || !type.startsWith('image/')) throw new Error(`cannot tell the image type of "${name}"; pass mimeType (png, jpeg, webp, gif, svg)`);
    let blob: Blob = new Blob([base64ToBytes(data)], { type });
    let finalName = name;
    if (type === 'image/svg+xml') {
      const size = typeof rasterSize === 'number' && rasterSize > 0 ? Math.min(8192, Math.round(rasterSize)) : 1024;
      blob = await rasterizeSvg(blob, size);
      finalName = `${name.replace(/\.svg$/i, '')}.png`;
    }
    const file = new File([blob], finalName, { type: blob.type || type });
    const { assetId, metadata } = await mediaAssetManager.importImage(file, projectId);
    return { assetId, width: metadata.width, height: metadata.height, name: finalName };
  },

  removeExpression: (layerId, propertyName) => {
    const layer = requireLayer(layerId);
    if (typeof propertyName !== 'string') throw new Error('"propertyName" must be a string');
    const prev = useExpressionStore.getState().getExpression(layer.id, propertyName);
    if (!prev) return false;
    useHistoryStore.getState().execute({
      label: `Remove expression on ${propertyName}`,
      execute: () => {
        useExpressionStore.getState().removeExpression(layer.id, propertyName);
        expressionManager.clearCache(layer.id);
      },
      undo: () => {
        const s = useExpressionStore.getState();
        s.setExpression(layer.id, propertyName, prev.code);
        s.setEnabled(layer.id, propertyName, prev.enabled);
        expressionManager.clearCache(layer.id);
      },
    });
    return true;
  },

  // ----- B51 cursor rig (animation-templates/cursorRig.ts): each call is ONE undo step -----
  addCursor: (icon, x, y, frame, color, size, name) => {
    const comp = useEditorStore.getState().composition;
    const num = (v: unknown, fallback: number, label: string): number => {
      if (v === undefined || v === null) return fallback;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${label}" must be a number`);
      return v;
    };
    if (color !== undefined && !(Array.isArray(color) && color.length === 4 && color.every((c) => typeof c === 'number' && Number.isFinite(c)))) throw new Error('"color" must be an RGBA colour [r, g, b, a] (0..1)');
    const start = Math.round(num(frame, 0, 'frame'));
    const layers = buildAgentCursor({
      icon: (icon ?? 'arrow') as AgentCursorIcon,
      x: num(x, comp.settings.width / 2, 'x'),
      y: num(y, comp.settings.height / 2, 'y'),
      frame: start,
      endFrame: Math.max(start + 1, comp.settings.durationFrames),
      color: color as [number, number, number, number] | undefined,
      size: num(size, 36, 'size'),
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
    });
    useEditorStore.getState().applyLayerEdits('Add cursor', { add: layers });
    const icons: Record<string, string> = {};
    for (const l of layers.slice(1)) icons[l.name] = l.id;
    return { cursorId: layers[0].id, icons, frame: start };
  },

  cursorMoveTo: (cursorId, frame, x, y, durationFrames, ease, arc) => {
    const ed = useEditorStore.getState();
    const rig = findCursorRig(ed.composition.layers, String(cursorId));
    for (const [v, label] of [[frame, 'frame'], [x, 'x'], [y, 'y']] as const) if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${label}" must be a number`);
    if (durationFrames !== undefined && (typeof durationFrames !== 'number' || !(durationFrames > 0))) throw new Error('"durationFrames" must be a positive number');
    if (arc !== undefined && (typeof arc !== 'number' || !Number.isFinite(arc))) throw new Error('"arc" must be a number');
    const plan = planCursorMove(rig.group, {
      frame: frame as number, to: [x as number, y as number], fps: ed.composition.settings.frameRate,
      durationFrames: durationFrames as number | undefined, ease: ease as KeyframeEaseSpec | undefined, arc: arc as number | undefined,
    });
    ed.applyLayerEdits('Move cursor', { update: [plan.group] });
    return { cursorId: rig.group.id, from: plan.from, to: plan.to, startFrame: plan.startFrame, endFrame: plan.endFrame };
  },

  cursorClick: (cursorId, frame, ripple, squash, rippleColor) => {
    const ed = useEditorStore.getState();
    const rig = findCursorRig(ed.composition.layers, String(cursorId));
    if (typeof frame !== 'number' || !Number.isFinite(frame)) throw new Error('"frame" must be a number');
    if (squash !== undefined && (typeof squash !== 'number' || !(squash > 0))) throw new Error('"squash" must be a positive scale factor');
    if (rippleColor !== undefined && !(Array.isArray(rippleColor) && rippleColor.length === 4 && rippleColor.every((c) => typeof c === 'number' && Number.isFinite(c)))) throw new Error('"rippleColor" must be an RGBA colour [r, g, b, a] (0..1)');
    const f = Math.round(frame);
    const group = planCursorClick(rig.group, { frame: f, squash: squash as number | undefined });
    const ring = ripple === false ? null : buildClickRipple(rig.group, f, { color: rippleColor as [number, number, number, number] | undefined });
    ed.applyLayerEdits('Cursor click', { update: [group], add: ring ? [ring] : [] });
    if (!ring) useEditorStore.getState().selectLayer(rig.group.id);
    return { cursorId: rig.group.id, frame: f, rippleId: ring ? ring.id : null, responseFrame: f + 2 };
  },

  cursorIcon: (cursorId, frame, icon) => {
    const ed = useEditorStore.getState();
    const rig = findCursorRig(ed.composition.layers, String(cursorId));
    if (typeof frame !== 'number' || !Number.isFinite(frame)) throw new Error('"frame" must be a number');
    if (!AGENT_CURSOR_ICONS.includes(icon as AgentCursorIcon)) throw new Error(`"icon" must be one of ${AGENT_CURSOR_ICONS.join(', ')}`);
    const before = cursorIconAt(rig, Math.round(frame));
    ed.applyLayerEdits('Cursor icon', { update: planCursorIcon(rig, frame, icon as AgentCursorIcon) });
    return { cursorId: rig.group.id, frame: Math.round(frame), from: before, icon };
  },

  // ----- B35 typing caret on a text layer (core/textCaret.ts) -----
  setTextCaret: (layerId, caret) => {
    const layer = requireTextLayer(layerId);
    if (caret === null) {
      if (!layer.caret) return null;
      useEditorStore.getState().updateLayerProperty(layer.id, 'caret', { ...layer.caret, enabled: false });
      return { ...layer.caret, enabled: false };
    }
    if (caret !== undefined && (typeof caret !== 'object' || Array.isArray(caret))) throw new Error('"caret" must be an object (TextCaret fields) or null');
    const next = normalizeTextCaret({ ...(layer.caret ?? {}), enabled: true, ...(caret as Record<string, unknown> | undefined) });
    if (!next) throw new Error('invalid caret');
    useEditorStore.getState().updateLayerProperty(layer.id, 'caret', next);
    return next;
  },
};

function resolveCallable(spec: AgentActionSpec): (...args: unknown[]) => unknown {
  switch (spec.store) {
    case 'editor': {
      const state = useEditorStore.getState();
      return (state[spec.method] as unknown as (...a: unknown[]) => unknown).bind(state);
    }
    case 'history': {
      const state = useHistoryStore.getState();
      return (state[spec.method] as unknown as (...a: unknown[]) => unknown).bind(state);
    }
    case 'agent':
      return HELPERS[spec.method];
  }
}

export async function runAgentAction(actionId: string, args?: unknown): Promise<AgentRunResult> {
  const spec = ACTIONS_BY_ID.get(actionId);
  if (!spec) return { ok: false, actionId, error: `"${actionId}" is not an allowed agent action (see listFeatures().actions)` };
  try {
    const positional = normalizeArgs(spec, args);
    const fn = resolveCallable(spec);
    const result = await fn(...positional);
    const ed = useEditorStore.getState();
    return {
      ok: true,
      actionId,
      result: result === undefined ? null : result,
      activeLayerId: ed.selection.activeId,
      undoDepth: useHistoryStore.getState().undoStack.length,
    };
  } catch (err) {
    return { ok: false, actionId, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listAgentFeatures(): AgentManifest & { catalogs: AgentCatalogs } {
  return { ...buildAgentManifest(), catalogs: buildAgentCatalogs() };
}

async function readAgentExport(exportId: string, offset: number, length: number): Promise<AgentExportChunk> {
  const blob = finishedExports.get(exportId);
  if (!blob) throw new Error(`no finished export with id "${exportId}"`);
  const start = Math.max(0, Math.floor(offset));
  const end = Math.min(blob.size, start + Math.max(0, Math.floor(length)));
  const bytes = new Uint8Array(await blob.slice(start, end).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), offset: start, length: bytes.length, total: blob.size };
}

/** Install `window.__ffxAgent` (idempotent). Called once from src/main.tsx. */
export function installAgentRuntime(): void {
  if (typeof window === 'undefined' || window.__ffxAgent) return;
  window.__ffxAgent = {
    version: `ffx-agent/${AGENT_MANIFEST_SCHEMA_VERSION}`,
    listFeatures: listAgentFeatures,
    getState: getAgentState,
    run: runAgentAction,
    readExport: readAgentExport,
    releaseExport: (exportId: string) => finishedExports.delete(exportId),
  };
}
