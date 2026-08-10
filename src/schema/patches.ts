import { z } from 'zod/v4';
import { PALETTE_ROLES } from './enums';
import { zId, zNamespacedId, zSemanticName, zFrame, zVec2 } from './primitives';
import { zKeyframeDoc } from './properties';
import { zDocumentLayer, zMotionPresetAttachment } from './layers';
import type { Caps } from './caps';

// EDIT-PATH PATCHES. Every op is addressed by ID + property path, NEVER by index. The op vocabulary
// covers real editing (reparent, z-order, retime, duplicate, rename, preset, group, panel ops), not
// just set/add.
//
// INVERSE-FOR-UNDO: ops are shaped so an inverse is COMPUTABLE at apply time by capturing prior
// state (e.g. the inverse of `setProperty(id,path,new)` is `setProperty(id,path,old)`, where `old`
// is read from the document before applying). The op does NOT carry its own inverse — that keeps the
// model's output minimal and avoids it inventing stale prior state. The applier snapshots the whole
// document and pushes ONE undo command (see the write-path note below), so op-level inverses are a
// convenience, not the primary undo mechanism.
//
// WRITE PATH (scoped to AI commits, per the correction): the whole patch applies as ONE command —
// snapshot getDocument() → apply all ops → push a single {execute,undo} that swaps whole documents.
// This is NOT a claim that the rest of the codebase funnels through one path; it is the shape the AI
// commit uses. loadDocument currently CLEARS history, so the commit must use the snapshot-Command
// pattern (exec) rather than loadDocument.

const setProperty = z.strictObject({
  op: z.literal('setProperty'),
  layerId: zId,
  propertyPath: z.string().min(1),
  value: z.union([z.number(), zVec2]),
});
const setKeyframes = z.strictObject({
  op: z.literal('setKeyframes'),
  layerId: zId,
  propertyPath: z.string().min(1),
  keyframes: z.array(zKeyframeDoc),
});
const addLayer = z.strictObject({ op: z.literal('addLayer'), layer: zDocumentLayer });
const removeLayer = z.strictObject({ op: z.literal('removeLayer'), layerId: zId });
const reparentLayer = z.strictObject({ op: z.literal('reparentLayer'), layerId: zId, parentId: zId.nullable() });
/** Z-order by explicit anchor (before/after another layer id), never by array index. */
const reorderLayer = z.strictObject({
  op: z.literal('reorderLayer'),
  layerId: zId,
  before: zId.nullable().optional(),
  after: zId.nullable().optional(),
});
const retimeLayer = z.strictObject({
  op: z.literal('retimeLayer'),
  layerId: zId,
  inPoint: zFrame,
  outPoint: z.int().min(0),
  shiftKeyframes: z.boolean().default(false),
});
const duplicateLayer = z.strictObject({
  op: z.literal('duplicateLayer'),
  layerId: zId,
  newId: zNamespacedId.describe('caller-supplied, seed-reproducible id (never timestamp-minted)'),
});
const renameLayer = z.strictObject({ op: z.literal('renameLayer'), layerId: zId, name: zSemanticName });
const applyPreset = z.strictObject({ op: z.literal('applyPreset'), layerId: zId, preset: zMotionPresetAttachment });
const setStyleRole = z.strictObject({
  op: z.literal('setStyleRole'),
  layerId: zId,
  slot: z.enum(['fill', 'stroke']),
  role: z.enum(PALETTE_ROLES),
});
const group = z.strictObject({
  op: z.literal('group'),
  layerIds: z.array(zId).min(1),
  groupId: zNamespacedId,
  name: zSemanticName,
});
const ungroup = z.strictObject({ op: z.literal('ungroup'), groupId: zId });
const addPanel = z.strictObject({ op: z.literal('addPanel'), panelId: zId, start: zFrame, end: zFrame, order: z.int().min(0) });
const removePanel = z.strictObject({ op: z.literal('removePanel'), panelId: zId });
const retimePanel = z.strictObject({ op: z.literal('retimePanel'), panelId: zId, start: zFrame, end: zFrame });
const setPanelMembership = z.strictObject({ op: z.literal('setPanelMembership'), layerId: zId, panelId: zId });

export const zPatchOp = z.discriminatedUnion('op', [
  setProperty, setKeyframes, addLayer, removeLayer, reparentLayer, reorderLayer, retimeLayer,
  duplicateLayer, renameLayer, applyPreset, setStyleRole, group, ungroup,
  addPanel, removePanel, retimePanel, setPanelMembership,
]);

/** Factory: a patch is an ordered op list applied as one undo transaction (≤ caps.maxPatchOps). */
export function makePatch(caps: Caps) {
  return z
    .strictObject({
      /** Target composition (patches are per-composition). */
      compositionId: zId,
      ops: z.array(zPatchOp).min(1).max(caps.maxPatchOps),
    })
    .describe('an edit-path patch: ordered ops applied as ONE undo transaction');
}

export type PatchOp = z.infer<typeof zPatchOp>;
export type Patch = z.infer<ReturnType<typeof makePatch>>;
