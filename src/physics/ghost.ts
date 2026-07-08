import type { PhysicsBinding, PhysicsWorldConfig, Vec2 } from './types';
import {
  ensureRapierInit,
  createPhysicsWorld,
  destroyPhysicsWorld,
  addBody,
  setKinematicPosition,
  activateDynamic,
  stepWorld,
  readBodyTransform,
} from './world';
import { deriveVelocityFromEvaluator } from './velocity';
import type { LayerTransformEvaluator } from './bake';

export interface GhostTrajectoryOptions {
  selectedLayerId: string;
  startFrame: number;
  framesToPreview: number;
  config: PhysicsWorldConfig;
  bindings: PhysicsBinding[];
  frameRate: number;
  evaluator: LayerTransformEvaluator;
  maxMs?: number;
}

export async function computeGhostTrajectory(options: GhostTrajectoryOptions): Promise<Vec2[]> {
  const { selectedLayerId, startFrame, framesToPreview, config, bindings, frameRate, evaluator, maxMs = 50 } = options;
  await ensureRapierInit();

  const handle = createPhysicsWorld(config);
  const enabledBindings = bindings.filter((b) => b.enabled);
  const startTime = performance.now();

  for (const binding of enabledBindings) {
    const t = evaluator(binding.layerId, startFrame);
    addBody(handle, binding, { x: t.x, y: t.y }, t.rotation, t.width, t.height);

    if (binding.role === 'dynamic' && startFrame >= binding.birthFrame) {
      const velocity = deriveVelocityFromEvaluator(
        binding.layerId, startFrame, frameRate,
        binding.handoff.deriveSampleWindow, evaluator,
      );
      activateDynamic(handle, binding.layerId, velocity);
    }
  }

  const path: Vec2[] = [];

  for (let i = 0; i < framesToPreview; i++) {
    if (performance.now() - startTime > maxMs) break;

    for (const binding of enabledBindings) {
      if (binding.role === 'kinematic') {
        const t = evaluator(binding.layerId, startFrame + i);
        setKinematicPosition(handle, binding.layerId, t.x, t.y, t.rotation);
      }
    }

    stepWorld(handle);

    const result = readBodyTransform(handle, selectedLayerId);
    if (result) {
      path.push({ x: result.x, y: result.y });
    }
  }

  destroyPhysicsWorld(handle);
  return path;
}
