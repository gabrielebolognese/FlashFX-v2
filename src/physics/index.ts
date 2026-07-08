export type {
  PhysicsRole,
  ColliderMode,
  PropertyOwner,
  VelocitySource,
  Vec2 as PhysicsVec2,
  MaterialConfig,
  ColliderConfig,
  HandoffConfig,
  PhysicsBinding,
  PhysicsWorldConfig,
  BakedFrame,
  PhysicsWorldCache,
  TriggerEvent,
} from './types';

export {
  DEFAULT_MATERIAL,
  DEFAULT_COLLIDER,
  DEFAULT_HANDOFF,
  DEFAULT_WORLD_CONFIG,
} from './types';

export { ensureRapierInit, isRapierReady } from './world';
export { bakePhysicsWorld, sampleBakedFrame, invalidatePhysicsCache, getCache, getCacheVersion } from './bake';
export type { LayerTransformEvaluator } from './bake';
export { deriveVelocityFromEvaluator, velocityFromMagnitudeAngle, velocityToMagnitudeAngle } from './velocity';
export { colliderFromBoundingBox, colliderFromBoundingCircle, colliderFromConvexHull, colliderFromPolyline, colliderFromPathVertices } from './colliders';
export { computeGhostTrajectory } from './ghost';
export type { GhostTrajectoryOptions } from './ghost';
export { getPropertyOwnership, setPropertyOwnership, clearPropertyOwnership, canEnablePhysicsDynamic, canEnableAnchorFollower, markPhysicsDynamic, unmarkPhysicsDynamic } from './ownership';
