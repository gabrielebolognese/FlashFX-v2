import type { PhysicsBinding, PhysicsWorldConfig, PhysicsWorldCache, BakedFrame, Vec2 } from './types';
import {
  ensureRapierInit,
  createPhysicsWorld,
  destroyPhysicsWorld,
  addBody,
  addBoundaryWalls,
  setKinematicPosition,
  activateDynamic,
  deactivateToDynamic,
  stepWorld,
  readBodyTransform,
  applyImpulseToBody,
} from './world';
import { deriveVelocityFromEvaluator } from './velocity';
import { magnetForce } from './forces';

export type LayerTransformEvaluator = (layerId: string, frame: number) => { x: number; y: number; rotation: number; width: number; height: number };

let currentCache: PhysicsWorldCache | null = null;
let cacheVersion = 0;

export function getCache(): PhysicsWorldCache | null {
  return currentCache;
}

export function invalidatePhysicsCache(): void {
  cacheVersion++;
  currentCache = null;
}

export function getCacheVersion(): number {
  return cacheVersion;
}

export function sampleBakedFrame(layerId: string, frame: number): BakedFrame | null {
  if (!currentCache) return null;
  const trajectory = currentCache.trajectories.get(layerId);
  if (!trajectory) return null;
  const clamped = Math.max(0, Math.min(frame, trajectory.length - 1));
  return trajectory[clamped] ?? null;
}

export async function bakePhysicsWorld(
  config: PhysicsWorldConfig,
  bindings: PhysicsBinding[],
  totalFrames: number,
  frameRate: number,
  evaluator: LayerTransformEvaluator,
  canvasWidth: number,
  canvasHeight: number,
  onProgress?: (frame: number, total: number) => void,
): Promise<PhysicsWorldCache> {
  await ensureRapierInit();

  const handle = createPhysicsWorld(config);

  addBoundaryWalls(handle, canvasWidth, canvasHeight);

  const enabledBindings = bindings.filter((b) => b.enabled);
  const dynamicBindings = enabledBindings.filter((b) => b.role === 'dynamic');
  const kinematicBindings = enabledBindings.filter((b) => b.role === 'kinematic');
  const staticBindings = enabledBindings.filter((b) => b.role === 'static');
  const ghostBindings = enabledBindings.filter((b) => b.role === 'ghost');

  for (const binding of staticBindings) {
    const t = evaluator(binding.layerId, 0);
    addBody(handle, binding, { x: t.x, y: t.y }, t.rotation, t.width, t.height);
  }

  for (const binding of kinematicBindings) {
    const t = evaluator(binding.layerId, 0);
    addBody(handle, binding, { x: t.x, y: t.y }, t.rotation, t.width, t.height);
  }

  for (const binding of ghostBindings) {
    const t = evaluator(binding.layerId, 0);
    addBody(handle, binding, { x: t.x, y: t.y }, t.rotation, t.width, t.height);
  }

  for (const binding of dynamicBindings) {
    const t = evaluator(binding.layerId, binding.birthFrame);
    addBody(handle, { ...binding, role: binding.solidBeforeActivation ? 'static' : 'kinematic' }, { x: t.x, y: t.y }, t.rotation, t.width, t.height);
  }

  const trajectories = new Map<string, BakedFrame[]>();
  for (const binding of dynamicBindings) {
    trajectories.set(binding.layerId, new Array(totalFrames));
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    for (const binding of kinematicBindings) {
      const t = evaluator(binding.layerId, frame);
      setKinematicPosition(handle, binding.layerId, t.x, t.y, t.rotation);
    }

    for (const binding of ghostBindings) {
      const t = evaluator(binding.layerId, frame);
      setKinematicPosition(handle, binding.layerId, t.x, t.y, t.rotation);
    }

    for (const binding of dynamicBindings) {
      if (frame === binding.birthFrame) {
        let initialVelocity: Vec2 | undefined;
        if (binding.handoff.velocitySource === 'auto-derive') {
          initialVelocity = deriveVelocityFromEvaluator(
            binding.layerId,
            binding.birthFrame,
            frameRate,
            binding.handoff.deriveSampleWindow,
            evaluator,
          );
        } else {
          const rad = binding.handoff.manualAngleDeg * Math.PI / 180;
          initialVelocity = {
            x: binding.handoff.manualMagnitude * Math.cos(rad),
            y: binding.handoff.manualMagnitude * Math.sin(rad),
          };
        }
        activateDynamic(handle, binding.layerId, initialVelocity);
      } else if (binding.endFrame !== undefined && frame === binding.endFrame) {
        deactivateToDynamic(handle, binding.layerId);
      }

      if (frame < binding.birthFrame) {
        const t = evaluator(binding.layerId, frame);
        setKinematicPosition(handle, binding.layerId, t.x, t.y, t.rotation);
      }
    }

    // Magnets (B21): apply an attraction/repulsion impulse to each active dynamic body before
    // stepping. Non-dynamic (pre-activation) bodies are ignored by applyImpulseToBody, so this is a
    // no-op until a body is live and byte-identical when no magnets are configured.
    if (config.magnets && config.magnets.length > 0) {
      const dt = 1 / frameRate;
      for (const binding of dynamicBindings) {
        if (frame < binding.birthFrame) continue;
        const tr = readBodyTransform(handle, binding.layerId);
        if (!tr) continue;
        let fx = 0, fy = 0;
        for (const m of config.magnets) { const f = magnetForce({ x: tr.x, y: tr.y }, m); fx += f.x; fy += f.y; }
        applyImpulseToBody(handle, binding.layerId, fx * dt, fy * dt);
      }
    }

    for (let sub = 0; sub < Math.max(1, config.substeps); sub++) {
      stepWorld(handle);
    }

    for (const binding of dynamicBindings) {
      const result = readBodyTransform(handle, binding.layerId);
      const trajectory = trajectories.get(binding.layerId)!;
      if (result && frame >= binding.birthFrame) {
        trajectory[frame] = { x: result.x, y: result.y, rotation: result.rotation, vx: result.vx, vy: result.vy };
      } else {
        const t = evaluator(binding.layerId, frame);
        trajectory[frame] = { x: t.x, y: t.y, rotation: t.rotation, vx: 0, vy: 0 };
      }
    }

    if (onProgress && frame % 10 === 0) {
      onProgress(frame, totalFrames);
    }
  }

  destroyPhysicsWorld(handle);

  const cache: PhysicsWorldCache = {
    version: ++cacheVersion,
    frameRate,
    totalFrames,
    trajectories,
  };
  currentCache = cache;
  return cache;
}
