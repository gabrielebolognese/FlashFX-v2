import { useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { useEditorStore } from '../../../store/editor';
import { useTimelineStore } from '../../../store/timeline';
import type { Layer, Track, ShapeLayer } from '../../../core/types';
import { Film, Type, Image, Music, Square, Folder } from 'lucide-react';

const ROW_HEIGHT = 24;
const RULER_HEIGHT = 22;
const LABEL_WIDTH = 140;

function clipColor(layer: Layer): string {
  switch (layer.type) {
    case 'video': return '#22c55e';
    case 'text': return '#3b82f6';
    case 'image': return '#22c55e';
    case 'audio': return '#f59e0b';
    case 'group': return '#6b7280';
    case 'lottieIcon': return '#a78bfa';
    case 'shape': {
      const shape = (layer as ShapeLayer).shape;
      switch (shape.type) {
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

function trackIcon(type: Track['type']) {
  switch (type) {
    case 'video': return <Film size={10} className="text-cyan-400" />;
    case 'text': return <Type size={10} className="text-blue-400" />;
    case 'image': return <Image size={10} className="text-emerald-400" />;
    case 'audio': return <Music size={10} className="text-amber-400" />;
    case 'group': return <Folder size={10} className="text-slate-400" />;
    case 'shape': return <Square size={10} className="text-rose-400" />;
    default: return <Square size={10} className="text-slate-500" />;
  }
}

const ReviewClip = memo(function ReviewClip({
  layer,
  trackWidth,
  durationFrames,
}: {
  layer: Layer;
  trackWidth: number;
  durationFrames: number;
}) {
  const color = clipColor(layer);
  const left = (layer.inPoint / durationFrames) * trackWidth;
  const width = Math.max(2, ((layer.outPoint - layer.inPoint) / durationFrames) * trackWidth);

  return (
    <div
      className="absolute top-[2px] rounded-sm overflow-hidden"
      style={{
        left,
        width,
        height: ROW_HEIGHT - 4,
        backgroundColor: color + '30',
        borderLeft: `2px solid ${color}`,
      }}
    >
      <div className="px-1 py-0.5 text-[8px] text-slate-300 truncate leading-tight h-full flex items-center">
        {layer.name}
      </div>
    </div>
  );
});

const ReviewTrackRow = memo(function ReviewTrackRow({
  track,
  layers,
  durationFrames,
  trackWidth,
}: {
  track: Track;
  layers: Layer[];
  durationFrames: number;
  trackWidth: number;
}) {
  return (
    <div className="flex border-b border-[#16294a]" style={{ height: ROW_HEIGHT }}>
      <div className="flex items-center gap-1.5 px-2 flex-shrink-0 bg-[#0a1628] border-r border-[#1a2a42]" style={{ width: LABEL_WIDTH }}>
        {trackIcon(track.type)}
        <span className="text-[9px] text-slate-500 truncate">{track.name || track.type}</span>
      </div>
      <div className="flex-1 relative">
        {layers.map((layer) => (
          <ReviewClip
            key={layer.id}
            layer={layer}
            trackWidth={trackWidth}
            durationFrames={durationFrames}
          />
        ))}
      </div>
    </div>
  );
});

export const ReviewTimeline = memo(function ReviewTimeline() {
  const composition = useEditorStore((s) => s.composition);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const trackWidthRef = useRef(0);

  const { layers, tracks } = composition;
  const durationFrames = composition.settings.durationFrames;
  const frameRate = composition.settings.frameRate;

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.order - b.order),
    [tracks]
  );

  const layersByTrack = useMemo(() => {
    const map = new Map<string, Layer[]>();
    for (const layer of layers) {
      const trackId = layer.trackId ?? '';
      if (!map.has(trackId)) map.set(trackId, []);
      map.get(trackId)!.push(layer);
    }
    return map;
  }, [layers]);

  // Measure the track area width (excluding label column)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      trackWidthRef.current = rect.width - LABEL_WIDTH;
    });
    observer.observe(container);
    trackWidthRef.current = container.getBoundingClientRect().width - LABEL_WIDTH;
    return () => observer.disconnect();
  }, []);

  // Playhead position update via rAF (no React re-renders)
  useEffect(() => {
    const update = () => {
      rafRef.current = requestAnimationFrame(update);
      const playhead = playheadRef.current;
      if (!playhead) return;
      const frame = useTimelineStore.getState().currentFrame;
      const trackWidth = trackWidthRef.current;
      if (trackWidth <= 0) return;
      const x = LABEL_WIDTH + (frame / durationFrames) * trackWidth;
      playhead.style.transform = `translateX(${x}px)`;
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [durationFrames]);

  // Ruler time marks
  const rulerMarks = useMemo(() => {
    const totalSec = durationFrames / frameRate;
    let interval = 1;
    if (totalSec > 600) interval = 60;
    else if (totalSec > 120) interval = 30;
    else if (totalSec > 60) interval = 10;
    else if (totalSec > 20) interval = 5;
    else if (totalSec > 5) interval = 2;

    const marks: { sec: number; label: string }[] = [];
    for (let s = 0; s <= totalSec; s += interval) {
      const min = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      marks.push({ sec: s, label: min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s` });
    }
    return marks;
  }, [durationFrames, frameRate]);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const trackWidth = rect.width;
    if (trackWidth <= 0) return;
    const frame = Math.round((x / trackWidth) * durationFrames);
    useTimelineStore.getState().scrubTo(Math.max(0, Math.min(frame, durationFrames - 1)));
  }, [durationFrames]);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0e1c32] overflow-hidden relative">
      {/* Ruler */}
      <div className="flex flex-shrink-0 border-b border-[#1a2a42]" style={{ height: RULER_HEIGHT }}>
        <div className="flex-shrink-0 bg-[#0a1628] border-r border-[#1a2a42] flex items-center px-2" style={{ width: LABEL_WIDTH }}>
          <span className="text-[9px] text-slate-500 font-medium">Review Timeline</span>
        </div>
        <div
          className="flex-1 relative cursor-pointer hover:bg-white/[0.02]"
          onClick={handleRulerClick}
        >
          {rulerMarks.map((mark) => {
            const percent = (mark.sec * frameRate) / durationFrames * 100;
            return (
              <div
                key={mark.sec}
                className="absolute top-0 h-full flex flex-col items-center justify-end pb-0.5"
                style={{ left: `${percent}%` }}
              >
                <div className="w-px h-2.5 bg-slate-700 mb-0.5" />
                <span className="text-[8px] text-slate-600">{mark.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sortedTracks.map((track) => (
          <ReviewTrackRow
            key={track.id}
            track={track}
            layers={layersByTrack.get(track.id) ?? []}
            durationFrames={durationFrames}
            trackWidth={trackWidthRef.current || 600}
          />
        ))}
        {sortedTracks.length === 0 && (
          <div className="flex items-center justify-center h-full text-[10px] text-slate-600">
            No tracks in project
          </div>
        )}
      </div>

      {/* Playhead */}
      <div
        ref={playheadRef}
        className="absolute top-0 bottom-0 w-px bg-[#f7b500] pointer-events-none z-10"
        style={{ transform: `translateX(${LABEL_WIDTH}px)` }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#f7b500]" />
      </div>
    </div>
  );
});
