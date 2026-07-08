import type { Vec2 } from './types';
import type { LayerTransformEvaluator } from './bake';

export function deriveVelocityFromEvaluator(
  layerId: string,
  handoffFrame: number,
  frameRate: number,
  sampleWindow: number,
  evaluator: LayerTransformEvaluator,
): Vec2 {
  const window = Math.max(1, Math.min(sampleWindow, handoffFrame));
  const dt = 1 / frameRate;

  let totalDx = 0;
  let totalDy = 0;

  for (let i = 0; i < window; i++) {
    const frameBefore = handoffFrame - (i + 1);
    const frameAt = handoffFrame - i;
    if (frameBefore < 0) break;
    const posBefore = evaluator(layerId, frameBefore);
    const posAt = evaluator(layerId, frameAt);
    totalDx += posAt.x - posBefore.x;
    totalDy += posAt.y - posBefore.y;
  }

  const avgDx = totalDx / window;
  const avgDy = totalDy / window;

  return {
    x: avgDx / dt,
    y: avgDy / dt,
  };
}

export function velocityFromMagnitudeAngle(magnitude: number, angleDeg: number): Vec2 {
  const rad = angleDeg * Math.PI / 180;
  return {
    x: magnitude * Math.cos(rad),
    y: magnitude * Math.sin(rad),
  };
}

export function velocityToMagnitudeAngle(v: Vec2): { magnitude: number; angleDeg: number } {
  const magnitude = Math.sqrt(v.x * v.x + v.y * v.y);
  const angleDeg = Math.atan2(v.y, v.x) * 180 / Math.PI;
  return { magnitude, angleDeg };
}
