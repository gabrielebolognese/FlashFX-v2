import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Layer, Track, ShapeLayer, AudioLayer, VideoLayer, AnimatableProperty } from '../../../core/types';
import { useTimelineStore } from '../../../store/timeline';
import { useEditorStore } from '../../../store/editor';
import { useSilenceStore } from '../../../store/silenceStripper';
import { useContextMenu } from '../../context-menu';
import { buildClipMenu, buildMultiClipMenu } from '../../context-menu/menuDefinitions';
import type { CommitClipMoveIntent } from '../../../store/editor';
import { isTrackCompressed } from '../../../core/trackCompression';
import { clampGroupResizeDelta, applyResizeDelta } from '../../../core/clipResize';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { videoDecoderPool } from '../../../engine/video/videoDecoderPool';
import { getSettingValue } from '../../../settings/store';
import {
  buildClipSnapSources,
  calculateClipMoveSnap,
  pixelThresholdToFrames,
  TIMELINE_SNAP_PX,
  type TimelineSnapLine,
} from '../../../core/timelineSnap';
import { TimelineSnapLines } from '../SnapGuides';
import {
  frameToPixel,
  pixelToFrame,
  getVisibleFrameRange,
  getRulerTicks,
  getMaxScrollX,
  getTotalTimelineWidth,
  getFrameWidth,
  ROW_HEIGHT,
  VIDEO_ROW_HEIGHT,
} from './timeUtils';

function getZoomSensitivity(): number {
  return getSettingValue<number>('timeline.zoomSensitivity') ?? 0.002;
}
function getScrollSpeed(): number {
  return getSettingValue<number>('timeline.scrollSpeed') ?? 1.0;
}
function getDragThreshold(): number {
  return getSettingValue<number>('editor.dragThreshold') ?? 4;
}

const RESIZE_EDGE_PX = 7;
const RESIZE_AUTOSCROLL_EDGE_PX = 60;
const RESIZE_AUTOSCROLL_MAX_PX_PER_FRAME = 14;

// Playhead scrub auto-scroll constants
const SCRUB_EDGE_ZONE = 0.15; // 15% of viewport width on each side
const SCRUB_MAX_SPEED = 18; // px per rAF tick at maximum proximity

