import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { usePanelStore } from '../store/panels';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { useTutorialStore } from './store';

export const TUTORIAL_SEEN_KEY = 'ffx-tutorial-seen';

export function markTutorialSeen(): void {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch { /* ignore */ }
}
export function hasSeenTutorial(): boolean {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; } catch { return false; }
}

/**
 * Start the manual Full-editor tour on the CURRENT project - nothing is rebuilt. Used by the
 * onboarding handoff, where the example scene (the forest) is already placed: switch to the Full
 * editor in EDIT mode (not Animate), then start the tour. The tour walks the canvas, timeline,
 * selection, inspector, media pool, top bar, and export, one Next click at a time.
 */
export function startEditorTour(): void {
  markTutorialSeen();
  const panels = usePanelStore.getState();
  panels.setUiMode('pro');
  panels.setEditorWorkspace('edit');
  useTutorialStore.getState().start();
}

/**
 * Launch the tour from scratch (dashboard hero / corner replay): spin up a fresh 16:9 project with a
 * sample scene to explore, then run the same manual tour so the "select a layer" / inspector steps
 * have something to act on.
 */
export async function launchTutorial(): Promise<void> {
  await useProjectStore.getState().createAndOpenProject({
    name: 'Tutorial',
    width: 1920,
    height: 1080,
    videoFormat: 'long',
  });
  useEditorStore.getState().insertAnimationTemplate('forest');
  useTimelineStore.getState().seekTo(0);
  startEditorTour();
}
