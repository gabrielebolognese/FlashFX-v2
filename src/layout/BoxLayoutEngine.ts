import { DesignElement } from '../types/design';

export interface BoxSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeLayout(
  container: DesignElement,
  children: DesignElement[]
): Record<string, BoxSlot> {
  if (children.length === 0) return {};

  const padding = container.padding ?? 0;
  const margin = container.margin ?? 0;
  const n = children.length;
  const result: Record<string, BoxSlot> = {};

  if (container.type === 'hbox') {
    const availableWidth = Math.max(0, container.width - padding * 2);
    const availableHeight = Math.max(0, container.height - padding * 2);
    const totalSpacing = Math.max(0, n - 1) * margin;
    const childHeight = Math.max(0, (availableHeight - totalSpacing) / n);

    children.forEach((child, i) => {
      result[child.id] = {
        x: container.x + padding,
        y: container.y + padding + i * (childHeight + margin),
        width: availableWidth,
        height: childHeight,
      };
    });
  } else {
    const availableWidth = Math.max(0, container.width - padding * 2);
    const availableHeight = Math.max(0, container.height - padding * 2);
    const totalSpacing = Math.max(0, n - 1) * margin;
    const childWidth = Math.max(0, (availableWidth - totalSpacing) / n);

    children.forEach((child, i) => {
      result[child.id] = {
        x: container.x + padding + i * (childWidth + margin),
        y: container.y + padding,
        width: childWidth,
        height: availableHeight,
      };
    });
  }

  return result;
}

/**
 * Topologically sort box containers so parents are processed before children.
 * This ensures nested boxes (e.g. VBox containing HBoxes) get their sizes
 * set by the parent before the child box layout runs.
 */
function topoSortContainers(containers: DesignElement[]): DesignElement[] {
  const idSet = new Set(containers.map(c => c.id));
  const sorted: DesignElement[] = [];
  const visited = new Set<string>();

  function visit(container: DesignElement) {
    if (visited.has(container.id)) return;
    visited.add(container.id);
    const parentId = container.parentId;
    if (parentId && idSet.has(parentId)) {
      const parent = containers.find(c => c.id === parentId);
      if (parent) visit(parent);
    }
    sorted.push(container);
  }

  containers.forEach(visit);
  return sorted;
}

export function applyBoxLayouts(elements: DesignElement[]): DesignElement[] {
  const containers = elements.filter(
    e => (e.type === 'hbox' || e.type === 'vbox') && e.childIds && e.childIds.length > 0
  );
  if (containers.length === 0) return elements;

  const sorted = topoSortContainers(containers);

  const updates: Record<string, BoxSlot> = {};

  for (const container of sorted) {
    const resolvedContainer = updates[container.id]
      ? { ...container, ...updates[container.id] }
      : container;

    const childIds = resolvedContainer.childIds!;
    const children = childIds
      .map(id => {
        const base = elements.find(e => e.id === id);
        if (!base) return undefined;
        return updates[id] ? { ...base, ...updates[id] } : base;
      })
      .filter((e): e is DesignElement => e !== undefined);

    if (children.length === 0) continue;
    const slots = computeLayout(resolvedContainer, children);
    Object.assign(updates, slots);
  }

  if (Object.keys(updates).length === 0) return elements;

  return elements.map(el => {
    const slot = updates[el.id];
    if (slot) return { ...el, ...slot };
    return el;
  });
}
