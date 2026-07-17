// Cloner — data model (MoGraph / C4D Cloner / AE Repeater concept).
//
// A Cloner is ONE logical layer that expands into N rendered instances at render
// time, as a pure function of (frame, index, params) — the same lazy-resolution
// discipline as a precomp, plus an index dimension. This module is the schema +
// the pure distribution engine ONLY (prompt 1): no rendering, no effectors, no
// stagger, and it is intentionally NOT yet part of the core `Layer` union (that
// scene-graph/render integration lands in a later prompt).
//
// Conventions: FlashFX has no Zod, so "schema" = plain strict-TS interfaces here
// plus the validator in ./validation.ts (mirroring core/types.ts + its checks).
// The editor is 2D (Vec2), but the engine carries a z component (default 0) so the
// output shape does not have to change if 3D distribution is added later.

import type { MotionPath, Transform, BlendMode, LayerShadow, LayerGlow, LayerBlur, Mask } from '../core/types';
// The resolved field buffer + its pure sampler are reused from the procedural
// field-sampling engine (never re-implemented). Type-only import here.
import type { FieldGrid } from '../field-sampling/fields';

/** Plain 3-component vector for the pure engine (editor is 2D → z usually 0). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Multiplicative color tint; identity is {1,1,1}. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * What a cloner repeats. Only `layer` is meaningful today; `composition` is
 * reserved for when precomps land (there is no multi-composition document yet),
 * kept in the union now so adding it later is additive, not a breaking change.
 * Flat reference (id only) — never inline the source content — so a cloner is
 * cheap to re-point and the generation pipeline can patch it in isolation.
 */
export type ClonerSourceRef =
  | { type: 'layer'; layerId: string }
  | { type: 'composition'; compositionId: string };

/** Reserved for the stagger prompt; the distribution engine ignores it. */
export type EasingCurve = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

// ── Distribution: a discriminated union of index→position rules ──
// This prompt implements exactly grid | radial | path. `field` and `random`
// depend on the procedural-field engine and arrive in a later prompt; adding
// them is purely additive to this union.

export interface GridDistribution {
  type: 'grid';
  countX: number;
  countY: number;
  countZ: number;
  spacing: Vec3;
  origin: Vec3;
  /**
   * GEOMETRIC per-row offset in X (brick/half-drop layout): odd rows shift by
   * this many units. This is a positional parameter — deliberately named
   * distinctly from the TIMING stagger (ClonerStagger) deferred to a later prompt.
   */
  rowOffset: number;
}

export interface RadialDistribution {
  type: 'radial';
  count: number;
  radius: number;
  /** Total sweep; 360 = full circle (instances evenly spaced, no duplicate seam). */
  arcDegrees: number;
  center: Vec3;
  startAngleDegrees: number;
  /** When true, each instance's Z rotation points radially outward from center. */
  orientToCenter: boolean;
}

export interface PathDistribution {
  type: 'path';
  /**
   * A MotionPath id (composition.motionPaths). We reuse core/motionPath's
   * arc-length sampler rather than reimplement it; paths live as MotionPaths in
   * this codebase, not as layers, so this is a MotionPath ref (not a LayerId).
   */
  pathRef: string;
  count: number;
  /**
   * Reserved flag. The engine always samples arc-length-corrected (naive
   * parametric-t produces visibly uneven spacing on curves and is intentionally
   * not offered); kept for API completeness / forward-compat.
   */
  arcLengthCorrected: boolean;
  /** When true, each instance's Z rotation matches the path tangent at its sample. */
  orientToPath: boolean;
}

/**
 * Field-driven distribution (Prompt 4): place instances where a resolved raster
 * field exceeds `threshold` — e.g. "denser where the source image is brighter".
 * Samples a pre-resolved `FieldGrid` (via ctx.getField) — the pure engine NEVER
 * touches the async worker pipeline; the buffer is resolved once, upstream.
 * `maxCount` caps candidates generated FROM the field, BEFORE renderCount's
 * downstream truncation (the two caps are distinct on purpose). Positions are a
 * pure function of the field data + params — independent of frameNumber.
 */
