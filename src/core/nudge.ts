// Pure arrow-key nudge resolution: maps an arrow key + Shift modifier to a
// composition-space (dx, dy) using the configurable small/big amounts. Kept pure so
// the small/big/direction contract is harness-testable (scripts/verify-nudge.mjs).
// Y is composition-down (ArrowUp decreases y), matching the renderer's Y-down space.

export function nudgeDelta(
  key: string,
  shift: boolean,
  small: number,
  big: number,
): { dx: number; dy: number } | null {
  const amt = shift ? big : small;
  switch (key) {
    case 'ArrowLeft': return { dx: -amt, dy: 0 };
    case 'ArrowRight': return { dx: amt, dy: 0 };
    case 'ArrowUp': return { dx: 0, dy: -amt };
    case 'ArrowDown': return { dx: 0, dy: amt };
    default: return null;
  }
}
