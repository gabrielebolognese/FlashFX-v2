import type { Keyframe, Vec2 } from './types';
import { createKeyframe } from './factory';

// Animation presets are pure configuration. Applying one generates ordinary
// keyframes that flow through the existing interpolation/playback system; there
// is no preset runtime. Adding a new preset means adding an entry to
// ANIMATION_PRESETS below — no engine, timeline, or interpolation changes.

export type EasingKey = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring';

interface EasingDef {
  interpolation: Keyframe['interpolation'];
  handleOut?: Vec2;
  handleIn?: Vec2;
}

// Bezier handle components are mapped onto the existing cubic-bezier evaluator.
// That evaluator replaces exact-zero components with defaults, so "zero" axes
// use a tiny non-zero value to preserve the intended curve shape.
const EASING: Record<EasingKey, EasingDef> = {
  linear: { interpolation: 'linear' },
  easeIn: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [1, 1] },
  easeOut: { interpolation: 'bezier', handleOut: [0.001, 0.001], handleIn: [0.58, 1] },
  easeInOut: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [0.58, 1] },
  spring: { interpolation: 'spring' },
};

export type PresetCategory = 'Position' | 'Fade' | 'Scale' | 'Rotation' | 'Combination';

export const PRESET_CATEGORIES: PresetCategory[] = [
  'Position',
  'Fade',
  'Scale',
  'Rotation',
  'Combination',
];

// Evaluated layer state at the moment a preset is applied, plus comp size.
export interface PresetContext {
  position: Vec2;
  scale: Vec2;
  rotation: number;
  opacity: number;
  compWidth: number;
  compHeight: number;
}

type PresetProperty = 'position' | 'scale' | 'rotation' | 'opacity';

const PROPERTY_PATHS: Record<PresetProperty, string> = {
  position: 'transform.position',
  scale: 'transform.scale',
  rotation: 'transform.rotation',
  opacity: 'transform.opacity',
};

type ValueResolver = number | Vec2 | ((ctx: PresetContext) => number | Vec2);

interface PresetKeyframeDef {
  // Relative position within the preset duration, 0 (start) .. 1 (end).
  at: number;
  value: ValueResolver;
  // Easing applied to the segment that STARTS at this keyframe. Ignored on the
  // final keyframe. Defaults to easeInOut.
  easing?: EasingKey;
}

interface PresetTrackDef {
  property: PresetProperty;
  keyframes: PresetKeyframeDef[];
}

export interface AnimationPreset {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  tracks: PresetTrackDef[];
}

export interface GeneratedTrack {
  propertyPath: string;
  keyframes: Keyframe[];
}

export function generatePresetKeyframes(
  preset: AnimationPreset,
  ctx: PresetContext,
  startFrame: number,
  durationFrames: number
): GeneratedTrack[] {
  return preset.tracks.map((track) => {
    const propertyPath = PROPERTY_PATHS[track.property];
    const keyframes = track.keyframes.map((def) => {
      const frame = Math.round(startFrame + def.at * durationFrames);
      const value = typeof def.value === 'function' ? def.value(ctx) : def.value;
      const easing = EASING[def.easing ?? 'easeInOut'];
      const kf = createKeyframe(frame, value, easing.interpolation);
      if (easing.handleOut) kf.handleOut = [easing.handleOut[0], easing.handleOut[1]];
      if (easing.handleIn) kf.handleIn = [easing.handleIn[0], easing.handleIn[1]];
      return kf;
    });
    return { propertyPath, keyframes };
  });
}

// --- value helpers -----------------------------------------------------------

const scaleBy = (s: Vec2, f: number): Vec2 => [s[0] * f, s[1] * f];
const ZERO: Vec2 = [0, 0];

