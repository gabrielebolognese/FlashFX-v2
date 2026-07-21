import { Type, Film, Image, Music, Folder, Square, Volume2, VolumeX, Eye, EyeOff, AlignHorizontalJustifyStart } from 'lucide-react';
import type { Layer, Track, ShapeLayer } from '../../../core/types';
import { useEditorStore } from '../../../store/editor';
import { isTrackCompressed } from '../../../core/trackCompression';

interface TrackRowProps {
  track: Track;
  layers: Layer[];
  selectedIds: string[];
  isDragging: boolean;
  dragSourceId: string | null;
  height: number;
  trackIndex?: number;
  onDragStart: (layerId: string, e: React.PointerEvent) => void;
}

function clipColor(layer: Layer): string {
  if (layer.labelColor) return layer.labelColor;
  switch (layer.type) {
    case 'video': return '#22c55e';
    case 'text': return '#3b82f6';
    case 'image': return '#22c55e';
    case 'audio': return '#f59e0b';
    case 'group': return '#6b7280';
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
    case 'video': return <Film size={11} className="text-cyan-400" />;
    case 'text': return <Type size={11} className="text-blue-400" />;
    case 'image': return <Image size={11} className="text-emerald-400" />;
    case 'audio': return <Music size={11} className="text-amber-400" />;
    case 'group': return <Folder size={11} className="text-slate-400" />;
    case 'shape': return <Square size={11} className="text-rose-400" />;
    default: return <Square size={11} className="text-slate-500" />;
  }
}

function trackPrefix(type: Track['type']): string {
  switch (type) {
    case 'video': return 'V';
    case 'audio': return 'A';
    case 'text': return 'T';
    case 'image': return 'I';
    case 'shape': return 'S';
    case 'group': return 'G';
    default: return 'M';
  }
}

