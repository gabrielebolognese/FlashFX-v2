import type { FieldSample, MarkStyle, OffsetBundleSamplerDef, SamplerDefinition } from './types';

export function renderMarks(
  ctx: OffscreenCanvasRenderingContext2D,
  samples: FieldSample[],
  mark: MarkStyle,
  sampler: SamplerDefinition,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  const [r, g, b, a] = mark.color;
  const colorStr = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

  if (sampler.type === 'offsetBundle') {
    renderOffsetBundleMarks(ctx, samples, mark, sampler, colorStr);
  } else if (mark.shape === 'dot') {
    renderDots(ctx, samples, mark, colorStr);
  } else {
    renderDashes(ctx, samples, mark, colorStr);
  }
}

function renderDots(
  ctx: OffscreenCanvasRenderingContext2D,
  samples: FieldSample[],
  mark: MarkStyle,
  color: string,
): void {
  ctx.fillStyle = color;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const radius = mark.sizeMin + (mark.sizeMax - mark.sizeMin) * s.value;

    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderDashes(
  ctx: OffscreenCanvasRenderingContext2D,
  samples: FieldSample[],
  mark: MarkStyle,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = mark.strokeWidth;
  ctx.lineCap = mark.roundCaps ? 'round' : 'butt';

  ctx.beginPath();

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const halfLen = s.length / 2;
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);

    ctx.moveTo(s.x - cos * halfLen, s.y - sin * halfLen);
    ctx.lineTo(s.x + cos * halfLen, s.y + sin * halfLen);
  }

  ctx.stroke();
}

function renderOffsetBundleMarks(
  ctx: OffscreenCanvasRenderingContext2D,
  samples: FieldSample[],
  mark: MarkStyle,
  sampler: OffsetBundleSamplerDef,
  baseColor: string,
): void {
  ctx.lineWidth = mark.strokeWidth;
  ctx.lineCap = mark.roundCaps ? 'round' : 'butt';

  const segmentsPerCopy = Math.floor(samples.length / sampler.copyCount) || 1;
  const [r, g, b] = mark.color;

  for (let copy = 0; copy < sampler.copyCount; copy++) {
    const t = copy / (sampler.copyCount - 1 || 1);
    const opacity = computeFalloff(t, sampler.opacityFalloff);

    if (opacity < 0.01) continue;

    ctx.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
    ctx.beginPath();

    const startIdx = copy * segmentsPerCopy;
    const endIdx = Math.min(startIdx + segmentsPerCopy, samples.length);

    let firstSeg = true;
    for (let i = startIdx; i < endIdx; i++) {
      const s = samples[i];
      if (s.value < 0.01) continue;

      const halfLen = s.length / 2;
      const cos = Math.cos(s.angle);
      const sin = Math.sin(s.angle);
      const x0 = s.x - cos * halfLen;
      const y0 = s.y - sin * halfLen;
      const x1 = s.x + cos * halfLen;
      const y1 = s.y + sin * halfLen;

      if (firstSeg) {
        ctx.moveTo(x0, y0);
        firstSeg = false;
      }
      ctx.lineTo(x1, y1);
    }

    ctx.stroke();
  }

  void baseColor;
}

function computeFalloff(t: number, mode: 'linear' | 'easeOut' | 'gaussian'): number {
  const centered = Math.abs(t - 0.5) * 2;

  switch (mode) {
    case 'linear':
      return 1 - centered;
    case 'easeOut':
      return 1 - centered * centered;
    case 'gaussian':
      return Math.exp(-centered * centered * 3);
  }
}
