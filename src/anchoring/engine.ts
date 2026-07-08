import type { AnchorEdge, AnchorPropertyMapping, AnchorTransferFunction, AnchorPropertyType } from '../core/types';
import type { ResolvedTransform } from '../core/types';
import { AnchorGraph } from './graph';
import { remapFrame } from './temporal';
import { getBakedValues } from './cache';

function getTransformProperty(transform: ResolvedTransform, prop: AnchorPropertyType): number {
  switch (prop) {
    case 'positionX': return transform.positionX;
    case 'positionY': return transform.positionY;
    case 'rotation': return transform.rotation;
    case 'scaleX': return transform.scaleX;
    case 'scaleY': return transform.scaleY;
    case 'opacity': return transform.opacity;
  }
}

function setTransformProperty(transform: ResolvedTransform, prop: AnchorPropertyType, value: number): void {
  switch (prop) {
    case 'positionX': transform.positionX = value; break;
    case 'positionY': transform.positionY = value; break;
    case 'rotation': transform.rotation = value; break;
    case 'scaleX': transform.scaleX = value; break;
    case 'scaleY': transform.scaleY = value; break;
    case 'opacity': transform.opacity = value; break;
  }
}

function applyTransfer(value: number, transfer: AnchorTransferFunction): number {
  let result = value;
  switch (transfer.type) {
    case 'direct':
      result = value * transfer.scale + transfer.offset;
      break;
    case 'mirror':
      result = -value * transfer.scale + transfer.offset;
      break;
    case 'scale':
      result = value * transfer.scale + transfer.offset;
      break;
    case 'remap': {
      const range = transfer.clampMax - transfer.clampMin;
      if (range > 0) {
        result = transfer.clampMin + ((value - transfer.clampMin) / range) * range * transfer.scale + transfer.offset;
      }
      break;
    }
    case 'expression':
      result = value * transfer.scale + transfer.offset;
      break;
  }
  return Math.max(transfer.clampMin, Math.min(transfer.clampMax, result));
}

export function evaluateAnchoring(
  edges: AnchorEdge[],
  transforms: Map<string, ResolvedTransform>,
  frame: number,
  frameRate: number,
  totalFrames: number,
): Map<string, ResolvedTransform> {
  if (edges.length === 0) return transforms;

  const graph = new AnchorGraph();
  graph.rebuild(edges);
  const sorted = graph.topologicalSort();

  const result = new Map<string, ResolvedTransform>();
  for (const [id, t] of transforms) {
    result.set(id, { ...t });
  }

  for (const layerId of sorted) {
    const incomingEdges = graph.getEdgesTo(layerId);
    if (incomingEdges.length === 0) continue;

    const target = result.get(layerId);
    if (!target) continue;

    for (const edge of incomingEdges) {
      const sourceTransform = result.get(edge.sourceLayerId);
      if (!sourceTransform) continue;

      let effectiveFrame = frame;
      if (edge.temporal) {
        effectiveFrame = remapFrame(edge.temporal, frame, 0, totalFrames);
      }

      for (const mapping of edge.mappings) {
        const sourceValue = getTransformProperty(sourceTransform, mapping.sourceProperty);

        if (edge.physics) {
          const sourceValues = buildSourceTimeline(
            sourceTransform, mapping.sourceProperty, totalFrames
          );
          const baked = getBakedValues(edge, mapping, sourceValues, frameRate);
          const bakedValue = baked[Math.min(effectiveFrame, baked.length - 1)] ?? sourceValue;
          const transferred = applyTransfer(bakedValue, mapping.transfer);
          setTransformProperty(target, mapping.targetProperty, transferred);
        } else {
          const transferred = applyTransfer(sourceValue, mapping.transfer);
          setTransformProperty(target, mapping.targetProperty, transferred);
        }
      }
    }
  }

  return result;
}

function buildSourceTimeline(
  currentTransform: ResolvedTransform,
  property: AnchorPropertyType,
  totalFrames: number,
): number[] {
  const value = getTransformProperty(currentTransform, property);
  const timeline = new Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    timeline[i] = value;
  }
  return timeline;
}
