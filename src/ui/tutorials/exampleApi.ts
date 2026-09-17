// Curated, type-safe helpers for tutorial "See example" actions. Each wraps real (undoable) editor
// store actions so a TutorialDef.seeExample can build a meaningful demo in a couple of calls without
// touching store internals. Every add* returns the new layer's id (the add action selects it).

import { useEditorStore } from '../../store/editor';
import { createDefaultMaterial, createDefaultPattern } from '../../core/material';
import { DEFAULT_GLOW, DEFAULT_SHADOW } from '../../core/effectDefaults';
import type { MaskType, PhysicsRoleDef, ShapeModifierType } from '../../core/types';

const ed = () => useEditorStore.getState();
const activeId = (): string => useEditorStore.getState().selection.activeId ?? '';

// ── create layers (returns the new id) ──
export function newRectangle(): string { ed().addRectangle(); return activeId(); }
export function newCircle(): string { ed().addCircle(); return activeId(); }
export function newStar(): string { ed().addStar(); return activeId(); }
export function newPolygon(): string { ed().addPolygon(); return activeId(); }
export function newText(content: string): string { ed().addText(content); return activeId(); }

// ── generic props / selection ──
export function prop(id: string, path: string, value: unknown): void { ed().updateLayerProperty(id, path, value); }
export function select(id: string): void { ed().selectLayer(id, false, 'canvas'); }

// ── shape features (B8) ──
export function addModifier(id: string, type: ShapeModifierType): void { ed().addShapeModifier(id, type); }
export function enableRepeater(id: string): void { ed().toggleShapeRepeater(id); }
export function setDash(id: string, pattern: number[]): void { ed().setShapeDash(id, pattern); }

// ── fills / strokes / effects ──
export function applyGradientFill(id: string): void { ed().updateLayerProperty(id, 'materialConfig', createDefaultMaterial()); }
export function applyGradientStroke(id: string): void { ed().updateLayerProperty(id, 'strokeMaterialConfig', createDefaultMaterial()); }
export function applyPatternFill(id: string): void { ed().updateLayerProperty(id, 'patternFill', createDefaultPattern()); }
export function applyGlow(id: string): void { ed().updateLayerProperty(id, 'glow', { ...DEFAULT_GLOW, enabled: true }); }
export function applyShadow(id: string): void { ed().updateLayerProperty(id, 'shadow', { ...DEFAULT_SHADOW, enabled: true }); }

// ── masks / motion path / physics / background ──
export function addMask(id: string, type: MaskType = 'ellipse'): void { ed().addMask(id, type); }
export function addMotionPath(id: string): void { ed().addMotionPath(id); }
export function addPhysics(id: string, role: PhysicsRoleDef): void { ed().addPhysicsBinding(id, role); }
export function addBackgroundLayer(): void { ed().addBackgroundLayer(); }
