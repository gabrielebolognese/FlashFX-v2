import { DesignElement } from './design';
import { EasingType } from '../animation-engine/types';

export interface Preset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  elements: DesignElement[];
  thumbnail?: string;
  element_count: number;
  created_at: string;
  updated_at: string;
}

export interface PresetCreateInput {
  name: string;
  description?: string;
  elements: DesignElement[];
  thumbnail?: string;
  element_count: number;
}

export interface PresetUpdateInput {
  name?: string;
  description?: string;
  elements?: DesignElement[];
  thumbnail?: string;
  element_count?: number;
}

export interface KeyframePresetKeyframe {
  id: string;
  relativeTime: number;
  value: number | string;
  easing: EasingType;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export interface KeyframePresetTrack {
  property: string;
  keyframes: KeyframePresetKeyframe[];
}

export interface KeyframeAnimationPreset {
  id: string;
  name: string;
  description?: string;
  tracks: KeyframePresetTrack[];
  duration: number;
  keyframeCount: number;
  created_at: string;
}

export interface KeyframeAnimationPresetCreateInput {
  name: string;
  description?: string;
  tracks: KeyframePresetTrack[];
  duration: number;
  keyframeCount: number;
}