// Fixed type-based color registry
function getClipColor(layer: Layer): string {
  if (layer.labelColor) return layer.labelColor;
  switch (layer.type) {
    case 'video': return '#22c55e';
    case 'text': return '#3b82f6';
    case 'image': return '#22c55e';
    case 'audio': return '#f59e0b';
    case 'group': return '#6b7280';
    case 'particle': return '#e879f9';
    case 'animationItem': return '#f97316';
    case 'fieldSampled': return '#06b6d4';
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

function getTrackHeight(track: Track): number {
  return track.type === 'video' ? VIDEO_ROW_HEIGHT : ROW_HEIGHT;
}

// Mirror of editor.ts layerTypeToTrackType — used for cross-type drop checks.
function layerTypeToTrack(t: Layer['type']): Track['type'] {
  switch (t) {
    case 'video': return 'video';
    case 'image': return 'image';
    case 'text': return 'text';
    case 'shape': return 'shape';
    case 'group': return 'group';
    case 'audio': return 'audio';
    case 'particle': return 'particle';
    case 'animationItem': return 'animationItem';
    case 'fieldSampled': return 'fieldSampled';
    case 'lottieIcon': return 'lottieIcon';
    default: return 'mixed';
  }
}

interface ClipDragState {
  layerId: string;
  startX: number;
  startY: number;
  startInPoint: number;
  startTrackId: string | null;
  currentFrame: number;
  // Track that the ghost is rendered on (null when intent is newTrack — ghost
  // floats at the predicted insertion gap).
  ghostTrackId: string | null;
  // Resolved intent that will be committed on pointerup. null while the drag
  // hasn't passed the threshold yet.
  intent: CommitClipMoveIntent | null;
  // Predicted insertion Y for the newTrack indicator. Only set when intent.kind === 'newTrack'.
  newTrackIndicatorY: number | null;
  isValid: boolean;
  isDragging: boolean;
  snapLines: TimelineSnapLine[];
}

interface ClipResizeState {
  // The grabbed clip — drives the tooltip and the raw pixel→frame delta.
  anchorId: string;
  // Every clip that resizes together this gesture (the live multi-selection,
  // or just the anchor when it wasn't part of a selection).
  targetIds: string[];
  edge: 'left' | 'right';
  startClientX: number;
  // Anchor's original bounds, captured at drag start (store is never mutated
  // mid-gesture, so these stay the resize origin).
  startInPoint: number;
  startOutPoint: number;
  // Anchor's previewed bounds — derived from previewDelta, shown in the tooltip.
  previewInPoint: number;
  previewOutPoint: number;
  // The single clamped delta applied to every target clip's dragged edge.
  previewDelta: number;
  isValid: boolean;
  cursorClientX: number;
  cursorClientY: number;
}

interface TrackAreaProps {
  layers: Layer[];
  tracks: Track[];
  selectedIds: string[];
  rulerOnly?: boolean;
  ghostRowCount?: number;
  onSelect?: (layerId: string, additive: boolean) => void;
}

export function TrackArea({ layers, tracks, selectedIds, rulerOnly, ghostRowCount = 0, onSelect }: TrackAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null);
  const clipDragRef = useRef<ClipDragState | null>(null);
  clipDragRef.current = clipDrag;

  const [clipResize, setClipResize] = useState<ClipResizeState | null>(null);
  const clipResizeRef = useRef<ClipResizeState | null>(null);
  clipResizeRef.current = clipResize;

  // Timeline marquee selection
  const [timelineMarquee, setTimelineMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    baseIds: string[];
    baseActiveId: string | null;
    active: boolean;
    lastKey: string;
  } | null>(null);

  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);
  const sortedTracksRef = useRef(sortedTracks);
  sortedTracksRef.current = sortedTracks;

  const layersRef = useRef(layers);
  layersRef.current = layers;

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const scrollY = useTimelineStore((s) => s.scrollY);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const followPlayhead = useTimelineStore((s) => s.followPlayhead);
  const showWaveforms = useTimelineStore((s) => s.showWaveforms);
  const showThumbnails = useTimelineStore((s) => s.showThumbnails);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const setScrollY = useTimelineStore((s) => s.setScrollY);
  const zoomAtCursor = useTimelineStore((s) => s.zoomAtCursor);
  const durationFrames = useEditorStore((s) => s.composition.settings.durationFrames);
  const frameRate = useEditorStore((s) => s.composition.settings.frameRate);
  const markers = useEditorStore((s) => s.composition.markers);
  const removeMarker = useEditorStore((s) => s.removeMarker);
  const moveClipInTime = useEditorStore((s) => s.moveClipInTime);
  const moveClipToTrack = useEditorStore((s) => s.moveClipToTrack);
  const reorderClipToTrackPosition = useEditorStore((s) => s.reorderClipToTrackPosition);
  const commitClipMove = useEditorStore((s) => s.commitClipMove);
  const canPlaceOnTrack = useEditorStore((s) => s.canPlaceOnTrack);
  const resizeClips = useEditorStore((s) => s.resizeClips);
  const { show: showCtxMenu } = useContextMenu();
  // Tag unused legacy actions so TS does not complain after the canonical migration.
  void moveClipInTime; void moveClipToTrack; void reorderClipToTrackPosition;

  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const durationFramesRef = useRef(durationFrames);
  durationFramesRef.current = durationFrames;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setContainerWidth(w);
      // Publish to the store so menu-driven fit/jump actions know the viewport width.
      useTimelineStore.getState().setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying || !followPlayhead) return;
    const playheadX = frameToPixel(currentFrame, zoomLevel, scrollX);
    if (playheadX > containerWidth - 60) {
      const newScrollX = currentFrame * getFrameWidth(zoomLevel) - containerWidth * 0.2;
      setScrollX(Math.max(0, newScrollX));
    } else if (playheadX < 40) {
      const newScrollX = currentFrame * getFrameWidth(zoomLevel) - containerWidth * 0.8;
      setScrollX(Math.max(0, newScrollX));
    }
  }, [currentFrame, isPlaying, followPlayhead, zoomLevel, scrollX, containerWidth, setScrollX]);

  // --- Playhead scrub with edge auto-scroll ---
  const scrubCursorRef = useRef<number | null>(null);
  const scrubRafRef = useRef<number>(0);

  const scrubAtClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left;
    const { scrollX: sx, zoomLevel: zl } = useTimelineStore.getState();
    const frame = pixelToFrame(localX, zl, sx);
    const maxFrame = durationFramesRef.current - 1;
    useTimelineStore.getState().scrubTo(Math.max(0, Math.min(frame, maxFrame)));
  }, []);

  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    scrubAtClientX(e.clientX);
    scrubCursorRef.current = e.clientX;

    const onMove = (ev: MouseEvent) => {
      scrubCursorRef.current = ev.clientX;
      scrubAtClientX(ev.clientX);
    };

    const onUp = () => {
      scrubCursorRef.current = null;
      cancelAnimationFrame(scrubRafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    // rAF edge-scroll loop
    const tick = () => {
      const cx = scrubCursorRef.current;
      const container = containerRef.current;
      if (cx === null || !container) { scrubRafRef.current = requestAnimationFrame(tick); return; }
      const rect = container.getBoundingClientRect();
      const localX = cx - rect.left;
      const edgePx = rect.width * SCRUB_EDGE_ZONE;
      let scrollDelta = 0;

      if (localX > rect.width - edgePx) {
        const ratio = Math.min(1, (localX - (rect.width - edgePx)) / edgePx);
        scrollDelta = SCRUB_MAX_SPEED * ratio * ratio;
      } else if (localX < edgePx) {
        const ratio = Math.min(1, (edgePx - localX) / edgePx);
        scrollDelta = -SCRUB_MAX_SPEED * ratio * ratio;
      }

      if (scrollDelta !== 0) {
        const state = useTimelineStore.getState();
        const newScrollX = Math.max(0, state.scrollX + scrollDelta);
        state.setScrollX(newScrollX);
        // Re-scrub so playhead follows cursor at new scroll offset
        scrubAtClientX(cx);
      }
      scrubRafRef.current = requestAnimationFrame(tick);
    };
    scrubRafRef.current = requestAnimationFrame(tick);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scrubAtClientX]);

  useEffect(() => {
    return () => { cancelAnimationFrame(scrubRafRef.current); };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;

    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * getZoomSensitivity());
      zoomAtCursor(cursorX, factor);
    } else if (e.altKey) {
      const totalH = sortedTracksRef.current.reduce((sum, t) => sum + getTrackHeight(t), 0);
      const visibleH = el.clientHeight;
      const maxScrollY = Math.max(0, totalH - visibleH);
      const dy = e.deltaY * getScrollSpeed();
      const newScrollY = Math.max(0, Math.min(maxScrollY, useTimelineStore.getState().scrollY + dy));
      setScrollY(newScrollY);
    } else if (e.shiftKey) {
      const maxScroll = getMaxScrollX(durationFrames, zoomLevel, containerWidth);
      const newScrollX = Math.max(0, Math.min(maxScroll, scrollX + e.deltaY * 2));
      setScrollX(newScrollX);
    } else {
      const maxScroll = getMaxScrollX(durationFrames, zoomLevel, containerWidth);
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const newScrollX = Math.max(0, Math.min(maxScroll, scrollX + dx * 2));
      setScrollX(newScrollX);
    }
  }, [zoomLevel, scrollX, durationFrames, containerWidth, setScrollX, setScrollY, zoomAtCursor]);

  // Drag start handler
  const handleClipPointerDown = useCallback((layerId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const layer = layersRef.current.find((l) => l.id === layerId);
    if (!layer) return;

    const state: ClipDragState = {
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      startInPoint: layer.inPoint,
      startTrackId: layer.trackId,
      currentFrame: layer.inPoint,
      ghostTrackId: layer.trackId,
      intent: null,
      newTrackIndicatorY: null,
      isValid: true,
      isDragging: false,
      snapLines: [],
    };
    setClipDrag(state);
    clipDragRef.current = state;
  }, []);

  // Edge-resize start handler. Captures the originating clip endpoints and the
  // full set of clips that should resize together so the entire interaction
  // lives in local pixel space — no store writes occur until pointerup commits
  // a single resizeClips operation.
  const handleResizePointerDown = useCallback(
    (layerId: string, edge: 'left' | 'right', e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const layer = layersRef.current.find((l) => l.id === layerId);
      if (!layer) return;

      // Grabbing the handle of an already-selected clip resizes the whole
      // selection as a group; grabbing an unselected clip resizes it alone.
      const selected = selectedIdsRef.current;
      const targetIds = selected.includes(layerId) ? [...selected] : [layerId];

      const state: ClipResizeState = {
        anchorId: layerId,
        targetIds,
        edge,
        startClientX: e.clientX,
        startInPoint: layer.inPoint,
        startOutPoint: layer.outPoint,
        previewInPoint: layer.inPoint,
        previewOutPoint: layer.outPoint,
        previewDelta: 0,
        isValid: true,
        cursorClientX: e.clientX,
        cursorClientY: e.clientY,
      };
      setClipResize(state);
      clipResizeRef.current = state;
    },
    []
  );

  // Global pointer move/up for drag
  useEffect(() => {
    if (!clipDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = clipDragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!drag.isDragging && dist < getDragThreshold()) return;

      const layer = layersRef.current.find((l) => l.id === drag.layerId);
      if (!layer) return;
      const duration = layer.outPoint - layer.inPoint;

      // Compute raw new frame position. No upper wall — timeline auto-expands
      // to accommodate clips dragged past the current end (commit on release).
      const frameDelta = Math.round(dx / getFrameWidth(zoomLevelRef.current));
      const rawInPoint = Math.max(0, drag.startInPoint + frameDelta);

      // Apply timeline snapping (unless Alt held)
      let newInPoint = rawInPoint;
      let snapLines: TimelineSnapLine[] = [];
      if (!e.altKey) {
        const snapSources = buildClipSnapSources(layersRef.current, drag.layerId);
        const frameWidth = getFrameWidth(zoomLevelRef.current);
        const thresholdFrames = pixelThresholdToFrames(TIMELINE_SNAP_PX, frameWidth);
        const currentFrameVal = useTimelineStore.getState().currentFrame;
        const snapResult = calculateClipMoveSnap(
          rawInPoint, duration, snapSources, currentFrameVal, thresholdFrames, true
        );
        newInPoint = Math.max(0, snapResult.snappedFrame);
        snapLines = snapResult.snapLines;
      }
      const outPoint = newInPoint + duration;

      // ── Y-zone classifier ────────────────────────────────────────────
      // Premiere-style: the body of each row is the dominant drop zone, and
      // a thin BOUNDARY_PX band straddling each row boundary line is the
      // newTrack insertion zone. Fixed pixels (not percentages) keep the
      // body stable even on short rows — a 22px audio row gets a ~14px
      // body, far easier to hit than the previous 11px body.
      const container = containerRef.current;
      const tracks = sortedTracksRef.current;
      const BOUNDARY_PX = 4;

      type Zone =
        | { kind: 'body'; track: Track; topY: number }
        | { kind: 'boundary'; insertOrder: number; lineY: number };

      let zone: Zone | null = null;
      if (container) {
        const rect = container.getBoundingClientRect();
        const mouseY = e.clientY - rect.top + useTimelineStore.getState().scrollY;

        // Boundary lines are at: 0, h_0, h_0 + h_1, ..., total. A cursor
        // within BOUNDARY_PX of any line snaps to that line's insertion
        // point. Otherwise the cursor is inside (or below) a row body.
        let accY = 0;
        const boundaries: number[] = [0];
        for (const t of tracks) {
          accY += getTrackHeight(t);
          boundaries.push(accY);
        }

        for (let i = 0; i < boundaries.length; i++) {
          if (Math.abs(mouseY - boundaries[i]) <= BOUNDARY_PX) {
            zone = { kind: 'boundary', insertOrder: i, lineY: boundaries[i] };
            break;
          }
        }

        if (!zone) {
          let accBody = 0;
          for (const track of tracks) {
            const h = getTrackHeight(track);
            if (mouseY < accBody + h) {
              zone = { kind: 'body', track, topY: accBody };
              break;
            }
            accBody += h;
          }
          if (!zone) {
            // Below the last row — append a new track at the end.
            zone = { kind: 'boundary', insertOrder: tracks.length, lineY: accBody };
          }
        }
      }

      // ── Intent prediction ───────────────────────────────────────────
      // Visual layers must stay above audio tracks; audio layers must stay
      // below visual tracks. We clamp the insertion order so newTrack intents
      // never break the audio-below-visual invariant.
      const isAudio = layer.type === 'audio';
      const visualTracks = tracks.filter((t) => t.type !== 'audio');
      const audioTracks = tracks.filter((t) => t.type === 'audio');
      const minNewTrackOrder = isAudio
        ? (visualTracks.length > 0 ? visualTracks[visualTracks.length - 1].order + 1 : 0)
        : 0;
      const maxNewTrackOrder = isAudio
        ? tracks.length
        : (audioTracks.length > 0 ? audioTracks[0].order : tracks.length);
      const clampOrder = (o: number) => Math.max(minNewTrackOrder, Math.min(maxNewTrackOrder, o));

      let intent: CommitClipMoveIntent | null = null;
      let valid = true;
      let ghostTrackId: string | null = null;
      let newTrackIndicatorY: number | null = null;

      if (!zone) {
        intent = { kind: 'sameTrack', inPoint: newInPoint };
      } else if (zone.kind === 'boundary') {
        intent = {
          kind: 'newTrack',
          insertOrder: clampOrder(zone.insertOrder),
          inPoint: newInPoint,
        };
        newTrackIndicatorY = zone.lineY;
      } else {
        // Body of a track: try to fit on this track. Cross-type lands as
        // invalid feedback so the user is nudged toward a boundary line.
        const compatible = zone.track.type === 'mixed' || zone.track.type === layerTypeToTrack(layer.type);
        if (!compatible) {
          // Snap to the nearest valid boundary line so committing creates a
          // new track in the correct lane (above for visual, below for audio).
          const fallbackOrder = clampOrder(isAudio ? zone.track.order + 1 : zone.track.order);
          intent = { kind: 'newTrack', insertOrder: fallbackOrder, inPoint: newInPoint };
          valid = false;
          newTrackIndicatorY = isAudio ? zone.topY + getTrackHeight(zone.track) : zone.topY;
        } else {
          ghostTrackId = zone.track.id;
          if (isTrackCompressed(zone.track)) {
            // Compressed track: predict an INSERTION INDEX, not a timestamp.
            // The dragged clip's center decides where it slots into the
            // gapless order; the ghost is then shown at the future compressed
            // position (sum of preceding clip durations).
            const trackClips = layersRef.current
              .filter((l) => l.trackId === zone.track.id && l.id !== drag.layerId)
              .sort((a, b) => a.inPoint - b.inPoint);
            const dragCenter = newInPoint + duration / 2;
            let insertIndex = 0;
            let ghostInPoint = 0;
            for (const c of trackClips) {
              const cDur = c.outPoint - c.inPoint;
              if (dragCenter > c.inPoint + cDur / 2) {
                insertIndex++;
                ghostInPoint += cDur;
              } else {
                break;
              }
            }
            intent = { kind: 'compressedInsert', trackId: zone.track.id, insertIndex };
            // Render the clip / ghost at the resolved insertion position.
            newInPoint = ghostInPoint;
            snapLines = [];
            valid = true;
          } else {
            // Body of a normal track: standard timestamp-based placement.
            const fits = canPlaceOnTrack(drag.layerId, zone.track.id, newInPoint, outPoint);
            intent = { kind: 'existingTrack', trackId: zone.track.id, inPoint: newInPoint };
            valid = fits;
          }
        }
      }

      const next: ClipDragState = {
        ...drag,
        isDragging: true,
        currentFrame: newInPoint,
        ghostTrackId,
        intent,
        newTrackIndicatorY,
        isValid: valid,
        snapLines,
      };
      setClipDrag(next);
      clipDragRef.current = next;
    };

    const handlePointerUp = () => {
      const drag = clipDragRef.current;
      if (drag && drag.isDragging && drag.isValid && drag.intent) {
        // Same-track horizontal-only moves collapse to sameTrack intent so the
        // store can early-return when the frame didn't change.
        const intent = drag.intent;
        if (intent.kind === 'existingTrack' && intent.trackId === drag.startTrackId) {
          commitClipMove(drag.layerId, { kind: 'sameTrack', inPoint: intent.inPoint });
        } else {
          commitClipMove(drag.layerId, intent);
        }
      }
      setClipDrag(null);
      clipDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [clipDrag !== null, canPlaceOnTrack, commitClipMove]); // Re-subscribe when drag starts/stops

  // Edge-resize: pointer move + up + auto-scroll. Pure frontend preview —
  // we maintain integer frame boundaries in local state, render the active
  // clip from those values, and only call setClipBounds once on release.
  useEffect(() => {
    if (!clipResize) return;

    const recomputePreview = (clientX: number) => {
      const drag = clipResizeRef.current;
      if (!drag) return;
      const frameWidth = getFrameWidth(zoomLevelRef.current);
      const dx = clientX - drag.startClientX;
      const requestedDelta = dx / frameWidth;

      // One shared delta, clamped so EVERY target stays valid (most restrictive
      // clip wins). Because we clamp, the preview is always a legal state.
      const delta = clampGroupResizeDelta(
        layersRef.current,
        drag.targetIds,
        drag.edge,
        requestedDelta,
      );

      const anchor = applyResizeDelta(
        { inPoint: drag.startInPoint, outPoint: drag.startOutPoint },
        drag.edge,
        delta,
      );

      const next: ClipResizeState = {
        ...drag,
        previewDelta: delta,
        previewInPoint: anchor.inPoint,
        previewOutPoint: anchor.outPoint,
        isValid: true,
        cursorClientX: clientX,
        cursorClientY: drag.cursorClientY,
      };
      setClipResize(next);
      clipResizeRef.current = next;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = clipResizeRef.current;
      if (!drag) return;
      // Update cursor Y for tooltip placement even if X is unchanged.
      clipResizeRef.current = { ...drag, cursorClientY: e.clientY };
      recomputePreview(e.clientX);
    };

    const handlePointerUp = () => {
      const drag = clipResizeRef.current;
      if (drag && drag.previewDelta !== 0) {
        resizeClips(drag.targetIds, drag.edge, drag.previewDelta);
      }
      setClipResize(null);
      clipResizeRef.current = null;
    };

    // Auto-scroll RAF loop. Active while resizing; reads current cursor X
    // from ref and pushes scroll without going through getMaxScrollX so the
    // user can extend past the current durationFrames.
    let rafId = 0;
    const tick = () => {
      const drag = clipResizeRef.current;
      const container = containerRef.current;
      if (!drag || !container) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const rect = container.getBoundingClientRect();
      const localX = drag.cursorClientX - rect.left;
      let scrollDelta = 0;
      if (localX > rect.width - RESIZE_AUTOSCROLL_EDGE_PX) {
        const ratio = Math.min(1, (localX - (rect.width - RESIZE_AUTOSCROLL_EDGE_PX)) / RESIZE_AUTOSCROLL_EDGE_PX);
        scrollDelta = RESIZE_AUTOSCROLL_MAX_PX_PER_FRAME * ratio;
      } else if (localX < RESIZE_AUTOSCROLL_EDGE_PX) {
        const ratio = Math.min(1, (RESIZE_AUTOSCROLL_EDGE_PX - localX) / RESIZE_AUTOSCROLL_EDGE_PX);
        scrollDelta = -RESIZE_AUTOSCROLL_MAX_PX_PER_FRAME * ratio;
      }
      if (scrollDelta !== 0) {
        const current = useTimelineStore.getState().scrollX;
        useTimelineStore.getState().setScrollX(current + scrollDelta);
        // Re-evaluate preview against the synthetic cursor → frame mapping
        // so the dragged edge tracks the (now-shifted) scroll position.
        recomputePreview(drag.cursorClientX);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [clipResize !== null, resizeClips]);

  // ── Timeline marquee (drag) selection ───────────────────────────────
  // Activation rule: ANY drag starting on EMPTY timeline space begins a marquee.
  // Clip-body and resize-handle pointerdowns call stopPropagation, so this
  // handler never fires over a clip — guaranteeing clip-move / resize and
  // marquee selection are mutually exclusive interaction states.
  //
  // Without Ctrl/Cmd the marquee REPLACES the selection with whatever it hits.
  // With Ctrl/Cmd the marquee is ADDITIVE — touched clips merge into the
  // existing selection. A plain click (no drag) on empty space still clears.
  //
  // Hit-testing is intersection-based and only walks the (small) per-track clip
  // lists, accumulating track Y offsets once — no full-scene scan per frame.
  const runMarqueeHitTest = useCallback(
    (mRect: { x: number; y: number; w: number; h: number }): string[] => {
      const hits: string[] = [];
      const sx = useTimelineStore.getState().scrollX;
      const zoom = zoomLevelRef.current;
      const mRight = mRect.x + mRect.w;
      const mBottom = mRect.y + mRect.h;
      let accY = 0;
      for (const track of sortedTracksRef.current) {
        const trackH = getTrackHeight(track);
        if (accY < mBottom && accY + trackH > mRect.y) {
          for (const clip of layersRef.current) {
            if (clip.trackId !== track.id) continue;
            const clipLeft = frameToPixel(clip.inPoint, zoom, sx);
            const clipRight = frameToPixel(clip.outPoint, zoom, sx);
            if (clipRight > mRect.x && clipLeft < mRight) {
              hits.push(clip.id);
            }
          }
        }
        accY += trackH;
      }
      return hits;
    },
    []
  );

  const handleTrackAreaPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-clip-id]')) return;
      const container = containerRef.current;
      if (!container) return;

      const additive = e.ctrlKey || e.metaKey;

      // Always start a potential marquee — whether additive or not. If the user
      // releases without moving past the threshold it degrades to a click
      // (clear selection when non-additive, no-op when additive).
      const rect = container.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top + useTimelineStore.getState().scrollY;
      const sel = useEditorStore.getState().selection;
      marqueeRef.current = {
        startX,
        startY,
        baseIds: additive ? [...sel.selectedIds] : [],
        baseActiveId: additive ? sel.activeId : null,
        active: false,
        lastKey: '',
      };

      const handleMove = (ev: PointerEvent) => {
        const m = marqueeRef.current;
        if (!m) return;
        const r = container.getBoundingClientRect();
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top + useTimelineStore.getState().scrollY;
        const dx = x - m.startX;
        const dy = y - m.startY;
        if (!m.active && Math.sqrt(dx * dx + dy * dy) < getDragThreshold()) return;
        m.active = true;

        const mRect = {
          x: Math.min(m.startX, x),
          y: Math.min(m.startY, y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        setTimelineMarquee(mRect);

        const hits = runMarqueeHitTest(mRect);
        const merged = m.baseIds.slice();
        for (const id of hits) if (!merged.includes(id)) merged.push(id);

        const key = merged.join(',');
        if (key !== m.lastKey) {
          m.lastKey = key;
          useEditorStore.getState()._setSelection({
            selectedIds: merged,
            activeId: hits.length > 0 ? hits[hits.length - 1] : m.baseActiveId,
            selectedKeyframes: [],
            selectedCurvePoints: [],
          });
        }
      };

      const handleUp = () => {
        const m = marqueeRef.current;
        // If the pointer never moved past threshold, treat as a click.
        if (m && !m.active && !additive) {
          useEditorStore.getState()._setSelection({
            selectedIds: [],
            activeId: null,
            selectedKeyframes: [],
            selectedCurvePoints: [],
          });
        }
        marqueeRef.current = null;
        setTimelineMarquee(null);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [runMarqueeHitTest]
  );

  const visibleRange = getVisibleFrameRange(containerWidth, zoomLevel, scrollX);
  const ticks = getRulerTicks(visibleRange, zoomLevel, frameRate);
  const playheadX = frameToPixel(currentFrame, zoomLevel, scrollX);
  const totalWidth = getTotalTimelineWidth(durationFrames, zoomLevel);

  const scrollbarThumbWidth = Math.max(30, (containerWidth / totalWidth) * containerWidth);
  const scrollbarThumbLeft = totalWidth > containerWidth
    ? (scrollX / (totalWidth - containerWidth)) * (containerWidth - scrollbarThumbWidth)
    : 0;
  const showScrollbar = totalWidth > containerWidth;

  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startScrollX = scrollX;
    const maxScroll = getMaxScrollX(durationFrames, zoomLevel, containerWidth);
    const scrollableTrack = containerWidth - scrollbarThumbWidth;

    const onMove = (ev: MouseEvent) => {
      const ddx = ev.clientX - startX;
      const scrollDelta = (ddx / scrollableTrack) * maxScroll;
      setScrollX(Math.max(0, Math.min(maxScroll, startScrollX + scrollDelta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scrollX, durationFrames, zoomLevel, containerWidth, scrollbarThumbWidth, setScrollX]);

  if (rulerOnly) {
    return (
      <div
        ref={containerRef}
        className="flex-1 relative bg-[#1a1e28] border-b border-[#243a5c] cursor-col-resize select-none overflow-hidden"
        onMouseDown={handleRulerMouseDown}
        onWheel={handleWheel}
      >
        {ticks.map((tick, i) => {
          const x = frameToPixel(tick.frame, zoomLevel, scrollX);
          if (x < -40 || x > containerWidth + 40) return null;
          return (
            <div key={`${i}-${tick.frame}`} className="absolute top-0 h-full" style={{ left: x }}>
              <div
                className={`w-px ${tick.major ? 'bg-slate-500/60' : 'bg-slate-700/40'}`}
                style={{ height: tick.major ? 10 : 5, marginTop: tick.major ? 10 : 15 }}
              />
              {tick.major && tick.label !== null && (
                <span className="absolute top-[1px] left-[3px] text-[9px] text-slate-400 whitespace-nowrap font-mono">
                  {tick.label}
                </span>
              )}
            </div>
          );
        })}

        {markers && markers.map((m) => {
          const mx = frameToPixel(m.frame, zoomLevel, scrollX);
          const color = m.color || '#38bdf8';
          const bandRight = m.endFrame != null ? frameToPixel(m.endFrame, zoomLevel, scrollX) : mx;
          if (bandRight < -20 || mx > containerWidth + 20) return null;
          return (
            <div key={m.id} className="absolute top-0 h-full z-10">
              {m.endFrame != null && (
                <div
                  className="absolute top-0 h-full pointer-events-none"
                  style={{ left: mx, width: Math.max(1, bandRight - mx), backgroundColor: color, opacity: 0.12 }}
                />
              )}
              <div
                className="absolute top-0 w-px h-full pointer-events-none"
                style={{ left: mx, backgroundColor: color, opacity: 0.7 }}
              />
              <div
                className="absolute top-0 cursor-pointer"
                style={{ left: mx, transform: 'translateX(-1px)' }}
                title={`${m.name || (m.endFrame != null ? 'Section' : 'Marker')} @ ${m.frame}${m.endFrame != null ? `–${m.endFrame}` : ''} · right-click to remove`}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeMarker(m.id); }}
              >
                <div className="w-0 h-0 border-l-[4px] border-t-[6px] border-l-transparent" style={{ borderTopColor: color }} />
              </div>
            </div>
          );
        })}

        {playheadX >= -5 && playheadX <= containerWidth + 5 && (
          <div
            className="absolute bottom-0 z-20 pointer-events-none"
            style={{ left: playheadX, transform: 'translateX(-4px)' }}
          >
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#ffcc00]" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-[#16294a] select-none"
        onWheel={handleWheel}
        onPointerDown={handleTrackAreaPointerDown}
      >
        {/* Vertically scrollable track stack */}
        <div
          style={{ transform: `translateY(${-scrollY}px)`, willChange: 'transform' }}
        >
        {/* Render tracks */}
        {sortedTracks.map((track, trackIndex) => {
          const trackHeight = getTrackHeight(track);
          const trackClips = layers.filter((l) => l.trackId === track.id);
          const isDropTarget = clipDrag?.isDragging
            && (clipDrag.intent?.kind === 'existingTrack' || clipDrag.intent?.kind === 'compressedInsert')
            && clipDrag.intent.trackId === track.id;

          // Live gapless reflow preview: when dragging onto a compressed track,
          // recompute every clip's display position as if the dragged clip were
          // already inserted at its predicted index. Pure render-time math — no
          // store mutation happens until pointerup.
          let previewLayout: Map<string, { in: number; out: number }> | null = null;
          if (clipDrag?.isDragging && clipDrag.intent?.kind === 'compressedInsert' && clipDrag.intent.trackId === track.id) {
            const dragged = layers.find((l) => l.id === clipDrag.layerId);
            if (dragged) {
              const draggedDur = dragged.outPoint - dragged.inPoint;
              const others = trackClips
                .filter((l) => l.id !== clipDrag.layerId)
                .sort((a, b) => a.inPoint - b.inPoint);
              const idx = Math.max(0, Math.min(clipDrag.intent.insertIndex, others.length));
              previewLayout = new Map();
              let cursor = 0;
              for (let i = 0; i <= others.length; i++) {
                if (i === idx) {
                  previewLayout.set(dragged.id, { in: cursor, out: cursor + draggedDur });
                  cursor += draggedDur;
                }
                if (i < others.length) {
                  const o = others[i];
                  const d = o.outPoint - o.inPoint;
                  previewLayout.set(o.id, { in: cursor, out: cursor + d });
                  cursor += d;
                }
              }
            }
          }

          return (
            <div
              key={track.id}
              className={`relative border-b border-[#1a2a42] ${!track.visible ? 'opacity-35' : ''}`}
              style={{
                height: trackHeight,
                backgroundColor: isDropTarget
                  ? clipDrag.isValid ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.06)'
                  : trackIndex % 2 === 0 ? '#0c1a2d' : '#0a1628',
                boxShadow: isDropTarget
                  ? clipDrag.isValid
                    ? 'inset 0 0 0 1px rgba(34,197,94,0.55)'
                    : 'inset 0 0 0 1px rgba(239,68,68,0.55)'
                  : undefined,
              }}
              data-track-id={track.id}
            >
              {/* Clips within this track */}
              {trackClips.map((layer) => {
                const isDragTarget = clipDrag?.layerId === layer.id && clipDrag.isDragging;
                const isResizeTarget = !!clipResize?.targetIds.includes(layer.id);

                let displayIn = layer.inPoint;
                let displayOut = layer.outPoint;
                const preview = previewLayout?.get(layer.id);
                if (isResizeTarget && clipResize) {
                  const t = applyResizeDelta(
                    { inPoint: layer.inPoint, outPoint: layer.outPoint },
                    clipResize.edge,
                    clipResize.previewDelta,
                  );
                  displayIn = t.inPoint;
                  displayOut = t.outPoint;
                } else if (preview) {
                  displayIn = preview.in;
                  displayOut = preview.out;
                } else if (isDragTarget && clipDrag) {
                  displayIn = clipDrag.currentFrame;
                  displayOut = clipDrag.currentFrame + (layer.outPoint - layer.inPoint);
                }

                // If clip is being dragged to another track, hide from source
                // (unless a compressed preview is already positioning it here).
                if (isDragTarget && clipDrag && !preview && clipDrag.ghostTrackId !== track.id) return null;

                const inX = frameToPixel(displayIn, zoomLevel, scrollX);
                const outX = frameToPixel(displayOut, zoomLevel, scrollX);
                const clipLeft = Math.max(0, inX);
                const clipRight = Math.min(containerWidth, outX);
                const barWidth = clipRight - clipLeft;

                if (barWidth <= 0) return null;

                const color = getClipColor(layer);
                const isSelected = selectedIds.includes(layer.id);
                const isInvalid = (isDragTarget && clipDrag && !clipDrag.isValid)
                  || (isResizeTarget && clipResize && !clipResize.isValid);
                const showHandles = !isDragTarget && !clipResize;

                return (
                  <div
                    key={layer.id}
                    data-clip-id={layer.id}
                    className="absolute overflow-hidden"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const currentSel = selectedIdsRef.current;
                      if (currentSel.includes(layer.id) && currentSel.length > 1) {
                        showCtxMenu(e.clientX, e.clientY, buildMultiClipMenu());
                      } else {
                        onSelect?.(layer.id, false);
                        showCtxMenu(e.clientX, e.clientY, buildClipMenu(layer.id));
                      }
                    }}
                    style={{
                      left: clipLeft,
                      width: barWidth,
                      top: 0,
                      bottom: 0,
                      backgroundColor: color,
                      opacity: isDragTarget ? 0.7 : isResizeTarget ? 0.92 : isSelected ? 0.95 : 0.75,
                      borderLeft: '1px solid rgba(255,255,255,0.1)',
                      borderRight: '1px solid rgba(0,0,0,0.3)',
                      outline: isSelected ? '1.5px solid #ffffff' : isInvalid ? '1.5px solid #ef4444' : 'none',
                      outlineOffset: '-1.5px',
                      cursor: isResizeTarget ? 'ew-resize' : 'grab',
                    }}
                  >
                    {/* Body — initiates move/select drag */}
                    <div
                      className="absolute inset-0"
                      style={{ left: RESIZE_EDGE_PX, right: RESIZE_EDGE_PX, cursor: 'grab' }}
                      onPointerDown={(e) => {
                        // Right-click on an already-selected clip in a multi-selection: don't deselect.
                        if (e.button === 2) {
                          const currentSel = selectedIdsRef.current;
                          if (currentSel.includes(layer.id) && currentSel.length > 1) return;
                        }
                        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                        onSelect?.(layer.id, additive);
                        handleClipPointerDown(layer.id, e);
                      }}
                    />

                    {/* Video thumbnail strip */}
                    {showThumbnails && layer.type === 'video' && track.type === 'video' && barWidth > 40 && (
                      <VideoThumbnailStrip
                        assetId={layer.video.assetId}
                        sourceFrameRate={layer.video.sourceFrameRate}
                        startOffset={layer.video.startOffset}
                        clipWidth={barWidth}
                        clipHeight={trackHeight}
                        inPoint={layer.inPoint}
                        outPoint={layer.outPoint}
                        compositionFrameRate={frameRate}
                      />
                    )}

                    {/* Video audio waveform overlay */}
                    {showWaveforms && layer.type === 'video' && barWidth > 20 && !layer.video.muted && (
                      <VideoAudioWaveformStrip
                        layer={layer as VideoLayer}
                        clipWidth={barWidth}
                        clipHeight={trackHeight}
                        compositionFrameRate={frameRate}
                      />
                    )}

                    {/* Audio waveform */}
                    {showWaveforms && layer.type === 'audio' && barWidth > 20 && (
                      <AudioWaveformStrip
                        layer={layer as AudioLayer}
                        clipWidth={barWidth}
                        clipHeight={trackHeight}
                        compositionFrameRate={frameRate}
                      />
                    )}

                    {/* Silence-stripper live preview overlay */}
                    {(layer.type === 'video' || layer.type === 'audio') && (
                      <SilenceOverlay
                        layer={layer}
                        clipLeft={clipLeft}
                        zoomLevel={zoomLevel}
                        scrollX={scrollX}
                      />
                    )}

                    {/* Keyframe markers */}
                    <KeyframeMarkers
                      layer={layer}
                      displayIn={displayIn}
                      displayOut={displayOut}
                      barWidth={barWidth}
                      clipLeft={clipLeft}
                      inX={inX}
                    />

                    {/* Proxy badge */}
                    {layer.type === 'video' && layer.video.playbackMode === 'proxy' && barWidth > 60 && (
                      <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/55 text-[8px] font-semibold tracking-wide text-[#ffc83d] pointer-events-none">
                        PROXY
                      </span>
                    )}

                    {/* Edge handles — hover surface, no permanent indicator */}
                    {showHandles && (
                      <>
                        <div
                          className="absolute top-0 bottom-0 z-10 group"
                          style={{ left: 0, width: RESIZE_EDGE_PX, cursor: 'ew-resize' }}
                          onPointerDown={(e) => {
                            if (!isSelected) onSelect?.(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            handleResizePointerDown(layer.id, 'left', e);
                          }}
                        >
                          <div className="absolute inset-y-1 left-0 w-[3px] bg-white/0 group-hover:bg-white/80 transition-colors rounded-r" />
                        </div>
                        <div
                          className="absolute top-0 bottom-0 z-10 group"
                          style={{ right: 0, width: RESIZE_EDGE_PX, cursor: 'ew-resize' }}
                          onPointerDown={(e) => {
                            if (!isSelected) onSelect?.(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            handleResizePointerDown(layer.id, 'right', e);
                          }}
                        >
                          <div className="absolute inset-y-1 right-0 w-[3px] bg-white/0 group-hover:bg-white/80 transition-colors rounded-l" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Ghost clip preview when dragging to a different existing track */}
              {clipDrag && clipDrag.isDragging && clipDrag.ghostTrackId === track.id && clipDrag.startTrackId !== track.id && (
                <GhostClip
                  inPoint={clipDrag.currentFrame}
                  layerId={clipDrag.layerId}
                  layers={layers}
                  zoomLevel={zoomLevel}
                  scrollX={scrollX}
                  containerWidth={containerWidth}
                  isValid={clipDrag.isValid}
                />
              )}
            </div>
          );
        })}

        {/* Ghost lanes — empty placeholder rows that fill the timeline so it
            never reads as blank. Each real clip the user creates spawns a track,
            consuming one ghost lane from the top of the stack. */}
        {Array.from({ length: ghostRowCount }).map((_, i) => (
          <div
            key={`ghost-${i}`}
            className="relative border-b border-[#1a2a42]/70 pointer-events-none"
            style={{
              height: ROW_HEIGHT,
              backgroundColor: (sortedTracks.length + i) % 2 === 0 ? '#0c1a2d' : '#0a1628',
            }}
          />
        ))}

        {/* New-track insertion indicator (newTrack intent) */}
        {clipDrag && clipDrag.isDragging && clipDrag.intent?.kind === 'newTrack' && clipDrag.newTrackIndicatorY !== null && (
          <div
            className="absolute left-0 right-0 z-30 pointer-events-none"
            style={{
              top: clipDrag.newTrackIndicatorY - 2,
              height: 4,
              backgroundColor: clipDrag.isValid ? '#3b82f6' : '#ef4444',
              boxShadow: clipDrag.isValid
                ? '0 0 12px 1px rgba(59,130,246,0.85), inset 0 0 0 1px rgba(255,255,255,0.4)'
                : '0 0 12px 1px rgba(239,68,68,0.85), inset 0 0 0 1px rgba(255,255,255,0.4)',
              borderRadius: 2,
            }}
          />
        )}
        </div>{/* end vertical scroll wrapper */}

        {/* Playhead */}
        {playheadX >= -1 && playheadX <= containerWidth + 1 && (
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: playheadX, width: 1, backgroundColor: '#ffcc00' }}
          />
        )}

        {/* Snap lines during clip drag */}
        {clipDrag && clipDrag.isDragging && clipDrag.snapLines.length > 0 && (
          <TimelineSnapLines
            snapLines={clipDrag.snapLines}
            frameToPixelFn={(frame) => frameToPixel(frame, zoomLevel, scrollX)}
            containerHeight={sortedTracks.reduce((sum, t) => sum + getTrackHeight(t), 0)}
          />
        )}

        {/* Timeline marquee selection */}
        {timelineMarquee && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: timelineMarquee.x,
              top: timelineMarquee.y - scrollY,
              width: timelineMarquee.w,
              height: timelineMarquee.h,
              border: '1px solid rgba(56, 189, 248, 0.8)',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
            }}
          />
        )}
      </div>

      {/* Horizontal scrollbar */}
      {showScrollbar && (
        <div className="h-[10px] min-h-[10px] bg-[#081220] border-t border-[#1a2a42] relative">
          <div
            className="absolute top-[2px] bottom-[2px] rounded-full bg-slate-600/40 hover:bg-slate-500/50 cursor-grab active:cursor-grabbing transition-colors"
            style={{ left: scrollbarThumbLeft, width: scrollbarThumbWidth }}
            onMouseDown={handleScrollbarMouseDown}
          />
        </div>
      )}

      {clipResize && (
        <ResizeTooltip
          state={clipResize}
          frameRate={frameRate}
        />
      )}
    </div>
  );
}

function ResizeTooltip({
  state,
  frameRate,
}: {
  state: ClipResizeState;
  frameRate: number;
}) {
  const duration = state.previewOutPoint - state.previewInPoint;
  const seconds = (duration / frameRate).toFixed(2);
  const endFrame = state.previewOutPoint;
  const startFrame = state.previewInPoint;
  return (
    <div
      className="fixed z-[100] pointer-events-none px-2 py-1 rounded-md bg-[#0e1c32]/95 border border-[#243a5c] shadow-lg text-[10px] font-mono tabular-nums whitespace-nowrap"
      style={{
        left: state.cursorClientX + 14,
        top: state.cursorClientY - 36,
        color: state.isValid ? '#e5e7eb' : '#fca5a5',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-slate-500 uppercase tracking-wider text-[9px]">Duration</span>
        <span>{duration} f</span>
        <span className="text-slate-500">·</span>
        <span>{seconds}s</span>
      </div>
      <div className="flex items-center gap-2 text-slate-400">
        <span className="text-[9px]">in</span>
        <span>{startFrame}</span>
        <span className="text-slate-600">→</span>
        <span className="text-[9px]">out</span>
        <span>{endFrame}</span>
      </div>
    </div>
  );
}

function SilenceOverlay({
  layer,
  clipLeft,
  zoomLevel,
  scrollX,
}: {
  layer: Layer;
  clipLeft: number;
  zoomLevel: number;
  scrollX: number;
}) {
  const targetLayerId = useSilenceStore((s) => s.targetLayerId);
  const stage = useSilenceStore((s) => s.stage);
  const plan = useSilenceStore((s) => s.plan);

  if (targetLayerId !== layer.id || stage !== 'preview' || !plan) return null;

  // Plan intervals are clip-local frames relative to the original inPoint, which
  // is the clip's current position during preview (nothing is committed yet).
  const base = layer.inPoint;
  const span = (startFrame: number, endFrame: number) => {
    const left = frameToPixel(base + startFrame, zoomLevel, scrollX) - clipLeft;
    const width =
      frameToPixel(base + endFrame, zoomLevel, scrollX) -
      frameToPixel(base + startFrame, zoomLevel, scrollX);
    return { left, width };
  };

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none">
      {plan.speechLocal.map((s, i) => {
        const { left, width } = span(s.startFrame, s.endFrame);
        if (width <= 0) return null;
        return (
          <div
            key={`speech-${i}`}
            className="absolute top-0 bottom-0 bg-emerald-400/20 border-l border-r border-emerald-400/40"
            style={{ left, width }}
          />
        );
      })}
      {plan.silenceLocal.map((s, i) => {
        const { left, width } = span(s.startFrame, s.endFrame);
        if (width <= 0) return null;
        return (
          <div
            key={`silence-${i}`}
            className="absolute top-0 bottom-0 bg-red-500/35 border-l border-r border-red-500/50"
            style={{ left, width }}
          />
        );
      })}
    </div>
  );
}

function AudioWaveformStrip({ layer, clipWidth, clipHeight, compositionFrameRate }: { layer: AudioLayer; clipWidth: number; clipHeight: number; compositionFrameRate: number }) {
  const waveform = mediaAssetManager.getWaveform(layer.audio.assetId);
  const canvas = useMemo(() => {
    if (!waveform || clipWidth <= 0) return null;
    const totalDuration = layer.audio.sourceDuration;
    if (totalDuration <= 0) return null;

    const peakCount = waveform.peaks.length / 2;
    // Source window the clip plays, in seconds. Source time 0 sits at
    // (inPoint - startOffset); the clip spans (outPoint - inPoint) comp frames.
    const startOffset = layer.audio.startOffset ?? 0;
    const sourceStartSec = startOffset / compositionFrameRate;
    const sourceSpanSec = (layer.outPoint - layer.inPoint) / compositionFrameRate;
    const startRatio = sourceStartSec / totalDuration;
    const clipDurationRatio = sourceSpanSec / totalDuration;

    const startPeak = Math.max(0, Math.floor(startRatio * peakCount));
    const endPeak = Math.min(peakCount, Math.floor((startRatio + clipDurationRatio) * peakCount));
    const visiblePeaks = endPeak - startPeak;

    if (visiblePeaks <= 0) return null;

    const barCount = Math.min(clipWidth, visiblePeaks);
    const midY = clipHeight / 2;
    const amplitude = (clipHeight - 8) / 2;

    const pathParts: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const peakIdx = startPeak + Math.floor(i * visiblePeaks / barCount);
      const min = waveform.peaks[peakIdx * 2] || 0;
      const max = waveform.peaks[peakIdx * 2 + 1] || 0;
      const x = (i / barCount) * clipWidth;
      const y1 = midY - max * amplitude;
      const y2 = midY - min * amplitude;
      pathParts.push(`M${x.toFixed(1)},${y1.toFixed(1)}L${x.toFixed(1)},${y2.toFixed(1)}`);
    }

    return pathParts.join('');
  }, [waveform, clipWidth, clipHeight, layer.inPoint, layer.outPoint, layer.audio.sourceDuration, layer.audio.startOffset, compositionFrameRate]);

  if (!canvas) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <path d={canvas} stroke="rgba(255,255,255,0.6)" strokeWidth={1.2} fill="none" />
    </svg>
  );
}

function VideoAudioWaveformStrip({ layer, clipWidth, clipHeight, compositionFrameRate }: { layer: VideoLayer; clipWidth: number; clipHeight: number; compositionFrameRate: number }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return mediaAssetManager.subscribe(() => forceUpdate((v) => v + 1));
  }, []);

  const waveform = mediaAssetManager.getWaveform(layer.video.assetId);
  const canvas = useMemo(() => {
    if (!waveform || clipWidth <= 0) return null;
    const totalDuration = waveform.duration;
    if (totalDuration <= 0) return null;

    const peakCount = waveform.peaks.length / 2;
    const startOffset = layer.video.startOffset ?? 0;
    const sourceStartSec = (startOffset / compositionFrameRate) * layer.video.playbackRate;
    const sourceSpanSec = ((layer.outPoint - layer.inPoint) / compositionFrameRate) * layer.video.playbackRate;
    const startRatio = sourceStartSec / totalDuration;
    const clipDurationRatio = sourceSpanSec / totalDuration;

    const startPeak = Math.max(0, Math.floor(startRatio * peakCount));
    const endPeak = Math.min(peakCount, Math.floor((startRatio + clipDurationRatio) * peakCount));
    const visiblePeaks = endPeak - startPeak;

    if (visiblePeaks <= 0) return null;

    const barCount = Math.min(clipWidth, visiblePeaks);
    const midY = clipHeight * 0.75;
    const amplitude = (clipHeight * 0.4) / 2;

    const pathParts: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const peakIdx = startPeak + Math.floor(i * visiblePeaks / barCount);
      const min = waveform.peaks[peakIdx * 2] || 0;
      const max = waveform.peaks[peakIdx * 2 + 1] || 0;
      const x = (i / barCount) * clipWidth;
      const y1 = midY - max * amplitude;
      const y2 = midY - min * amplitude;
      pathParts.push(`M${x.toFixed(1)},${y1.toFixed(1)}L${x.toFixed(1)},${y2.toFixed(1)}`);
    }

    return pathParts.join('');
  }, [waveform, clipWidth, clipHeight, layer.inPoint, layer.outPoint, layer.video.startOffset, layer.video.playbackRate, compositionFrameRate]);

  if (!canvas) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-70" preserveAspectRatio="none">
      <path d={canvas} stroke="rgba(247,181,0,0.8)" strokeWidth={1} fill="none" />
    </svg>
  );
}

function GhostClip({
  inPoint,
  layerId,
  layers,
  zoomLevel,
  scrollX,
  containerWidth,
  isValid,
}: {
  inPoint: number;
  layerId: string;
  layers: Layer[];
  zoomLevel: number;
  scrollX: number;
  containerWidth: number;
  isValid: boolean;
}) {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const duration = layer.outPoint - layer.inPoint;
  const outPoint = inPoint + duration;
  const inX = frameToPixel(inPoint, zoomLevel, scrollX);
  const outX = frameToPixel(outPoint, zoomLevel, scrollX);
  const clipLeft = Math.max(0, inX);
  const clipRight = Math.min(containerWidth, outX);
  const barWidth = clipRight - clipLeft;
  if (barWidth <= 0) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: clipLeft,
        width: barWidth,
        top: 0,
        bottom: 0,
        backgroundColor: isValid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        border: isValid ? '2px dashed #22c55e' : '2px dashed #ef4444',
      }}
    />
  );
}

