import type { PropertyOwner } from './types';

export interface PropertyOwnership {
  positionX: PropertyOwner;
  positionY: PropertyOwner;
  rotation: PropertyOwner;
}

const ownershipMap = new Map<string, PropertyOwnership>();

const DEFAULT_OWNERSHIP: PropertyOwnership = {
  positionX: 'keyframe',
  positionY: 'keyframe',
  rotation: 'keyframe',
};

export function getPropertyOwnership(layerId: string): PropertyOwnership {
  return ownershipMap.get(layerId) ?? { ...DEFAULT_OWNERSHIP };
}

export function setPropertyOwnership(layerId: string, ownership: Partial<PropertyOwnership>): void {
  const current = getPropertyOwnership(layerId);
  ownershipMap.set(layerId, { ...current, ...ownership });
}

export function clearPropertyOwnership(layerId: string): void {
  ownershipMap.delete(layerId);
}

export function canEnablePhysicsDynamic(layerId: string): { allowed: boolean; conflictingProperty?: string; conflictingOwner?: PropertyOwner } {
  const ownership = getPropertyOwnership(layerId);
  if (ownership.positionX === 'anchorFollower') {
    return { allowed: false, conflictingProperty: 'positionX', conflictingOwner: 'anchorFollower' };
  }
  if (ownership.positionY === 'anchorFollower') {
    return { allowed: false, conflictingProperty: 'positionY', conflictingOwner: 'anchorFollower' };
  }
  if (ownership.rotation === 'anchorFollower') {
    return { allowed: false, conflictingProperty: 'rotation', conflictingOwner: 'anchorFollower' };
  }
  return { allowed: true };
}

export function canEnableAnchorFollower(layerId: string, property: keyof PropertyOwnership): { allowed: boolean; conflictingOwner?: PropertyOwner } {
  const ownership = getPropertyOwnership(layerId);
  if (ownership[property] === 'physicsDynamic') {
    return { allowed: false, conflictingOwner: 'physicsDynamic' };
  }
  return { allowed: true };
}

export function markPhysicsDynamic(layerId: string): void {
  setPropertyOwnership(layerId, {
    positionX: 'physicsDynamic',
    positionY: 'physicsDynamic',
    rotation: 'physicsDynamic',
  });
}

export function unmarkPhysicsDynamic(layerId: string): void {
  const current = getPropertyOwnership(layerId);
  const reset: Partial<PropertyOwnership> = {};
  if (current.positionX === 'physicsDynamic') reset.positionX = 'keyframe';
  if (current.positionY === 'physicsDynamic') reset.positionY = 'keyframe';
  if (current.rotation === 'physicsDynamic') reset.rotation = 'keyframe';
  setPropertyOwnership(layerId, reset);
}
