import { Captions, X } from 'lucide-react';
import { useSubtitleReviewStore } from '../../store/subtitleReview';
import { useEditorStore } from '../../store/editor';

// Non-modal panel (top-right) shown after transcription: edit each caption's text, then place. The
// editor stays interactive underneath; timing/style are fixed on the pre-built layers.
export function SubtitleReviewPanel() {
  const open = useSubtitleReviewStore((s) => s.open);
  const layers = useSubtitleReviewStore((s) => s.layers);
  const texts = useSubtitleReviewStore((s) => s.texts);
  const setText = useSubtitleReviewStore((s) => s.setText);
  const place = useSubtitleReviewStore((s) => s.place);
  const cancel = useSubtitleReviewStore((s) => s.cancel);
  const fps = useEditorStore((s) => s.composition.settings.frameRate);

  if (!open) return null;

  const fmt = (frames: number) => {
    const t = frames / fps;
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  };

  return (
    <div className="fixed right-4 top-16 z-[85] w-80 max-h-[70vh] flex flex-col rounded-lg border border-[#26364f] bg-[#0d1524] shadow-2xl shadow-black/50 select-none">
      <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-[#1a2a42]">
        <Captions size={14} className="text-[#f7b500]" />
        <span className="text-[12px] font-semibold text-slate-200">Review subtitles</span>
        <span className="text-[10px] text-slate-500 tabular-nums">{layers.length}</span>
        <button title="Cancel" className="ml-auto p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={cancel}><X size={13} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        <p className="text-[10px] text-slate-500 px-1 pb-1">Edit the transcribed text before placing. Emptied lines are skipped.</p>
        {layers.map((l, i) => (
          <div key={l.id} className="rounded-md bg-[#0e1726] border border-[#1a2a42] px-2 py-1.5">
            <div className="text-[9px] text-slate-600 mb-1 tabular-nums">{fmt(l.inPoint)} → {fmt(l.outPoint)}</div>
            <textarea
              value={texts[i] ?? ''}
              onChange={(e) => setText(i, e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              rows={1}
              className="w-full resize-none bg-transparent text-[12px] text-slate-100 placeholder:text-slate-600 outline-none leading-snug"
              placeholder="(empty)"
            />
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 p-2 border-t border-[#1a2a42]">
        <button onClick={cancel} className="flex-1 py-1.5 rounded text-[11px] text-slate-300 bg-[#122240] hover:bg-[#1a2a42] transition-colors">Cancel</button>
        <button onClick={place} className="flex-1 py-1.5 rounded text-[11px] font-semibold text-[#0e1c32] bg-[#f7b500] hover:bg-[#ffc21a] transition-colors">Place Subtitles</button>
      </div>
    </div>
  );
}