export interface FieldDistribution {
  type: 'field';
  fieldRef: string;
  /** Base grid resolution per axis to evaluate the field over. */
  sampleResolution: number;
  /** Keep candidates whose sampled field value exceeds this. */
  threshold: number;
  /** Cap on candidate positions generated from the field (NOT renderCount). */
  maxCount: number;
  /** World-space region the field maps onto: candidate (u,v) → origin + (u,v)·size. */
  origin: Vec3;
  size: Vec3;
}

export type ClonerDistribution = GridDistribution | RadialDistribution | PathDistribution | FieldDistribution;

// ── Effectors (prompt 2): stackable per-instance transform modulators ──
// Each effector is a pure function of (index, basePosition, time, its params) →
// TransformDelta. They apply in array order on top of the base distribution
// transform, each with its own strength + blendMode. See ./effectors.ts.

/** A per-instance modulation, as deviations from identity. */
export interface TransformDelta {
  positionDelta: Vec3;
  rotationDelta: Vec3;
  scaleDelta: Vec3; // fractional deviation from 1
  colorDelta: Vec3; // fractional deviation from {1,1,1} (x→r, y→g, z→b)
  opacityDelta: number; // fractional deviation from 1
}

export type EffectorBlendMode = 'add' | 'multiply' | 'override';
export type EffectorWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface EffectorCommon {
  strength: number;
  blendMode: EffectorBlendMode;
}

/**
 * Deterministic per-instance random offset/rotation/scale. `seed` is REQUIRED —
 * an effector without a fixed seed cannot be deterministic. Implementation MUST
 * hash (seed, index) with the house RNG; Math.random()/Date are banned (they would
 * make every scrub non-reproducible).
 */
export interface RandomEffector extends EffectorCommon {
  type: 'random';
  seed: number;
  positionAmount: Vec3;
  rotationAmount: Vec3;
  scaleAmount: number;
  opacityAmount: number;
}

/**
 * A spatial falloff scalar in [0,1] scaling a fixed delta. The `field` variant
 * (Prompt 4) samples a resolved FieldGrid instead of a closed-form distance — same
 * `strength(position) -> [0,1]` contract, resolved once & sampled purely.
 */
export type FalloffShape =
  | { type: 'linear'; start: Vec3; direction: Vec3; length: number }
  | { type: 'radial'; center: Vec3; innerRadius: number; outerRadius: number }
  | { type: 'box'; center: Vec3; halfExtents: Vec3; softness: number }
  | { type: 'field'; fieldRef: string; origin: Vec3; size: Vec3 };

export interface FalloffEffector extends EffectorCommon {
  type: 'falloff';
  shape: FalloffShape;
  /** Shapes the [0,1] falloff curve (1 = linear ramp). */
  curveExponent: number;
  // The delta applied at full falloff (strength 1):
  positionDelta: Vec3;
  rotationDelta: Vec3;
  scaleDelta: number; // uniform
  colorDelta: Vec3;
  opacityDelta: number;
}

/** Output is a function of the INDEX only (deterministic wave across the grid). */
export interface StepEffector extends EffectorCommon {
  type: 'step';
  waveform: EffectorWaveform;
  frequency: number;
  phase: number;
  positionAmount: Vec3;
  rotationAmount: Vec3;
  scaleAmount: number;
  opacityAmount: number;
}

/**
 * Output is a function of playhead TIME only (uniform across instances). Named
 * 'time' deliberately: an 'audio'-amplitude sibling is reserved for once the
 * audio-reactive system exists — the union stays open for it.
 */
export interface TimeEffector extends EffectorCommon {
  type: 'time';
  waveform: EffectorWaveform;
  frequency: number;
  phase: number;
  positionAmount: Vec3;
  rotationAmount: Vec3;
  scaleAmount: number;
  opacityAmount: number;
}

/**
 * Rotates each instance to face a target POINT (camera-facing is reserved — no
 * camera system to bind to yet). Distinct from radial's orientToCenter, which is
 * base distribution geometry; this points at an arbitrary target independently.
 */
