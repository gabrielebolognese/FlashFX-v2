import type { AnchorTemporalGate, AnchorPropertyType } from '../core/types';
import type { ResolvedTransform } from '../core/types';

function getPropertyValue(transform: ResolvedTransform, prop: AnchorPropertyType): number {
  switch (prop) {
    case 'positionX': return transform.positionX;
    case 'positionY': return transform.positionY;
    case 'rotation': return transform.rotation;
    case 'scaleX': return transform.scaleX;
    case 'scaleY': return transform.scaleY;
    case 'opacity': return transform.opacity;
  }
}

export function remapFrame(
  gate: AnchorTemporalGate,
  frame: number,
  inPoint: number,
  outPoint: number,
  sourceTransforms?: ResolvedTransform[],
): number {
  const localFrame = frame - inPoint;
  const duration = outPoint - inPoint;

  switch (gate.type) {
    case 'doAfter': {
      const delay = gate.delayFrames ?? 0;
      const adjusted = localFrame - delay;
      if (adjusted < 0) return inPoint;
      return inPoint + adjusted;
    }
    case 'doWhile': {
      if (!sourceTransforms || !gate.triggerProperty || gate.threshold === undefined) {
        return frame;
      }
      const sourceFrame = Math.min(frame, sourceTransforms.length - 1);
      if (sourceFrame < 0) return inPoint;
      const val = getPropertyValue(sourceTransforms[sourceFrame], gate.triggerProperty);
      if (Math.abs(val) < gate.threshold) return inPoint;
      return frame;
    }
    case 'doUntil': {
      if (!sourceTransforms || !gate.triggerProperty || gate.threshold === undefined) {
        return frame;
      }
      const sourceFrame = Math.min(frame, sourceTransforms.length - 1);
      if (sourceFrame < 0) return frame;
      const val = getPropertyValue(sourceTransforms[sourceFrame], gate.triggerProperty);
      if (Math.abs(val) >= gate.threshold) return inPoint;
      return frame;
    }
    case 'doFasterSlower': {
      const speed = gate.speedFactor ?? 1;
      const remapped = Math.round(localFrame * speed);
      return inPoint + Math.min(remapped, duration - 1);
    }
  }
}
