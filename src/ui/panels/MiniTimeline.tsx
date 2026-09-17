import { useRef, useState } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import type { Layer, ShapeLayer } from '../../core/types';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';

// Compact timeline for the Starter editor (sits under the Inspector). Mirrors the full timeline: tracks
// as striped rows, clips time-positioned and colored the SAME way (clipColor), selectable + horizontally
// draggable (moveClipInTime), a ruler, and a playhead. No layer names. Reuses the timeline store so it
// stays in sync; scrub by clicking/dragging the ruler.

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Same clip colors as the full timeline (TrackRow.clipColor): honor labelColor, else per-type/shape.
function clipColor(layer: Layer): string {
  if (layer.labelColor) return layer.labelColor;
  switch (layer.type) {
    case 'video': return '#22c55e';
    case 'text': return '#3b82f6';
    case 'image': return '#22c55e';
    case 'audio': return '#f59e0b';
    case 'group': return '#6b7280';
    case 'camera': return '#eab308';
    case 'shape': {
      switch ((layer as ShapeLayer).shape.type) {
        case 'rectangle': return '#ef4444';
        case 'circle': return '#22c55e';
        case 'star': return '#eab308';
        case 'polygon': return '#f97316';
        default: return '#6b7280';
      }
    }
    default: return '#6b7280';
  }
}

const ROW_H = 20; // double the previous compact bar height, matching the full timeline's clip feel

export function MiniTimeline() {
  const layers = useEditorStore((s) => s.composition.layers);
  const tracks = useEditorStore((s) => s.composition.tracks);
  const durationFrames = useEditorStore((s) => s.composition.settings.durationFrames);
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const moveClipInTime = useEditorStore((s) => s.moveClipInTime);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const seekTo = useTimelineStore((s) => s.seekTo);

  const total = Math.max(1, durationFrames);
  const laneRef = useRef<HTMLDivElement>(null);
  // Live drag preview: { layerId, inPoint } while dragging a clip (committed on release).
  const [drag, setDrag] = useState<{ layerId: string; inPoint: number } | null>(null);

  const laneWidth = () => laneRef.current?.getBoundingClientRect().width ?? 1;

  const seekFromClientX = (clientX: number) => {
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    seekTo(Math.round(clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * total));
  };

  const onRulerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isPlaying) pause();
    seekFromClientX(e.clientX);
    const move = (ev: PointerEvent) => seekFromClientX(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onClipDown = (e: React.PointerEvent, layer: Layer) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // don't scrub
    e.preventDefault();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    selectLayer(layer.id, additive, 'timeline');
    const startX = e.clientX;
    const startIn = layer.inPoint;
    const dur = Math.max(1, layer.outPoint - layer.inPoint);
    const fpx = total / Math.max(1, laneWidth()); // frames per pixel at this width
    let moved = false;
    const move = (ev: PointerEvent) => {
      const delta = Math.round((ev.clientX - startX) * fpx);
      if (delta !== 0) moved = true;
      const newIn = clamp(startIn + delta, 0, Math.max(0, total - dur));
      setDrag({ layerId: layer.id, inPoint: newIn });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag((d) => {
        if (moved && d && d.layerId === layer.id && d.inPoint !== startIn) moveClipInTime(layer.id, d.inPoint);
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const orderedTracks = [...tracks].sort((a, b) => b.order - a.order); // top track first, like the timeline
  const playheadPct = (currentFrame / total) * 100;

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-hairline bg-surface-1">
      {/* Transport */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-hairline px-2 py-1">
        <button onClick={() => (isPlaying ? pause() : play())} title={isPlaying ? 'Pause' : 'Play'} className="flex h-5 w-5 items-center justify-center rounded text-accent hover:bg-white/5">
          {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        <button onClick={() => seekTo(0)} title="Go to start" className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/5 hover:text-slate-200">
          <SkipBack size={12} />
        </button>
        <span className="ml-auto text-[9px] tabular-nums text-slate-500">{currentFrame} / {total}</span>
      </div>

      {/* Ruler + tracks share one horizontal lane so time positions line up. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div ref={laneRef} className="relative">
          {/* Ruler (click/drag to scrub) */}
          <div
            onPointerDown={onRulerDown}
            className="relative h-4 cursor-ew-resize select-none border-b border-hairline bg-[#0b1424]"
            style={{ touchAction: 'none' }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f} className="absolute top-0 text-[8px] tabular-nums text-slate-600" style={{ left: `calc(${f * 100}% + 2px)`, transform: f === 1 ? 'translateX(-100%)' : undefined }}>
                {Math.round(f * total)}
              </span>
            ))}
          </div>

          {/* Track rows: striped, with time-positioned clips. */}
          {orderedTracks.map((track, i) => {
            const trackClips = layers.filter((l) => l.trackId === track.id);
            return (
              <div
                key={track.id}
                className="relative border-b border-hairline"
                style={{ height: ROW_H, backgroundColor: i % 2 === 0 ? '#080f1c' : '#0a1424' }}
              >
                {trackClips.map((layer) => {
                  const inF = drag && drag.layerId === layer.id ? drag.inPoint : layer.inPoint;
                  const dur = Math.max(1, layer.outPoint - layer.inPoint);
                  const isSel = selectedIds.includes(layer.id);
                  return (
                    <div
                      key={layer.id}
                      onPointerDown={(e) => onClipDown(e, layer)}
                      title={`${layer.name} · in ${layer.inPoint} · out ${layer.outPoint}`}
                      className={`absolute top-[2px] bottom-[2px] cursor-grab select-none ${isSel ? 'ring-1 ring-white/70 z-10' : ''}`}
                      style={{
                        left: `${(inF / total) * 100}%`,
                        width: `${Math.max(1, (dur / total) * 100)}%`,
                        backgroundColor: clipColor(layer),
                        opacity: drag && drag.layerId === layer.id ? 0.75 : 1,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          {orderedTracks.length === 0 && <div className="px-1 py-2 text-center text-[9px] text-slate-600">No layers yet</div>}

          {/* Playhead across ruler + tracks. */}
          <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-accent" style={{ left: `${playheadPct}%` }}>
            <div className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
