import { BackgroundConfig } from './background';

export interface ProjectCanvas {
  width: number;
  height: number;
  fps: number;
  unit?: 'px' | 'percent';
  background?: BackgroundConfig;
  grid: {
    enabled: boolean;
    size: number;
    snap: boolean;
  };
  zoom?: number;
  pan?: { x: number; y: number };
}
