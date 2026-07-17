import type { EngineClip, EngineTrack, EngineKeyframe, EasingType, ResolvedProperties } from './types';
import { resolvedPropsPool, type PooledResolvedProps } from './MemoryPool';
// EASING_LUT removed — was identical to easingFunctions in interpolation.ts. Using shared function.
import { getEasingFunction } from '../../animation-engine/interpolation';

interface SegmentCache {
  trackKey: string;
  index: number;
  startTime: number;
  endTime: number;
}

const COLOR_PROPS = new Set(['fill', 'stroke']);

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b))
    .toString(16).slice(1);
}

function interpolateColor(a: string, b: string, t: number): string {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  if (!c1 || !c2) return t < 0.5 ? a : b;
  return rgbToHex(
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  );
}

function isColorProp(prop: string): boolean {
  return COLOR_PROPS.has(prop) || prop.startsWith('gradientColor-');
}

export class AnimationEvaluator {
  private segmentCache: Map<string, SegmentCache> = new Map();

  evaluateClip(clip: EngineClip, time: number, pooled?: PooledResolvedProps): ResolvedProperties {
    const result: ResolvedProperties = pooled || {};
    if (clip.muted) return result;

    for (let t = 0; t < clip.tracks.length; t++) {
      const track = clip.tracks[t];
      if (!track.enabled || track.keyframes.length === 0) continue;

      const val = this.evaluateTrack(track, time, clip.elementId);
      if (val !== null) {
        result[track.property] = val;
      }
    }
    return result;
  }

  evaluateTrack(track: EngineTrack, time: number, elementId: string): number | string | null {
    const kfs = track.keyframes;
    const len = kfs.length;
    if (len === 0) return null;
    if (len === 1) return kfs[0].value;

    if (time <= kfs[0].time) return kfs[0].value;
    if (time >= kfs[len - 1].time) return kfs[len - 1].value;

    const idx = this.findSegment(kfs, time, elementId, track.property);
    const kf0 = kfs[idx];
    const kf1 = kfs[idx + 1];

    const duration = kf1.time - kf0.time;
    if (duration <= 0) return kf0.value;

    const linearT = (time - kf0.time) / duration;
    const isColor = isColorProp(track.property);

    if (kf0.handleOut || kf1.handleIn) {
      return this.interpolateWithBezier(kf0, kf1, linearT, isColor);
    }

    const easingFn = getEasingFunction(kf0.easing);
    const easedT = easingFn(linearT);

    if (isColor) {
      return interpolateColor(String(kf0.value), String(kf1.value), easedT);
    }
    return (kf0.value as number) + ((kf1.value as number) - (kf0.value as number)) * easedT;
  }

  private findSegment(kfs: EngineKeyframe[], time: number, elementId: string, property: string): number {
    const cacheKey = `${elementId}:${property}`;
    const cached = this.segmentCache.get(cacheKey);

    if (cached && time >= cached.startTime && time <= cached.endTime) {
      return cached.index;
    }

    let lo = 0;
    let hi = kfs.length - 2;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (time < kfs[mid].time) {
        hi = mid - 1;
      } else if (time > kfs[mid + 1].time) {
        lo = mid + 1;
      } else {
        this.segmentCache.set(cacheKey, {
          trackKey: cacheKey,
          index: mid,
          startTime: kfs[mid].time,
          endTime: kfs[mid + 1].time,
        });
        return mid;
      }
    }

    const idx = Math.max(0, Math.min(lo, kfs.length - 2));
    this.segmentCache.set(cacheKey, {
      trackKey: cacheKey,
      index: idx,
      startTime: kfs[idx].time,
      endTime: kfs[idx + 1]?.time ?? kfs[idx].time,
    });
    return idx;
  }

  private interpolateWithBezier(
    kf0: EngineKeyframe,
    kf1: EngineKeyframe,
    t: number,
    isColor: boolean
  ): number | string {
    if (isColor) {
      return interpolateColor(String(kf0.value), String(kf1.value), t);
    }

    const startVal = kf0.value as number;
    const endVal = kf1.value as number;
    const timeDelta = kf1.time - kf0.time;
    const valueDelta = endVal - startVal;

    const p1Time = kf0.handleOut
      ? kf0.time + kf0.handleOut.x * timeDelta
      : kf0.time + timeDelta * 0.33;
    const p1Value = kf0.handleOut
      ? startVal + kf0.handleOut.y * valueDelta
      : startVal;

    const p2Time = kf1.handleIn
      ? kf1.time + kf1.handleIn.x * timeDelta
      : kf1.time - timeDelta * 0.33;
    const p2Value = kf1.handleIn
      ? endVal + kf1.handleIn.y * valueDelta
      : endVal;

    const timeAtT = cubicBezier(kf0.time, p1Time, p2Time, kf1.time, t);
    const normalizedT = timeDelta > 0 ? (timeAtT - kf0.time) / timeDelta : 0;

    return cubicBezier(startVal, p1Value, p2Value, endVal, normalizedT);
  }

  clearCache(): void {
    this.segmentCache.clear();
  }

  invalidateElement(elementId: string): void {
    for (const key of this.segmentCache.keys()) {
      if (key.startsWith(elementId + ':')) {
        this.segmentCache.delete(key);
      }
    }
  }
}
