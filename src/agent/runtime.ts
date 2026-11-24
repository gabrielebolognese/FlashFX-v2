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
import { TEXT_ANIMATOR_PRESETS, createTextDecode } from '../core/textAnimatorPresets';
import type { Layer, TextLayer } from '../core/types';
import {
  AGENT_ACTIONS,
  AGENT_MANIFEST_SCHEMA_VERSION,
  buildAgentManifest,
  type AgentActionSpec,
  type AgentHelperMethod,
  type AgentManifest,
} from './featureManifest';
import { buildAgentCatalogs, type AgentCatalogs } from './catalogs';

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
  canUndo: boolean;
  canRedo: boolean;
}

export type AgentRunResult =
  | { ok: true; actionId: string; result: unknown; activeLayerId: string | null; undoDepth: number }
  | { ok: false; actionId: string; error: string };

export interface FfxAgentApi {
  version: string;
  listFeatures: () => AgentManifest & { catalogs: AgentCatalogs };
  getState: () => AgentStateSummary;
  run: (actionId: string, args?: unknown) => Promise<AgentRunResult>;
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
    currentFrame: ed.currentFrame,
    isPlaying: ed.isPlaying,
    selectedIds: [...ed.selection.selectedIds],
    activeLayerId: ed.selection.activeId,
    layers: comp.layers.map(summarizeLayer),
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

/** Composite helpers: each is one undoable step built on real store actions / history commands. */
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
    const next = [...existing, preset.build(start, dur)];
    useEditorStore.getState().updateLayerProperty(layer.id, 'animators', next);
    return { animatorIndex: next.length - 1 };
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

/** Install `window.__ffxAgent` (idempotent). Called once from src/main.tsx. */
export function installAgentRuntime(): void {
  if (typeof window === 'undefined' || window.__ffxAgent) return;
  window.__ffxAgent = {
    version: `ffx-agent/${AGENT_MANIFEST_SCHEMA_VERSION}`,
    listFeatures: listAgentFeatures,
    getState: getAgentState,
    run: runAgentAction,
  };
}
