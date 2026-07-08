import { useRef, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { TrackArea } from './timeline/TrackArea';
import { TrackRow, GhostTrackRow } from './timeline/TrackRow';
import { TimelineZoomControl } from './timeline/TimelineZoomControl';
import { ROW_HEIGHT, VIDEO_ROW_HEIGHT } from './timeline/timeUtils';
import { Film, Scissors, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { Track } from '../../core/types';
import { useContextMenu } from '../context-menu';
import { buildTimelineEmptyMenu } from '../context-menu/menuDefinitions';

const TOOL_SIDEBAR_WIDTH = 32;
const LABEL_COLUMN_WIDTH = 360;
const VERTICAL_SCROLL_SPEED = 1.0;

function getTrackHeight(track: Track): number {
  return track.type === 'video' ? VIDEO_ROW_HEIGHT : ROW_HEIGHT;
}

export function TimelinePanel() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const trimSplit = useEditorStore((s) => s.trimSplit);
  const trimLeft = useEditorStore((s) => s.trimLeft);
  const trimRight = useEditorStore((s) => s.trimRight);
  const trimCutUp = useEditorStore((s) => s.trimCutUp);
  const trimCutDown = useEditorStore((s) => s.trimCutDown);
  const extendToMaxLeft = useEditorStore((s) => s.extendToMaxLeft);
  const extendToMaxRight = useEditorStore((s) => s.extendToMaxRight);

  const scrollY = useTimelineStore((s) => s.scrollY);
  const setScrollY = useTimelineStore((s) => s.setScrollY);
  const { show: showContextMenu } = useContextMenu();

  const allLayers = composition.layers;
  const tracks = [...(composition.tracks || [])].sort((a, b) => a.order - b.order);
  const hasSelection = selection.selectedIds.length > 0;

  const handleTrackSelect = (layerId: string, additive: boolean) => {
    selectLayer(layerId, additive, 'timeline');
  };

  const labelRef = useRef<HTMLDivElement>(null);
  const [labelViewportHeight, setLabelViewportHeight] = useState(0);
  const [, setDragTick] = useState(0);
  const dragSourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setLabelViewportHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalTrackHeight = tracks.reduce((sum, t) => sum + getTrackHeight(t), 0);

  const ghostRowCount = Math.max(0, Math.ceil((labelViewportHeight - totalTrackHeight) / ROW_HEIGHT));

  useEffect(() => {
    const maxScrollY = Math.max(0, totalTrackHeight - labelViewportHeight);
    if (scrollY > maxScrollY) setScrollY(maxScrollY);
  }, [totalTrackHeight, labelViewportHeight, scrollY, setScrollY]);

  const handleLabelWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const maxScrollY = Math.max(0, totalTrackHeight - labelViewportHeight);
    const dy = e.deltaY * VERTICAL_SCROLL_SPEED;
    const next = Math.max(0, Math.min(maxScrollY, scrollY + dy));
    setScrollY(next);
  }, [scrollY, setScrollY, totalTrackHeight, labelViewportHeight]);

  const handleLayerDragStart = (layerId: string, e: React.PointerEvent) => {
    dragSourceIdRef.current = layerId;
    setDragTick((n) => n + 1);
    const onUp = () => {
      dragSourceIdRef.current = null;
      setDragTick((n) => n + 1);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointerup', onUp);
    void e;
  };

  // --- File drag-to-import ---
  const addImage = useEditorStore((s) => s.addImage);
  const addVideo = useEditorStore((s) => s.addVideo);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [fileDragOver, setFileDragOver] = useState(false);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const files = e.dataTransfer.files;
    if (!files.length || !activeProjectId) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        addImage(file, activeProjectId);
      } else if (file.type.startsWith('video/')) {
        addVideo(file, activeProjectId);
      }
    }
  }, [addImage, addVideo, activeProjectId]);

  return (
    <div
      className="flex flex-row h-full min-h-0 bg-[#0a1628] relative"
      onContextMenu={(e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, buildTimelineEmptyMenu()); }}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {fileDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#0a1628]/80 backdrop-blur-sm border-2 border-dashed border-sky-400 rounded-lg m-2">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-sky-400/10 border border-sky-400/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <span className="text-base font-semibold text-sky-400">Drop to Timeline</span>
            <span className="text-xs text-slate-400">Release to add media to the timeline</span>
          </div>
        </div>
      )}
      {/* Left tool sidebar (Premiere-style) */}
      <div
        className="flex-shrink-0 flex flex-col items-center bg-[#081220] border-r border-[#1a2a42]/40"
        style={{ width: TOOL_SIDEBAR_WIDTH }}
      >
        <div className="h-[26px] w-full flex items-center justify-center border-b border-[#1a2a42]/40">
          <Film size={11} className="text-[#f7b500]" />
        </div>

        <div className="flex flex-col items-center gap-0.5 pt-2 pb-2">
          <ToolButton
            icon={<ArrowLeftToLine size={13} />}
            title="Trim Left (Q)"
            onClick={() => trimLeft()}
            disabled={!hasSelection}
          />
          <ToolButton
            icon={<Scissors size={13} />}
            title="Split (S)"
            onClick={() => trimSplit()}
            disabled={!hasSelection}
          />
          <ToolButton
            icon={<ArrowRightToLine size={13} />}
            title="Trim Right (W)"
            onClick={() => trimRight()}
            disabled={!hasSelection}
          />

          <div className="w-5 h-px bg-[#1a2a42] my-1.5" />

          <ToolButton
            icon={<ArrowUpToLine size={13} />}
            title="Cut Up (Shift+S)"
            onClick={() => trimCutUp()}
            disabled={!hasSelection}
          />
          <ToolButton
            icon={<ArrowDownToLine size={13} />}
            title="Cut Down (Alt+S)"
            onClick={() => trimCutDown()}
            disabled={!hasSelection}
          />

          <div className="w-5 h-px bg-[#1a2a42] my-1.5" />

          <ToolButton
            icon={<ChevronsLeft size={13} />}
            title="Extend To Max Left"
            onClick={() => extendToMaxLeft()}
            disabled={selection.selectedIds.length < 2}
          />
          <ToolButton
            icon={<ChevronsRight size={13} />}
            title="Extend To Max Right"
            onClick={() => extendToMaxRight()}
            disabled={selection.selectedIds.length < 2}
          />
        </div>
      </div>

      {/* Timeline body */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="h-[26px] min-h-[26px] flex items-center justify-between px-3 border-b border-[#1a2a42]/40 bg-[#081220]">
          <div className="flex items-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Timeline</span>
            <span className="text-[9px] text-slate-600 ml-2">{tracks.length} tracks</span>
          </div>
          <TimelineZoomControl />
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Ruler row */}
          <div className="flex flex-row flex-shrink-0" style={{ height: 21 }}>
            <div
              className="flex-shrink-0 border-r border-b border-[#1a2a42]/40 bg-[#081220] flex items-center justify-end pr-2"
              style={{ width: LABEL_COLUMN_WIDTH }}
            >
              <span className="text-[8px] text-slate-600 uppercase tracking-wider font-mono">
                Layer Name & Switches
              </span>
            </div>
            <TrackArea layers={allLayers} tracks={tracks} selectedIds={selection.selectedIds} rulerOnly />
          </div>

          {/* Track rows */}
          <div className="flex-1 flex flex-row min-h-0">
            {/* Left: per-layer rows with switches (synced vertical scroll via transform) */}
            <div
              ref={labelRef}
              className="flex-shrink-0 min-h-0 relative overflow-hidden border-r border-[#1a2a42]"
              style={{ width: LABEL_COLUMN_WIDTH }}
              onWheel={handleLabelWheel}
            >
              <div
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${-scrollY}px)`, willChange: 'transform' }}
              >
                {tracks.map((track, trackIndex) => {
                  const trackHeight = getTrackHeight(track);
                  return (
                    <TrackRow
                      key={track.id}
                      track={track}
                      layers={allLayers}
                      selectedIds={selection.selectedIds}
                      isDragging={dragSourceIdRef.current !== null}
                      dragSourceId={dragSourceIdRef.current}
                      height={trackHeight}
                      trackIndex={trackIndex}
                      onDragStart={handleLayerDragStart}
                    />
                  );
                })}
                {Array.from({ length: ghostRowCount }).map((_, i) => (
                  <GhostTrackRow
                    key={`ghost-label-${i}`}
                    label={`N${i + 1}`}
                    height={ROW_HEIGHT}
                    shade={(tracks.length + i) % 2 === 0 ? '#0c1a2d' : '#0a1628'}
                  />
                ))}
              </div>
            </div>

            {/* Right: track clips area */}
            <div className="flex-1 min-w-0">
              <TrackArea
                layers={allLayers}
                tracks={tracks}
                selectedIds={selection.selectedIds}
                ghostRowCount={ghostRowCount}
                onSelect={handleTrackSelect}
              />
            </div>

            {/* Dedicated vertical scrollbar (drives shared scrollY) */}
            <TimelineVerticalScrollbar
              totalHeight={totalTrackHeight}
              viewportHeight={labelViewportHeight}
              scrollY={scrollY}
              setScrollY={setScrollY}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ icon, title, onClick, disabled }: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded transition-all ${
        disabled
          ? 'text-slate-700 cursor-not-allowed'
          : 'text-slate-400 hover:text-yellow-400 hover:bg-[#1a2a42] active:bg-[#1c3155]'
      }`}
    >
      {icon}
    </button>
  );
}

function TimelineVerticalScrollbar({
  totalHeight,
  viewportHeight,
  scrollY,
  setScrollY,
}: {
  totalHeight: number;
  viewportHeight: number;
  scrollY: number;
  setScrollY: (y: number) => void;
}) {
  if (viewportHeight <= 0 || totalHeight <= viewportHeight) return null;

  const maxScrollY = totalHeight - viewportHeight;
  const thumbHeight = Math.max(24, (viewportHeight / totalHeight) * viewportHeight);
  const travel = viewportHeight - thumbHeight;
  const thumbTop = maxScrollY > 0 ? (scrollY / maxScrollY) * travel : 0;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startScroll = scrollY;
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const delta = travel > 0 ? (dy / travel) * maxScrollY : 0;
      setScrollY(Math.max(0, Math.min(maxScrollY, startScroll + delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="flex-shrink-0 w-[10px] bg-[#081220] border-l border-[#1a2a42] relative"
      style={{ height: viewportHeight }}
    >
      <div
        className="absolute left-[2px] right-[2px] rounded-full bg-slate-600/40 hover:bg-slate-500/60 cursor-grab active:cursor-grabbing transition-colors"
        style={{ top: thumbTop, height: thumbHeight }}
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}
