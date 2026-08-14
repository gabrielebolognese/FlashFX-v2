import { Loader2, X, AlertTriangle, Captions } from 'lucide-react';
import { useAutoCaptionStore } from '../../store/autoCaption';
import { usePanelStore } from '../../store/panels';

// Small, non-blocking indicator for the batch auto-caption flow (bottom-right). Shows model-download
// progress on first run, then "Transcribing clip N of M…", with cancel. Clicking it opens the Tasks
// panel for the full detailed log. The editor stays interactive underneath. Also surfaces a
// dismissible error (e.g. no speech, or the model failed to load offline).
export function AutoCaptionProgress() {
  const active = useAutoCaptionStore((s) => s.active);
  const label = useAutoCaptionStore((s) => s.label);
  const download = useAutoCaptionStore((s) => s.download);
  const error = useAutoCaptionStore((s) => s.error);
  const cancel = useAutoCaptionStore((s) => s.cancel);
  const dismissError = useAutoCaptionStore((s) => s.dismissError);
  const openTasks = usePanelStore((s) => s.openTasks);

  if (!active && !error) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[90] w-72 rounded-lg border border-[#26364f] bg-[#0d1524] shadow-2xl shadow-black/50 p-3 select-none cursor-pointer hover:border-[#33456a]"
      onClick={openTasks}
      title="Open Tasks for the full log"
    >
      {error ? (
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-slate-200">Auto-caption failed</div>
            <div className="text-[11px] text-slate-400 leading-snug mt-0.5 break-words">{error}</div>
          </div>
          <button title="Dismiss" onClick={(e) => { e.stopPropagation(); dismissError(); }} className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5"><X size={12} /></button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Captions size={14} className="text-accent flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[12px] text-slate-200 truncate">{label || 'Auto-captioning…'}</span>
            <Loader2 size={13} className="text-slate-500 animate-spin flex-shrink-0" />
            <button title="Cancel" onClick={(e) => { e.stopPropagation(); cancel(); }} className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5"><X size={12} /></button>
          </div>
          {download && (
            <div className="mt-2 h-1 rounded bg-surface-3 overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(2, Math.min(100, download.progress))}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
