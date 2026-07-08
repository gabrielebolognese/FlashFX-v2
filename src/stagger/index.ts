export type {
  DirectionMode,
  CurveProfile,
  GroupExpansionMode,
  RadialCenterMode,
  StaggerConfig,
  BoundingBox,
  StaggerBinding,
} from './types';

export { DEFAULT_STAGGER_CONFIG } from './types';
export { sortByDirection, sortGridSnake } from './sorting';
export { computeStaggerOffsets, computeGapFrames } from './timing';
export { resolveStaggerTargets } from './resolver';
