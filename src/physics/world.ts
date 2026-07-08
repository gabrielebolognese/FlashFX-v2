import type { PhysicsBinding, PhysicsWorldConfig, MaterialConfig, ColliderConfig, Vec2 } from './types';

let RAPIER: typeof import('@dimforge/rapier2d-compat').default | null = null;
let rapierInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureRapierInit(): Promise<void> {
  if (rapierInitialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = await import('@dimforge/rapier2d-compat');
    RAPIER = mod.default;
    await RAPIER.init('/rapier_wasm2d_bg.wasm');
    rapierInitialized = true;
  })();
  return initPromise;
}

export function isRapierReady(): boolean {
  return rapierInitialized;
}

function getRapier() {
  if (!RAPIER) throw new Error('RAPIER not initialized. Call ensureRapierInit() first.');
  return RAPIER;
}

export interface PhysicsWorldHandle {
  world: any;
  bodies: Map<string, { rigidBody: any; collider: any }>;
}

export function createPhysicsWorld(config: PhysicsWorldConfig): PhysicsWorldHandle {
  const R = getRapier();
  const world = new R.World({ x: config.gravityX, y: config.gravityY });
  return { world, bodies: new Map() };
}

export function destroyPhysicsWorld(handle: PhysicsWorldHandle): void {
  handle.world.free();
  handle.bodies.clear();
}

export function addBoundaryWalls(handle: PhysicsWorldHandle, canvasWidth: number, canvasHeight: number): void {
  const R = getRapier();
  const wallThickness = 50;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  const floorDesc = handle.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, canvasHeight + wallThickness / 2));
  handle.world.createCollider(R.ColliderDesc.cuboid(canvasWidth / 2 + wallThickness, wallThickness / 2).setRestitution(0.3).setFriction(0.5), floorDesc);

  const ceilDesc = handle.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, -wallThickness / 2));
  handle.world.createCollider(R.ColliderDesc.cuboid(canvasWidth / 2 + wallThickness, wallThickness / 2).setRestitution(0.3).setFriction(0.5), ceilDesc);

  const leftDesc = handle.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(-wallThickness / 2, cy));
  handle.world.createCollider(R.ColliderDesc.cuboid(wallThickness / 2, canvasHeight / 2 + wallThickness).setRestitution(0.3).setFriction(0.5), leftDesc);

  const rightDesc = handle.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(canvasWidth + wallThickness / 2, cy));
  handle.world.createCollider(R.ColliderDesc.cuboid(wallThickness / 2, canvasHeight / 2 + wallThickness).setRestitution(0.3).setFriction(0.5), rightDesc);
}

export function addBody(
  handle: PhysicsWorldHandle,
  binding: PhysicsBinding,
  position: Vec2,
  rotation: number,
  layerWidth: number,
  layerHeight: number,
): void {
  const R = getRapier();
  const { world } = handle;

  let bodyDesc: any;
  switch (binding.role) {
    case 'kinematic':
      bodyDesc = R.RigidBodyDesc.kinematicPositionBased();
      break;
    case 'dynamic':
      bodyDesc = R.RigidBodyDesc.dynamic();
      break;
    case 'static':
      bodyDesc = R.RigidBodyDesc.fixed();
      break;
    case 'ghost':
      bodyDesc = R.RigidBodyDesc.kinematicPositionBased();
      break;
    default:
      bodyDesc = R.RigidBodyDesc.fixed();
  }

  bodyDesc.setTranslation(position.x, position.y);
  bodyDesc.setRotation(rotation);

  if (binding.role === 'dynamic') {
    bodyDesc.setLinearDamping(binding.material.linearDamping);
    bodyDesc.setAngularDamping(binding.material.angularDamping);
  }

  const rigidBody = world.createRigidBody(bodyDesc);

  if (binding.role === 'dynamic') {
    if (binding.material.lockAxisX && binding.material.lockAxisY) {
      rigidBody.lockTranslations(true, true);
    } else if (binding.material.lockAxisX) {
      rigidBody.setEnabledTranslations(false, true, true);
    } else if (binding.material.lockAxisY) {
      rigidBody.setEnabledTranslations(true, false, true);
    }
    if (binding.material.lockRotation) {
      rigidBody.lockRotations(true, true);
    }
  }

  const colliderDesc = buildColliderDesc(R, binding.collider, binding.material, layerWidth, layerHeight);
  if (binding.role === 'ghost') {
    colliderDesc.setSensor(true);
  }

  const collider = world.createCollider(colliderDesc, rigidBody);
  handle.bodies.set(binding.layerId, { rigidBody, collider });
}