// --- preset catalog ----------------------------------------------------------

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // Position ------------------------------------------------------------------
  {
    id: 'slide-left',
    name: 'Slide Left',
    category: 'Position',
    description: 'Enter from off the left edge',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0] - c.compWidth, c.position[1]], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
    ],
  },
  {
    id: 'slide-right',
    name: 'Slide Right',
    category: 'Position',
    description: 'Enter from off the right edge',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0] + c.compWidth, c.position[1]], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
    ],
  },
  {
    id: 'slide-up',
    name: 'Slide Up',
    category: 'Position',
    description: 'Enter sliding up from below',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0], c.position[1] + c.compHeight], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
    ],
  },
  {
    id: 'slide-down',
    name: 'Slide Down',
    category: 'Position',
    description: 'Enter sliding down from above',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0], c.position[1] - c.compHeight], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
    ],
  },

  // Fade ----------------------------------------------------------------------
  {
    id: 'fade-in',
    name: 'Fade In',
    category: 'Fade',
    description: 'Opacity 0% to 100%',
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'fade-out',
    name: 'Fade Out',
    category: 'Fade',
    description: 'Opacity 100% to 0%',
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 1, easing: 'easeIn' },
          { at: 1, value: 0 },
        ],
      },
    ],
  },

  // Scale ---------------------------------------------------------------------
  {
    id: 'scale-up',
    name: 'Scale Up',
    category: 'Scale',
    description: 'Grow from 0% to 100%',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: ZERO, easing: 'easeOut' },
          { at: 1, value: (c) => c.scale },
        ],
      },
    ],
  },
  {
    id: 'scale-down',
    name: 'Scale Down',
    category: 'Scale',
    description: 'Shrink from 100% to 0%',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: (c) => c.scale, easing: 'easeIn' },
          { at: 1, value: ZERO },
        ],
      },
    ],
  },
  {
    id: 'pop-in',
    name: 'Pop In',
    category: 'Scale',
    description: 'Grow with a 110% overshoot',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: ZERO, easing: 'easeOut' },
          { at: 0.7, value: (c) => scaleBy(c.scale, 1.1), easing: 'easeInOut' },
          { at: 1, value: (c) => c.scale },
        ],
      },
    ],
  },
  {
    id: 'pop-out',
    name: 'Pop Out',
    category: 'Scale',
    description: 'Overshoot to 110% then shrink away',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: (c) => c.scale, easing: 'easeInOut' },
          { at: 0.3, value: (c) => scaleBy(c.scale, 1.1), easing: 'easeIn' },
          { at: 1, value: ZERO },
        ],
      },
    ],
  },

  // Rotation ------------------------------------------------------------------
  {
    id: 'rotate-in',
    name: 'Rotate In',
    category: 'Rotation',
    description: 'Spin in from -180 degrees',
    tracks: [
      {
        property: 'rotation',
        keyframes: [
          { at: 0, value: (c) => c.rotation - 180, easing: 'easeOut' },
          { at: 1, value: (c) => c.rotation },
        ],
      },
    ],
  },
  {
    id: 'rotate-out',
    name: 'Rotate Out',
    category: 'Rotation',
    description: 'Spin out to +180 degrees',
    tracks: [
      {
        property: 'rotation',
        keyframes: [
          { at: 0, value: (c) => c.rotation, easing: 'easeIn' },
          { at: 1, value: (c) => c.rotation + 180 },
        ],
      },
    ],
  },

  // Combination ---------------------------------------------------------------
  {
    id: 'fade-slide-left',
    name: 'Fade + Slide Left',
    category: 'Combination',
    description: 'Slide in from the left while fading in',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0] - c.compWidth, c.position[1]], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'fade-slide-right',
    name: 'Fade + Slide Right',
    category: 'Combination',
    description: 'Slide in from the right while fading in',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0] + c.compWidth, c.position[1]], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'fade-slide-up',
    name: 'Fade + Slide Up',
    category: 'Combination',
    description: 'Slide up from below while fading in',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0], c.position[1] + c.compHeight], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'fade-slide-down',
    name: 'Fade + Slide Down',
    category: 'Combination',
    description: 'Slide down from above while fading in',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0], c.position[1] - c.compHeight], easing: 'easeOut' },
          { at: 1, value: (c) => c.position },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'fade-scale',
    name: 'Fade + Scale',
    category: 'Combination',
    description: 'Fade in while scaling from 80% to 100%',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: (c) => scaleBy(c.scale, 0.8), easing: 'easeOut' },
          { at: 1, value: (c) => c.scale },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0, easing: 'easeOut' },
          { at: 1, value: 1 },
        ],
      },
    ],
  },
  {
    id: 'zoom-in',
    name: 'Zoom In',
    category: 'Combination',
    description: 'Scale from 300% down to 100%',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: (c) => scaleBy(c.scale, 3), easing: 'easeOut' },
          { at: 1, value: (c) => c.scale },
        ],
      },
    ],
  },
  {
    id: 'zoom-out',
    name: 'Zoom Out',
    category: 'Combination',
    description: 'Scale from 100% up to 300%',
    tracks: [
      {
        property: 'scale',
        keyframes: [
          { at: 0, value: (c) => c.scale, easing: 'easeIn' },
          { at: 1, value: (c) => scaleBy(c.scale, 3) },
        ],
      },
    ],
  },
  {
    id: 'attention-grabber',
    name: 'Attention Grabber',
    category: 'Combination',
    description: 'Quick rotational shake',
    tracks: [
      {
        property: 'rotation',
        keyframes: [
          { at: 0, value: (c) => c.rotation, easing: 'easeInOut' },
          { at: 0.2, value: (c) => c.rotation - 10, easing: 'easeInOut' },
          { at: 0.4, value: (c) => c.rotation + 10, easing: 'easeInOut' },
          { at: 0.6, value: (c) => c.rotation - 5, easing: 'easeInOut' },
          { at: 0.8, value: (c) => c.rotation + 5, easing: 'easeInOut' },
          { at: 1, value: (c) => c.rotation },
        ],
      },
    ],
  },
  {
    id: 'bounce-in',
    name: 'Bounce In',
    category: 'Combination',
    description: 'Drop in from below with a bounce',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => [c.position[0], c.position[1] + c.compHeight], easing: 'spring' },
          { at: 1, value: (c) => c.position },
        ],
      },
    ],
  },
  {
    id: 'bounce-out',
    name: 'Bounce Out',
    category: 'Combination',
    description: 'Bounce downward out of frame',
    tracks: [
      {
        property: 'position',
        keyframes: [
          { at: 0, value: (c) => c.position, easing: 'spring' },
          { at: 1, value: (c) => [c.position[0], c.position[1] + c.compHeight] },
        ],
      },
    ],
  },
];

export function getPresetById(id: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find((p) => p.id === id);
}

export function getPresetsByCategory(): Record<PresetCategory, AnimationPreset[]> {
  const grouped = {} as Record<PresetCategory, AnimationPreset[]>;
  for (const category of PRESET_CATEGORIES) grouped[category] = [];
  for (const preset of ANIMATION_PRESETS) grouped[preset.category].push(preset);
  return grouped;
}