export function TrackRow({
  track, layers, selectedIds, isDragging, dragSourceId, height, trackIndex = 0, onDragStart,
}: TrackRowProps) {
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setHoveredLayer = useEditorStore((s) => s.setHoveredLayer);
  const hoveredLayerId = useEditorStore((s) => s.hoveredLayerId);
  const toggleTrackCompression = useEditorStore((s) => s.toggleTrackCompression);
  const toggleTrackVisibility = useEditorStore((s) => s.toggleTrackVisibility);
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute);

  const compressed = isTrackCompressed(track);

  const trackClips = layers
    .filter((l) => l.trackId === track.id)
    .sort((a, b) => a.inPoint - b.inPoint);

  const trackLabel = `${trackPrefix(track.type)}${track.order + 1}`;

  return (
    <div
      className="border-b border-[#1a2a42] flex items-stretch select-none"
      style={{ height, backgroundColor: trackIndex % 2 === 0 ? '#0c1a2d' : '#0a1628' }}
      data-track-id={track.id}
    >
      {/* Track header (left subsection) */}
      <div
        className="flex items-center gap-1.5 px-2 flex-shrink-0 border-r border-[#1a2a42] bg-[#081220]"
        style={{ width: 84 }}
      >
        <div className="flex-shrink-0">{trackIcon(track.type)}</div>
        <span className="text-[10px] font-mono font-medium text-slate-300 tracking-wide">{trackLabel}</span>
        {trackClips.length > 1 && (
          <span className="text-[8px] text-slate-500 font-mono ml-auto">{trackClips.length}</span>
        )}
      </div>

      {/* Track switches */}
      <div className="flex items-center gap-0.5 px-1.5 flex-shrink-0 border-r border-[#1a2a42]">
        <button
          onClick={() => toggleTrackVisibility(track.id)}
          className={`p-0.5 rounded transition-colors hover:bg-[#1a2a42] ${track.visible ? 'text-[#f7b500]' : 'text-slate-600'}`}
          title={track.visible ? 'Hide track' : 'Show track'}
        >
          {track.visible ? <Eye size={10} /> : <EyeOff size={10} />}
        </button>
        <button
          onClick={() => toggleTrackMute(track.id)}
          className={`p-0.5 rounded transition-colors hover:bg-[#1a2a42] ${track.muted ? 'text-red-400' : 'text-amber-400'}`}
          title={track.muted ? 'Unmute track' : 'Mute track'}
        >
          {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </button>
        <button
          onClick={() => toggleTrackCompression(track.id)}
          className={`p-0.5 rounded transition-colors ${
            compressed
              ? 'text-emerald-400 hover:text-emerald-300'
              : 'text-slate-600 hover:text-slate-400'
          }`}
          title={compressed ? 'Compression on — clips packed gaplessly' : 'Compression off — free positioning'}
        >
          <AlignHorizontalJustifyStart size={10} />
        </button>
      </div>

      {/* Clip chips (right subsection) */}
      <div className={`flex-1 min-w-0 flex items-center gap-1 px-1.5 overflow-x-auto overflow-y-hidden custom-scrollbar ${!track.visible ? 'opacity-35' : ''}`}>
        {trackClips.length === 0 ? (
          <span className="text-[9px] text-slate-700 italic">empty</span>
        ) : (
          trackClips.map((layer) => {
            const isSelected = selectedIds.includes(layer.id);
            const isHovered = hoveredLayerId === layer.id;
            const isDragSource = dragSourceId === layer.id;
            const color = clipColor(layer);
            return (
              <button
                key={layer.id}
                onClick={(e) => {
                  if (isDragging) return;
                  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                  selectLayer(layer.id, additive, 'timeline');
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  onDragStart(layer.id, e);
                }}
                onPointerEnter={() => { if (!isDragging) setHoveredLayer(layer.id); }}
                onPointerLeave={() => { if (!isDragging) setHoveredLayer(null); }}
                className={`flex-shrink-0 flex items-center gap-1 px-1.5 h-[18px] rounded text-[9.5px] font-medium tracking-wide transition-all ${
                  isDragSource
                    ? 'opacity-40'
                    : isSelected
                      ? 'bg-[#1a2438] text-white ring-1 ring-white/40'
                      : isHovered
                        ? 'bg-[#141a24] text-slate-200'
                        : 'bg-[#122240] text-slate-400 hover:bg-[#161c28] hover:text-slate-200'
                }`}
                style={{ maxWidth: 132, cursor: isDragging ? 'grabbing' : 'grab' }}
                title={`${layer.name} · in ${layer.inPoint} · out ${layer.outPoint}`}
              >
                <span
                  className="w-[7px] h-[7px] rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{layer.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

interface GhostTrackRowProps {
  label: string;
  height: number;
  shade: string;
}

export function GhostTrackRow({ label, height, shade }: GhostTrackRowProps) {
  return (
    <div
      className="border-b border-[#1a2a42]/70 flex items-stretch select-none opacity-50"
      style={{ height, backgroundColor: shade }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-2 flex-shrink-0 border-r border-[#1a2a42]"
        style={{ width: 84 }}
      >
        <div className="flex-shrink-0"><Square size={11} className="text-slate-600" /></div>
        <span className="text-[10px] font-mono font-medium text-slate-500 tracking-wide">{label}</span>
      </div>

      {/* Switches — present but disabled */}
      <div className="flex items-center gap-0.5 px-1.5 flex-shrink-0 border-r border-[#1a2a42]">
        <span className="p-0.5 rounded text-slate-700 cursor-not-allowed" title="Track visible (n/a)">
          <Eye size={10} />
        </span>
        <span className="p-0.5 rounded text-slate-700 cursor-not-allowed" title="Mute (n/a)">
          <VolumeX size={10} />
        </span>
        <span className="p-0.5 rounded text-slate-700 cursor-not-allowed" title="Compression (n/a)">
          <AlignHorizontalJustifyStart size={10} />
        </span>
      </div>

      {/* Clip area */}
      <div className="flex-1 min-w-0 flex items-center px-1.5">
        <span className="text-[9px] text-slate-700 italic">empty</span>
      </div>
    </div>
  );
}
