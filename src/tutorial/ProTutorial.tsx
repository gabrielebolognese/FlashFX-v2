import { useEffect, useRef } from 'react';
import { useProTutorialStore, type ProTutorialKind } from './proTutorialStore';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { usePanelStore } from '../store/panels';

// Runs a Pro tutorial choreography once a project is open. Mounted in the editor. Sets the starter
// editor, clears the scene, inserts the template (rebased to frame 0), and plays it - so the user
// watches the template's own build-up (the storage stack rising + the counter tickering to 20 GB),
// with no meta "agent assembling" show. Armed via useProTutorialStore from App's boot handler.

const TEMPLATE: Record<ProTutorialKind, string> = { storage: 'storage-reveal' };

export function ProTutorial() {
  const kind = useProTutorialStore((s) => s.kind);
  const clear = useProTutorialStore((s) => s.clear);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const ran = useRef(false);

  useEffect(() => {
    if (!kind || !activeProjectId || ran.current) return;
    const templateId = TEMPLATE[kind];
    ran.current = true;
    // Defer one frame so the freshly-opened editor is fully mounted before we build + play.
    requestAnimationFrame(() => {
      usePanelStore.getState().setUiMode('starter');
      const ed = useEditorStore.getState();
      ed.removeLayers(ed.composition.layers.map((l) => l.id));
      const tl = useTimelineStore.getState();
      tl.seekTo(0);                          // anchor so the template's keyframes rebase to frame 0
      ed.insertAnimationTemplate(templateId);
      tl.seekTo(0);
      tl.play();
      clear();
    });
  }, [kind, activeProjectId, clear]);

  return null;
}
