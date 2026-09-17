// Mask reveal wipes (B10a). Pure builders that keyframe an EXISTING parametric mask's position + size
// so the masked content wipes/irises on over time. Uses the mask render that already ships (analytic
// SDF + feather), so there is NO engine change — this only computes keyframe values. A mask shows the
// content INSIDE its shape (assuming not inverted), so growing the mask from nothing reveals the layer.
// Leaf module: imports only the Vec2 type → node-harnessable (`verify:mask-reveal`).

import type { Vec2 } from './types';

export type MaskRevealKind = 'irisIn' | 'wipeRight' | 'wipeLeft' | 'wipeDown' | 'wipeUp';

export interface MaskRevealKey {
  frame: number;
  value: Vec2;
}

export interface MaskRevealKeys {
  position: [MaskRevealKey, MaskRevealKey];
  size: [MaskRevealKey, MaskRevealKey];
}

export const MASK_REVEAL_KINDS: { id: MaskRevealKind; label: string }[] = [
  { id: 'irisIn', label: 'Iris in (center)' },
  { id: 'wipeRight', label: 'Wipe → right' },
  { id: 'wipeLeft', label: 'Wipe ← left' },
  { id: 'wipeDown', label: 'Wipe ↓ down' },
  { id: 'wipeUp', label: 'Wipe ↑ up' },
];

/**
 * Keyframes that reveal the layer through `kind` over [startFrame, startFrame+durationFrames]. The
 * mask's CURRENT (center, size) is the fully-revealed END state; the START collapses the mask:
 * - irisIn: size 0 at the center → grows out to full (center-out reveal).
 * - wipeRight/Left: a full-height sliver anchored to the left/right edge → grows across (L→R / R→L).
 * - wipeDown/Up: a full-width sliver anchored to the top/bottom edge → grows down/up (T→B / B→T).
 * Position is keyframed alongside size so the anchored edge stays put while the mask grows.
 */
export function buildMaskReveal(kind: MaskRevealKind, center: Vec2, size: Vec2, startFrame: number, durationFrames: number): MaskRevealKeys {
  const end = startFrame + Math.max(1, durationFrames);
  const [cx, cy] = center;
  const [w, h] = size;
  const hw = w / 2;
  const hh = h / 2;

  let startPos: Vec2;
  let startSize: Vec2;
  switch (kind) {
    case 'irisIn':
      startPos = [cx, cy];
      startSize = [0, 0];
      break;
    case 'wipeRight': // reveal grows left→right: anchor the LEFT edge (x = cx - hw)
      startPos = [cx - hw, cy];
      startSize = [0, h];
      break;
    case 'wipeLeft': // right→left: anchor the RIGHT edge (x = cx + hw)
      startPos = [cx + hw, cy];
      startSize = [0, h];
      break;
    case 'wipeDown': // top→bottom: anchor the TOP edge (y = cy - hh)
      startPos = [cx, cy - hh];
      startSize = [w, 0];
      break;
    case 'wipeUp': // bottom→top: anchor the BOTTOM edge (y = cy + hh)
      startPos = [cx, cy + hh];
      startSize = [w, 0];
      break;
  }

  return {
    position: [{ frame: startFrame, value: startPos }, { frame: end, value: [cx, cy] }],
    size: [{ frame: startFrame, value: startSize }, { frame: end, value: [w, h] }],
  };
}
