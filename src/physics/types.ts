export type PhysicsRole = 'kinematic' | 'dynamic' | 'static' | 'ghost';

export type ColliderMode = 'boundingBox' | 'boundingCircle' | 'convexHull' | 'polyline';

export type PropertyOwner = 'keyframe' | 'proceduralLoop' | 'physicsDynamic' | 'anchorFollower';

export type VelocitySource = 'auto-derive' | 'manual';

export interface Vec2 {
  x: number;
  y: number;
}

export interface MaterialConfig {
  mass: number;
  restitution: number;
  friction: number;
  lockAxisX: boolean;
  lockAxisY: boolean;
  lockRotation: boolean;
  linearDamping: number;
  angularDamping: number;
}

export interface ColliderConfig {
  mode: ColliderMode;
  manualPoints?: [number, number][];
  radiusOverride?: number;
  widthOverride?: number;
  heightOverride?: number;
}

export interface HandoffConfig {
  velocitySource: VelocitySource;
  manualMagnitude: number;
  manualAngleDeg: number;
  deriveSampleWindow: number;
}

export interface PhysicsBinding {
  id: string;
  layerId: string;
  enabled: boolean;
  role: PhysicsRole;
  material: MaterialConfig;
  collider: ColliderConfig;
  birthFrame: number;
  endFrame?: number;
  handoff: HandoffConfig;
  solidBeforeActivation: boolean;
}

export interface PhysicsWorldConfig {
  enabled: boolean;
  gravityX: number;
  gravityY: number;
  timeScale: number;
  substeps: number;
}

export interface BakedFrame {
  x: number;
  y: number;
  rotation: number;
  vx: number;
  vy: number;
}

export interface PhysicsWorldCache {
  version: number;
  frameRate: number;
  totalFrames: number;
  trajectories: Map<string, BakedFrame[]>;
}

export interface TriggerEvent {
  frame: number;
  type: 'enter' | 'exit';
  ghostLayerId: string;
  otherLayerId: string;
}

export const DEFAULT_MATERIAL: MaterialConfig = {
  mass: 1,
  restitution: 0.3,
  friction: 0.5,
  lockAxisX: false,
  lockAxisY: false,
  lockRotation: false,
  linearDamping: 0.1,
  angularDamping: 0.05,
};

export const DEFAULT_COLLIDER: ColliderConfig = {
  mode: 'boundingBox',
};

export const DEFAULT_HANDOFF: HandoffConfig = {
  velocitySource: 'auto-derive',
  manualMagnitude: 0,
  manualAngleDeg: 0,
  deriveSampleWindow: 3,
};

export const DEFAULT_WORLD_CONFIG: PhysicsWorldConfig = {
  enabled: false,
  gravityX: 0,
  gravityY: 980,
  timeScale: 1,
  substeps: 1,
};
