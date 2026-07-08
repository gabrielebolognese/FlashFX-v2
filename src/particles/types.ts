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

export type EmitterShape = 'point' | 'circle' | 'rectangle' | 'ring';

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