export interface TargetEffector extends EffectorCommon {
  type: 'target';
  target: Vec3;
}

export type ClonerEffector =
  | RandomEffector
  | FalloffEffector
  | StepEffector
  | TimeEffector
  | TargetEffector;

/**
 * Reserved timing-stagger shape. This prompt parses it and IGNORES it — every
 * instance is evaluated at the same frameNumber (no per-instance time offset yet).
 */
export interface ClonerStagger {
  delaySeconds: number;
  curve?: EasingCurve;
}

/**
 * Data-bound source (Prompt 4 — the templating engine): instance `i` pulls
 * `data[i % data.length]` into bound source properties, so instances can differ in
 * content (text/color/image) instead of rendering identically. `data.length` need
 * not equal instance count — the wraparound is intentional. Routes the cloner to
 * the full per-instance render path.
 */
export interface ClonerDataBinding {
  data: Array<Record<string, string | number>>;
  bindings: Array<{ propertyPath: string; dataKey: string }>;
}

export interface ClonerLayer {
  id: string;
  type: 'cloner';
  name: string;
  // ── Common Layer fields (a cloner is a first-class member of the core `Layer`
  // union). resolveFrame reads visible/inPoint/outPoint/parentId/trackId/blendMode/
  // transform exactly as for other layers; `transform` is the cloner's own layer
  // transform, applied on top of the per-instance transforms. ──
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  transform: Transform;
  inPoint: number;
  outPoint: number;
  // Optional common-layer fields other layers carry, so accesses on the `Layer`
  // union (motion blur / shadow / glow / blur / masks) type-check for cloners too.
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  masks?: Mask[];
  // ── Cloner-specific ──
  sourceRef: ClonerSourceRef;
  distribution: ClonerDistribution;
  effectors: ClonerEffector[];
  stagger: ClonerStagger;
  /**
   * Hard safety cap on produced instances, independent of what the distribution
   * math would otherwise generate. Enforced (truncate, lowest index first) — not
   * just documented — so a bad count cannot stall or crash a render.
   */
  renderCount: number;
  /** When present & non-empty, per-instance content binding (routes to full render). */
  dataBinding?: ClonerDataBinding;
}

/** One resolved instance. In 2D, only rotationDegrees.z is non-zero. */
export interface InstanceTransform {
  index: number;
  position: Vec3;
  rotationDegrees: Vec3;
  scale: Vec3;
  /** Multiplicative tint; base distribution sets identity {1,1,1}, effectors modulate. */
  colorTint: RGB;
  /** Base distribution sets 1; effectors modulate. */
  opacity: number;
}

/** The source layer's animated transform at a (staggered) local frame; all optional. */
export interface SourceAnimatedTransform {
  position?: Vec3;
  rotationDegrees?: Vec3;
  scale?: Vec3;
  opacity?: number;
  colorTint?: RGB;
}

/**
 * Resolution context so the pure engine can look up flat refs and delegate host
 * concerns without inlining them or reimplementing them. All optional & additive —
 * passing only (cloner, frame) still works for a pure grid/radial with no stagger.
 */
export interface ClonerResolveContext {
  /** Resolve a path distribution's MotionPath by id (reuses core/motionPath sampling). */
  getMotionPath?: (id: string) => MotionPath | undefined;
  /**
   * Resolve a field ref to an ALREADY-SAMPLED FieldGrid buffer (field distribution +
   * field falloff). The async worker/rasterization happens upstream (in resolveFrame,
   * cached); the pure engine only reads this buffer — it never awaits anything.
   */
  getField?: (fieldRef: string) => FieldGrid | undefined;
  /** Frames-per-second, to convert stagger delaySeconds → frames. Default 30. */
  fps?: number;
  /**
   * Evaluate the SOURCE layer's animated transform at a (staggered) local frame.
   * The host wires this to its EXISTING per-layer keyframe evaluator (evaluateNumber
   * over the source's AnimatableProperties); the cloner never reimplements keyframe
   * evaluation. Absent → the source contributes identity (distribution+effectors only).
   */
  evaluateSourceTransform?: (localFrame: number) => SourceAnimatedTransform;
}
