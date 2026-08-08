// M20 — Rulers & pixel snapping. Pure, dependency-free (no ./interpolation, so the harness needs
// no Worker stub). Generates adaptive "nice-number" ruler ticks (major labelled + minor) that
// track pan/zoom, plus the live snap-to-pixel rounding helpers. Deterministic; every emitted
// number normalized with `+ 0` (kills -0).

export interface RulerTick {
  value: number;     // comp-space coordinate
  screenPos: number; // px offset within the strip = value * pxPerUnit
  major: boolean;    // a labelled tick
  label?: string;    // present iff major
}

/** Snap a raw step up to the nearest 1/2/5 × 10ⁿ value (classic axis "nice numbers"). */
export function niceStep(rawStep: number): number {
  if (!(rawStep > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const f = rawStep / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/** Integers plain; otherwise up to 2 decimals with trailing zeros stripped. */
export function formatTickLabel(v: number): string {
  if (Number.isInteger(v)) return String(v + 0);
  return String(parseFloat(v.toFixed(2)));
}

const MAX_TICKS = 2000;

/**
 * Adaptive ruler ticks over [rangeStart, rangeEnd] (comp space), drawn through a strip scaled by
 * `pxPerUnit`. Major ticks land on nice round values ~`targetLabelSpacingPx` apart; minors
 * subdivide by 5. `minStep` floors the step so a pixel editor never labels sub-pixel values.
 */
export function generateRulerTicks(
  rangeStart: number,
  rangeEnd: number,
  pxPerUnit: number,
  targetLabelSpacingPx = 70,
  minStep = 1,
): { ticks: RulerTick[]; step: number } {
  if (!(pxPerUnit > 0) || rangeEnd <= rangeStart) return { ticks: [], step: minStep };
  const majorStep = Math.max(minStep, niceStep(targetLabelSpacingPx / pxPerUnit));
  let minorStep = Math.max(minStep, majorStep / 5);
  // Bound the tick count on huge ranges / tiny scales by coarsening the minor step.
  while ((rangeEnd - rangeStart) / minorStep > MAX_TICKS) minorStep *= 2;

  const ticks: RulerTick[] = [];
  const first = Math.ceil(rangeStart / minorStep - 1e-9);
  const last = Math.floor(rangeEnd / minorStep + 1e-9);
  for (let k = first; k <= last; k++) {
    const value = k * minorStep;
    const major = Math.abs(value / majorStep - Math.round(value / majorStep)) < 1e-6;
    const tick: RulerTick = { value: value + 0, screenPos: value * pxPerUnit + 0, major };
    if (major) tick.label = formatTickLabel(value);
    ticks.push(tick);
  }
  return { ticks, step: majorStep };
}

// ── Live snap-to-pixel (M20 part 2) ──
export function snapToPixel(v: number): number { return Math.round(v) + 0; }

export interface PixelRect { x: number; y: number; w: number; h: number }
export function snapRectToPixel(r: PixelRect): PixelRect {
  return { x: Math.round(r.x) + 0, y: Math.round(r.y) + 0, w: Math.round(r.w) + 0, h: Math.round(r.h) + 0 };
}
