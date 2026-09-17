import { X, Play, Sparkles, GraduationCap } from 'lucide-react';
import { useTutorialStore } from '../../store/tutorial';
import { getTutorial } from './registry';

// The single, global, non-modal Tutorial panel. When a panel's "Tutorial: How to use X" button opens
// a tutorial id, this renders a centered floating card laid out side-by-side: the big 16:9 video
// placeholder fills the left 2/3 (the real clip drops in later), and the right 1/3 is a column with the
// "what you can do" write-up on top and the Close / See-example buttons split in two along the bottom.
// Non-modal: the dim backdrop only dims - the card floats above the editor and dismisses on backdrop
// click.

export function TutorialPanel() {
  const openId = useTutorialStore((s) => s.openId);
  const close = useTutorialStore((s) => s.close);
  const def = openId ? getTutorial(openId) : undefined;
  if (!def) return null;

  const seeExample = () => {
    try { def.seeExample(); } catch (e) { console.error('[tutorial] see-example failed:', e); }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={close}
      role="dialog"
      aria-label={`Tutorial: ${def.title}`}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
          <GraduationCap size={16} className="text-accent" />
          <span className="flex-1 text-[13px] font-semibold text-slate-100">{def.title}</span>
          <button onClick={close} title="Close" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        {/* Body: video 2/3 on the left, list column 1/3 on the right */}
        <div className="flex min-h-0 flex-row">
          {/* 16:9 video placeholder - left 2/3 */}
          <div className="w-2/3 flex-shrink-0 bg-black">
            <div className="relative aspect-video w-full bg-gradient-to-br from-[#0b1320] to-[#131c2e]">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/40">
                  <Play size={26} className="ml-0.5 text-accent" />
                </div>
                <span className="text-[12px] font-medium text-slate-400">Video walkthrough coming soon</span>
                <span className="text-[10px] text-slate-600">{def.videoCaption}</span>
              </div>
            </div>
          </div>

          {/* Right 1/3: scrollable write-up on top, two buttons split along the bottom */}
          <div className="flex min-h-0 w-1/3 flex-col border-l border-hairline">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
              <p className="text-[12px] leading-relaxed text-slate-300">{def.intro}</p>
              {def.bullets.length > 0 && (
                <ul className="space-y-1.5">
                  {def.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-slate-400">
                      <span className="mt-[3px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/70" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid flex-shrink-0 grid-cols-2 gap-2 border-t border-hairline p-3">
              <button
                onClick={close}
                className="rounded-md border border-hairline px-2 py-1.5 text-[11.5px] text-slate-300 transition-colors hover:bg-white/5"
              >
                Close tutorial
              </button>
              <button
                onClick={seeExample}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-[11.5px] font-medium text-on-accent transition-colors hover:brightness-110"
              >
                <Sparkles size={13} /> {def.exampleLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
