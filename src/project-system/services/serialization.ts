import type { Composition, SceneDocument } from '../../core/types';
import { validateComposition } from './validation';

export function serializeComposition(composition: Composition): string {
  return JSON.stringify(composition);
}

export function deserializeComposition(data: string): Composition {
  const raw = JSON.parse(data);
  return validateComposition(raw);
}

// ── Multi-composition document (precomposition) ──

const SCENE_DOCUMENT_VERSION = 2;

export function serializeDocument(doc: SceneDocument): string {
  return JSON.stringify(doc);
}

/**
 * Parse a persisted scene into a SceneDocument, MIGRATING legacy single-composition
 * scenes (a bare serialized `Composition`) into a one-entry document keyed by the
 * composition's id. Every composition is run through validateComposition.
 */
export function deserializeDocument(data: string): SceneDocument {
  const raw = JSON.parse(data);

  // Legacy: a bare Composition (has `layers`, no `compositions` registry).
  if (raw && Array.isArray(raw.layers) && !raw.compositions) {
    const comp = validateComposition(raw);
    return { version: SCENE_DOCUMENT_VERSION, rootCompositionId: comp.id, compositions: { [comp.id]: comp } };
  }

  const compositions: Record<string, Composition> = {};
  const rawComps = (raw && raw.compositions) || {};
  for (const id of Object.keys(rawComps)) {
    compositions[id] = validateComposition(rawComps[id]);
  }
  const ids = Object.keys(compositions);
  const rootCompositionId =
    raw && raw.rootCompositionId && compositions[raw.rootCompositionId] ? raw.rootCompositionId : ids[0];
  return { version: SCENE_DOCUMENT_VERSION, rootCompositionId, compositions };
}
