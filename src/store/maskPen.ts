// Path-mask authoring glue (B10d-mask): committing the mask pen's draft and the keyboard for the pen
// and for path-mask vertex editing. Shared by MaskOverlay (pointer) and App.tsx (global keydown) so the
// global Delete/Backspace never deletes the LAYER while the user is drawing or has a mask vertex
// selected.

import { useEditorStore } from './editor';
import { useMaskStore } from './mask';
import { deleteMaskVertex, isPathMask } from '../core/maskPath';
import type { Mask } from '../core/types';

/** Turn the pen draft into a path mask on the pen's layer (needs ≥3 points). True when created. */
export function commitMaskPen(): boolean {
  const ms = useMaskStore.getState();
  if (!ms.penLayerId || ms.penDraft.length < 3) return false;
  const id = useEditorStore.getState().addPathMask(ms.penLayerId, ms.penDraft);
  ms.stopMaskPen();
  if (id) useMaskStore.getState().setSelectedMaskId(id);
  return !!id;
}

/** The selected path mask on the active layer, if any. */
export function selectedPathMask(): { layerId: string; mask: Mask } | null {
  const st = useEditorStore.getState();
  const layer = st.composition.layers.find((l) => l.id === st.selection.activeId);
  const maskId = useMaskStore.getState().selectedMaskId;
  if (!layer || !maskId || !('masks' in layer) || !Array.isArray(layer.masks)) return null;
  const mask = layer.masks.find((m) => m.id === maskId);
  return mask && isPathMask(mask) ? { layerId: layer.id, mask } : null;
}

/**
 * Mask pen + vertex keys. While drawing: Enter closes (≥3 points), Backspace/Delete drops the last
 * point, Esc clears the draft then exits the pen. With a path-mask vertex selected: Delete/Backspace
 * removes that vertex (an outline keeps ≥3). Returns true when the key was consumed.
 */
export function handleMaskKey(e: KeyboardEvent): boolean {
  const ms = useMaskStore.getState();
  if (ms.penLayerId) {
    if (e.key === 'Enter') {
      commitMaskPen();
      return true;
    }
    if (e.key === 'Escape') {
      if (ms.penDraft.length > 0) ms.setPenDraft([]);
      else ms.stopMaskPen();
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      ms.setPenDraft(ms.penDraft.slice(0, -1));
      return true;
    }
    return false;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ms.selectedVertex !== null) {
    const sel = selectedPathMask();
    if (!sel) return false;
    const patch = deleteMaskVertex(sel.mask, ms.selectedVertex);
    if (patch) useEditorStore.getState().patchMask(sel.layerId, sel.mask.id, patch, 'Delete Mask Vertex');
    ms.setSelectedVertex(null);
    return true;
  }
  return false;
}
