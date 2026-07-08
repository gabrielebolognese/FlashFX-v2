import type { StaggerConfig, CurveProfile } from './types';

function elasticEaseOut(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}

function easeInFn(t: number): number {
  return t * t;
}

function easeOutFn(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOutFn(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getEasingFn(profile: CurveProfile): (t: number) => number {
  switch (profile) {
    case 'linear': return (t) => t;
    case 'easeIn': return easeInFn;
    case 'easeOut': return easeOutFn;
    case 'easeInOut': return easeInOutFn;
    case 'elasticSpring': return elasticEaseOut;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeGapFrames(config: StaggerConfig, itemCount: number): number {
  if (config.totalDurationLock.enabled && itemCount > 1) {
    return config.totalDurationLock.totalFrames / (itemCount - 1);
  }
  return config.gapFrames;
}

export function computeStaggerOffsets(
  orderedLayerIds: string[],
  config: StaggerConfig,
): Map<string, number> {
  const n = orderedLayerIds.length;
  if (n === 0) return new Map();
  if (n === 1) {
    const offsets = new Map<string, number>();
    offsets.set(orderedLayerIds[0], 0);
    return offsets;
  }

  const gapFrames = computeGapFrames(config, n);
  const totalSpan = (n - 1) * gapFrames;
  const easingFn = getEasingFn(config.curveProfile);
  const intensity = Math.max(0, Math.min(100, config.curveIntensity)) / 100;

  const offsets = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const normalizedIndex = i / (n - 1);
    const easedPosition = lerp(normalizedIndex, easingFn(normalizedIndex), intensity);
    offsets.set(orderedLayerIds[i], Math.round(easedPosition * totalSpan));
  }

  return offsets;
}
