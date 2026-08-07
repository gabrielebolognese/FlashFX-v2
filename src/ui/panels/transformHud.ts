// Pure formatting + positioning for the live transform HUD (the little readout
// that follows the cursor while you move / resize / rotate / round a shape).
// Dependency-free + deterministic — proven by scripts/verify-transformhud.mjs.
//
// Conventions distilled from Figma / Sketch / Affinity / Canva research:
//  - Resize and Rotate show ABSOLUTE values (resulting W×H, resulting angle).
//  - Terse on-canvas labels: no "px"; a real U+00D7 "×" for size; U+00B0 "°".
//  - Round to 1 decimal, drop a trailing ".0" (a decimal shows only when needed).
//  - Angle is signed in (-180, 180]. Tabular numerals in the pill prevent jitter.

/**
 * Round to 1 decimal and drop a trailing ".0", so whole values read as integers
 * (`100`) and fractional ones keep one decimal (`100.5`). Normalizes -0 → 0.
 */
export function fmtNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  const s = (Object.is(r, -0) ? 0 : r).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Fold an angle (degrees) into the (-180, 180] range used by the rotate readout. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  a = a === -180 ? 180 : a;
  return a + 0; // fold -0 (e.g. -360 % 360) to 0
}

export type HudKind = 'move' | 'resize' | 'rotate' | 'radius';

/**
 * The terse on-canvas HUD label for a transform operation.
 * move → `X, Y` · resize → `W × H` · rotate → `±deg°` · radius → `R n`.
 */
export function hudLabel(kind: HudKind, a: number, b = 0): string {
  switch (kind) {
    case 'move': return `${fmtNum(a)}, ${fmtNum(b)}`;
    case 'resize': return `${fmtNum(a)} × ${fmtNum(b)}`;
    case 'rotate': return `${fmtNum(normalizeAngle(a))}°`;
    case 'radius': return `R ${fmtNum(a)}`;
  }
}

/**
 * Place a cursor-anchored HUD pill: offset down-right of the pointer, flipped to
 * the opposite side when it would overflow the right/bottom edge, then clamped so
 * it always stays at least `margin` px inside the viewport. Coordinates are for a
 * `position: fixed` element (viewport space), matching the research's guidance.
 */
export function clampHud(
  cursorX: number,
  cursorY: number,
  hudW: number,
  hudH: number,
  viewW: number,
  viewH: number,
  offset = 16,
  margin = 10,
): { x: number; y: number } {
  let x = cursorX + offset;
  let y = cursorY + offset;
  if (x + hudW + margin > viewW) x = cursorX - offset - hudW; // flip left
  if (y + hudH + margin > viewH) y = cursorY - offset - hudH; // flip up
  x = Math.max(margin, Math.min(x, viewW - hudW - margin));
  y = Math.max(margin, Math.min(y, viewH - hudH - margin));
  return { x, y };
}
