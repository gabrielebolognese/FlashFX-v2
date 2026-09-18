import { create } from 'zustand';

// Manual guided tour of the Full editor. It NEVER runs on its own: the user clicks Next through a
// fixed sequence of spotlight + prompt steps (one step waits for the user to select a layer instead
// of a Next click). The <TutorialRunner> reads active/stepIndex and drives the SpotlightOverlay +
// prompt box; when stepIndex runs past the last step the runner stops it.

interface TutorialState {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  stop: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  active: false,
  stepIndex: 0,
  start: () => set({ active: true, stepIndex: 0 }),
  next: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
  stop: () => set({ active: false, stepIndex: 0 }),
}));
