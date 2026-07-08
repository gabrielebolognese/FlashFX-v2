import type { AnchorEdge, AnchorPropertyMapping, AnchorPropertyType } from '../core/types';
import { simulatePhysics } from './physics';

interface CacheKey {
  edgeId: string;
  mapping: string;
  version: number;
}

interface CacheEntry {
  key: CacheKey;
  values: number[];
}

let cacheVersion = 0;
const cache = new Map<string, CacheEntry>();

export function invalidateCache(): void {
  cacheVersion++;
  cache.clear();
}

export function invalidateEdgeCache(edgeId: string): void {
  for (const [key] of cache) {
    if (key.startsWith(edgeId)) cache.delete(key);
  }
}

function makeCacheKeyString(edgeId: string, sourceProperty: AnchorPropertyType, targetProperty: AnchorPropertyType): string {
  return `${edgeId}:${sourceProperty}->${targetProperty}`;
}

export function getBakedValues(
  edge: AnchorEdge,
  mapping: AnchorPropertyMapping,
  sourceValues: number[],
  frameRate: number,
): number[] {
  if (!edge.physics) return sourceValues;

  const keyStr = makeCacheKeyString(edge.id, mapping.sourceProperty, mapping.targetProperty);
  const existing = cache.get(keyStr);
  if (existing && existing.key.version === cacheVersion && existing.values.length === sourceValues.length) {
    return existing.values;
  }

  const baked = simulatePhysics(edge.physics, sourceValues, frameRate);
  cache.set(keyStr, {
    key: { edgeId: edge.id, mapping: `${mapping.sourceProperty}->${mapping.targetProperty}`, version: cacheVersion },
    values: baked,
  });
  return baked;
}

export function getCacheVersion(): number {
  return cacheVersion;
}
