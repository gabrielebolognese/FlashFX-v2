// Cloner module (MoGraph / C4D Cloner / AE Repeater).
//
// Prompt 1 scope: schema + pure distribution engine + reference/cycle validation.
// No rendering, no effectors, no stagger, no field/random distribution, and NOT
// yet part of the core `Layer` union — those land in later prompts. Everything
// here is pure and deterministic (see scripts/verify-cloner.mjs for the harness).

export * from './types';
export * from './distribution';
export * from './effectors';
export * from './stagger';
export * from './instanceMatrix';
export * from './renderPath';
export * from './dataBinding';
export * from './validation';
export * from './factory';
