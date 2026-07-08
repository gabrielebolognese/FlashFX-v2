import { create } from 'zustand';

export type OnboardingStep =
  | 'welcome'
  | 'askOnboarding'
  | 'letsStart'
  | 'bgColor'
  | 'shapeMode'
  | 'brandAssets'
  | 'contentType'
  | 'tutorial'
  | 'done';

export type ShapeCreationMode = 'fast' | 'drag';
export type ContentType = 'long' | 'short';

interface OnboardingState {
  active: boolean;
  step: OnboardingStep;
  bgColor: [number, number, number];
  shapeMode: ShapeCreationMode | null;
  contentType: ContentType | null;
  wantsTutorial: boolean | null;

  setStep: (step: OnboardingStep) => void;
  setBgColor: (color: [number, number, number]) => void;
  setShapeMode: (mode: ShapeCreationMode) => void;
  setContentType: (type: ContentType) => void;
  setWantsTutorial: (val: boolean) => void;
  complete: () => void;
  skip: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  active: true,
  step: 'welcome',
  bgColor: [0.08, 0.09, 0.12],
  shapeMode: null,
  contentType: null,
  wantsTutorial: null,

  setStep: (step) => set({ step }),
  setBgColor: (color) => set({ bgColor: color }),
  setShapeMode: (mode) => set({ shapeMode: mode }),
  setContentType: (type) => set({ contentType: type }),
  setWantsTutorial: (val) => set({ wantsTutorial: val }),
  complete: () => set({ active: false, step: 'done' }),
  skip: () => set({ active: false, step: 'done' }),
}));
