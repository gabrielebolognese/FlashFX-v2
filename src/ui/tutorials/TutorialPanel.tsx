import { X, Play, Sparkles, GraduationCap } from 'lucide-react';
import { useTutorialStore } from '../../store/tutorial';
import { getTutorial } from './registry';

// The single, global, non-modal Tutorial panel. When a panel's "Tutorial: How to use X" button opens
// a tutorial id, this renders a centered floating card: a big 16:9 video placeholder (the real clip
// drops in later), a short "what you can do" write-up, and Close / See example actions. Non-modal: the
// dim backdrop only dims — the card floats above the editor and dismisses on backdrop click or Esc.

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
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-2xl"
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

        <div className="max-h-[80vh] overflow-y-auto">
          {/* 16:9 video placeholder */}
          <div className="relative aspect-video w-full bg-gradient-to-br from-[#0b1320] to-[#131c2e]">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/40">
                <Play size={22} className="ml-0.5 text-accent" />
              </div>
              <span className="text-[11px] font-medium text-slate-400">Video walkthrough coming soon</span>
              <span className="text-[10px] text-slate-600">{def.videoCaption}</span>
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-3 px-4 py-3.5">
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
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-2.5">
          <button
            onClick={close}
            className="rounded-md border border-hairline px-3 py-1.5 text-[11.5px] text-slate-300 transition-colors hover:bg-white/5"
          >
            Close tutorial
          </button>
          <button
            onClick={seeExample}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-medium text-on-accent transition-colors hover:brightness-110"
          >
            <Sparkles size={13} /> {def.exampleLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
