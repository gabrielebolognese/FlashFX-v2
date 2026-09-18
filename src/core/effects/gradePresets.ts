import type { CurvePoint } from './curves';

// Color grading (B15) - film-look presets (pure data). Each is a set of tone curves (master +
// per-channel R/G/B) plus a saturation factor, applied by the Color Grade image-tool bake (renders
// now). Curves are control points in [0,1]; the tool bakes them to 1D LUTs. Validated (verify:color-grade).

export interface GradePreset {
  name: string;
  label: string;
  /** Master (value) tone curve applied to all channels. */
  master?: CurvePoint[];
  r?: CurvePoint[];
  g?: CurvePoint[];
  b?: CurvePoint[];
  /** Saturation multiplier (1 = unchanged, 0 = greyscale). */
  saturation?: number;
}

const S_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 0.25, y: 0.17 }, { x: 0.75, y: 0.83 }, { x: 1, y: 1 }];
const LIFT_BLACKS: CurvePoint[] = [{ x: 0, y: 0.09 }, { x: 1, y: 0.98 }];
const WARM_R: CurvePoint[] = [{ x: 0, y: 0.04 }, { x: 1, y: 1 }];
const WARM_B_DOWN: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0.92 }];
const COOL_B: CurvePoint[] = [{ x: 0, y: 0.04 }, { x: 1, y: 1 }];
const COOL_R_DOWN: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0.92 }];

export const GRADE_PRESETS: GradePreset[] = [
  { name: 'none', label: 'None' },
  {
    name: 'teal-orange', label: 'Teal & Orange',
    r: [{ x: 0, y: 0 }, { x: 0.5, y: 0.53 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0.08 }, { x: 0.5, y: 0.47 }, { x: 1, y: 0.94 }],
    saturation: 1.12,
  },
  { name: 'warm', label: 'Warm', r: WARM_R, b: WARM_B_DOWN, saturation: 1.05 },
  { name: 'cool', label: 'Cool', b: COOL_B, r: COOL_R_DOWN, saturation: 1.0 },
  { name: 'bleach', label: 'Bleach Bypass', master: S_CURVE, saturation: 0.4 },
  { name: 'noir', label: 'Noir', master: S_CURVE, saturation: 0 },
  { name: 'vintage', label: 'Vintage', master: LIFT_BLACKS, r: WARM_R, saturation: 0.82 },
  { name: 'vibrant', label: 'Vibrant', master: S_CURVE, saturation: 1.4 },
];
