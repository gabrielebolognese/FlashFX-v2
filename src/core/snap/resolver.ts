import type { Rect, SnapTarget, SnapLine, SnapOutput, GuidelineInput } from './types';

const THRESHOLD_SCREEN_PX = 8;

export interface SnapContext {
  proposed: Rect;
  targets: SnapTarget[];
  screenScale: number;
}

export function snap(ctx: SnapContext): SnapOutput {
  const threshold = THRESHOLD_SCREEN_PX / Math.max(ctx.screenScale, 0.01);
  const { proposed, targets } = ctx;

  const anchorsX = [
    proposed.x,
    proposed.x + proposed.w / 2,
    proposed.x + proposed.w,
  ];
  const anchorsY = [
    proposed.y,
    proposed.y + proposed.h / 2,
    proposed.y + proposed.h,
  ];

  let bestDx = 0;
  let bestDistX = Infinity;
  let bestTargetX: SnapTarget | null = null;

  for (const target of targets) {
    if (target.axis !== 'x') continue;
    for (const ax of anchorsX) {
      const dist = Math.abs(ax - target.value);
      if (dist < threshold && dist < bestDistX) {
        bestDistX = dist;
        bestDx = target.value - ax;
        bestTargetX = target;
      }
    }
  }

  let bestDy = 0;
  let bestDistY = Infinity;
  let bestTargetY: SnapTarget | null = null;

  for (const target of targets) {
    if (target.axis !== 'y') continue;
    for (const ay of anchorsY) {
      const dist = Math.abs(ay - target.value);
      if (dist < threshold && dist < bestDistY) {
        bestDistY = dist;
        bestDy = target.value - ay;
        bestTargetY = target;
      }
    }
  }

  const lines: SnapLine[] = [];

  if (bestTargetX) {
    const snappedTop = proposed.y + bestDy;
    const snappedBottom = snappedTop + proposed.h;
    lines.push({
      axis: 'x',
      pos: bestTargetX.value,
      from: Math.min(bestTargetX.from, snappedTop),
      to: Math.max(bestTargetX.to, snappedBottom),
      kind: bestTargetX.kind,
    });
  }

  if (bestTargetY) {
    const snappedLeft = proposed.x + bestDx;
    const snappedRight = snappedLeft + proposed.w;
    lines.push({
      axis: 'y',
      pos: bestTargetY.value,
      from: Math.min(bestTargetY.from, snappedLeft),
      to: Math.max(bestTargetY.to, snappedRight),
      kind: bestTargetY.kind,
    });
  }

  return { dx: bestDx, dy: bestDy, lines };
}

export function buildTargets(
  otherRects: Rect[],
  canvasW: number,
  canvasH: number,
  gridVertical: number[],
  gridHorizontal: number[],
  guidelines: GuidelineInput[] = []
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  // Canvas edges
  targets.push(
    { axis: 'x', value: 0, kind: 'canvas-edge', from: 0, to: canvasH },
    { axis: 'x', value: canvasW, kind: 'canvas-edge', from: 0, to: canvasH },
    { axis: 'y', value: 0, kind: 'canvas-edge', from: 0, to: canvasW },
    { axis: 'y', value: canvasH, kind: 'canvas-edge', from: 0, to: canvasW },
  );

  // Canvas center
  targets.push(
    { axis: 'x', value: canvasW / 2, kind: 'canvas-center', from: 0, to: canvasH },
    { axis: 'y', value: canvasH / 2, kind: 'canvas-center', from: 0, to: canvasW },
  );

  // Grid lines
  for (const x of gridVertical) {
    targets.push({ axis: 'x', value: x, kind: 'grid', from: 0, to: canvasH });
  }
  for (const y of gridHorizontal) {
    targets.push({ axis: 'y', value: y, kind: 'grid', from: 0, to: canvasW });
  }

  // User-defined guidelines
  for (const g of guidelines) {
    if (!g.visible) continue;
    if (g.axis === 'vertical') {
      targets.push({ axis: 'x', value: g.position, kind: 'guideline', from: 0, to: canvasH });
    } else {
      targets.push({ axis: 'y', value: g.position, kind: 'guideline', from: 0, to: canvasW });
    }
  }

  // Other objects
  for (const r of otherRects) {
    const left = r.x;
    const right = r.x + r.w;
    const top = r.y;
    const bottom = r.y + r.h;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;

    targets.push(
      { axis: 'x', value: left, kind: 'edge', from: top, to: bottom },
      { axis: 'x', value: right, kind: 'edge', from: top, to: bottom },
      { axis: 'x', value: cx, kind: 'center', from: top, to: bottom },
      { axis: 'y', value: top, kind: 'edge', from: left, to: right },
      { axis: 'y', value: bottom, kind: 'edge', from: left, to: right },
      { axis: 'y', value: cy, kind: 'center', from: left, to: right },
    );
  }

  return targets;
}
