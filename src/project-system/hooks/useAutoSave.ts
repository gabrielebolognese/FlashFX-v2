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
    timerRef.current = setTimeout(() => {
      try {
        const key = `ffx-project-${activeProjectId}`;
        localStorage.setItem(key, JSON.stringify(composition));
      } catch { /* quota exceeded or serialization failure */ }
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeProjectId, composition]);
}
