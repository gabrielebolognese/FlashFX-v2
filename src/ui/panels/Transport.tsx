import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { Play, Pause, SkipBack, SkipForward, Square, AlertTriangle } from 'lucide-react';

export function Transport() {
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playbackLagging = useTimelineStore((s) => s.playbackLagging);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const stop = useTimelineStore((s) => s.stop);
  const seekTo = useTimelineStore((s) => s.seekTo);
  const scrubTo = useTimelineStore((s) => s.scrubTo);

  const durationFrames = useEditorStore((s) => s.composition.settings.durationFrames);

  return (
    <div className="h-8 min-h-[32px] bg-[#0a1628] border-b border-[#1a2a42]/60 flex items-center px-3 gap-2">
      <button
        onClick={() => { pause(); seekTo(0); }}
        className="text-slate-500 hover:text-slate-200 transition-colors"
      >
        <SkipBack size={14} />
      </button>
      <button
        onClick={() => { if (isPlaying) pause(); else play(); }}
        className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
          isPlaying ? 'bg-[#f7b500]/15 text-[#f7b500]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
        }`}
      >
        {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>
      <button
        onClick={stop}
        className="text-slate-500 hover:text-slate-200 transition-colors"
      >
        <Square size={11} />
      </button>
      <button
        onClick={() => { pause(); seekTo(durationFrames - 1); }}
        className="text-slate-500 hover:text-slate-200 transition-colors"
      >
        <SkipForward size={14} />
      </button>

      <div className="flex-1 mx-3">
        <input
          type="range"
          min={0}
          max={durationFrames - 1}
          value={currentFrame}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="w-full h-[3px] appearance-none bg-[#1a2a42] rounded cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:bg-[#f7b500] [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(247,181,0,0.3)]"
        />
      </div>

      {playbackLagging && (
        <div
          className="flex items-center gap-1 flex-shrink-0 px-1.5 text-[10px] text-amber-400"
          title="Playback is running slower than real time. Preview timing may be inaccurate."
        >
          <AlertTriangle size={12} />
          <span className="hidden sm:inline">Slower than real time</span>
        </div>
      )}

      <span className="text-[10px] font-mono text-slate-500 tabular-nums w-14 text-right">
        {currentFrame}/{durationFrames}
      </span>
    </div>
  );
}
