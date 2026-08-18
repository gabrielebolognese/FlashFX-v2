import { create } from 'zustand';

// The example project is created at 1080p/30fps with enough frames that the whole
// bar-chart-race (350 frames) plays before the guided tutorial starts.
export const TUTORIAL_EXAMPLE_FPS = 30;
export const TUTORIAL_EXAMPLE_DURATION_FRAMES = 360;

/**
 * Bridges the onboarding "Yes, open the example" click to the <TutorialIntro> overlay
 * mounted in the editor. Onboarding sets `pending`; once the example project is open,
 * TutorialIntro runs its sequence (2s → popup → bar-chart-race choreography → tutorial),
 * then clears it.
 */
interface TutorialIntroState {
  pending: boolean;
  requestIntro: () => void;
  clear: () => void;
}

export const useTutorialIntroStore = create<TutorialIntroState>((set) => ({
  pending: false,
  requestIntro: () => set({ pending: true }),
  clear: () => set({ pending: false }),
}));
