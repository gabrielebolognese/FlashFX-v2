import type { GroupExpansionMode } from './types';
import type { Layer } from '../core/types';
import { getDescendants } from '../core/sceneGraph';

export function resolveStaggerTargets(
  selectedIds: string[],
  layers: Layer[],
  expansionMode: GroupExpansionMode,
): string[] {
  const result: string[] = [];

  for (const id of selectedIds) {
    const layer = layers.find((l) => l.id === id);
    if (!layer) continue;

    if (layer.type !== 'group' || expansionMode === 'treatGroupsAsAtomicUnits') {
      result.push(id);
      continue;
    }

    if (expansionMode === 'expandIntoChildren') {
      const children = layers.filter((l) => l.parentId === id);
      if (children.length > 0) {
        result.push(...children.map((c) => c.id));
      } else {
        result.push(id);
      }
    } else if (expansionMode === 'expandRecursively') {
      const descendants = getDescendants(id, layers);
      const leaves = descendants.filter((d) => d.type !== 'group');
      if (leaves.length > 0) {
        result.push(...leaves.map((l) => l.id));
      } else {
        result.push(id);
      }
    }
  }

  const seen = new Set<string>();
  return result.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
