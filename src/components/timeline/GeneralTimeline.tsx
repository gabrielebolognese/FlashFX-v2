import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight, Lock, Volume2, VolumeX, Scissors, EyeOff, Bookmark, CreditCard as Edit, Magnet, ChevronDown, Music, Film } from 'lucide-react';
import { DesignElement } from '../../types/design';
import { useAnimation, usePlayback } from '../../animation-engine';
import ClipContextMenu from './ClipContextMenu';
import ClipSpeedDurationModal from './ClipSpeedDurationModal';
import ClipRenameModal from './ClipRenameModal';
import MarkerEditModal from './MarkerEditModal';
import PlayheadIndicator from './PlayheadIndicator';
import { TimelineMarker } from '../../animation-engine/types';
import { getAllElementsFlat } from '../../utils/groupUtils';
import { useAudio } from '../../audio/AudioContext';
import { useVideo } from '../../video/VideoContext';
import { useUIStore } from '../../store/uiStore';
import { buildClipSources, calculateMoveSnap, calculateSnap, calculateProximityThreshold, renderSnapOverlay } from '../../engine/timeline/TimelineSnapEngine';
import type { SnapSource } from '../../engine/timeline/TimelineSnapEngine';
import { formatTimeCode } from '../../utils/formatTimeCode';

interface GeneralTimelineProps {
  elements: DesignElement[];
  compactMode?: boolean;
  selectedCanvasElements?: string[];
  onAudioClipSelect?: () => void;
  /** Called when timeline clip selection changes — sync canvas and layers panel */
  onSelectClips?: (elementIds: string[]) => void;
  /** Called when clips are deleted — remove the corresponding canvas elements */
  onDeleteClips?: (elementIds: string[]) => void;
}

const SNAP_THRESHOLD = 0.2;
const LAYOUT_ZOOM = 0.8;

