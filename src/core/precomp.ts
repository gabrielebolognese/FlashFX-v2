// Precomposition core — pure helpers for the multi-composition document.
//
// A precomp layer references another Composition by id; the resolve pipeline
// recursively resolves that sub-composition at a time-remapped local frame. This
// module holds the pure pieces: the resolve context threaded through resolveFrame,
// the local-time math, the recursion depth cap, and a unified composition-graph
// cycle detector that walks BOTH precomp-nesting edges AND cloner composition-source
// edges (the cloner's WHITE/GRAY/BLACK DFS was deliberately shaped for exactly this).

import type { Composition, PrecompLayer } from './types';

/** Hard recursion cap — guarantees termination even if resolve-time cycle
 *  validation is bypassed. Nesting deeper than this renders nothing. */
export const MAX_PRECOMP_DEPTH = 16;

/**
 * Threaded through resolveFrame so precomp layers can resolve their referenced
 * sub-composition. Optional everywhere: a composition with no precomps (or a caller
 * that passes nothing) resolves exactly as before, and precomps whose registry is
 * absent resolve to an empty (nothing-rendered) precomp.
 */
export interface ResolveContext {
  /** Resolve a composition by id from the document registry. */
  getComposition?: (id: string) => Composition | undefined;
  /** Current recursion depth (0 at the root). */
  depth?: number;
  /** Composition ids currently on the recursion stack (cycle guard). */
  visited?: ReadonlySet<string>;
}

/**
 * Map a parent frame to the sub-composition's local frame:
 *   (frame − inPoint) → ×(subFps/parentFps) ×timeStretch +startFrame, clamped to
 *   [0, subDuration). Mirrors the existing per-source local-time pattern (video/
 *   lottie), including the fps rescale and outPoint-exclusive clamp.
 */
export function precompLocalFrame(
  precomp: PrecompLayer,
  frame: number,
  parentFps: number,
  sub: Composition,
): number {
  const rebased = frame - precomp.inPoint;
  const stretch = precomp.timeRemap?.timeStretch ?? 1;
  const startFrame = precomp.timeRemap?.startFrame ?? 0;
  const fpsRatio = (sub.settings.frameRate || parentFps || 1) / (parentFps || 1);
  const dur = Math.max(1, Math.floor(sub.settings.durationFrames || 1));
  let local = startFrame + rebased * fpsRatio * stretch;
  if (!Number.isFinite(local)) local = 0;
  if (local < 0) local = 0;
  if (local > dur - 1) local = dur - 1; // outPoint-exclusive style clamp
  return Math.floor(local);
}

/** Composition ids a composition references (precomp layers + cloner composition
 *  sources) — the out-edges of a comp in the document graph. */
export function referencedCompositionIds(comp: Composition): string[] {
  const ids: string[] = [];
  for (const layer of comp.layers) {
    if (layer.type === 'precomp') {
      ids.push((layer as PrecompLayer).compositionId);
    } else if (layer.type === 'cloner') {
      const ref = (layer as { sourceRef?: { type: string; compositionId?: string } }).sourceRef;
      if (ref?.type === 'composition' && ref.compositionId) ids.push(ref.compositionId);
    }
  }
  return ids;
}

// ── Unified composition-graph cycle detection ──

export type CompositionIssueKind = 'cycle' | 'dangling';

export interface CompositionGraphIssue {
  compositionId: string;
  kind: CompositionIssueKind;
  message: string;
  /** For cycles: the chain of composition ids forming the loop. */
  path?: string[];
}

const WHITE = 0; // unvisited
const GRAY = 1; // on the current DFS stack
const BLACK = 2; // fully explored

/**
 * Detect reference cycles (a comp reaching itself through nested precomps and/or
 * cloner composition-sources) and dangling references (a ref to a comp not in the
 * registry). Pure — mutates nothing. Returns all issues (empty = valid).
 */
export function validateCompositionGraph(
  getComposition: (id: string) => Composition | undefined,
  rootIds: string[],
): CompositionGraphIssue[] {
  const issues: CompositionGraphIssue[] = [];
  const color = new Map<string, number>();
  const stack: string[] = [];

  const dfs = (id: string): void => {
    const comp = getComposition(id);
    if (!comp) {
      issues.push({ compositionId: id, kind: 'dangling', message: `Referenced composition "${id}" does not exist.` });
      return;
    }
    color.set(id, GRAY);
    stack.push(id);
    for (const childId of referencedCompositionIds(comp)) {
      const c = color.get(childId) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(childId);
        const chain = (start >= 0 ? stack.slice(start) : stack.slice()).concat(childId);
        issues.push({
          compositionId: id,
          kind: 'cycle',
          message: `Precomposition reference cycle: ${chain.join(' → ')}.`,
          path: chain,
        });
      } else if (c === WHITE) {
        dfs(childId);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of rootIds) {
    if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
  }
  return issues;
}
