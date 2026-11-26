// B75: styled number counter on a text layer (r08 view counts "10K -> 1.2M", follower count, multipliers).
// A counter rewrites ONE span's text per frame before layout, so that span keeps its own font, weight,
// italic and colour, and a prefix / suffix in another style lives in its neighbouring spans ("+" bold,
// "1.2M" italic, " views" light). The value runs from `from` to `to` over [startFrame, endFrame] on an
// ease (linear, a named easing or a cubic-bezier quad), optionally stepped. Frame-pure: no state, so
// scrubbing renders the identical string. Leaf module (types + easings) -> node-harnessable.

import type { TextLayer } from './types';
import { applyEasing, cubicBezier } from './easings';

export interface TextCounter {
  enabled: boolean;
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  /** Digits after the decimal mark (0..6). Compact values use `compactDecimals`. */
  decimals?: number;
  /** Thousands separator: "," (default), ".", " ", "'" or "" (none). */
  separator?: string;
  /** Decimal mark: "." (default) or ",". */
  decimalMark?: string;
  /** 10K / 1.2M / 3.4B style (thresholds 1e3 / 1e6 / 1e9). */
  compact?: boolean;
  /** Digits after the decimal mark for compact values (default 1; trailing zeros trimmed). */
  compactDecimals?: number;
  /** Uppercase K / M / B (default true). */
  compactUpper?: boolean;
  prefix?: string;
  suffix?: string;
  /** Ease name from core/easings.ts ("cubicOut", "expoOut"...) or a cubic-bezier quad [x1, y1, x2, y2]. Default cubicOut. */
  ease?: string | [number, number, number, number];
  /** Hold each value for this many frames (1 = every frame). */
  stepFrames?: number;
  /** Which content span the counter rewrites (default 0). */
  spanIndex?: number;
  /** B76: a per-frame value table starting at startFrame (a measured readout: dX, W, Angle...). When present it
   *  replaces from / to / ease: frame f shows samples[f - startFrame], clamped to the first / last entry. */
  samples?: number[];
}

/** Longest samples table a counter keeps (a 10 minute comp at 60 fps). */
export const MAX_COUNTER_SAMPLES = 36000;

const fin = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Sanitize an untrusted counter (agent args, a loaded project). Null when it is not an object. */
export function normalizeTextCounter(raw: unknown): TextCounter | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const start = Math.round(fin(r.startFrame, 0));
  const end = Math.round(fin(r.endFrame, start + 30));
  const ease = Array.isArray(r.ease) && r.ease.length === 4 && r.ease.every((v) => typeof v === 'number' && Number.isFinite(v))
    ? (r.ease as number[]).slice(0, 4) as [number, number, number, number]
    : typeof r.ease === 'string' ? r.ease : undefined;
  const str = (v: unknown, d: string, max = 40): string => (typeof v === 'string' ? v.slice(0, max) : d);
  return {
    enabled: r.enabled !== false,
    from: fin(r.from, 0),
    to: fin(r.to, 100),
    startFrame: start,
    endFrame: Math.max(start, end),
    decimals: Math.min(6, Math.max(0, Math.round(fin(r.decimals, 0)))),
    separator: str(r.separator, ',', 2),
    decimalMark: r.decimalMark === ',' ? ',' : '.',
    compact: r.compact === true,
    compactDecimals: Math.min(3, Math.max(0, Math.round(fin(r.compactDecimals, 1)))),
    compactUpper: r.compactUpper !== false,
    prefix: str(r.prefix, ''),
    suffix: str(r.suffix, ''),
    ...(ease !== undefined ? { ease } : {}),
    stepFrames: Math.max(1, Math.round(fin(r.stepFrames, 1))),
    spanIndex: Math.max(0, Math.round(fin(r.spanIndex, 0))),
    ...(Array.isArray(r.samples) && r.samples.length > 0
      ? { samples: (r.samples as unknown[]).slice(0, MAX_COUNTER_SAMPLES).map((v) => fin(v, 0)) }
      : {}),
  };
}

/** The counter's numeric value at a frame (clamped before start / after end, eased, stepped). */
export function counterValueAt(c: TextCounter, frame: number): number {
  if (c.samples && c.samples.length > 0) {
    const i = Math.min(c.samples.length - 1, Math.max(0, Math.round(frame) - c.startFrame));
    return c.samples[i];
  }
  const step = Math.max(1, c.stepFrames ?? 1);
  const f = c.startFrame + Math.floor((frame - c.startFrame) / step) * step;
  const span = c.endFrame - c.startFrame;
  const t = span <= 0 ? (f >= c.endFrame ? 1 : 0) : Math.min(1, Math.max(0, (f - c.startFrame) / span));
  const e = Array.isArray(c.ease) ? cubicBezier(t, c.ease[0], c.ease[1], c.ease[2], c.ease[3]) : applyEasing(c.ease ?? 'cubicOut', t);
  return c.from + (c.to - c.from) * e;
}

function groupDigits(int: string, sep: string): string {
  if (!sep) return int;
  let out = '';
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) out += sep;
    out += int[i];
  }
  return out;
}

/** Format a value with the counter's style (no prefix / suffix). */
export function formatCounterNumber(value: number, c: TextCounter): string {
  const neg = value < 0;
  let v = Math.abs(value);
  let unit = '';
  let decimals = c.decimals ?? 0;
  let trim = false;
  if (c.compact) {
    const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const hit = units.find(([th]) => v >= th);
    if (hit) {
      decimals = c.compactDecimals ?? 1;
      // Round first so 999,950 shows "1M", not "1000K".
      let scaled = v / hit[0];
      const idx = units.indexOf(hit);
      if (Number(scaled.toFixed(decimals)) >= 1000 && idx > 0) { scaled /= 1000; unit = units[idx - 1][1]; } else unit = hit[1];
      v = scaled;
      trim = true;
      if (c.compactUpper === false) unit = unit.toLowerCase();
    }
  }
  const fixed = v.toFixed(decimals);
  let [int, frac = ''] = fixed.split('.');
  if (trim) frac = frac.replace(/0+$/, '');
  int = groupDigits(int, c.compact && unit ? '' : (c.separator ?? ','));
  const body = frac ? `${int}${c.decimalMark ?? '.'}${frac}` : int;
  return `${neg && Number(fixed) !== 0 ? '-' : ''}${body}${unit}`;
}

/** The full counter string at a frame (prefix + number + suffix). */
export function counterTextAt(c: TextCounter, frame: number): string {
  return `${c.prefix ?? ''}${formatCounterNumber(counterValueAt(c, frame), c)}${c.suffix ?? ''}`;
}

/**
 * The layer as it should resolve at `frame`: a text layer with an enabled counter gets its counter span's
 * text replaced (a shallow copy; the stored layer is untouched). Anything else is returned as is.
 */
export function withTextCounter<L extends { type: string }>(layer: L, frame: number): L {
  if (layer.type !== 'text') return layer;
  const tl = layer as unknown as TextLayer;
  const c = tl.counter;
  if (!c || !c.enabled) return layer;
  const spans = tl.content.spans;
  if (spans.length === 0) return layer;
  const idx = Math.min(spans.length - 1, Math.max(0, c.spanIndex ?? 0));
  const text = counterTextAt(c, frame);
  const nextSpans = spans.map((sp, i) => (i === idx ? { ...sp, text } : sp));
  return { ...tl, content: { ...tl.content, spans: nextSpans } } as unknown as L;
}
