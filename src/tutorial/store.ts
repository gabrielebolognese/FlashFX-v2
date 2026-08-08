import { create } from 'zustand';

// Tutorial director state. The <TutorialRunner> owns the async loop and writes progress here via
// _patch; the narration bar + controls read it and call the public setters. `jumpTo` is a signal
// the runner consumes (skip to a chapter, or past the end → handoff).

export type TutorialPhase = 'idle' | 'running' | 'handoff';
export type TutorialSpeed = 1 | 2 | 4;

interface TutorialState {
  active: boolean;
  phase: TutorialPhase;
  chapterIndex: number;
  stepIndex: number;
  paused: boolean;
  speed: TutorialSpeed;
  /** Runner consumes this: jump to chapter i (>= chapter count → run to handoff). null = no jump. */
  jumpTo: number | null;

  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (s: TutorialSpeed) => void;
  skipToChapter: (i: number) => void;
  skipAll: () => void;
  /** Runner-internal progress/phase updates. */
  _patch: (p: Partial<Pick<TutorialState, 'phase' | 'chapterIndex' | 'stepIndex' | 'jumpTo'>>) => void;
}

const SKIP_TO_END = 1_000_000;

export const useTutorialStore = create<TutorialState>((set) => ({
  active: false,
  phase: 'idle',
  chapterIndex: 0,
  stepIndex: 0,
  paused: false,
  speed: 1,
  jumpTo: null,

  start: () => set({ active: true, phase: 'running', chapterIndex: 0, stepIndex: 0, paused: false, speed: 1, jumpTo: null }),
  stop: () => set({ active: false, phase: 'idle', paused: false, jumpTo: null }),
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  setSpeed: (speed) => set({ speed }),
  skipToChapter: (i) => set({ jumpTo: i, paused: false }),
  skipAll: () => set({ jumpTo: SKIP_TO_END, paused: false }),
  _patch: (p) => set(p),
}));

export { SKIP_TO_END };
