// Cloner — reference / cycle validation.
//
// Structurally the same problem as precomp cycle detection, adapted to what this
// codebase actually has. A cloner adds an edge: cloner → whatever its `sourceRef`
// points at. A cycle forms if following those edges (through layers that are
// themselves cloners) returns to the start — e.g. A sources B, B sources A, which
// would expand infinitely.
//
// EXTENSION POINT (precomps): when a multi-composition document + precomp layers
// land, `sourceRef.type === 'composition'` becomes a real edge (cloner's owning
// composition → referenced composition), and precomp nesting adds a second edge
// source. Both must be walked in this SAME DFS — a cycle that alternates precomp
// nesting and cloner sourceRef is just as invalid. `ClonerGraphContext` is shaped
// so those edges slot in without restructuring the walk.

import type { ClonerLayer, ClonerSourceRef } from './types';

export type ClonerIssueKind = 'cycle' | 'self-reference' | 'dangling-source';

export interface ClonerValidationIssue {
  clonerId: string;
  kind: ClonerIssueKind;
  message: string;
  /** For cycle/self-reference: the chain of layer ids forming the loop. */
  path?: string[];
}

export interface ClonerGraphContext {
  /** The cloner whose layer id is `layerId`, or undefined if that id is not a cloner. */
  getClonerByLayerId: (layerId: string) => ClonerLayer | undefined;
  /** Whether a layer with this id exists at all (for dangling-ref detection). */
  layerExists: (layerId: string) => boolean;
}

/** The layer id a sourceRef points at, or null when it is not a walkable layer edge. */
function sourceLayerId(ref: ClonerSourceRef): string | null {
  // Composition refs are not walked yet (no precomps / multi-comp document). When
  // that lands, resolve the composition's cloner/precomp edges here instead.
  return ref.type === 'layer' ? ref.layerId : null;
}

const WHITE = 0; // unvisited
const GRAY = 1; // on the current DFS stack
const BLACK = 2; // fully explored

/**
 * Validate a set of cloner layers for reference cycles, self-references, and
 * dangling source refs. Pure — no mutation of inputs. Returns all issues found
 * (empty array = valid).
 */
export function validateClonerReferences(
  cloners: ClonerLayer[],
  ctx: ClonerGraphContext,
): ClonerValidationIssue[] {
  const issues: ClonerValidationIssue[] = [];
  const color = new Map<string, number>();
  const stack: string[] = [];

  const dfs = (cloner: ClonerLayer): void => {
    color.set(cloner.id, GRAY);
    stack.push(cloner.id);

    const targetLayerId = sourceLayerId(cloner.sourceRef);
    if (targetLayerId !== null) {
      if (!ctx.layerExists(targetLayerId)) {
        issues.push({
          clonerId: cloner.id,
          kind: 'dangling-source',
          message: `Cloner "${cloner.id}" sources layer "${targetLayerId}", which does not exist.`,
        });
      } else {
        const target = ctx.getClonerByLayerId(targetLayerId);
        // Only cloner targets create a walkable edge; a plain layer terminates the walk.
        if (target) {
          const c = color.get(target.id) ?? WHITE;
          if (c === GRAY) {
            const start = stack.indexOf(target.id);
            const chain = stack.slice(start).concat(target.id);
            issues.push({
              clonerId: cloner.id,
              kind: target.id === cloner.id ? 'self-reference' : 'cycle',
              message:
                target.id === cloner.id
                  ? `Cloner "${cloner.id}" sources itself.`
                  : `Cloner reference cycle: ${chain.join(' → ')}.`,
              path: chain,
            });
          } else if (c === WHITE) {
            dfs(target);
          }
        }
      }
    }

    stack.pop();
    color.set(cloner.id, BLACK);
  };

  for (const cloner of cloners) {
    if ((color.get(cloner.id) ?? WHITE) === WHITE) {
      dfs(cloner);
    }
  }

  return issues;
}
