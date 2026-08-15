import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from './useProjectStore';
import { captureError } from '../../lib/telemetry';

export function useAutoSave() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const composition = useEditorStore((s) => s.composition);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while edits are pending the debounce (used by the crash-flush below).
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!activeProjectId || !composition) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = true;
    // Debounced: persist the FULL document (all scenes/precomps, via getDocument)
    // to IndexedDB a couple seconds after the last edit. Previously this wrote a
    // localStorage key that nothing ever read — a silent no-op that lost work.
    timerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      useProjectStore.getState().saveCurrentProject().catch((err) => {
        captureError(err, { kind: 'autosave' });
      });
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeProjectId, composition]);

  // Crash-flush: if the tab is hidden or closed within the 2s debounce window, save NOW so
  // switching tabs / closing doesn't drop the last few seconds of work. visibilitychange
  // (hidden) fires reliably on tab-switch and mobile backgrounding; pagehide covers close.
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      dirtyRef.current = false;
      if (useProjectStore.getState().activeProjectId) {
        useProjectStore.getState().saveCurrentProject().catch((err) => captureError(err, { kind: 'autosave-flush' }));
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}