function VideoThumbnailStrip({
  assetId,
  sourceFrameRate,
  startOffset,
  clipWidth,
  clipHeight,
  inPoint,
  outPoint,
  compositionFrameRate,
}: {
  assetId: string;
  sourceFrameRate: number;
  startOffset: number;
  clipWidth: number;
  clipHeight: number;
  inPoint: number;
  outPoint: number;
  compositionFrameRate: number;
}) {
  const thumbWidth = clipHeight * (16 / 9);
  const thumbCount = Math.max(1, Math.floor(clipWidth / thumbWidth));
  const durationFrames = outPoint - inPoint;

  const thumbnails: { sourceFrame: number }[] = [];
  for (let i = 0; i < thumbCount; i++) {
    const progress = thumbCount === 1 ? 0 : i / (thumbCount - 1);
    const compFrame = inPoint + progress * durationFrames;
    const sourceFrame = Math.floor(
      (compFrame - inPoint + startOffset) * (sourceFrameRate / compositionFrameRate)
    );
    thumbnails.push({ sourceFrame });
  }

  return (
    <div className="absolute inset-0 flex overflow-hidden opacity-50 pointer-events-none">
      {thumbnails.map((thumb, i) => (
        <VideoThumb
          key={i}
          assetId={assetId}
          sourceFrame={thumb.sourceFrame}
          width={clipWidth / thumbCount}
          height={clipHeight}
        />
      ))}
    </div>
  );
}

