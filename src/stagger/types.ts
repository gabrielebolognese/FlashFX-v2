export type DirectionMode =
  | 'layerStackOrder'
  | 'selectionClickOrder'
  | 'spatialLeftToRight'
  | 'spatialRightToLeft'
  | 'spatialTopToBottom'
  | 'spatialBottomToTop'
  | 'radialOutward'
  | 'radialInward'
  | 'gridSnake'
  | 'randomChaos';

export type CurveProfile = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'elasticSpring';

export type GroupExpansionMode = 'treatGroupsAsAtomicUnits' | 'expandIntoChildren' | 'expandRecursively';

export type RadialCenterMode = 'boundingBoxCenter' | 'masterLayer';

export interface StaggerConfig {
  directionMode: DirectionMode;
  invertOrder: boolean;
  radialCenterMode: RadialCenterMode;
  radialMasterLayerId?: string;
  gapFrames: number;
  totalDurationLock: { enabled: boolean; totalFrames: number };
  curveProfile: CurveProfile;
  curveIntensity: number;
  randomSeed: number;
  groupExpansion: GroupExpansionMode;
  liveReindexing: boolean;
  rowToleranceFraction: number;
}

export interface BoundingBox {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface StaggerBinding {
  id: string;
  targetLayerIds: string[];
  config: StaggerConfig;
  baseStartFrame: number;
  computedOffsets: Map<string, number>;
}

export const DEFAULT_STAGGER_CONFIG: StaggerConfig = {
  directionMode: 'spatialLeftToRight',
  invertOrder: false,
  radialCenterMode: 'boundingBoxCenter',
  gapFrames: 3,
  totalDurationLock: { enabled: false, totalFrames: 30 },
  curveProfile: 'linear',
  curveIntensity: 100,
  randomSeed: Math.floor(Math.random() * 100000),
  groupExpansion: 'treatGroupsAsAtomicUnits',
  liveReindexing: false,
  rowToleranceFraction: 0.5,
};
