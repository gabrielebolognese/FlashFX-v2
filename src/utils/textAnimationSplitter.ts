import { DesignElement } from '../types/design';
import { ElementAnimation, PropertyTrack, Keyframe } from '../animation-engine/types';
import { splitTextIntoUnits, createTextElementFromUnit } from './textSplitUtils';
import { v4 as uuidv4 } from 'uuid';

export interface SplitResult {
  newElements: DesignElement[];
  newAnimations: Record<string, ElementAnimation>;
}

export function splitTextWithAnimation(
  element: DesignElement,
  animation: ElementAnimation | undefined,
  mode: 'line' | 'word' | 'character',
  staggerDelay: number
): SplitResult {
  if (element.type !== 'text' || !element.text) {
    return { newElements: [], newAnimations: {} };
  }

  const units = splitTextIntoUnits(element, mode);
  const newElements: DesignElement[] = [];
  const newAnimations: Record<string, ElementAnimation> = {};

  units.forEach((unit, index) => {
    const newElement = createTextElementFromUnit(element, unit, index);
    newElements.push(newElement);

    if (animation && animation.tracks.length > 0) {
      const timeOffset = index * staggerDelay;
      const newAnimation = offsetAnimation(animation, newElement.id, timeOffset);
      newAnimations[newElement.id] = newAnimation;
    }
  });

  return { newElements, newAnimations };
}

function offsetAnimation(
  originalAnimation: ElementAnimation,
  newElementId: string,
  timeOffset: number
): ElementAnimation {
  const newTracks: PropertyTrack[] = originalAnimation.tracks.map(track => ({
    ...track,
    keyframes: track.keyframes.map(kf => ({
      ...kf,
      id: uuidv4(),
      time: kf.time + timeOffset
    }))
  }));

  return {
    elementId: newElementId,
    tracks: newTracks,
    clipStart: originalAnimation.clipStart + timeOffset,
    clipDuration: originalAnimation.clipDuration,
    locked: originalAnimation.locked,
    muted: originalAnimation.muted
  };
}

export function calculateTotalAnimationDuration(
  element: DesignElement,
  animation: ElementAnimation | undefined,
  mode: 'line' | 'word' | 'character',
  staggerDelay: number
): number {
  if (!element.text || !animation) return 0;

  const units = splitTextIntoUnits(element, mode);

  let maxKeyframeTime = 0;
  animation.tracks.forEach(track => {
    track.keyframes.forEach(kf => {
      if (typeof kf.time === 'number' && kf.time > maxKeyframeTime) {
        maxKeyframeTime = kf.time;
      }
    });
  });

  const lastUnitOffset = (units.length - 1) * staggerDelay;
  return maxKeyframeTime + lastUnitOffset;
}
