import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useTutorialStore } from './store';

export const TUTORIAL_SEEN_KEY = 'ffx-tutorial-seen';

export function markTutorialSeen(): void {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch { /* ignore */ }
}
export function hasSeenTutorial(): boolean {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; } catch { return false; }
}

/**
 * Launch the guided tutorial: always from a FRESH 16:9 project so the auto-build is clean (a
 * replay never inherits a half-built prior run), then start the director. The <TutorialRunner>
 * mounted in the editor picks up `active` and runs the script once the comp is ready.
 */
export async function launchTutorial(): Promise<void> {
  markTutorialSeen();
  await useProjectStore.getState().createAndOpenProject({
    name: 'Tutorial',
    width: 1920,
    height: 1080,
    videoFormat: 'long',
  });
  useTutorialStore.getState().start();
}
