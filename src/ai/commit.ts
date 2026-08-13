import type { Composition } from '../core/types';
import type { SharedStyle } from '../core/styles';
import { useEditorStore } from '../store/editor';
import { useHistoryStore } from '../store/history';

// COMMIT (browser only — imports the store, so it is NOT bundled into the Node compiler/harness).
// Takes a compiled Composition + its palette styles and commits them as ONE undo step via the
// snapshot-command pattern. We do NOT use the document loader: it clears history, which would make
// the generation non-undoable. Scoped to AI commits only — this is not a general write path.

export function commitAiComposition(
  composition: Composition,
  styles: Record<string, SharedStyle>,
  aiMeta?: Record<string, unknown>,
): void {
  const editor = useEditorStore.getState();
  const before = {
    composition: editor.composition,
    compositions: editor.compositions,
    styles: editor.styles,
    rootCompositionId: editor.rootCompositionId,
    activeCompositionId: editor.activeCompositionId,
    navStack: (editor as unknown as { navStack?: unknown[] }).navStack ?? [],
    aiMeta: editor.aiMeta,
  };
  const after = {
    composition,
    compositions: { [composition.id]: composition },
    styles: { ...editor.styles, ...styles },
    rootCompositionId: composition.id,
    activeCompositionId: composition.id,
    navStack: [],
    // Carried through save/load so the edit path can regenerate from it.
    aiMeta,
  };
  useHistoryStore.getState().execute({
    label: 'AI: generate scene',
    execute: () => useEditorStore.setState(after as never),
    undo: () => useEditorStore.setState(before as never),
  });
}
