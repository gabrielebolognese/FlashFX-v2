export type AnchorProperty =
  | 'positionX' | 'positionY'
  | 'rotation'
  | 'scaleX' | 'scaleY'
  | 'opacity';

export type TransferFunctionType = 'direct' | 'mirror' | 'scale' | 'remap' | 'expression';

export interface TransferFunction {
  type: TransferFunctionType;
  scale: number;
  offset: number;
  clampMin: number;
  clampMax: number;
  expression?: string;
}

export type PhysicsType = 'spring' | 'rope' | 'magnetic';

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface RopeConfig {
  length: number;
  stiffness: number;
  gravity: number;
}

export interface MagneticConfig {
  strength: number;
  falloff: number;
  maxDistance: number;
}

export interface PhysicsConfig {
  type: PhysicsType;
  spring?: SpringConfig;
  rope?: RopeConfig;
  magnetic?: MagneticConfig;
}

export type TemporalGateType = 'doWhile' | 'doAfter' | 'doFasterSlower' | 'doUntil';

export interface TemporalGate {
  type: TemporalGateType;
  triggerProperty?: AnchorProperty;
  threshold?: number;
  speedFactor?: number;
  delayFrames?: number;
}

export interface PropertyMapping {
  sourceProperty: AnchorProperty;
  targetProperty: AnchorProperty;
  transfer: TransferFunction;
}

export interface AnchorEdge {
  id: string;
  sourceLayerId: string;
  targetLayerId: string;
  enabled: boolean;
  mappings: PropertyMapping[];
  physics?: PhysicsConfig;
  temporal?: TemporalGate;
}
