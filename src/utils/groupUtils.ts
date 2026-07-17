import { DesignElement } from '../types/design';

/**
 * Computes the axis-aligned bounding box of a rotated rectangle.
 * Returns the AABB corners considering element rotation.
 */
function getRotatedBounds(el: DesignElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const angle = ((el.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const hw = el.width / 2;
  const hh = el.height / 2;
  const aabbW = hw * cos + hh * sin;
  const aabbH = hw * sin + hh * cos;
  return {
    minX: cx - aabbW,
    minY: cy - aabbH,
    maxX: cx + aabbW,
    maxY: cy + aabbH,
  };
}

export const createGroup = (elements: DesignElement[], selectedIds: string[]): DesignElement[] => {
  const selectedElements = elements.filter(el => selectedIds.includes(el.id));

  if (selectedElements.length < 2) return elements;

  // Calculate group bounds accounting for rotation
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of selectedElements) {
    const bounds = getRotatedBounds(el);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  const groupId = `group-${Date.now()}`;

  const group: DesignElement = {
    id: groupId,
    type: 'group',
    name: 'Group',
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
    children: selectedElements.map(el => ({
      ...el,
      x: el.x - minX,
      y: el.y - minY,
      parentId: groupId,
    })),
  };

  const remainingElements = elements.filter(el => !selectedIds.includes(el.id));
  return [...remainingElements, group];
};

export const ungroupElements = (elements: DesignElement[], groupId: string): DesignElement[] => {
  const group = elements.find(el => el.id === groupId && el.type === 'group');

  if (!group || !group.children) return elements;

  const groupRotRad = ((group.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(groupRotRad);
  const sin = Math.sin(groupRotRad);
  const groupCX = group.x + group.width / 2;
  const groupCY = group.y + group.height / 2;

  const ungroupedChildren = group.children.map(child => {
    if (group.rotation === 0) {
      return {
        ...child,
        x: child.x + group.x,
        y: child.y + group.y,
        parentId: undefined,
      };
    }
    // Apply group rotation to child local coordinates
    const localCX = child.x + child.width / 2;
    const localCY = child.y + child.height / 2;
    const rotatedX = cos * localCX - sin * localCY;
    const rotatedY = sin * localCX + cos * localCY;
    return {
      ...child,
      x: groupCX + rotatedX - child.width / 2,
      y: groupCY + rotatedY - child.height / 2,
      rotation: (child.rotation || 0) + (group.rotation || 0),
      parentId: undefined,
    };
  });

  const remainingElements = elements.filter(el => el.id !== groupId);
  return [...remainingElements, ...ungroupedChildren];
};

export const getAllElementsFlat = (elements: DesignElement[]): DesignElement[] => {
  const result: DesignElement[] = [];

  elements.forEach(element => {
    if (element.type === 'group' && element.children) {
      result.push(element);
      result.push(...getAllElementsFlat(element.children));
    } else {
      result.push(element);
    }
  });

  return result;
};

export const updateElementInGroup = (
  elements: DesignElement[],
  elementId: string,
  updates: Partial<DesignElement>
): DesignElement[] => {
  return elements.map(element => {
    if (element.id === elementId) {
      return { ...element, ...updates };
    }

    if (element.type === 'group' && element.children) {
      return {
        ...element,
        children: updateElementInGroup(element.children, elementId, updates),
      };
    }

    return element;
  });
};

export const findParentGroup = (
  elements: DesignElement[],
  childId: string
): DesignElement | null => {
  for (const element of elements) {
    if (element.type === 'group' && element.children) {
      const hasChild = element.children.some(child => child.id === childId);
      if (hasChild) {
        return element;
      }
      const parentInChildren = findParentGroup(element.children, childId);
      if (parentInChildren) {
        return parentInChildren;
      }
    }
  }
  return null;
};

/**
 * Finds an element by id searching recursively through groups.
 */
export const findElementById = (
  elements: DesignElement[],
  id: string
): DesignElement | null => {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.type === 'group' && el.children) {
      const found = findElementById(el.children, id);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Updates a child element within a group, returning a new elements array.
 * Also works for top-level elements.
 */
export const updateChildInGroup = (
  elements: DesignElement[],
  groupId: string,
  childId: string,
  updates: Partial<DesignElement>
): DesignElement[] => {
  return elements.map(el => {
    if (el.id === groupId && el.type === 'group' && el.children) {
      const updatedChildren = el.children.map(child =>
        child.id === childId ? { ...child, ...updates } : child
      );
      // Recompute group bounding box from children
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of updatedChildren) {
        const bounds = getRotatedBounds({ ...child, x: el.x + child.x, y: el.y + child.y });
        const localMinX = bounds.minX - el.x;
        const localMinY = bounds.minY - el.y;
        const localMaxX = bounds.maxX - el.x;
        const localMaxY = bounds.maxY - el.y;
        minX = Math.min(minX, localMinX);
        minY = Math.min(minY, localMinY);
        maxX = Math.max(maxX, localMaxX);
        maxY = Math.max(maxY, localMaxY);
      }
      return {
        ...el,
        children: updatedChildren,
        width: isFinite(maxX - minX) ? maxX - minX : el.width,
        height: isFinite(maxY - minY) ? maxY - minY : el.height,
      };
    }
    return el;
  });
};
