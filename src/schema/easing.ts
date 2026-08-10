import { z } from 'zod/v4';
import { EASING_NAMES, type EasingName } from './enums';

// THE single source of truth for named easing → concrete keyframe handles. Today the same values
// also live in src/core/animationPresets.ts (`EASING`); this package is intended to become the one
// place, with animationPresets importing from here. scripts/verify-schema.mjs asserts the two tables
// are byte-identical so they can't drift until that consolidation lands.
//
// Values mirror animationPresets.ts exactly: the cubic-bezier evaluator replaces exact-zero handle
// components with defaults, so "zero" axes use a tiny 0.001 to preserve the intended curve.

export interface EasingHandles {
  interpolation: 'linear' | 'bezier' | 'hold' | 'spring';
  handleOut?: [number, number];
  handleIn?: [number, number];
}

export const EASING_TABLE: Record<EasingName, EasingHandles> = {
  linear: { interpolation: 'linear' },
  easeIn: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [1, 1] },
  easeOut: { interpolation: 'bezier', handleOut: [0.001, 0.001], handleIn: [0.58, 1] },
  easeInOut: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [0.58, 1] },
  spring: { interpolation: 'spring' },
};

/** Resolve a named easing to concrete handles (used by preset expansion / assembly). */
export function resolveEasing(name: EasingName): EasingHandles {
  return EASING_TABLE[name];
}

/** The Zod enum of allowed easing names — the closed set the Director picks from and the Coder names. */
export const zEasingName = z.enum(EASING_NAMES).describe('named easing; resolves to concrete handles');
