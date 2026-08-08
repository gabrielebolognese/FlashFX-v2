import { useTutorialStore, type TutorialSpeed } from './store';
import { tutorialScript } from './tutorialScript';
import { Play, Pause, SkipForward, Gauge, GraduationCap, Check } from 'lucide-react';

const NEXT_SPEED: Record<TutorialSpeed, TutorialSpeed> = { 1: 2, 2: 4, 4: 1 };

export function NarrationBar() {
  const phase = useTutorialStore((s) => s.phase);
  const chapterIndex = useTutorialStore((s) => s.chapterIndex);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const paused = useTutorialStore((s) => s.paused);
  const speed = useTutorialStore((s) => s.speed);

  if (phase === 'idle') return null;

  const handoff = phase === 'handoff';
  const say = handoff
    ? 'Now it’s yours — drag a layer, scrub the timeline, or hit play. Export is up top when you’re ready.'
    : tutorialScript[chapterIndex]?.steps[stepIndex]?.say ?? '';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[min(720px,92vw)] pointer-events-auto">
      <div className="bg-[#0e1c32]/95 border border-[#26405f] rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden">
        {/* Chapter progress strip */}
        {!handoff && (
          <div className="flex gap-1 px-3 pt-2.5">
            {tutorialScript.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => useTutorialStore.getState().skipToChapter(i)}
                title={ch.title}
                className={`h-1 flex-1 rounded-full transition-colors ${i < chapterIndex ? 'bg-[#f7b500]' : i === chapterIndex ? 'bg-[#f7b500]/70' : 'bg-[#26405f] hover:bg-[#38557a]'}`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          <div className={`shrink-0 ${handoff ? 'text-emerald-400' : 'text-[#f7b500]'}`}>
            {handoff ? <Check size={18} /> : <GraduationCap size={18} />}
          </div>
          <p className="flex-1 text-[13px] leading-snug text-slate-200">{say}</p>

          {handoff ? (
            <button onClick={() => useTutorialStore.getState().stop()} className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#f7b500] hover:bg-[#ffc21a] text-[#0e1c32]">
              Start creating
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-1">
              <button onClick={() => useTutorialStore.getState().setSpeed(NEXT_SPEED[speed])} title="Playback speed" className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] text-slate-400 hover:text-slate-100 hover:bg-white/5">
                <Gauge size={13} />{speed}×
              </button>
              <button onClick={() => (paused ? useTutorialStore.getState().resume() : useTutorialStore.getState().pause())} title={paused ? 'Resume' : 'Pause'} className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/5">
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button onClick={() => useTutorialStore.getState().skipAll()} title="Skip tutorial" className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] text-slate-400 hover:text-slate-100 hover:bg-white/5">
                <SkipForward size={13} />Skip
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
