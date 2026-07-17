export interface TutorialStep {
  id: number;
  target: string;
  title: string;
  message: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  requiresAction?: boolean;
  actionType?: 'click' | 'create-shape';
}

export interface TutorialState {
  isActive: boolean;
  currentStep: number;
  hasCompleted: boolean;
  showWelcomeModal: boolean;
}

export interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

export interface TutorialContextValue {
  state: TutorialState;
  startTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  finishTutorial: () => void;
  resetTutorial: () => void;
  showWelcomeModal: () => void;
  hideWelcomeModal: () => void;
}
