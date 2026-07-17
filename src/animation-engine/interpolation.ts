import { EasingType, Keyframe, PropertyTrack, AnimatableProperty, BezierHandle } from './types';
import { isColorPropertyPath } from './propertyRegistry';

type EasingFunction = (t: number) => number;

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function interpolateWithBezierHandles(
  startTime: number,
  startValue: number,
  endTime: number,
  endValue: number,
  handleOut: BezierHandle | undefined,
  handleIn: BezierHandle | undefined,
  t: number
): number {
  const p0Time = startTime;
  const p0Value = startValue;
  const p3Time = endTime;
  const p3Value = endValue;

  const timeDelta = endTime - startTime;
  const valueDelta = endValue - startValue;

  const p1Time = handleOut ? startTime + handleOut.x * timeDelta : startTime + timeDelta * 0.33;
  const p1Value = handleOut ? startValue + handleOut.y * valueDelta : startValue;

  const p2Time = handleIn ? endTime + handleIn.x * timeDelta : endTime - timeDelta * 0.33;
  const p2Value = handleIn ? endValue + handleIn.y * valueDelta : endValue;

  const timeAtT = cubicBezier(p0Time, p1Time, p2Time, p3Time, t);
  const normalizedT = timeDelta > 0 ? (timeAtT - p0Time) / timeDelta : 0;

  return cubicBezier(p0Value, p1Value, p2Value, p3Value, normalizedT);
}

const easingFunctions: Record<EasingType, EasingFunction> = {
  'linear': (t) => t,
  'ease': (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'ease-in-quad': (t) => t * t,
  'ease-out-quad': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out-quad': (t) => t < 0.5 ? 2 * t * t : 1 - 2 * Math.pow(1 - t, 2),
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) => t < 0.5 ? 4 * t * t * t : 1 - 4 * Math.pow(1 - t, 3),
  'ease-in-out-cosine': (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
  'ease-in-expo': (t) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  'ease-out-expo': (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  'ease-in-circ': (t) => 1 - Math.sqrt(1 - t * t),
  'ease-out-circ': (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  'ease-in-elastic': (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  'ease-out-elastic': (t) => {
    const c5 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.sin(-13 * (Math.PI / 2) * (t + 1)) * Math.pow(2, -10 * t) + 1;
  },
  'ease-out-back': (t) => {
    const c = 1.70158;
    return 1 + c * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  'ease-out-bounce': (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  'hold': () => 0,
};

export function getEasingFunction(easing: EasingType): EasingFunction {
  return easingFunctions[easing] || easingFunctions.linear;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function interpolateNumber(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

export function interpolateColor(startHex: string, endHex: string, progress: number): string {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);

  if (!start || !end) {
    return progress < 0.5 ? startHex : endHex;
  }

  const r = interpolateNumber(start.r, end.r, progress);
  const g = interpolateNumber(start.g, end.g, progress);
  const b = interpolateNumber(start.b, end.b, progress);

  return rgbToHex(r, g, b);
}

export function interpolateValue(
  startValue: number | string,
  endValue: number | string,
  progress: number,
  isColor: boolean
): number | string {
  if (isColor) {
    return interpolateColor(String(startValue), String(endValue), progress);
  }
  return interpolateNumber(Number(startValue), Number(endValue), progress);
}

export function getValueAtTime(
  track: PropertyTrack,
  time: number,
  isColor: boolean
): number | string | null {
  const { keyframes } = track;

  if (keyframes.length === 0) {
    return null;
  }

  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

  if (time <= sortedKeyframes[0].time) {
    return sortedKeyframes[0].value;
  }

  if (time >= sortedKeyframes[sortedKeyframes.length - 1].time) {
    return sortedKeyframes[sortedKeyframes.length - 1].value;
  }

  let startKeyframe: Keyframe | null = null;
  let endKeyframe: Keyframe | null = null;

  for (let i = 0; i < sortedKeyframes.length - 1; i++) {
    if (time >= sortedKeyframes[i].time && time <= sortedKeyframes[i + 1].time) {
      startKeyframe = sortedKeyframes[i];
      endKeyframe = sortedKeyframes[i + 1];
      break;
    }
  }

  if (!startKeyframe || !endKeyframe) {
    return sortedKeyframes[0].value;
  }

  const duration = endKeyframe.time - startKeyframe.time;
  const elapsed = time - startKeyframe.time;
  const linearProgress = duration > 0 ? elapsed / duration : 0;

  if (startKeyframe.handleOut || endKeyframe.handleIn) {
    const startVal = Number(startKeyframe.value);
    const endVal = Number(endKeyframe.value);
    const interpolatedValue = interpolateWithBezierHandles(
      startKeyframe.time,
      startVal,
      endKeyframe.time,
      endVal,
      startKeyframe.handleOut,
      endKeyframe.handleIn,
      linearProgress
    );
    return isColor ? startKeyframe.value : interpolatedValue;
  }

  const easingFn = getEasingFunction(startKeyframe.easing);
  const easedProgress = easingFn(linearProgress);

  return interpolateValue(startKeyframe.value, endKeyframe.value, easedProgress, isColor);
}

export function isColorProperty(property: AnimatableProperty): boolean {
  return isColorPropertyPath(property);
}

export function getAnimatedValue(
  tracks: PropertyTrack[],
  property: AnimatableProperty,
  time: number
): number | string | null {
  const track = tracks.find((t) => t.property === property && t.enabled);
  if (!track) {
    return null;
  }
  return getValueAtTime(track, time, isColorProperty(property));
}

export function findKeyframeAtTime(keyframes: Keyframe[], time: number, tolerance: number = 0.05): Keyframe | null {
  return keyframes.find((kf) => Math.abs(kf.time - time) <= tolerance) || null;
}

export function getKeyframesBetween(keyframes: Keyframe[], startTime: number, endTime: number): Keyframe[] {
  return keyframes.filter((kf) => kf.time >= startTime && kf.time <= endTime);
}
