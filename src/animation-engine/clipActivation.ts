import { ElementAnimation } from './types';

/**
 * Returns true when the clip is active at the given timeline time.
 *
 * A clip is active when ALL of the following hold:
 *   - clip.muted === false
 *   - currentTime >= clip.clipStart
 *   - currentTime <= clip.clipStart + clip.clipDuration
 *
 * Elements without a clip are always considered active (implicit full-duration clip).
 */
export function isClipActive(animation: ElementAnimation, currentTime: number): boolean {
  if (animation.muted) return false;
  const clipEnd = animation.clipStart + animation.clipDuration;
  return currentTime >= animation.clipStart && currentTime <= clipEnd;
}

/**
 * Given the full animations map, returns the computed visibility for an element
 * at the given currentTime. Elements with no clip entry are always visible.
 */
export function getClipComputedVisibility(
  elementId: string,
  animations: Record<string, ElementAnimation>,
  currentTime: number
): boolean {
  const animation = animations[elementId];
  if (!animation) return true;
  return isClipActive(animation, currentTime);
}
