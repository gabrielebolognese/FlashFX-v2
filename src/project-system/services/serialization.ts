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
    return { version: SCENE_DOCUMENT_VERSION, rootCompositionId: comp.id, scenes: [comp.id], compositions: { [comp.id]: comp } };
  }

  const compositions: Record<string, Composition> = {};
  const rawComps = (raw && raw.compositions) || {};
  for (const id of Object.keys(rawComps)) {
    compositions[id] = validateComposition(rawComps[id]);
  }
  // Degenerate / corrupt input with no valid compositions (e.g. an empty object, or a document
  // whose compositions map is missing/all-invalid): synthesize one default composition so the
  // document is always usable. A missing root would otherwise crash the editor when it renders
  // compositions[rootCompositionId].
  if (Object.keys(compositions).length === 0) {
    const fallback = validateComposition(raw);
    compositions[fallback.id] = fallback;
  }
  const ids = Object.keys(compositions);
  const rootCompositionId =
    raw && raw.rootCompositionId && compositions[raw.rootCompositionId] ? raw.rootCompositionId : ids[0];
  // Keep the scene list if present (valid ids only); legacy docs migrate to a
  // single scene (the root). The store guarantees the root is always a scene.
  const rawScenes = Array.isArray(raw?.scenes) ? (raw.scenes as unknown[]).filter((id): id is string => typeof id === 'string' && !!compositions[id]) : [];
  const scenes = rawScenes.length > 0 ? rawScenes : [rootCompositionId];
  // AI metadata is preserved as an opaque blob (the schema owns its shape); dropping it would break
  // the edit path, which regenerates from it. No validation here beyond "is an object".
  const aiMeta = raw && typeof raw.aiMeta === 'object' && raw.aiMeta ? (raw.aiMeta as Record<string, unknown>) : undefined;
  return { version: SCENE_DOCUMENT_VERSION, rootCompositionId, scenes, compositions, styles: validateStyles(raw?.styles), ...(aiMeta ? { aiMeta } : {}) };
}

// M21 — preserve the shared-style registry through the round-trip (else it vanishes on load).
function validateStyles(raw: unknown): SceneDocument['styles'] {
  if (!raw || typeof raw !== 'object') return {};
  const out: NonNullable<SceneDocument['styles']> = {};
  for (const [id, s] of Object.entries(raw as Record<string, unknown>)) {
    if (s && typeof s === 'object') {
      const st = s as { id?: unknown; name?: unknown; type?: unknown; value?: unknown };
      if (typeof st.id === 'string' && typeof st.name === 'string' && typeof st.type === 'string' && st.value && typeof st.value === 'object') {
        out[id] = s as NonNullable<SceneDocument['styles']>[string];
      }
    }
  }
  return out;
}
