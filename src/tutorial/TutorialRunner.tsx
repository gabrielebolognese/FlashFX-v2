import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { GraduationCap } from 'lucide-react';
import { useTutorialStore } from './store';
import { TOUR_STEPS } from './tutorialScript';
import { SpotlightOverlay } from './SpotlightOverlay';
import { useSpotlightRect, type SpotRect } from './spotlightRect';
import { useEditorStore } from '../store/editor';

// The manual tour runner. Mounted once in the editor; renders nothing when idle. On `active` it shows
// the current step's spotlight + a prompt box positioned right next to the spotlit region (so the eye
// stays where the highlight is). Most steps advance on the Next button; the one 'select' step advances
// when the user selects a layer. No input-lock, no timer - the user drives every step.

const GAP = 14; // space between the spotlight cutout and the box
const MARGIN = 12; // keep the box this far from the viewport edges

// Pick a box position adjacent to the target: below -> above -> right -> left, else a clamped below.
// Horizontally the box centres on the target (vertically for the side placements), always clamped
// on-screen. Uses the box's measured size so it never runs off the edge or overlaps the cutout.
function placeBox(rect: SpotRect, bw: number, bh: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const hLeft = clamp(cx - bw / 2, MARGIN, vw - bw - MARGIN); // centred-on-target, clamped
  const vTop = clamp(cy - bh / 2, MARGIN, vh - bh - MARGIN);

  if (rect.y + rect.h + GAP + bh <= vh - MARGIN) return { left: hLeft, top: rect.y + rect.h + GAP }; // below
  if (rect.y - GAP - bh >= MARGIN) return { left: hLeft, top: rect.y - GAP - bh }; // above
  if (rect.x + rect.w + GAP + bw <= vw - MARGIN) return { left: rect.x + rect.w + GAP, top: vTop }; // right
  if (rect.x - GAP - bw >= MARGIN) return { left: rect.x - GAP - bw, top: vTop }; // left
  return { left: hLeft, top: clamp(rect.y + rect.h + GAP, MARGIN, vh - bh - MARGIN) }; // clamped fallback
}

export function TutorialRunner() {
  const active = useTutorialStore((s) => s.active);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const selectedCount = useEditorStore((s) => s.selection.selectedIds.length);

  const step = active ? TOUR_STEPS[stepIndex] : undefined;
  const rect = useSpotlightRect(step?.spotlight);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

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

  // Position the box next to the spotlight. useLayoutEffect measures the rendered box and places it
  // before paint, so it lands beside the target without a flash. Falls back to bottom-centre when the
  // target isn't found (rect null).
  useLayoutEffect(() => {
    if (!rect || !boxRef.current) { setPos(null); return; }
    const b = boxRef.current.getBoundingClientRect();
    setPos(placeBox(rect, b.width, b.height));
  }, [rect, stepIndex, active]);

  if (!active || !step) return null;

  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { left: '50%', bottom: 24, transform: 'translateX(-50%)' };

  return (
    <>
      <SpotlightOverlay target={step.spotlight} />
      <div
        ref={boxRef}
        style={style}
        className="fixed z-[120] w-[340px] max-w-[92vw] rounded-xl border border-[#26405f] bg-[#0e1c32]/95 p-4 shadow-2xl backdrop-blur-sm transition-[left,top] duration-300 ease-out"
      >
        <div className="flex items-start gap-2.5">
          <GraduationCap size={16} className="mt-0.5 shrink-0 text-[#f7b500]" />
          <p className="text-[13px] leading-relaxed text-slate-100">{step.text}</p>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => useTutorialStore.getState().stop()}
            className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
          >
            Skip
          </button>
          {step.advance === 'select' ? (
            <span className="text-[12px] font-medium italic text-slate-400">Waiting for a selection</span>
          ) : (
            <button
              type="button"
              onClick={() => (isLast ? useTutorialStore.getState().stop() : useTutorialStore.getState().next())}
              className="rounded-md bg-[#f7b500] px-4 py-1.5 text-[12px] font-semibold text-[#0e1c32] transition-colors hover:bg-[#ffc21a]"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