// Bounded cache of decoded thumbnail bitmaps, keyed by asset+frame. Decoding a
// VideoFrame is expensive and the strip re-renders often (scroll/zoom), so we
// decode once, convert to an ImageBitmap, and reuse it. Capped to bound memory.
const THUMB_CACHE = new Map<string, ImageBitmap>();
const THUMB_CACHE_MAX = 240;
const THUMB_PENDING = new Set<string>();

function cacheThumb(key: string, bmp: ImageBitmap): void {
  if (THUMB_CACHE.size >= THUMB_CACHE_MAX) {
    const oldest = THUMB_CACHE.keys().next().value;
    if (oldest !== undefined) {
      THUMB_CACHE.get(oldest)?.close();
      THUMB_CACHE.delete(oldest);
    }
  }
  THUMB_CACHE.set(key, bmp);
}

// Decodes one source frame via the shared video decoder pool and paints it,
// object-fit: cover. Best-effort: if the asset has no active decoder (not yet
// loaded) or decode fails, the canvas stays blank. Gated behind the timeline
// "Show Thumbnails" toggle so this decode traffic is opt-in.
function VideoThumb({ assetId, sourceFrame, width, height }: {
  assetId: string;
  sourceFrame: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cw = Math.max(1, Math.ceil(width));
  const ch = Math.max(1, Math.ceil(height));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frameIdx = Math.max(0, sourceFrame);
    const key = `${assetId}:${frameIdx}`;
    let cancelled = false;

    const paint = (bmp: ImageBitmap) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // object-fit: cover
      const scale = Math.max(cw / bmp.width, ch / bmp.height);
      const dw = bmp.width * scale;
      const dh = bmp.height * scale;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(bmp, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };

    const cached = THUMB_CACHE.get(key);
    if (cached) { paint(cached); return; }
    if (THUMB_PENDING.has(key)) return;

    THUMB_PENDING.add(key);
    videoDecoderPool.decodeFrame(assetId, frameIdx)
      .then(async (frame) => {
        try {
          const bmp = await createImageBitmap(frame);
          cacheThumb(key, bmp);
          if (!cancelled) paint(bmp);
        } finally {
          frame.close();
        }
      })
      .catch(() => { /* asset not decodable right now — leave blank */ })
      .finally(() => { THUMB_PENDING.delete(key); });

    return () => { cancelled = true; };
  }, [assetId, sourceFrame, cw, ch]);

  return (
    <canvas
      ref={canvasRef}
      width={cw}
      height={ch}
      className="flex-shrink-0"
      style={{ width, height }}
    />
  );
}

