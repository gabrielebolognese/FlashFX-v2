// Cutout + Shadow - pure shadow geometry (leaf module, no imports). Reuses the Background Removal
// alpha mask (no second segmentation): from the subject's alpha it finds the bounds + ground-contact
// line and derives the shadow transform (drop offset or a ground-plane projection) from the user's
// direction/distance. Resolution-relative so a given slider looks the same on a 500px and 6000px
// image. Deterministic + unit-tested (verify:shadow-geometry); the actual blur/tint/composite is
// browser-only (see cutoutShadow.ts).

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; found: boolean }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const minSide = (w: number, h: number) => Math.max(1, Math.min(w, h));
const DEG = Math.PI / 180;

/** Bounding box of opaque pixels in a single-channel alpha buffer (length w*h, 0..255). */
export function alphaBounds(alpha: Uint8ClampedArray | number[], w: number, h: number, threshold = 8): Bounds {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] >= threshold) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const found = maxX >= 0;
  return found
    ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, found: true }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, found: false };
}

/**
 * Horizontal centre of the subject's ground contact - the mean x of opaque pixels in the bottom band
 * of the bounds (where the subject meets the floor), which anchors a ground shadow better than the
 * plain bbox centre for lopsided subjects.
 */
export function contactCenterX(alpha: Uint8ClampedArray | number[], w: number, _h: number, bounds: Bounds, bandFrac = 0.06, threshold = 8): number {
  if (!bounds.found) return 0;
  const bandTop = Math.max(bounds.minY, Math.floor(bounds.maxY - bounds.height * bandFrac));
  let sum = 0, n = 0;
  for (let y = bandTop; y <= bounds.maxY; y++) {
    const row = y * w;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (alpha[row + x] >= threshold) { sum += x; n++; }
    }
  }
  return n > 0 ? sum / n : (bounds.minX + bounds.maxX) / 2;
}

export interface DropShadow { dx: number; dy: number }

/**
 * Cast (drop) shadow offset in pixels. `direction` 0..100 maps to azimuth (50 = straight down/back,
 * 0 = down-left, 100 = down-right); `distance` 0..100 is resolution-relative.
 */
export function dropShadowOffset(direction: number, distance: number, w: number, h: number): DropShadow {
  const angle = (clamp(direction, 0, 100) / 50 - 1) * 60 * DEG; // -60deg..+60deg from vertical
  const dist = (clamp(distance, 0, 100) / 100) * 0.2 * minSide(w, h);
  return { dx: Math.sin(angle) * dist, dy: Math.cos(angle) * dist };
}

export interface GroundShadow { pivotX: number; pivotY: number; scaleY: number; shearX: number }

/**
 * Ground-plane shadow: the silhouette flipped + foreshortened + sheared around the contact point, so
 * it lies on the floor. Apply on a canvas as: translate(pivot) · transform(1,0,shearX,scaleY,0,0) ·
 * translate(-pivot) before drawing the mask. `scaleY` is negative (flip below the contact line);
 * |scaleY| (shadow length) grows with `distance`; `shearX` slant follows `direction`.
 */
export function groundShadowParams(bounds: Bounds, contactX: number, direction: number, distance: number): GroundShadow {
  const foreshorten = 0.25 + (clamp(distance, 0, 100) / 100) * 0.6; // 0.25..0.85
  const shearX = (clamp(direction, 0, 100) / 50 - 1) * 1.2;          // -1.2..+1.2
  return { pivotX: contactX, pivotY: bounds.maxY, scaleY: -foreshorten, shearX };
}

/** Resolution-relative shadow blur radius (px) for a softness [0..100]. */
export function softnessBlurPx(softness: number, w: number, h: number): number {
  return Math.max(0, Math.round((clamp(softness, 0, 100) / 100) * 0.05 * minSide(w, h)));
}
