import { useEffect, useRef } from 'react';
import { GraduationCap } from 'lucide-react';
import { useTutorialStore } from './store';
import { TOUR_STEPS } from './tutorialScript';
import { SpotlightOverlay } from './SpotlightOverlay';
import { useEditorStore } from '../store/editor';

// The manual tour runner. Mounted once in the editor; renders nothing when idle. On `active` it shows
// the current step's spotlight + a prompt box. Most steps advance on the Next button; the one 'select'
// step advances when the user selects a layer. There is NO input-lock and NO timer - the user drives
// every step, and can leave the editor be or interact with it (they must, to select a layer).
export function TutorialRunner() {
  const active = useTutorialStore((s) => s.active);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const selectedCount = useEditorStore((s) => s.selection.selectedIds.length);

  const step = active ? TOUR_STEPS[stepIndex] : undefined;
  // The 'select' step only fires AFTER we've seen the selection cleared (armed), so a pre-existing
  // selection can't skip the step the instant it appears.
  const selectArmed = useRef(false);

  // End the tour once we advance past the last step.
  useEffect(() => {
    if (active && stepIndex >= TOUR_STEPS.length) useTutorialStore.getState().stop();
  }, [active, stepIndex]);

  // Entering a 'select' step: clear any selection so the user genuinely performs the click.
  useEffect(() => {
    if (!active) return;
    const s = TOUR_STEPS[stepIndex];
    if (s?.advance === 'select') {
      selectArmed.current = false;
      useEditorStore.getState().deselectAll();
    }
  }, [active, stepIndex]);

  // Advance the 'select' step when the user selects a layer (after the clear has landed).
  useEffect(() => {
    if (step?.advance !== 'select') return;
    if (selectedCount === 0) { selectArmed.current = true; return; }
    if (selectArmed.current) useTutorialStore.getState().next();
  }, [step, selectedCount]);

  if (!active || !step) return null;

  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <>
      <SpotlightOverlay target={step.spotlight} />
      <div className="fixed bottom-6 left-1/2 z-[120] w-[min(680px,92vw)] -translate-x-1/2 rounded-xl border border-[#26405f] bg-[#0e1c32]/95 px-5 py-4 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <GraduationCap size={18} className="shrink-0 text-[#f7b500]" />
          <p className="flex-1 text-[13px] leading-relaxed text-slate-100">{step.text}</p>
          {step.advance === 'select' ? (
            <span className="shrink-0 text-[12px] font-medium italic text-slate-400">Waiting for a selection</span>
          ) : (
            <button
              type="button"
              onClick={() => (isLast ? useTutorialStore.getState().stop() : useTutorialStore.getState().next())}
              className="shrink-0 rounded-md bg-[#f7b500] px-4 py-2 text-[12px] font-semibold text-[#0e1c32] transition-colors hover:bg-[#ffc21a]"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
        {/* Always-available exit, so the user is never trapped in the tour. */}
        <button
          type="button"
          onClick={() => useTutorialStore.getState().stop()}
          className="absolute right-2 top-2 text-[10px] text-slate-500 transition-colors hover:text-slate-300"
        >
          Skip
        </button>
      </div>
    </>
  );
}