function collectKeyframeFrames(layer: Layer): number[] {
  const frames = new Set<number>();
  const t = layer.transform;
  const props: AnimatableProperty[] = [t.position, t.rotation, t.scale, t.anchorPoint, t.opacity];
  for (const p of props) {
    for (const kf of p.keyframes) {
      frames.add(kf.frame);
    }
  }
  return [...frames].sort((a, b) => a - b);
}

function KeyframeMarkers({ layer, displayIn, displayOut, barWidth, clipLeft, inX }: {
  layer: Layer;
  displayIn: number;
  displayOut: number;
  barWidth: number;
  clipLeft: number;
  inX: number;
}) {
  const frames = useMemo(() => collectKeyframeFrames(layer), [layer]);
  if (frames.length === 0) return null;

  const offsetLeft = clipLeft - inX;

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none flex items-center">
      {frames.map((frame) => {
        if (frame < displayIn || frame >= displayOut) return null;
        const x = ((frame - displayIn) / (displayOut - displayIn)) * (barWidth + offsetLeft) - offsetLeft;
        if (x < -4 || x > barWidth + 4) return null;
        return (
          <div
            key={frame}
            className="absolute"
            style={{
              left: x,
              top: '50%',
              transform: 'translate(-50%, -50%) rotate(45deg)',
              width: 7,
              height: 7,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              boxShadow: '0 0 2px rgba(0,0,0,0.5)',
            }}
          />
        );
      })}
    </div>
  );
}
