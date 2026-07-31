import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from './useProjectStore';

export function useAutoSave() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const composition = useEditorStore((s) => s.composition);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeProjectId || !composition) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Debounced: persist the FULL document (all scenes/precomps, via getDocument)
    // to IndexedDB a couple seconds after the last edit. Previously this wrote a
    // localStorage key that nothing ever read — a silent no-op that lost work.
    timerRef.current = setTimeout(() => {
      useProjectStore.getState().saveCurrentProject().catch((err) => {
        console.error('Autosave failed:', err);
      });
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeProjectId, composition]);
}
