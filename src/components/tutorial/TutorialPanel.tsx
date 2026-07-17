import React from 'react';
import { ChevronLeft, ChevronRight, X, CheckCircle } from 'lucide-react';
import { TutorialStep } from '../../types/tutorial';

interface TutorialPanelProps {
  step: TutorialStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onFinish: () => void;
  style: React.CSSProperties;
}

const TutorialPanel: React.FC<TutorialPanelProps> = ({
  step,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onFinish,
  style
}) => {
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <div
      className="fixed bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 z-[10001]"
      style={{
        ...style,
        maxWidth: '400px',
        minWidth: '320px'
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">
            {step.title}
          </h3>
        </div>
        <button
          onClick={onSkip}
          className="text-slate-400 hover:text-white transition-colors p-1"
          title="Skip Tutorial"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-slate-300 text-sm leading-relaxed mb-6">
        {step.message}
      </p>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onPrevious}
          disabled={isFirstStep}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            isFirstStep
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentStepIndex
                  ? 'w-8 bg-amber-500'
                  : index < currentStepIndex
                  ? 'w-1.5 bg-amber-500/50'
                  : 'w-1.5 bg-slate-600'
              }`}
            />
          ))}
        </div>

        {isLastStep ? (
          <button
            onClick={onFinish}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-semibold rounded-lg transition-all shadow-lg"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Finish</span>
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white font-medium rounded-lg transition-all"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-1 bg-slate-700/50 rounded text-slate-300">←</kbd>
            <kbd className="px-2 py-1 bg-slate-700/50 rounded text-slate-300">→</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-1 bg-slate-700/50 rounded text-slate-300">ESC</kbd>
            Skip
          </span>
        </div>
      </div>
    </div>
  );
};

export default TutorialPanel;
