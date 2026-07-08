import type { Layer } from './types';
import { isDescendantOf } from './sceneGraph';

export type LayerSwitchKey = 'visible' | 'locked' | 'effectsEnabled' | 'motionBlur' | 'is3D';

export const LAYER_SWITCH_DEFAULTS: Record<LayerSwitchKey, boolean> = {
  visible: true,
  locked: false,
  effectsEnabled: true,
  motionBlur: false,
  is3D: false,
};

export function getSwitchValue(layer: Layer, key: LayerSwitchKey): boolean {
  const value = (layer as unknown as Record<string, unknown>)[key];
  if (typeof value === 'boolean') return value;
  return LAYER_SWITCH_DEFAULTS[key];
}

export function getEffectsEnabled(layer: Layer): boolean {
  return getSwitchValue(layer, 'effectsEnabled');
}

export function getMotionBlur(layer: Layer): boolean {
  return getSwitchValue(layer, 'motionBlur');
}

export function getIs3D(layer: Layer): boolean {
  return getSwitchValue(layer, 'is3D');
}

export function canParentTo(
  childId: string,
  parentId: string | null,
  layers: Layer[],
): boolean {
  if (parentId === null) return true;
  if (parentId === childId) return false;
  const parent = layers.find((l) => l.id === parentId);
  if (!parent) return false;
  if (isDescendantOf(parentId, childId, layers)) return false;
  return true;
}

export function getParentCandidates(layerId: string, layers: Layer[]): Layer[] {
  return layers.filter((l) => canParentTo(layerId, l.id, layers));
}