export function removeBody(handle: PhysicsWorldHandle, layerId: string): void {
  const entry = handle.bodies.get(layerId);
  if (!entry) return;
  handle.world.removeRigidBody(entry.rigidBody);
  handle.bodies.delete(layerId);
}

export function setKinematicPosition(handle: PhysicsWorldHandle, layerId: string, x: number, y: number, rotation: number): void {
  const entry = handle.bodies.get(layerId);
  if (!entry) return;
  entry.rigidBody.setNextKinematicTranslation({ x, y });
  entry.rigidBody.setNextKinematicRotation(rotation);
}

export function activateDynamic(
  handle: PhysicsWorldHandle,
  layerId: string,
  initialVelocity?: Vec2,
): void {
  const R = getRapier();
  const entry = handle.bodies.get(layerId);
  if (!entry) return;
  entry.rigidBody.setBodyType(R.RigidBodyType.Dynamic, true);
  if (initialVelocity) {
    entry.rigidBody.setLinvel(initialVelocity, true);
  }
}

export function deactivateToDynamic(
  handle: PhysicsWorldHandle,
  layerId: string,
): void {
  const R = getRapier();
  const entry = handle.bodies.get(layerId);
  if (!entry) return;
  entry.rigidBody.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
}

export function stepWorld(handle: PhysicsWorldHandle): void {
  handle.world.step();
}

export function readBodyTransform(handle: PhysicsWorldHandle, layerId: string): { x: number; y: number; rotation: number; vx: number; vy: number } | null {
  const entry = handle.bodies.get(layerId);
  if (!entry) return null;
  const t = entry.rigidBody.translation();
  const r = entry.rigidBody.rotation();
  const v = entry.rigidBody.linvel();
  return { x: t.x, y: t.y, rotation: r, vx: v.x, vy: v.y };
}

function buildColliderDesc(
  R: NonNullable<typeof RAPIER>,
  config: ColliderConfig,
  material: MaterialConfig,
  layerWidth: number,
  layerHeight: number,
): any {
  let desc: any;

  const w = config.widthOverride ?? layerWidth;
  const h = config.heightOverride ?? layerHeight;

  switch (config.mode) {
    case 'boundingBox':
      desc = R.ColliderDesc.cuboid(w / 2, h / 2);
      break;
    case 'boundingCircle': {
      const r = config.radiusOverride ?? Math.max(w, h) / 2;
      desc = R.ColliderDesc.ball(r);
      break;
    }
    case 'convexHull': {
      if (config.manualPoints && config.manualPoints.length >= 3) {
        const flat = new Float32Array(config.manualPoints.length * 2);
        for (let i = 0; i < config.manualPoints.length; i++) {
          flat[i * 2] = config.manualPoints[i][0];
          flat[i * 2 + 1] = config.manualPoints[i][1];
        }
        const hull = R.ColliderDesc.convexHull(flat);
        desc = hull ?? R.ColliderDesc.cuboid(w / 2, h / 2);
      } else {
        desc = R.ColliderDesc.cuboid(w / 2, h / 2);
      }
      break;
    }
    case 'polyline': {
      if (config.manualPoints && config.manualPoints.length >= 2) {
        const flat = new Float32Array(config.manualPoints.length * 2);
        for (let i = 0; i < config.manualPoints.length; i++) {
          flat[i * 2] = config.manualPoints[i][0];
          flat[i * 2 + 1] = config.manualPoints[i][1];
        }
        const indices = new Uint32Array((config.manualPoints.length - 1) * 2);
        for (let i = 0; i < config.manualPoints.length - 1; i++) {
          indices[i * 2] = i;
          indices[i * 2 + 1] = i + 1;
        }
        desc = R.ColliderDesc.polyline(flat, indices);
      } else {
        desc = R.ColliderDesc.cuboid(w / 2, h / 2);
      }
      break;
    }
    default:
      desc = R.ColliderDesc.cuboid(w / 2, h / 2);
  }

  desc.setRestitution(material.restitution);
  desc.setFriction(material.friction);
  desc.setMass(material.mass);

  return desc;
}
