import { useRef } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';

// Compact timeline for the Starter editor (sits under the Inspector). Gives the one thing Starter was
// missing: a way to scrub / roll back after playback starts. Shows each layer's clip span as a bar
// (no names) plus a playhead, and the core transport (play/pause, go to start). Click or drag anywhere
// on the track to seek. Reuses the same timeline store as the full timeline, so it stays in sync.

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// A soft per-type tint so the bars read at a glance without labels.
const TYPE_TINT: Record<string, string> = {
  shape: 'bg-emerald-400/40',
  text: 'bg-sky-400/40',
  video: 'bg-violet-400/40',
  image: 'bg-amber-400/40',
  audio: 'bg-rose-400/40',
};

export function MiniTimeline() {
  const layers = useEditorStore((s) => s.composition.layers);
  const durationFrames = useEditorStore((s) => s.composition.settings.durationFrames);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const seekTo = useTimelineStore((s) => s.seekTo);

  const total = Math.max(1, durationFrames);
  const trackRef = useRef<HTMLDivElement>(null);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    seekTo(Math.round(frac * total));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isPlaying) pause(); // scrubbing while playing is jarring; pause first (matches most editors)
    seekFromClientX(e.clientX);
    const move = (ev: PointerEvent) => seekFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const playheadPct = (currentFrame / total) * 100;

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-hairline bg-surface-1">
      {/* Transport */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-hairline px-2 py-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          title={isPlaying ? 'Pause' : 'Play'}
          className="flex h-5 w-5 items-center justify-center rounded text-accent hover:bg-white/5"
        >
          {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        <button
          onClick={() => seekTo(0)}
          title="Go to start"
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/5 hover:text-slate-200"
        >
          <SkipBack size={12} />
        </button>
        <span className="ml-auto text-[9px] tabular-nums text-slate-500">{currentFrame} / {total}</span>
      </div>

      {/* Track: clip bars (no names) + playhead. Click/drag to scrub. */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        className="relative min-h-0 flex-1 cursor-ew-resize select-none overflow-y-auto"
        style={{ touchAction: 'none' }}
      >
        <div className="flex flex-col gap-[2px] p-1">
          {layers.length === 0 && (
            <div className="px-1 py-2 text-center text-[9px] text-slate-600">No layers yet</div>
          )}
          {layers.map((l) => {
            const inF = clamp(l.inPoint ?? 0, 0, total);
            const outF = clamp(l.outPoint ?? total, inF, total);
            const left = (inF / total) * 100;
            const width = Math.max(1.5, ((outF - inF) / total) * 100);
            return (
              <div key={l.id} className="relative h-2.5">
                <div
                  className={`absolute top-0 h-full rounded-sm ${TYPE_TINT[l.type] ?? 'bg-slate-400/30'}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={l.name}
                />
              </div>
            );
          })}
        </div>
        {/* Playhead spanning the whole track. */}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${playheadPct}%` }}>
          <div className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
