import React, { useEffect, useState, useCallback } from 'react';
import { useTutorial } from '../../contexts/TutorialContext';
import TutorialPanel from './TutorialPanel';
import { TUTORIAL_STEPS, getSpotlightPosition, getPanelPosition, scrollElementIntoView } from '../../utils/tutorialUtils';
import { SpotlightPosition } from '../../types/tutorial';

const TutorialOverlay: React.FC = () => {
  const { state, nextStep, previousStep, skipTutorial, finishTutorial } = useTutorial();
  const [spotlightPos, setSpotlightPos] = useState<SpotlightPosition | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const currentStep = TUTORIAL_STEPS[state.currentStep];

  const updatePositions = useCallback(() => {
    if (!currentStep) return;

    const spotlight = getSpotlightPosition(currentStep.target);
    if (spotlight) {
      setSpotlightPos(spotlight);
      const panel = getPanelPosition(spotlight, currentStep.position);
      setPanelPos(panel);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!state.isActive || !currentStep) return;

    scrollElementIntoView(currentStep.target);

    setTimeout(() => {
      updatePositions();
    }, 100);

    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [state.isActive, state.currentStep, currentStep, updatePositions]);

  useEffect(() => {
    if (!state.isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          skipTutorial();
          break;
        case 'ArrowRight':
        case 'Enter':
          if (state.currentStep < TUTORIAL_STEPS.length - 1) {
            nextStep();
          } else {
            finishTutorial();
          }
          break;
        case 'ArrowLeft':
          if (state.currentStep > 0) {
            previousStep();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isActive, state.currentStep, nextStep, previousStep, skipTutorial, finishTutorial]);

  if (!state.isActive || !currentStep || !spotlightPos) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-auto">
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={spotlightPos.left}
              y={spotlightPos.top}
              width={spotlightPos.width}
              height={spotlightPos.height}
              rx={spotlightPos.borderRadius}
              ry={spotlightPos.borderRadius}
              fill="black"
            />
          </mask>
        </defs>

        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.85)"
          mask="url(#spotlight-mask)"
          style={{ transition: 'all 0.4s ease-in-out' }}
        />

        <rect
          x={spotlightPos.left}
          y={spotlightPos.top}
          width={spotlightPos.width}
          height={spotlightPos.height}
          rx={spotlightPos.borderRadius}
          ry={spotlightPos.borderRadius}
          fill="none"
          stroke="rgba(251, 191, 36, 0.5)"
          strokeWidth="3"
          style={{
            transition: 'all 0.4s ease-in-out',
            filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.4))'
          }}
        />
      </svg>

      <TutorialPanel
        step={currentStep}
        currentStepIndex={state.currentStep}
        totalSteps={TUTORIAL_STEPS.length}
        onNext={nextStep}
        onPrevious={previousStep}
        onSkip={skipTutorial}
        onFinish={finishTutorial}
        style={{
          top: `${panelPos.top}px`,
          left: `${panelPos.left}px`,
          transition: 'all 0.4s ease-in-out'
        }}
      />
    </div>
  );
};

export default TutorialOverlay;