const WaveformDisplay: React.FC<{ peaks: number[]; muted: boolean }> = ({ peaks, muted }) => {
  if (peaks.length === 0) return null;
  const n = peaks.length;
  const topPts = peaks.map((p, i) => `${i},${(0.5 - p * 0.44).toFixed(4)}`).join(' ');
  const botPts = [...peaks].reverse().map((p, i) => `${n - 1 - i},${(0.5 + p * 0.44).toFixed(4)}`).join(' ');
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${n} 1`}
      preserveAspectRatio="none"
    >
      <polygon
        points={`${topPts} ${botPts}`}
        fill={muted ? 'rgba(156,163,175,0.3)' : 'rgba(74,222,128,0.35)'}
      />
    </svg>
  );
};
const SNAP_GRID = 0.125; // 1/8 second grid

/** Pure function: applies delta seconds to a set of clips, clamped so none goes before 0 */
function applyMultiMoveDelta(
  originals: Map<string, { clipStart: number; clipDuration: number }>,
  rawDelta: number,
): { delta: number; results: Map<string, { clipStart: number; clipDuration: number }> } {
  let minStart = Infinity;
  originals.forEach(({ clipStart }) => { if (clipStart < minStart) minStart = clipStart; });
  const clampedDelta = Math.max(-minStart, rawDelta);
  const results = new Map<string, { clipStart: number; clipDuration: number }>();
  originals.forEach((orig, id) => {
    results.set(id, { clipStart: orig.clipStart + clampedDelta, clipDuration: orig.clipDuration });
  });
  return { delta: clampedDelta, results };
}

/** Pure function: applies resize delta to the start or end edge of all selected clips */
function applyMultiResizeDelta(
  originals: Map<string, { clipStart: number; clipDuration: number }>,
  edge: 'left' | 'right',
  rawDelta: number,
  minDuration: number,
): Map<string, { clipStart: number; clipDuration: number }> {
  if (edge === 'left') {
    let maxStartDelta = Infinity;
    originals.forEach(({ clipStart, clipDuration }) => {
      const maxD = clipDuration - minDuration;
      if (maxD < maxStartDelta) maxStartDelta = maxD;
    });
    const clampedDelta = Math.min(rawDelta, maxStartDelta);
    const adjustedDelta = Math.max(-Infinity, clampedDelta);
    const results = new Map<string, { clipStart: number; clipDuration: number }>();
    originals.forEach((orig, id) => {
      const newStart = Math.max(0, orig.clipStart + adjustedDelta);
      const actualDelta = newStart - orig.clipStart;
      results.set(id, { clipStart: newStart, clipDuration: Math.max(minDuration, orig.clipDuration - actualDelta) });
    });
    return results;
  } else {
    let maxDurationIncrease = Infinity;
    originals.forEach(({ clipDuration }) => {
      const minIncrease = minDuration - clipDuration;
      if (minIncrease > -maxDurationIncrease) maxDurationIncrease = Math.max(rawDelta, minIncrease);
    });
    const results = new Map<string, { clipStart: number; clipDuration: number }>();
    originals.forEach((orig, id) => {
      results.set(id, { clipStart: orig.clipStart, clipDuration: Math.max(minDuration, orig.clipDuration + rawDelta) });
    });
    return results;
  }
}

type DragState =
  | {
      type: 'move';
      id: string;
      startClientX: number;
      originalStart: number;
      originalDuration: number;
      pixPerSec: number;
      /** Multi-clip originals: elementId → { clipStart, clipDuration } */
      multiOriginals?: Map<string, { clipStart: number; clipDuration: number }>;
    }
  | {
      type: 'resize';
      id: string;
      edge: 'left' | 'right';
      startClientX: number;
      originalStart: number;
      originalDuration: number;
      pixPerSec: number;
      /** Multi-clip originals for resize */
      multiOriginals?: Map<string, { clipStart: number; clipDuration: number }>;
    };

type AudioDragState =
  | { type: 'move'; id: string; startClientX: number; originalStart: number; originalEnd: number; pixPerSec: number }
  | { type: 'resize'; id: string; edge: 'left' | 'right'; startClientX: number; originalStart: number; originalEnd: number; pixPerSec: number };

type VideoDragState =
  | { type: 'move'; id: string; startClientX: number; originalStart: number; originalEnd: number; pixPerSec: number }
  | { type: 'resize'; id: string; edge: 'left' | 'right'; startClientX: number; originalStart: number; originalEnd: number; pixPerSec: number };

const snapToGrid = (value: number): number =>
  Math.round(value / SNAP_GRID) * SNAP_GRID;

const GeneralTimeline: React.FC<GeneralTimelineProps> = ({ elements, compactMode = false, selectedCanvasElements = [], onAudioClipSelect, onSelectClips, onDeleteClips }) => {
  const { state, selectClip, selectClips, batchUpdateClips, updateClip, initAnimation, splitClip, splitClips, deleteAllKeyframes, selectKeyframes, removeAnimation, addMarker, updateMarker, deleteMarker, toggleSnapToMarkers, getMarkerAtTime, setDuration } = useAnimation();
  const { play, pause, stop, togglePlay, seekTo, seekToStart, seekToEnd, stepForward, stepBackward, isPlaying, currentTime, currentFrame, totalFrames, duration, fps } = usePlayback();

  // suppress unused warnings for play/pause (used elsewhere in original)
  void play; void pause;

  const { pixelsPerSecond, selectedClipId, selectedClipIds, markers, snapToMarkers } = state.timeline;

  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeResizeId, setActiveResizeId] = useState<string | null>(null);
  const [activeAudioDragId, setActiveAudioDragId] = useState<string | null>(null);
  const [activeVideoDragId, setActiveVideoDragId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [speedDurationModal, setSpeedDurationModal] = useState<{ clipId: string; clipName: string; duration: number; speed: number } | null>(null);
  const [renameModal, setRenameModal] = useState<{ clipId: string; currentName: string } | null>(null);
  const [clipboardClip, setClipboardClip] = useState<{ elementId: string; animation: any } | null>(null);
  const [editingMarker, setEditingMarker] = useState<TimelineMarker | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef = useRef<HTMLDivElement>(null);
  const tracksPlayheadRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [playheadIsSnapped, setPlayheadIsSnapped] = useState(false);

  const { audioState, importAudio, updateTrack: updateAudioTrack, updateClip: updateAudioClip, removeClip: removeAudioClip, selectedAudioClipId, setSelectedAudioClipId } = useAudio();
  const audioTracks = audioState.trackOrder.map((id) => audioState.tracks[id]).filter(Boolean);

  const { videoState, updateClip: updateVideoClip, removeClip: removeVideoClip, selectedVideoClipId, setSelectedVideoClipId } = useVideo();
  const videoTracks = videoState.trackOrder.map((id) => videoState.tracks[id]).filter(Boolean);

  const clipSnapEnabled = useUIStore((s) => s.clipSnapEnabled);
  const setClipSnapEnabled = useUIStore((s) => s.setClipSnapEnabled);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        const ids = selectedClipIdsRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          selectClips([]);
          onSelectClips?.([]);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedClipIdsRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          for (const id of ids) removeAnimation(id);
          selectClips([]);
          onSelectClips?.([]);
          onDeleteClips?.(ids);
          return;
        }
        if (selectedAudioClipId) {
          e.preventDefault();
          e.stopPropagation();
          removeAudioClip(selectedAudioClipId);
          setSelectedAudioClipId(null);
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const ids = selectedClipIdsRef.current;
        if (ids.length === 0) return;
        e.preventDefault();
        const nudgeFrames = e.shiftKey ? 10 : 1;
        const nudgeSec = (nudgeFrames / fps) * (e.key === 'ArrowLeft' ? -1 : 1);
        const batchUpdates: Array<{ elementId: string; updates: Partial<import('../../animation-engine/types').ElementAnimation> }> = [];
        for (const id of ids) {
          const anim = animationsRef.current[id];
          if (anim) {
            const newStart = Math.max(0, anim.clipStart + nudgeSec);
            batchUpdates.push({ elementId: id, updates: { clipStart: newStart } });
          }
        }
        if (batchUpdates.length > 0) batchUpdateClips(batchUpdates);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedAudioClipId, removeAudioClip, setSelectedAudioClipId, selectClips, removeAnimation, batchUpdateClips, onSelectClips, onDeleteClips, fps]);

  const handleAudioFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await importAudio(file);
  }, [importAudio]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Alt') altKeyPressedRef.current = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') altKeyPressedRef.current = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const buildSnapSources = useCallback((activeClipId: string): SnapSource[] => {
    const audioTrackClipIds = audioTrackOrderRef.current.map(
      (id) => audioTracksDataRef.current[id]?.clipIds ?? [],
    );
    const videoTrackClipIds = videoTrackOrderRef.current.map(
      (id) => videoTracksDataRef.current[id]?.clipIds ?? [],
    );
    return buildClipSources(
      animationsRef.current,
      audioClipsRef.current,
      audioTrackClipIds,
      videoClipsRef.current,
      videoTrackClipIds,
      activeClipId,
    );
  }, []);

  const clearSnapOverlay = useCallback(() => {
    if (snapOverlayRef.current) snapOverlayRef.current.innerHTML = '';
  }, []);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (rulerRef.current) rulerRef.current.scrollLeft = target.scrollLeft;
    if (labelsRef.current) labelsRef.current.scrollTop = target.scrollTop;
  }, []);

  const dragRef = useRef<DragState | null>(null);
  /** Set to true in the drag mouseup; read+cleared in handleClipClick to suppress the synthetic click that fires after mouseup */
  const dragJustEndedRef = useRef(false);
  const audioDragRef = useRef<AudioDragState | null>(null);
  const videoDragRef = useRef<VideoDragState | null>(null);
  const rafRef = useRef<number>(0);
  const clipElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const audioClipElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const videoClipElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  const durationRef = useRef(duration);
  const findNearestMarkerRef = useRef<(time: number) => number | null>(() => null);
  const snapSourcesRef = useRef<SnapSource[]>([]);
  const altKeyPressedRef = useRef(false);
  const snapOverlayRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(currentTime);
  const clipSnapEnabledRef = useRef(clipSnapEnabled);
  const animationsRef = useRef(state.animations);
  const audioClipsRef = useRef(audioState.clips);
  const audioTrackOrderRef = useRef(audioState.trackOrder);
  const audioTracksDataRef = useRef(audioState.tracks);
  const videoClipsRef = useRef(videoState.clips);
  const videoTrackOrderRef = useRef(videoState.trackOrder);
  const videoTracksDataRef = useRef(videoState.tracks);
  const markersRef = useRef(markers);
  /** Last individually clicked clip for Shift+click range selection */
  const lastClickedClipRef = useRef<string | null>(null);
  /** Current selectedClipIds as a ref for use inside event handlers without stale closure */
  const selectedClipIdsRef = useRef<string[]>(selectedClipIds);

  useEffect(() => { pixelsPerSecondRef.current = pixelsPerSecond; }, [pixelsPerSecond]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { clipSnapEnabledRef.current = clipSnapEnabled; }, [clipSnapEnabled]);
  useEffect(() => { animationsRef.current = state.animations; }, [state.animations]);
  useEffect(() => { audioClipsRef.current = audioState.clips; }, [audioState.clips]);
  useEffect(() => { audioTrackOrderRef.current = audioState.trackOrder; }, [audioState.trackOrder]);
  useEffect(() => { audioTracksDataRef.current = audioState.tracks; }, [audioState.tracks]);
  useEffect(() => { videoClipsRef.current = videoState.clips; }, [videoState.clips]);
  useEffect(() => { videoTrackOrderRef.current = videoState.trackOrder; }, [videoState.trackOrder]);
  useEffect(() => { videoTracksDataRef.current = videoState.tracks; }, [videoState.tracks]);
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { selectedClipIdsRef.current = selectedClipIds; }, [selectedClipIds]);

  const setClipRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) clipElsRef.current.set(id, el);
    else clipElsRef.current.delete(id);
  }, []);

  const setAudioClipRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) audioClipElsRef.current.set(id, el);
    else audioClipElsRef.current.delete(id);
  }, []);

  const setVideoClipRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) videoClipElsRef.current.set(id, el);
    else videoClipElsRef.current.delete(id);
  }, []);

  const displayElements = useMemo(() => {
    const result: Array<{ element: DesignElement; depth: number; parentId?: string }> = [];
    const processElement = (element: DesignElement, depth: number = 0, parentId?: string) => {
      result.push({ element, depth, parentId });
      if (element.type === 'group' && element.children && !collapsedGroups.has(element.id)) {
        element.children.forEach(child => processElement(child, depth + 1, element.id));
      }
    };
    elements.forEach(element => processElement(element));
    return result;
  }, [elements, collapsedGroups]);

  useEffect(() => {
    const allElements = getAllElementsFlat(elements);
    allElements.forEach((element) => {
      if (!animationsRef.current[element.id]) initAnimation(element.id);
    });
  }, [elements, initAnimation]);

  useEffect(() => {
    const BUFFER = 5;
    let maxEnd = 0;
    Object.values(state.animations).forEach((anim) => {
      const clipEnd = (anim.clipStart ?? 0) + (anim.clipDuration ?? 0);
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    });
    audioTracks.forEach((track) => {
      track.clipIds.forEach((clipId) => {
        const clip = audioState.clips[clipId];
        if (clip && clip.endTime > maxEnd) maxEnd = clip.endTime;
      });
    });
    videoTracks.forEach((track) => {
      track.clipIds.forEach((clipId) => {
        const clip = videoState.clips[clipId];
        if (clip && clip.endTime > maxEnd) maxEnd = clip.endTime;
      });
    });
    if (maxEnd + BUFFER > duration) {
      setDuration(maxEnd + BUFFER);
    }
  }, [state.animations, audioTracks, audioState.clips, videoTracks, videoState.clips, duration, setDuration]);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    if (rulerRef.current && pixelsPerSecond > 0) {
      const rect = rulerRef.current.getBoundingClientRect();
      const scrollLeft = rulerRef.current.scrollLeft;
      const x = (e.clientX - rect.left) / LAYOUT_ZOOM + scrollLeft;
      const time = x / pixelsPerSecond;
      seekTo(Math.max(0, Math.min(time, duration)));
    }
  }, [pixelsPerSecond, duration, seekTo]);

  const findNearestMarker = useCallback((time: number): number | null => {
    if (!snapToMarkers) return null;
    let nearestTime: number | null = null;
    let minDistance = SNAP_THRESHOLD;
    markers.forEach(marker => {
      const distance = Math.abs(time - marker.time);
      if (distance < minDistance) { minDistance = distance; nearestTime = marker.time; }
    });
    return nearestTime;
  }, [snapToMarkers, markers]);
  findNearestMarkerRef.current = findNearestMarker;

  const resolvePlayheadSnapTime = useCallback((rawTime: number): { time: number; didSnap: boolean } => {
    const pps = pixelsPerSecondRef.current;
    const threshold = calculateProximityThreshold(pps);
    const markerSnapped = findNearestMarkerRef.current(rawTime);
    if (markerSnapped !== null) {
      return { time: markerSnapped, didSnap: true };
    }
    const snapSrcs = buildClipSources(
      animationsRef.current,
      audioClipsRef.current,
      audioTrackOrderRef.current.map((id) => audioTracksDataRef.current[id]?.clipIds ?? []),
      videoClipsRef.current,
      videoTrackOrderRef.current.map((id) => videoTracksDataRef.current[id]?.clipIds ?? []),
      '',
    );
    const { snappedPosition, didSnap } = calculateSnap({
      dragPosition: rawTime,
      clipSources: snapSrcs,
      markers: [],
      playheadTime: -999,
      snapEnabled: clipSnapEnabledRef.current,
      altPressed: altKeyPressedRef.current,
      proximityThreshold: threshold,
    });
    return { time: didSnap ? snappedPosition : rawTime, didSnap };
  }, []);

  const handlePlayheadFindSnap = useCallback((rawTime: number): number | null => {
    const { time, didSnap } = resolvePlayheadSnapTime(rawTime);
    setPlayheadIsSnapped(didSnap);
    if (didSnap && snapOverlayRef.current) {
      const pps = pixelsPerSecondRef.current;
      renderSnapOverlay(snapOverlayRef.current, [{ time, type: 'clipStart' }], pps);
    } else if (!didSnap && snapOverlayRef.current) {
      snapOverlayRef.current.innerHTML = '';
    }
    return didSnap ? time : null;
  }, [resolvePlayheadSnapTime]);

  const handlePlayheadSnapChange = useCallback((isSnapped: boolean) => {
    setPlayheadIsSnapped(isSnapped);
    if (!isSnapped && snapOverlayRef.current) {
      snapOverlayRef.current.innerHTML = '';
    }
  }, []);

  const handleRulerPlayheadTimeChange = useCallback((time: number) => {
    if (tracksPlayheadRef.current) {
      tracksPlayheadRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }
  }, []);

  const handleTracksPlayheadTimeChange = useCallback((time: number) => {
    if (rulerPlayheadRef.current) {
      rulerPlayheadRef.current.style.transform = `translateX(${time * pixelsPerSecondRef.current}px)`;
    }
  }, []);

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    let isDragging = false;
    let rulerRafId = 0;
    let lastClientX = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (rulerPlayheadRef.current && rulerPlayheadRef.current.contains(e.target as Node)) return;
      isDragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
      lastClientX = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        lastClientX = ev.clientX;
        cancelAnimationFrame(rulerRafId);
        rulerRafId = requestAnimationFrame(() => {
          const pps = pixelsPerSecondRef.current;
          if (pps <= 0) return;
          const rect = ruler.getBoundingClientRect();
          const scrollLeft = ruler.scrollLeft;
          const x = (lastClientX - rect.left) / LAYOUT_ZOOM + scrollLeft;
          const rawTime = x / pps;
          const { time: snappedTime, didSnap } = resolvePlayheadSnapTime(rawTime);
          const time = Math.max(0, Math.min(snappedTime, durationRef.current));
          setPlayheadIsSnapped(didSnap);
          if (didSnap && snapOverlayRef.current) {
            renderSnapOverlay(snapOverlayRef.current, [{ time, type: 'clipStart' }], pps);
          } else if (!didSnap && snapOverlayRef.current) {
            snapOverlayRef.current.innerHTML = '';
          }
          const tx = `translateX(${time * pps}px)`;
          if (rulerPlayheadRef.current) {
            rulerPlayheadRef.current.style.transform = tx;
          }
          if (tracksPlayheadRef.current) {
            tracksPlayheadRef.current.style.transform = tx;
          }
        });
      };

      const onMouseUp = (ev: MouseEvent) => {
        if (!isDragging) return;
        cancelAnimationFrame(rulerRafId);
        isDragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        setPlayheadIsSnapped(false);
        if (snapOverlayRef.current) snapOverlayRef.current.innerHTML = '';
        const pps = pixelsPerSecondRef.current;
        if (pps <= 0) { seekTo(0); return; }
        const rect = ruler.getBoundingClientRect();
        const scrollLeft = ruler.scrollLeft;
        const x = (ev.clientX - rect.left) / LAYOUT_ZOOM + scrollLeft;
        const rawTime = x / pps;
        const { time: snappedTime } = resolvePlayheadSnapTime(rawTime);
        const time = Math.max(0, Math.min(snappedTime, durationRef.current));
        seekTo(time);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    ruler.addEventListener('mousedown', onMouseDown);
    return () => {
      ruler.removeEventListener('mousedown', onMouseDown);
      cancelAnimationFrame(rulerRafId);
    };
  }, [seekTo, resolvePlayheadSnapTime]);

  const handleClipClick = useCallback((elementId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragJustEndedRef.current) {
      dragJustEndedRef.current = false;
      return;
    }

    if (e.shiftKey && lastClickedClipRef.current) {
      // Shift+click: range select between lastClicked and this clip on the same track
      const allIds = displayElements.map(de => de.element.id);
      const fromIdx = allIds.indexOf(lastClickedClipRef.current);
      const toIdx = allIds.indexOf(elementId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const rangeIds = allIds.slice(start, end + 1).filter(id => state.animations[id]);
        const newIds = Array.from(new Set([...selectedClipIdsRef.current, ...rangeIds]));
        selectClips(newIds);
        onSelectClips?.(newIds);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle membership in selection set
      const current = selectedClipIdsRef.current;
      const newIds = current.includes(elementId)
        ? current.filter(id => id !== elementId)
        : [...current, elementId];
      selectClips(newIds);
      onSelectClips?.(newIds);
      lastClickedClipRef.current = elementId;
      return;
    }

    // Plain click: sole selection. Never toggle-off on plain click — the canvas-timeline
    // sync may have pre-selected this clip (e.g. via canvas shape selection), so the
    // toggle condition would fire on what the user perceives as a first click.
    // Clicking empty timeline space (tracked on the container) handles deselection.
    lastClickedClipRef.current = elementId;
    selectClip(elementId);
    onSelectClips?.([elementId]);
  }, [selectClip, selectClips, state.animations, displayElements, onSelectClips]);

  const handleClipDragStart = useCallback((elementId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const animation = state.animations[elementId];
    if (!animation || animation.locked) return;

    // If dragging a clip not in the multi-selection, replace selection with just this clip
    const currentIds = selectedClipIdsRef.current;
    const isInSelection = currentIds.includes(elementId);
    const effectiveIds = isInSelection && currentIds.length > 1 ? currentIds : [elementId];

    if (!isInSelection) {
      selectClip(elementId);
      onSelectClips?.([elementId]);
      lastClickedClipRef.current = elementId;
    }

    // Build multi-clip originals map
    const multiOriginals = new Map<string, { clipStart: number; clipDuration: number }>();
    for (const id of effectiveIds) {
      const anim = state.animations[id];
      if (anim && !anim.locked) multiOriginals.set(id, { clipStart: anim.clipStart, clipDuration: anim.clipDuration });
    }

    snapSourcesRef.current = buildSnapSources(elementId);
    dragRef.current = {
      type: 'move',
      id: elementId,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: animation.clipStart,
      originalDuration: animation.clipDuration,
      pixPerSec: pixelsPerSecondRef.current,
      multiOriginals,
    };
    setActiveDragId(elementId);
  }, [state.animations, buildSnapSources, selectClip, onSelectClips]);

  const handleClipResize = useCallback((elementId: string, edge: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const animation = state.animations[elementId];
    if (!animation || animation.locked) return;

    const currentIds = selectedClipIdsRef.current;
    const effectiveIds = currentIds.includes(elementId) && currentIds.length > 1 ? currentIds : [elementId];

    const multiOriginals = new Map<string, { clipStart: number; clipDuration: number }>();
    for (const id of effectiveIds) {
      const anim = state.animations[id];
      if (anim && !anim.locked) multiOriginals.set(id, { clipStart: anim.clipStart, clipDuration: anim.clipDuration });
    }

    snapSourcesRef.current = buildSnapSources(elementId);
    dragRef.current = {
      type: 'resize',
      id: elementId,
      edge,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: animation.clipStart,
      originalDuration: animation.clipDuration,
      pixPerSec: pixelsPerSecondRef.current,
      multiOriginals,
    };
    setActiveResizeId(elementId);
  }, [state.animations, buildSnapSources]);

  const handleAudioClipDragStart = useCallback((clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = audioState.clips[clipId];
    if (!clip) return;
    snapSourcesRef.current = buildSnapSources(clipId);
    audioDragRef.current = {
      type: 'move',
      id: clipId,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: clip.startTime,
      originalEnd: clip.endTime,
      pixPerSec: pixelsPerSecondRef.current,
    };
    setActiveAudioDragId(clipId);
    setSelectedAudioClipId(clipId);
    onAudioClipSelect?.();
  }, [audioState.clips, setSelectedAudioClipId, onAudioClipSelect, buildSnapSources]);

  const handleAudioClipResize = useCallback((clipId: string, edge: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = audioState.clips[clipId];
    if (!clip) return;
    snapSourcesRef.current = buildSnapSources(clipId);
    audioDragRef.current = {
      type: 'resize',
      id: clipId,
      edge,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: clip.startTime,
      originalEnd: clip.endTime,
      pixPerSec: pixelsPerSecondRef.current,
    };
    setActiveAudioDragId(clipId);
    setSelectedAudioClipId(clipId);
    onAudioClipSelect?.();
  }, [audioState.clips, setSelectedAudioClipId, onAudioClipSelect, buildSnapSources]);

  const handleVideoClipDragStart = useCallback((clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = videoState.clips[clipId];
    if (!clip) return;
    snapSourcesRef.current = buildSnapSources(clipId);
    videoDragRef.current = {
      type: 'move',
      id: clipId,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: clip.startTime,
      originalEnd: clip.endTime,
      pixPerSec: pixelsPerSecondRef.current,
    };
    setActiveVideoDragId(clipId);
    setSelectedVideoClipId(clipId);
  }, [videoState.clips, setSelectedVideoClipId, buildSnapSources]);

  const handleVideoClipResize = useCallback((clipId: string, edge: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = videoState.clips[clipId];
    if (!clip) return;
    snapSourcesRef.current = buildSnapSources(clipId);
    videoDragRef.current = {
      type: 'resize',
      id: clipId,
      edge,
      startClientX: e.clientX / LAYOUT_ZOOM,
      originalStart: clip.startTime,
      originalEnd: clip.endTime,
      pixPerSec: pixelsPerSecondRef.current,
    };
    setActiveVideoDragId(clipId);
    setSelectedVideoClipId(clipId);
  }, [videoState.clips, setSelectedVideoClipId, buildSnapSources]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      cancelAnimationFrame(rafRef.current);
      const clientX = e.clientX;

      rafRef.current = requestAnimationFrame(() => {
        const d = dragRef.current;
        if (!d) return;
        const pps = d.pixPerSec;
        const threshold = calculateProximityThreshold(pps);
        const snapSrcs = snapSourcesRef.current;
        const mks = markersRef.current;
        const snapEn = clipSnapEnabledRef.current;
        const altOn = altKeyPressedRef.current;

        if (d.type === 'move') {
          const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
          const rawStart = d.originalStart + deltaX / pps;
          const { snappedStartTime, snapLines, didSnap } = calculateMoveSnap({
            rawStartTime: rawStart,
            clipDuration: d.originalDuration,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
          const rawDelta = finalStart - d.originalStart;

          if (d.multiOriginals && d.multiOriginals.size > 1) {
            const { delta } = applyMultiMoveDelta(d.multiOriginals, rawDelta);
            d.multiOriginals.forEach((_orig, id) => {
              const clipEl = clipElsRef.current.get(id);
              if (clipEl) clipEl.style.transform = `translateX(${delta * pps}px)`;
            });
          } else {
            const el = clipElsRef.current.get(d.id);
            if (el) el.style.transform = `translateX(${rawDelta * pps}px)`;
          }
          if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
        } else {
          const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
          const deltaTime = deltaX / pps;
          const el = clipElsRef.current.get(d.id);
          if (!el) return;

          if (d.edge === 'left') {
            const rawNewStart = d.originalStart + deltaTime;
            const { snappedPosition: snappedStart, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewStart,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
            const startDelta = resolvedStart - d.originalStart;
            const newDuration = Math.max(SNAP_GRID, d.originalDuration - startDelta);
            el.style.transform = `translateX(${startDelta * pps}px)`;
            el.style.width = `${newDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          } else {
            const rawNewEnd = d.originalStart + d.originalDuration + deltaTime;
            const { snappedPosition: snappedEnd, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewEnd,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(d.originalDuration + deltaTime));
            el.style.width = `${resolvedDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          }
        }
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      cancelAnimationFrame(rafRef.current);
      clearSnapOverlay();

      const clientX = e.clientX;
      const el = clipElsRef.current.get(d.id);
      const pps = d.pixPerSec;
      const threshold = calculateProximityThreshold(pps);
      const snapSrcs = snapSourcesRef.current;
      const mks = markersRef.current;
      const snapEn = clipSnapEnabledRef.current;
      const altOn = altKeyPressedRef.current;

      if (d.type === 'move') {
        const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
        const rawStart = d.originalStart + deltaX / pps;
        const { snappedStartTime, didSnap } = calculateMoveSnap({
          rawStartTime: rawStart,
          clipDuration: d.originalDuration,
          clipSources: snapSrcs,
          markers: mks,
          playheadTime: currentTimeRef.current,
          snapEnabled: snapEn,
          altPressed: altOn,
          proximityThreshold: threshold,
        });
        const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
        const rawDelta = finalStart - d.originalStart;

        if (d.multiOriginals && d.multiOriginals.size > 1) {
          // Atomic batch commit for all selected clips
          const { delta, results } = applyMultiMoveDelta(d.multiOriginals, rawDelta);
          void delta;
          const batchUpdates: Array<{ elementId: string; updates: Partial<import('../../animation-engine/types').ElementAnimation> }> = [];
          results.forEach(({ clipStart }, id) => {
            const clipEl = clipElsRef.current.get(id);
            if (clipEl) {
              clipEl.style.left = `${clipStart * pps}px`;
              clipEl.style.transform = '';
            }
            batchUpdates.push({ elementId: id, updates: { clipStart } });
          });
          batchUpdateClips(batchUpdates);
        } else {
          if (el) {
            el.style.left = `${finalStart * pps}px`;
            el.style.transform = '';
          }
          updateClip(d.id, { clipStart: finalStart });
        }
      } else {
        const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
        const deltaTime = deltaX / pps;

        if (d.edge === 'left') {
          const rawNewStart = d.originalStart + deltaTime;
          const { snappedPosition: snappedStart, didSnap } = calculateSnap({
            dragPosition: rawNewStart,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
          const startDelta = resolvedStart - d.originalStart;
          const newDuration = Math.max(SNAP_GRID, d.originalDuration - startDelta);

          if (d.multiOriginals && d.multiOriginals.size > 1) {
            const resizeResults = applyMultiResizeDelta(d.multiOriginals, 'left', startDelta, SNAP_GRID);
            const batchUpdates: Array<{ elementId: string; updates: Partial<import('../../animation-engine/types').ElementAnimation> }> = [];
            resizeResults.forEach(({ clipStart, clipDuration }, id) => {
              const clipEl = clipElsRef.current.get(id);
              if (clipEl) {
                clipEl.style.left = `${clipStart * pps}px`;
                clipEl.style.width = `${clipDuration * pps}px`;
                clipEl.style.transform = '';
              }
              batchUpdates.push({ elementId: id, updates: { clipStart, clipDuration } });
            });
            batchUpdateClips(batchUpdates);
          } else {
            if (el) {
              el.style.left = `${resolvedStart * pps}px`;
              el.style.width = `${newDuration * pps}px`;
              el.style.transform = '';
            }
            updateClip(d.id, { clipStart: resolvedStart, clipDuration: newDuration });
          }
        } else {
          const rawNewEnd = d.originalStart + d.originalDuration + deltaTime;
          const { snappedPosition: snappedEnd, didSnap } = calculateSnap({
            dragPosition: rawNewEnd,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(d.originalDuration + deltaTime));
          const durationDelta = resolvedDuration - d.originalDuration;

          if (d.multiOriginals && d.multiOriginals.size > 1) {
            const resizeResults = applyMultiResizeDelta(d.multiOriginals, 'right', durationDelta, SNAP_GRID);
            const batchUpdates: Array<{ elementId: string; updates: Partial<import('../../animation-engine/types').ElementAnimation> }> = [];
            resizeResults.forEach(({ clipStart, clipDuration }, id) => {
              const clipEl = clipElsRef.current.get(id);
              if (clipEl) {
                clipEl.style.width = `${clipDuration * pps}px`;
                clipEl.style.transform = '';
              }
              void clipStart;
              batchUpdates.push({ elementId: id, updates: { clipDuration } });
            });
            batchUpdateClips(batchUpdates);
          } else {
            if (el) {
              el.style.width = `${resolvedDuration * pps}px`;
              el.style.transform = '';
            }
            updateClip(d.id, { clipDuration: resolvedDuration });
          }
        }
      }

      dragJustEndedRef.current = true;
      dragRef.current = null;
      setActiveDragId(null);
      setActiveResizeId(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateClip, batchUpdateClips, clearSnapOverlay]);

  useEffect(() => {
    const audioRafRef = { current: 0 };

    const onMouseMove = (e: MouseEvent) => {
      if (!audioDragRef.current) return;
      cancelAnimationFrame(audioRafRef.current);
      const clientX = e.clientX;

      audioRafRef.current = requestAnimationFrame(() => {
        const d = audioDragRef.current;
        if (!d) return;
        const el = audioClipElsRef.current.get(d.id);
        if (!el) return;
        const pps = d.pixPerSec;
        const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
        const threshold = calculateProximityThreshold(pps);
        const snapSrcs = snapSourcesRef.current;
        const mks = markersRef.current;
        const snapEn = clipSnapEnabledRef.current;
        const altOn = altKeyPressedRef.current;
        const origDuration = d.originalEnd - d.originalStart;

        if (d.type === 'move') {
          const rawStart = d.originalStart + deltaX / pps;
          const { snappedStartTime, snapLines, didSnap } = calculateMoveSnap({
            rawStartTime: rawStart,
            clipDuration: origDuration,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
          el.style.transform = `translateX(${(finalStart - d.originalStart) * pps}px)`;
          if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
        } else {
          const deltaTime = deltaX / pps;
          if (d.edge === 'left') {
            const rawNewStart = d.originalStart + deltaTime;
            const { snappedPosition: snappedStart, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewStart,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
            const startDelta = resolvedStart - d.originalStart;
            const newDuration = Math.max(SNAP_GRID, origDuration - startDelta);
            el.style.transform = `translateX(${startDelta * pps}px)`;
            el.style.width = `${newDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          } else {
            const rawNewEnd = d.originalEnd + deltaTime;
            const { snappedPosition: snappedEnd, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewEnd,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(origDuration + deltaTime));
            el.style.width = `${resolvedDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          }
        }
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      const d = audioDragRef.current;
      if (!d) return;
      cancelAnimationFrame(audioRafRef.current);
      clearSnapOverlay();

      const clientX = e.clientX;
      const el = audioClipElsRef.current.get(d.id);
      const pps = d.pixPerSec;
      const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
      const origDuration = d.originalEnd - d.originalStart;
      const threshold = calculateProximityThreshold(pps);
      const snapSrcs = snapSourcesRef.current;
      const mks = markersRef.current;
      const snapEn = clipSnapEnabledRef.current;
      const altOn = altKeyPressedRef.current;

      if (d.type === 'move') {
        const rawStart = d.originalStart + deltaX / pps;
        const { snappedStartTime, didSnap } = calculateMoveSnap({
          rawStartTime: rawStart,
          clipDuration: origDuration,
          clipSources: snapSrcs,
          markers: mks,
          playheadTime: currentTimeRef.current,
          snapEnabled: snapEn,
          altPressed: altOn,
          proximityThreshold: threshold,
        });
        const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
        if (el) {
          el.style.left = `${finalStart * pps}px`;
          el.style.transform = '';
        }
        updateAudioClip(d.id, { startTime: finalStart, endTime: finalStart + origDuration });
      } else {
        const deltaTime = deltaX / pps;
        if (d.edge === 'left') {
          const rawNewStart = d.originalStart + deltaTime;
          const { snappedPosition: snappedStart, didSnap } = calculateSnap({
            dragPosition: rawNewStart,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
          const startDelta = resolvedStart - d.originalStart;
          const newDuration = Math.max(SNAP_GRID, origDuration - startDelta);
          if (el) {
            el.style.left = `${resolvedStart * pps}px`;
            el.style.width = `${newDuration * pps}px`;
            el.style.transform = '';
          }
          updateAudioClip(d.id, { startTime: resolvedStart, endTime: resolvedStart + newDuration });
        } else {
          const rawNewEnd = d.originalEnd + deltaTime;
          const { snappedPosition: snappedEnd, didSnap } = calculateSnap({
            dragPosition: rawNewEnd,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(origDuration + deltaTime));
          if (el) {
            el.style.width = `${resolvedDuration * pps}px`;
            el.style.transform = '';
          }
          updateAudioClip(d.id, { endTime: d.originalStart + resolvedDuration });
        }
      }

      audioDragRef.current = null;
      setActiveAudioDragId(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(audioRafRef.current);
    };
  }, [updateAudioClip, clearSnapOverlay]);

  useEffect(() => {
    const videoRafRef = { current: 0 };

    const onMouseMove = (e: MouseEvent) => {
      if (!videoDragRef.current) return;
      cancelAnimationFrame(videoRafRef.current);
      const clientX = e.clientX;

      videoRafRef.current = requestAnimationFrame(() => {
        const d = videoDragRef.current;
        if (!d) return;
        const el = videoClipElsRef.current.get(d.id);
        if (!el) return;
        const pps = d.pixPerSec;
        const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
        const threshold = calculateProximityThreshold(pps);
        const snapSrcs = snapSourcesRef.current;
        const mks = markersRef.current;
        const snapEn = clipSnapEnabledRef.current;
        const altOn = altKeyPressedRef.current;
        const origDuration = d.originalEnd - d.originalStart;

        if (d.type === 'move') {
          const rawStart = d.originalStart + deltaX / pps;
          const { snappedStartTime, snapLines, didSnap } = calculateMoveSnap({
            rawStartTime: rawStart,
            clipDuration: origDuration,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
          el.style.transform = `translateX(${(finalStart - d.originalStart) * pps}px)`;
          if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
        } else {
          const deltaTime = deltaX / pps;
          if (d.edge === 'left') {
            const rawNewStart = d.originalStart + deltaTime;
            const { snappedPosition: snappedStart, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewStart,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
            const startDelta = resolvedStart - d.originalStart;
            const newDuration = Math.max(SNAP_GRID, origDuration - startDelta);
            el.style.transform = `translateX(${startDelta * pps}px)`;
            el.style.width = `${newDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          } else {
            const rawNewEnd = d.originalEnd + deltaTime;
            const { snappedPosition: snappedEnd, snapLines, didSnap } = calculateSnap({
              dragPosition: rawNewEnd,
              clipSources: snapSrcs,
              markers: mks,
              playheadTime: currentTimeRef.current,
              snapEnabled: snapEn,
              altPressed: altOn,
              proximityThreshold: threshold,
            });
            const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(origDuration + deltaTime));
            el.style.width = `${resolvedDuration * pps}px`;
            if (snapOverlayRef.current) renderSnapOverlay(snapOverlayRef.current, snapLines, pps);
          }
        }
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      const d = videoDragRef.current;
      if (!d) return;
      cancelAnimationFrame(videoRafRef.current);
      clearSnapOverlay();

      const clientX = e.clientX;
      const el = videoClipElsRef.current.get(d.id);
      const pps = d.pixPerSec;
      const deltaX = (clientX / LAYOUT_ZOOM) - d.startClientX;
      const origDuration = d.originalEnd - d.originalStart;
      const threshold = calculateProximityThreshold(pps);
      const snapSrcs = snapSourcesRef.current;
      const mks = markersRef.current;
      const snapEn = clipSnapEnabledRef.current;
      const altOn = altKeyPressedRef.current;

      if (d.type === 'move') {
        const rawStart = d.originalStart + deltaX / pps;
        const { snappedStartTime, didSnap } = calculateMoveSnap({
          rawStartTime: rawStart,
          clipDuration: origDuration,
          clipSources: snapSrcs,
          markers: mks,
          playheadTime: currentTimeRef.current,
          snapEnabled: snapEn,
          altPressed: altOn,
          proximityThreshold: threshold,
        });
        const finalStart = Math.max(0, didSnap ? snappedStartTime : snapToGrid(rawStart));
        if (el) {
          el.style.left = `${finalStart * pps}px`;
          el.style.transform = '';
        }
        updateVideoClip(d.id, { startTime: finalStart, endTime: finalStart + origDuration });
      } else {
        const deltaTime = deltaX / pps;
        if (d.edge === 'left') {
          const rawNewStart = d.originalStart + deltaTime;
          const { snappedPosition: snappedStart, didSnap } = calculateSnap({
            dragPosition: rawNewStart,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedStart = Math.max(0, didSnap ? snappedStart : snapToGrid(rawNewStart));
          const startDelta = resolvedStart - d.originalStart;
          const newDuration = Math.max(SNAP_GRID, origDuration - startDelta);
          if (el) {
            el.style.left = `${resolvedStart * pps}px`;
            el.style.width = `${newDuration * pps}px`;
            el.style.transform = '';
          }
          updateVideoClip(d.id, { startTime: resolvedStart, endTime: resolvedStart + newDuration });
        } else {
          const rawNewEnd = d.originalEnd + deltaTime;
          const { snappedPosition: snappedEnd, didSnap } = calculateSnap({
            dragPosition: rawNewEnd,
            clipSources: snapSrcs,
            markers: mks,
            playheadTime: currentTimeRef.current,
            snapEnabled: snapEn,
            altPressed: altOn,
            proximityThreshold: threshold,
          });
          const resolvedDuration = Math.max(SNAP_GRID, didSnap ? snappedEnd - d.originalStart : snapToGrid(origDuration + deltaTime));
          if (el) {
            el.style.width = `${resolvedDuration * pps}px`;
            el.style.transform = '';
          }
          updateVideoClip(d.id, { endTime: d.originalStart + resolvedDuration });
        }
      }

      videoDragRef.current = null;
      setActiveVideoDragId(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(videoRafRef.current);
    };
  }, [updateVideoClip, clearSnapOverlay]);

  const handleCutClip = useCallback(() => {
    const ids = selectedClipIdsRef.current;
    if (ids.length === 0) return;
    const clipsToSplit = ids
      .map(id => ({ elementId: id, time: currentTime }))
      .filter(({ elementId }) => {
        const anim = state.animations[elementId];
        if (!anim) return false;
        return currentTime > anim.clipStart && currentTime < anim.clipStart + anim.clipDuration;
      });
    if (clipsToSplit.length === 0) return;
    if (clipsToSplit.length === 1) {
      splitClip(clipsToSplit[0].elementId, currentTime);
    } else {
      splitClips(clipsToSplit);
    }
  }, [currentTime, state.animations, splitClip, splitClips]);

  const handleClipContextMenu = useCallback((elementId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId: elementId });
  }, []);

  const handleContextMenuCut = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    if (!animation) return;
    setClipboardClip({ elementId: contextMenu.clipId, animation });
    alert('Cut: Animation copied to clipboard. Note: Full element removal requires parent component integration.');
  }, [contextMenu, state.animations]);

  const handleContextMenuDuplicate = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    if (!animation) return;
    alert('Duplicate: This feature requires parent component integration to duplicate the element.');
  }, [contextMenu, state.animations]);

  const handleContextMenuSpeedDuration = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    const displayElement = displayElements.find(de => de.element.id === contextMenu.clipId);
    const element = displayElement?.element;
    if (!animation || !element) return;
    setSpeedDurationModal({
      clipId: contextMenu.clipId,
      clipName: element.name || (element.type === 'group' ? 'Group' : 'Layer'),
      duration: animation.clipDuration,
      speed: 1,
    });
  }, [contextMenu, state.animations, displayElements]);

  const handleContextMenuSelectAllKeyframes = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    if (!animation) return;
    const keyframeIds: string[] = [];
    animation.tracks.forEach(track => track.keyframes.forEach(kf => keyframeIds.push(kf.id)));
    selectKeyframes(keyframeIds);
  }, [contextMenu, state.animations, selectKeyframes]);

  const handleContextMenuDeleteAllKeyframes = useCallback(() => {
    if (!contextMenu) return;
    deleteAllKeyframes(contextMenu.clipId);
  }, [contextMenu, deleteAllKeyframes]);

  const handleContextMenuToggleLock = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    if (!animation) return;
    updateClip(contextMenu.clipId, { locked: !animation.locked });
  }, [contextMenu, state.animations, updateClip]);

  const handleContextMenuRename = useCallback(() => {
    if (!contextMenu) return;
    const element = elements.find(e => e.id === contextMenu.clipId);
    if (!element) return;
    setRenameModal({ clipId: contextMenu.clipId, currentName: element.name || 'Layer' });
  }, [contextMenu, elements]);

  const handleContextMenuConvertToStatic = useCallback(() => {
    if (!contextMenu) return;
    deleteAllKeyframes(contextMenu.clipId);
  }, [contextMenu, deleteAllKeyframes]);

  const handleContextMenuToggleDisable = useCallback(() => {
    if (!contextMenu) return;
    const animation = state.animations[contextMenu.clipId];
    if (!animation) return;
    updateClip(contextMenu.clipId, { muted: !animation.muted });
  }, [contextMenu, state.animations, updateClip]);

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu) return;
    if (confirm('Delete this clip? This will remove animation data but the element will remain on canvas.')) {
      removeAnimation(contextMenu.clipId);
    }
  }, [contextMenu, removeAnimation]);

  const handleApplySpeedDuration = useCallback((duration: number, speed: number) => {
    if (!speedDurationModal) return;
    void speed;
    updateClip(speedDurationModal.clipId, { clipDuration: duration });
    setSpeedDurationModal(null);
  }, [speedDurationModal, updateClip]);

  const handleRename = useCallback((newName: string) => {
    if (!renameModal) return;
    alert(`Rename: New name "${newName}" - This feature requires parent component integration to update the element.`);
    setRenameModal(null);
  }, [renameModal]);

  const handleAddMarker = useCallback(() => addMarker(currentTime), [currentTime, addMarker]);

  const handleEditMarker = useCallback(() => {
    const marker = getMarkerAtTime(currentTime, 0.05);
    if (marker) setEditingMarker(marker);
  }, [currentTime, getMarkerAtTime]);

  const handleToggleDisableClip = useCallback(() => {
    if (!selectedClipId) return;
    const animation = state.animations[selectedClipId];
    if (!animation) return;
    updateClip(selectedClipId, { muted: !animation.muted });
  }, [selectedClipId, state.animations, updateClip]);

  // Removed local formatTime — now using shared formatTimeCode utility.
  const formatTime = (s: number) => formatTimeCode(s, fps);

  const renderRulerTicks = () => {
    const ticks = [];
    const totalSeconds = Math.ceil(duration);
    const majorTickInterval = pixelsPerSecond >= 100 ? 1 : pixelsPerSecond >= 50 ? 2 : 5;

    for (let i = 0; i <= totalSeconds; i++) {
      const x = i * pixelsPerSecond;
      const isMajor = i % majorTickInterval === 0;
      ticks.push(
        <div key={i} className="absolute top-0 flex flex-col items-start" style={{ left: `${x}px` }}>
          <div className={`w-px ${isMajor ? 'h-4 bg-gray-400' : 'h-2 bg-gray-600'}`}></div>
          {isMajor && <span className="text-[10px] text-gray-400 mt-0.5 -ml-2">{i}s</span>}
        </div>
      );
      if (pixelsPerSecond >= 80) {
        for (let f = 1; f < 4; f++) {
          const frameX = x + (f / 4) * pixelsPerSecond;
          ticks.push(
            <div key={`${i}-${f}`} className="absolute top-0" style={{ left: `${frameX}px` }}>
              <div className="w-px h-1.5 bg-gray-700"></div>
            </div>
          );
        }
      }
    }
    return ticks;
  };

  const timelineWidth = duration * pixelsPerSecond;
  void clipboardClip;

  return (
    <div
      className="h-full bg-gray-900 border-t border-r border-gray-700/50 flex flex-col relative"
      style={{ cursor: activeDragId ? 'grabbing' : activeResizeId ? 'ew-resize' : undefined }}
    >
      {/* Toolbar */}
      <div className="h-10 bg-gray-800/80 border-b border-gray-700/50 flex items-center px-2 justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {!compactMode && (
            <>
              <div className="flex items-center gap-1">
                <button onClick={seekToStart} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors" title="Go to start">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={stepBackward} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors" title="Previous frame">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePlay}
                  className={`p-2 rounded-lg transition-all ${isPlaying ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'}`}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={stop} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors" title="Stop">
                  <Square className="w-3.5 h-3.5" />
                </button>
                <button onClick={stepForward} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors" title="Next frame">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={seekToEnd} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors" title="Go to end">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
              <div className="h-6 w-px bg-gray-700/50" />
            </>
          )}

          <button
            onClick={handleCutClip}
            disabled={!selectedClipId || !state.animations[selectedClipId]}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedClipId && state.animations[selectedClipId]
                ? 'bg-gray-700/50 text-gray-300 hover:bg-yellow-500/20 hover:text-yellow-400'
                : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
            }`}
            title="Cut clip at playhead (requires selected clip)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Cut Clip</span>
          </button>

          <button
            onClick={handleToggleDisableClip}
            disabled={!selectedClipId || !state.animations[selectedClipId]}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedClipId && state.animations[selectedClipId]
                ? state.animations[selectedClipId]?.muted
                  ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
            }`}
            title="Disable/Enable clip"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>{selectedClipId && state.animations[selectedClipId]?.muted ? 'Enable' : 'Disable'}</span>
          </button>

          <div className="h-6 w-px bg-gray-700/50" />

          <button
            onClick={handleAddMarker}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-gray-700/50 text-gray-300 hover:bg-yellow-500/20 hover:text-yellow-400 transition-colors"
            title="Add marker at playhead"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Add Marker</span>
          </button>

          {getMarkerAtTime(currentTime, 0.05) && (
            <button
              onClick={handleEditMarker}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
              title="Edit marker at playhead"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Marker</span>
            </button>
          )}

          <button
            onClick={() => toggleSnapToMarkers(!snapToMarkers)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              snapToMarkers
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'bg-gray-700/50 text-gray-500 hover:bg-gray-600/50'
            }`}
            title="Toggle snap to markers"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>

          <button
            onClick={() => setClipSnapEnabled(!clipSnapEnabled)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              clipSnapEnabled
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'bg-gray-700/50 text-gray-500 hover:bg-gray-600/50'
            }`}
            title="Toggle clip snapping (Alt key temporarily disables)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Clip Snap</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {!compactMode && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              <div className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
                F {currentFrame + 1} / {totalFrames}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Unified label panel */}
        <div className="w-36 flex-shrink-0 bg-gray-800/40 border-r border-gray-700/50 flex flex-col">
          <div className="h-8 flex-shrink-0 border-b border-gray-700/50 flex items-center justify-between px-3">
            <span className="text-xs font-medium text-gray-400">Timeline</span>
            <button
              onClick={() => audioFileInputRef.current?.click()}
              className="p-0.5 rounded hover:bg-gray-600/60 text-gray-500 hover:text-green-400 transition-colors"
              title="Import audio file"
            >
              <Music className="w-3 h-3" />
            </button>
          </div>
          <div ref={labelsRef} className="overflow-y-hidden flex-1">
            {/* Visual layer labels */}
            {displayElements.map(({ element, depth }) => {
              const animation = state.animations[element.id];
              const isSelected = selectedClipIds.includes(element.id) || selectedCanvasElements.includes(element.id);
              const isLocked = animation?.locked || false;
              const isMuted = animation?.muted || false;
              const isGroup = element.type === 'group';
              const isCollapsed = collapsedGroups.has(element.id);

              return (
                <div
                  key={element.id}
                  className={`h-7 border-b border-gray-700/30 flex items-center gap-1 cursor-pointer transition-colors ${
                    isSelected ? 'bg-green-500/20' : 'hover:bg-gray-700/30'
                  }`}
                  style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
                  onClick={(e) => handleClipClick(element.id, e)}
                >
                  {isGroup && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(element.id); }}
                      className="p-0.5 rounded hover:bg-gray-600/50"
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3 h-3 text-gray-400" />
                        : <ChevronDown className="w-3 h-3 text-gray-400" />
                      }
                    </button>
                  )}
                  {!isGroup && depth > 0 && <div className="w-3 h-3 flex-shrink-0" />}
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: element.fill || '#60a5fa' }} />
                  <span className="text-xs text-gray-300 truncate flex-1">
                    {element.name || (isGroup ? 'Group' : 'Layer')}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateClip(element.id, { muted: !isMuted }); }}
                    className={`p-0.5 rounded ${isMuted ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateClip(element.id, { locked: !isLocked }); }}
                    className={`p-0.5 rounded ${isLocked ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
                    title={isLocked ? 'Unlock' : 'Lock'}
                  >
                    <Lock className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Audio track labels */}
            {audioTracks.map((track) => (
              <div
                key={track.id}
                className="h-7 border-b border-gray-700/30 flex items-center gap-1 px-2 hover:bg-gray-700/20 transition-colors"
                style={{ backgroundColor: 'rgba(5, 46, 22, 0.25)' }}
              >
                <Music className="w-3 h-3 text-green-500 flex-shrink-0" />
                <span className="text-xs text-gray-300 truncate flex-1">{track.name}</span>
                <button
                  onClick={() => updateAudioTrack(track.id, { muted: !track.muted })}
                  className={`p-0.5 rounded transition-colors ${track.muted ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
                  title={track.muted ? 'Unmute track' : 'Mute track'}
                >
                  {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            ))}

            {/* Video track labels */}
            {videoTracks.map((track) => (
              <div
                key={track.id}
                className="h-7 border-b border-gray-700/30 flex items-center gap-1 px-2 hover:bg-gray-700/20 transition-colors"
                style={{ backgroundColor: 'rgba(23, 37, 84, 0.35)' }}
              >
                <Film className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-gray-300 truncate flex-1">{track.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline track area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          <div
            ref={rulerRef}
            className="h-8 bg-gray-850 border-b border-gray-700/50 relative cursor-pointer overflow-x-auto flex-shrink-0 scrollbar-hide"
            onClick={handleRulerClick}
          >
            <div className="relative h-full" style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
              {renderRulerTicks()}
              {markers.map(marker => {
                const markerX = marker.time * pixelsPerSecond;
                return (
                  <div
                    key={marker.id}
                    className="absolute top-0 bottom-0 w-0.5 z-5 cursor-pointer group"
                    style={{ left: `${markerX}px`, backgroundColor: marker.color }}
                    onMouseEnter={() => setHoveredMarkerId(marker.id)}
                    onMouseLeave={() => setHoveredMarkerId(null)}
                    onClick={() => setEditingMarker(marker)}
                  >
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3"
                      style={{ backgroundColor: marker.color, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                    />
                    {hoveredMarkerId === marker.id && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none">
                        {marker.name}
                      </div>
                    )}
                  </div>
                );
              })}
              <PlayheadIndicator
                ref={rulerPlayheadRef}
                pixelsPerSecond={pixelsPerSecond}
                isDraggable={true}
                showHandle={true}
                isSnapped={playheadIsSnapped}
                containerRef={rulerRef}
                duration={duration}
                seekTo={seekTo}
                layoutZoom={LAYOUT_ZOOM}
                onFindSnap={handlePlayheadFindSnap}
                onSnapChange={handlePlayheadSnapChange}
                onTimeChange={handleRulerPlayheadTimeChange}
                className="z-10 pointer-events-auto"
              />
            </div>
          </div>

          {/* Tracks */}
          <div
            ref={tracksContainerRef}
            className="flex-1 overflow-auto relative scrollbar-hide"
            onScroll={handleMainScroll}
            onClick={(e) => {
              if (e.target === tracksContainerRef.current || (e.target as HTMLElement).closest('[data-track-row]') === null) {
                if (!e.ctrlKey && !e.metaKey && selectedClipIdsRef.current.length > 0) {
                  selectClips([]);
                  onSelectClips?.([]);
                }
              }
            }}
          >
            <div className="absolute inset-0 pointer-events-none z-20">
              {markers.map(marker => (
                <div
                  key={marker.id}
                  className="absolute top-0 bottom-0 w-0.5"
                  style={{ left: `${marker.time * pixelsPerSecond}px`, backgroundColor: marker.color }}
                />
              ))}
              <div ref={snapOverlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }} />
              <PlayheadIndicator
                ref={tracksPlayheadRef}
                pixelsPerSecond={pixelsPerSecond}
                isDraggable={true}
                isSnapped={playheadIsSnapped}
                containerRef={tracksContainerRef}
                duration={duration}
                seekTo={seekTo}
                layoutZoom={LAYOUT_ZOOM}
                onFindSnap={handlePlayheadFindSnap}
                onSnapChange={handlePlayheadSnapChange}
                onTimeChange={handleTracksPlayheadTimeChange}
                className="pointer-events-auto"
              />
            </div>

            {displayElements.length === 0 && audioTracks.length === 0 && videoTracks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No layers available. Create shapes or import media to get started.
              </div>
            ) : (
              <div className="relative" style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
                {/* Visual element clip rows */}
                {displayElements.map(({ element, depth }) => {
                  const animation = state.animations[element.id];
                  const clipStart    = animation?.clipStart    ?? 0;
                  const clipDuration = animation?.clipDuration ?? 5;
                  const clipX     = clipStart    * pixelsPerSecond;
                  const clipWidth = clipDuration * pixelsPerSecond;
                  const isSelected     = selectedClipIds.includes(element.id) || selectedCanvasElements.includes(element.id);
                  const isHovered      = hoveredClipId === element.id;
                  const isDraggingThis = activeDragId === element.id || activeResizeId === element.id;
                  const isMuted  = animation?.muted  || false;
                  const isLocked = animation?.locked || false;
                  const uniqueKeyframeTimes: number[] = (() => {
                    if (!animation?.tracks) return [];
                    const seen = new Set<number>();
                    const result: number[] = [];
                    for (const track of animation.tracks) {
                      for (const kf of track.keyframes) {
                        const t = kf.time;
                        const offsetPx = t * pixelsPerSecond;
                        if (offsetPx >= 0 && offsetPx <= clipWidth && !seen.has(t)) {
                          seen.add(t);
                          result.push(t);
                        }
                      }
                    }
                    return result;
                  })();

                  return (
                    <div key={element.id} className="h-7 border-b border-black/60 relative" data-track-row>
                      <div
                        ref={setClipRef(element.id)}
                        className="absolute top-0 bottom-0 group will-change-transform"
                        style={{
                          left: `${clipX}px`,
                          width: `${clipWidth}px`,
                          backgroundColor: isSelected ? '#16a34a' : '#3b82f6',
                          opacity: isMuted ? 0.3 : (depth > 0 ? 0.72 : 1),
                          outline: isSelected ? '2px solid rgba(34,197,94,0.8)' : 'none',
                          outlineOffset: '-2px',
                          zIndex: isDraggingThis ? 30 : 1,
                          boxShadow: isDraggingThis
                            ? '0 4px 16px rgba(0,0,0,0.5)'
                            : isSelected
                              ? '0 0 0 1px rgba(34,197,94,0.4)'
                              : 'none',
                        }}
                        onMouseEnter={() => setHoveredClipId(element.id)}
                        onMouseLeave={() => setHoveredClipId(null)}
                      >
                        {isHovered && !isSelected && (
                          <div className="absolute inset-0 bg-white/10 pointer-events-none" />
                        )}

                        <div
                          className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
                          onClick={(e) => handleClipClick(element.id, e)}
                          onMouseDown={(e) => !isLocked && handleClipDragStart(element.id, e)}
                          onContextMenu={(e) => handleClipContextMenu(element.id, e)}
                        >
                          {uniqueKeyframeTimes.map((t) => {
                            const offsetPx = t * pixelsPerSecond;
                            return (
                              <div
                                key={t}
                                className="absolute pointer-events-none"
                                style={{
                                  left: `${offsetPx}px`,
                                  top: '50%',
                                  transform: 'translate(-50%, -50%) rotate(45deg)',
                                  width: 7,
                                  height: 7,
                                  backgroundColor: 'rgba(255,255,255,0.92)',
                                  boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
                                  flexShrink: 0,
                                }}
                              />
                            );
                          })}
                        </div>

                        <div
                          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 hover:bg-black/40 z-10"
                          onMouseDown={(e) => !isLocked && handleClipResize(element.id, 'left', e)}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 hover:bg-black/40 z-10"
                          onMouseDown={(e) => !isLocked && handleClipResize(element.id, 'right', e)}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Video clip rows */}
                {videoTracks.map((track) => (
                  <div
                    key={track.id}
                    className="h-7 border-b border-black/60 relative"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.06)' }}
                  >
                    {track.clipIds.map((clipId) => {
                      const clip = videoState.clips[clipId];
                      if (!clip) return null;
                      const clipX = clip.startTime * pixelsPerSecond;
                      const clipW = Math.max(4, (clip.endTime - clip.startTime) * pixelsPerSecond);
                      const isVideoClipSelected = selectedVideoClipId === clipId;
                      const isVideoDragging = activeVideoDragId === clipId;
                      return (
                        <div
                          key={clipId}
                          ref={setVideoClipRef(clipId)}
                          className="absolute top-0 bottom-0 overflow-hidden group will-change-transform"
                          style={{
                            left: `${clipX}px`,
                            width: `${clipW}px`,
                            backgroundColor: isVideoClipSelected ? '#dc2626' : '#ef4444',
                            outline: isVideoClipSelected
                              ? '2px solid rgba(248,113,113,0.8)'
                              : 'none',
                            outlineOffset: '-2px',
                            boxShadow: isVideoDragging
                              ? '0 4px 16px rgba(0,0,0,0.5)'
                              : isVideoClipSelected
                              ? '0 0 0 1px rgba(248,113,113,0.4)'
                              : 'none',
                            zIndex: isVideoDragging ? 30 : 1,
                          }}
                          onMouseDownCapture={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('button')) return;
                            setSelectedVideoClipId(clipId);
                          }}
                        >
                          <div
                            className="absolute inset-0 cursor-grab active:cursor-grabbing z-0"
                            onMouseDown={(e) => handleVideoClipDragStart(clipId, e)}
                          />

                          <div
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 bg-black/20 hover:bg-black/40 transition-colors"
                            onMouseDown={(e) => handleVideoClipResize(clipId, 'left', e)}
                          />

                          <div
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 bg-black/20 hover:bg-black/40 transition-colors"
                            onMouseDown={(e) => handleVideoClipResize(clipId, 'right', e)}
                          />

                          <div className="absolute inset-x-0 top-0 bottom-0 flex items-center gap-1 px-1.5 pointer-events-none">
                            <Film className="w-2.5 h-2.5 text-white/70 flex-shrink-0" />
                            <span className="text-xs text-white/60 truncate leading-none">{clip.name}</span>
                          </div>

                          <div className="absolute right-0.5 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <button
                              className="p-0.5 rounded text-white/30 hover:text-red-400 transition-colors"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); removeVideoClip(clipId); if (selectedVideoClipId === clipId) setSelectedVideoClipId(null); }}
                              title="Remove clip"
                            >
                              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 1l8 8M9 1L1 9" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Audio clip rows — same row height as visual clips */}
                {audioTracks.map((track) => (
                  <div
                    key={track.id}
                    className="h-7 border-b border-black/60 relative"
                    style={{ backgroundColor: 'rgba(5, 46, 22, 0.12)' }}
                  >
                    {track.clipIds.map((clipId) => {
                      const clip = audioState.clips[clipId];
                      if (!clip) return null;
                      const asset = audioState.assets[clip.assetId];
                      const clipX = clip.startTime * pixelsPerSecond;
                      const clipW = Math.max(4, (clip.endTime - clip.startTime) * pixelsPerSecond);
                      const isMutedClip = clip.muted || track.muted;
                      const isAudioClipSelected = selectedAudioClipId === clipId;
                      const isAudioDragging = activeAudioDragId === clipId;
                      return (
                        <div
                          key={clipId}
                          ref={setAudioClipRef(clipId)}
                          className="absolute top-0 bottom-0 overflow-hidden group will-change-transform"
                          style={{
                            left: `${clipX}px`,
                            width: `${clipW}px`,
                            backgroundColor: isMutedClip ? '#1f2937' : '#052e16',
                            outline: isAudioClipSelected
                              ? '2px solid rgba(74,222,128,0.9)'
                              : `1px solid ${isMutedClip ? '#374151' : '#15803d'}`,
                            outlineOffset: '-1px',
                            opacity: isMutedClip ? 0.5 : 1,
                            boxShadow: isAudioDragging
                              ? '0 4px 16px rgba(0,0,0,0.5)'
                              : isAudioClipSelected
                              ? '0 0 0 1px rgba(74,222,128,0.3)'
                              : 'none',
                            zIndex: isAudioDragging ? 30 : 1,
                          }}
                          onMouseDownCapture={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('button')) return;
                            setSelectedAudioClipId(clipId);
                            onAudioClipSelect?.();
                          }}
                        >
                          {/* Waveform background */}
                          {asset?.waveform && (
                            <WaveformDisplay peaks={asset.waveform} muted={isMutedClip} />
                          )}

                          {/* Drag + click body */}
                          <div
                            className="absolute inset-0 cursor-grab active:cursor-grabbing z-0"
                            onMouseDown={(e) => handleAudioClipDragStart(clipId, e)}
                          />

                          {/* Left resize handle */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 bg-green-400/20 hover:bg-green-400/40 transition-colors"
                            onMouseDown={(e) => handleAudioClipResize(clipId, 'left', e)}
                          />

                          {/* Right resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 bg-green-400/20 hover:bg-green-400/40 transition-colors"
                            onMouseDown={(e) => handleAudioClipResize(clipId, 'right', e)}
                          />

                          {/* Label overlay */}
                          <div className="absolute inset-x-0 top-0 bottom-0 flex items-center gap-1 px-1.5 pointer-events-none">
                            <Music className="w-2.5 h-2.5 text-green-400/70 flex-shrink-0" />
                            <span className="text-xs text-white/60 truncate leading-none">{clip.name}</span>
                          </div>

                          {/* Controls (appear on hover) */}
                          <div className="absolute right-0.5 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <button
                              className={`p-0.5 rounded transition-colors ${clip.muted ? 'text-red-400' : 'text-white/50 hover:text-white'}`}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); updateAudioClip(clipId, { muted: !clip.muted }); }}
                              title={clip.muted ? 'Unmute clip' : 'Mute clip'}
                            >
                              {clip.muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                            </button>
                            <button
                              className="p-0.5 rounded text-white/30 hover:text-red-400 transition-colors"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); removeAudioClip(clipId); if (selectedAudioClipId === clipId) setSelectedAudioClipId(null); }}
                              title="Remove clip"
                            >
                              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M1 1l8 8M9 1L1 9" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio file input */}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioFileChange}
      />

      {contextMenu && (() => {
        const displayElement = displayElements.find(de => de.element.id === contextMenu.clipId);
        const element = displayElement?.element;
        return (
          <ClipContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            clipId={contextMenu.clipId}
            clipName={element?.name || (element?.type === 'group' ? 'Group' : 'Layer')}
            isLocked={state.animations[contextMenu.clipId]?.locked || false}
            isDisabled={state.animations[contextMenu.clipId]?.muted || false}
            hasKeyframes={state.animations[contextMenu.clipId]?.tracks.some(t => t.keyframes.length > 0) || false}
            onClose={() => setContextMenu(null)}
            onCut={handleContextMenuCut}
            onDuplicate={handleContextMenuDuplicate}
            onSpeedDuration={handleContextMenuSpeedDuration}
            onSelectAllKeyframes={handleContextMenuSelectAllKeyframes}
            onDeleteAllKeyframes={handleContextMenuDeleteAllKeyframes}
            onToggleLock={handleContextMenuToggleLock}
            onRename={handleContextMenuRename}
            onConvertToStatic={handleContextMenuConvertToStatic}
            onToggleDisable={handleContextMenuToggleDisable}
            onDelete={handleContextMenuDelete}
          />
        );
      })()}

      {speedDurationModal && (
        <ClipSpeedDurationModal
          clipName={speedDurationModal.clipName}
          currentDuration={speedDurationModal.duration}
          currentSpeed={speedDurationModal.speed}
          onClose={() => setSpeedDurationModal(null)}
          onApply={handleApplySpeedDuration}
        />
      )}

      {renameModal && (
        <ClipRenameModal
          currentName={renameModal.currentName}
          onClose={() => setRenameModal(null)}
          onRename={handleRename}
        />
      )}

      {editingMarker && (
        <MarkerEditModal
          marker={editingMarker}
          onClose={() => setEditingMarker(null)}
          onSave={(updates) => updateMarker(editingMarker.id, updates)}
          onDelete={() => deleteMarker(editingMarker.id)}
        />
      )}
    </div>
  );
};

export default GeneralTimeline;
