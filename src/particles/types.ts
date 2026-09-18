export type ParticleBlendMode = 'additive' | 'alpha' | 'screen';

export interface FloatRange {
  min: number;
  max: number;
}

export interface Vec2Range {
  min: [number, number];
  max: [number, number];
}

export interface ColorStop {
  t: number;
  color: [number, number, number, number];
}

export type EmitterShape = 'point' | 'circle' | 'rectangle' | 'ring' | 'points';

/** A radial attractor/repeller force (B19): pulls (strength>0) or pushes (<0) particles within radius. */
export interface ParticleAttractor {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export interface EmitterConfig {
  id: string;
  name: string;
  maxParticles: number;
  spawnRate: number;
  burstCount: number;
  burstRepeat: boolean;
  burstInterval: number;

  emitterShape: EmitterShape;
  emitterRadius: number;
  emitterWidth: number;
  emitterHeight: number;

  initialSpeed: FloatRange;
  initialAngle: FloatRange;
  initialSize: FloatRange;
  initialRotation: FloatRange;
  lifetime: FloatRange;

  gravity: [number, number];
  drag: number;
  turbulenceStrength: number;
  turbulenceScale: number;

  spinSpeed: FloatRange;

  sizeOverLife: number[];
  opacityOverLife: number[];
  colorOverLife: ColorStop[];

  blendMode: ParticleBlendMode;
  spriteShape: 'circle' | 'square' | 'star' | 'spark' | 'smoke';
  trailLength: number;

  // B19 polish (all optional so existing configs load unchanged; absent/0 = off).
  /** Constant directional force (px/s^2), e.g. wind. */
  wind?: [number, number];
  /** Radial attractor/repeller force. */
  attractor?: ParticleAttractor | null;
  /** Spawn positions for emitterShape 'points' (e.g. sampled from a source layer for dissolve). */
  sourcePoints?: [number, number][];

  // Plexus (B20): connect particles within this distance (px) with fading lines (0 = off).
  connectDistance?: number;
  connectColor?: [number, number, number, number];
  connectWidth?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  age: number;
  lifetime: number;
  seed: number;
  alive: boolean;
}

export interface ParticleSnapshot {
  particles: Particle[];
  nextSpawnAccum: number;
  totalSpawned: number;
}

export interface ParticleLayerConfig {
  emitter: EmitterConfig;
  seed: number;
  startFrame: number;
  loop: boolean;
}
