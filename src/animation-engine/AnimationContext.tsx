import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  AnimationState,
  ElementAnimation,
  PropertyTrack,
  Keyframe,
  TimelineState,
  AnimatableProperty,
  DEFAULT_TIMELINE_STATE,
  createDefaultElementAnimation,
  createKeyframe,
  createPropertyTrack,
  EasingType,
  Sequence,
  createSequence as createSequenceHelper,
  getSequenceTotalFrames,
  getFrameTime,
  getFrameAtTime,
  getFrameDuration,
  TimelineMarker,
  createMarker,
  globalToLocalTime,
} from './types';
import { getPropertyValueFromElement } from './propertyRegistry';
import { DesignElement } from '../types/design';
import { TimelineEngine } from '../engine/core/TimelineEngine';
import { animationsToEngineClips } from '../engine/ReactBridge';
import { isClipActive } from './clipActivation';
import { usePlaybackStore } from '../store/playbackStore';

type AnimationAction =
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_FPS'; fps: number }
  | { type: 'SET_LOOP'; loop: boolean }
  | { type: 'SET_PIXELS_PER_SECOND'; pixelsPerSecond: number }
  | { type: 'SELECT_CLIP'; clipId: string | null }
  | { type: 'SELECT_CLIPS'; clipIds: string[] }
  | { type: 'BATCH_UPDATE_CLIPS'; updates: Array<{ elementId: string; updates: Partial<ElementAnimation> }> }
  | { type: 'SELECT_KEYFRAMES'; keyframeIds: string[] }
  | { type: 'ADD_KEYFRAME'; elementId: string; property: AnimatableProperty; keyframe: Keyframe }
  | { type: 'UPDATE_KEYFRAME'; elementId: string; property: AnimatableProperty; keyframeId: string; updates: Partial<Keyframe> }
  | { type: 'DELETE_KEYFRAME'; elementId: string; property: AnimatableProperty; keyframeId: string }
  | { type: 'DELETE_TRACK'; elementId: string; property: AnimatableProperty }
  | { type: 'DELETE_ALL_KEYFRAMES'; elementId: string }
  | { type: 'UPDATE_CLIP'; elementId: string; updates: Partial<ElementAnimation> }
  | { type: 'SPLIT_CLIP'; elementId: string; time: number }
  | { type: 'SPLIT_CLIPS'; clips: Array<{ elementId: string; time: number }> }
  | { type: 'INIT_ANIMATION'; elementId: string; clipStart: number }
  | { type: 'REMOVE_ANIMATION'; elementId: string }
  | { type: 'LOAD_ANIMATIONS'; animations: Record<string, ElementAnimation> }
  | { type: 'LOAD_ANIMATION_STATE'; animations: Record<string, ElementAnimation>; sequences: Record<string, Sequence>; activeSequenceId: string | null }
  | { type: 'RESET_TIMELINE' }
  | { type: 'CREATE_SEQUENCE'; sequence: Sequence }
  | { type: 'UPDATE_SEQUENCE'; sequenceId: string; updates: Partial<Sequence> }
  | { type: 'DELETE_SEQUENCE'; sequenceId: string }
  | { type: 'SET_ACTIVE_SEQUENCE'; sequenceId: string | null }
  | { type: 'ADD_MARKER'; marker: TimelineMarker }
  | { type: 'UPDATE_MARKER'; markerId: string; updates: Partial<TimelineMarker> }
  | { type: 'DELETE_MARKER'; markerId: string }
  | { type: 'TOGGLE_SNAP_TO_MARKERS'; enabled: boolean };

function animationReducer(state: AnimationState, action: AnimationAction): AnimationState {
  switch (action.type) {
    case 'SET_DURATION':
      return {
        ...state,
        timeline: { ...state.timeline, duration: action.duration },
      };

    case 'SET_FPS':
      return {
        ...state,
        timeline: { ...state.timeline, fps: action.fps },
      };

    case 'SET_LOOP':
      return {
        ...state,
        timeline: { ...state.timeline, loop: action.loop },
      };

    case 'SET_PIXELS_PER_SECOND':
      return {
        ...state,
        timeline: { ...state.timeline, pixelsPerSecond: action.pixelsPerSecond },
      };

    case 'SELECT_CLIP':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          selectedClipId: action.clipId,
          selectedClipIds: action.clipId ? [action.clipId] : [],
          selectedKeyframeIds: [],
        },
      };

    case 'SELECT_CLIPS':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          selectedClipId: action.clipIds[action.clipIds.length - 1] ?? null,
          selectedClipIds: action.clipIds,
          selectedKeyframeIds: [],
        },
      };

    case 'BATCH_UPDATE_CLIPS': {
      const updatedAnimations = { ...state.animations };
      for (const { elementId, updates } of action.updates) {
        const anim = updatedAnimations[elementId];
        if (anim) updatedAnimations[elementId] = { ...anim, ...updates };
      }
      return { ...state, animations: updatedAnimations };
    }

    case 'SELECT_KEYFRAMES':
      return {
        ...state,
        timeline: { ...state.timeline, selectedKeyframeIds: action.keyframeIds },
      };

    case 'INIT_ANIMATION': {
      if (state.animations[action.elementId]) {
        return state;
      }
      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: createDefaultElementAnimation(action.elementId, action.clipStart),
        },
      };
    }

    case 'REMOVE_ANIMATION': {
      const { [action.elementId]: removed, ...rest } = state.animations;
      return {
        ...state,
        animations: rest,
      };
    }

    case 'ADD_KEYFRAME': {
      const animation = state.animations[action.elementId] || createDefaultElementAnimation(action.elementId);
      let trackIndex = animation.tracks.findIndex((t) => t.property === action.property);

      let updatedTracks: PropertyTrack[];
      if (trackIndex === -1) {
        const newTrack = createPropertyTrack(action.property);
        newTrack.keyframes = [action.keyframe];
        updatedTracks = [...animation.tracks, newTrack];
      } else {
        updatedTracks = animation.tracks.map((track, idx) => {
          if (idx === trackIndex) {
            const deduplicated = track.keyframes.filter(
              (kf) => Math.abs(kf.time - action.keyframe.time) > 0.0001
            );
            return {
              ...track,
              keyframes: [...deduplicated, action.keyframe].sort((a, b) => a.time - b.time),
            };
          }
          return track;
        });
      }

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            tracks: updatedTracks,
          },
        },
      };
    }

    case 'UPDATE_KEYFRAME': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      const updatedTracks = animation.tracks.map((track) => {
        if (track.property !== action.property) return track;
        return {
          ...track,
          keyframes: track.keyframes
            .map((kf) => (kf.id === action.keyframeId ? { ...kf, ...action.updates } : kf))
            .sort((a, b) => a.time - b.time),
        };
      });

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            tracks: updatedTracks,
          },
        },
      };
    }

    case 'DELETE_KEYFRAME': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      const updatedTracks = animation.tracks
        .map((track) => {
          if (track.property !== action.property) return track;
          return {
            ...track,
            keyframes: track.keyframes.filter((kf) => kf.id !== action.keyframeId),
          };
        })
        .filter((track) => track.keyframes.length > 0);

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            tracks: updatedTracks,
          },
        },
      };
    }

    case 'DELETE_TRACK': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            tracks: animation.tracks.filter((t) => t.property !== action.property),
          },
        },
      };
    }

    case 'DELETE_ALL_KEYFRAMES': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            tracks: [],
          },
        },
        timeline: {
          ...state.timeline,
          selectedKeyframeIds: [],
        },
      };
    }

    case 'UPDATE_CLIP': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            ...action.updates,
          },
        },
      };
    }

    case 'SPLIT_CLIP': {
      const animation = state.animations[action.elementId];
      if (!animation) return state;

      const splitTimeGlobal = action.time;
      const clipStart = animation.clipStart;
      const clipEnd = clipStart + animation.clipDuration;

      if (splitTimeGlobal <= clipStart || splitTimeGlobal >= clipEnd) return state;

      // Convert global split time to clip-local since keyframes are stored in clip-local coordinates
      const splitTimeLocal = globalToLocalTime(splitTimeGlobal, clipStart);

      const firstClipDuration = splitTimeGlobal - clipStart;

      return {
        ...state,
        animations: {
          ...state.animations,
          [action.elementId]: {
            ...animation,
            clipDuration: firstClipDuration,
            tracks: animation.tracks.map((track) => ({
              ...track,
              keyframes: track.keyframes.filter((kf) => kf.time <= splitTimeLocal),
            })),
          },
        },
      };
    }

    case 'SPLIT_CLIPS': {
      const updatedAnimations = { ...state.animations };
      for (const { elementId, time } of action.clips) {
        const animation = updatedAnimations[elementId];
        if (!animation) continue;
        const clipStart = animation.clipStart;
        const clipEnd = clipStart + animation.clipDuration;
        if (time <= clipStart || time >= clipEnd) continue;
        const splitTimeLocal = globalToLocalTime(time, clipStart);
        const firstClipDuration = time - clipStart;
        updatedAnimations[elementId] = {
          ...animation,
          clipDuration: firstClipDuration,
          tracks: animation.tracks.map((track) => ({
            ...track,
            keyframes: track.keyframes.filter((kf) => kf.time <= splitTimeLocal),
          })),
        };
      }
      return { ...state, animations: updatedAnimations };
    }

    case 'LOAD_ANIMATIONS':
      return {
        ...state,
        animations: action.animations,
      };

    case 'LOAD_ANIMATION_STATE':
      return {
        ...state,
        animations: action.animations,
        sequences: action.sequences,
        activeSequenceId: action.activeSequenceId,
      };

    case 'RESET_TIMELINE':
      return {
        ...state,
        timeline: DEFAULT_TIMELINE_STATE,
      };

    case 'CREATE_SEQUENCE': {
      const { sequence } = action;
      return {
        ...state,
        sequences: {
          ...state.sequences,
          [sequence.id]: sequence,
        },
        activeSequenceId: sequence.id,
        timeline: {
          ...state.timeline,
          duration: sequence.duration,
          fps: sequence.frameRate,
          currentTime: 0,
          currentFrame: 0,
        },
      };
    }

    case 'UPDATE_SEQUENCE': {
      const sequence = state.sequences[action.sequenceId];
      if (!sequence) return state;

      const updatedSequence = {
        ...sequence,
        ...action.updates,
        updatedAt: Date.now(),
      };

      const newState = {
        ...state,
        sequences: {
          ...state.sequences,
          [action.sequenceId]: updatedSequence,
        },
      };

      if (state.activeSequenceId === action.sequenceId) {
        newState.timeline = {
          ...state.timeline,
          duration: updatedSequence.duration,
          fps: updatedSequence.frameRate,
        };
      }

      return newState;
    }

    case 'DELETE_SEQUENCE': {
      const { [action.sequenceId]: deleted, ...remainingSequences } = state.sequences;
      return {
        ...state,
        sequences: remainingSequences,
        activeSequenceId: state.activeSequenceId === action.sequenceId ? null : state.activeSequenceId,
      };
    }

    case 'SET_ACTIVE_SEQUENCE': {
      if (!action.sequenceId) {
        return {
          ...state,
          activeSequenceId: null,
        };
      }

      const sequence = state.sequences[action.sequenceId];
      if (!sequence) return state;

      return {
        ...state,
        activeSequenceId: action.sequenceId,
        timeline: {
          ...state.timeline,
          duration: sequence.duration,
          fps: sequence.frameRate,
          currentTime: 0,
          currentFrame: 0,
        },
      };
    }

    case 'ADD_MARKER':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          markers: [...state.timeline.markers, action.marker],
        },
      };

    case 'UPDATE_MARKER': {
      const markers = state.timeline.markers.map(marker =>
        marker.id === action.markerId
          ? { ...marker, ...action.updates }
          : marker
      );
      return {
        ...state,
        timeline: { ...state.timeline, markers },
      };
    }

    case 'DELETE_MARKER': {
      const markers = state.timeline.markers.filter(marker => marker.id !== action.markerId);
      return {
        ...state,
        timeline: { ...state.timeline, markers },
      };
    }

    case 'TOGGLE_SNAP_TO_MARKERS':
      return {
        ...state,
        timeline: { ...state.timeline, snapToMarkers: action.enabled },
      };

    default:
      return state;
  }
}

interface AnimationContextValue {
  state: AnimationState;
  setCurrentTime: (time: number) => void;
  setCurrentFrame: (frame: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setDuration: (duration: number) => void;
  setFps: (fps: number) => void;
  setLoop: (loop: boolean) => void;
  setPixelsPerSecond: (pps: number) => void;
  selectClip: (clipId: string | null) => void;
  selectClips: (clipIds: string[]) => void;
  batchUpdateClips: (updates: Array<{ elementId: string; updates: Partial<ElementAnimation> }>) => void;
  selectKeyframes: (keyframeIds: string[]) => void;
  initAnimation: (elementId: string) => void;
  removeAnimation: (elementId: string) => void;
  addKeyframe: (elementId: string, property: AnimatableProperty, time: number, value: number | string, easing?: EasingType) => void;
  updateKeyframe: (elementId: string, property: AnimatableProperty, keyframeId: string, updates: Partial<Keyframe>) => void;
  deleteKeyframe: (elementId: string, property: AnimatableProperty, keyframeId: string) => void;
  deleteTrack: (elementId: string, property: AnimatableProperty) => void;
  deleteAllKeyframes: (elementId: string) => void;
  updateClip: (elementId: string, updates: Partial<ElementAnimation>) => void;
  splitClip: (elementId: string, time: number) => void;
  splitClips: (clips: Array<{ elementId: string; time: number }>) => void;
  loadAnimations: (animations: Record<string, ElementAnimation>) => void;
  loadAnimationState: (animations: Record<string, ElementAnimation>, sequences: Record<string, Sequence>, activeSequenceId: string | null) => void;
  getAnimatedElementState: (element: DesignElement) => Partial<DesignElement>;
  hasKeyframesForProperty: (elementId: string, property: AnimatableProperty) => boolean;
  getTrack: (elementId: string, property: AnimatableProperty) => PropertyTrack | null;
  createSequence: (name: string, frameRate: number, duration: number, canvasId: string) => Sequence;
  updateSequence: (sequenceId: string, updates: Partial<Sequence>) => void;
  deleteSequence: (sequenceId: string) => void;
  setActiveSequence: (sequenceId: string | null) => void;
  stepFrame: (direction: 'forward' | 'backward') => void;
  getActiveSequence: () => Sequence | null;
  computeAnimatedPropertiesAtTime: (element: DesignElement, time: number) => Partial<DesignElement>;
  addMarker: (time: number, name?: string, color?: string) => void;
  updateMarker: (markerId: string, updates: Partial<TimelineMarker>) => void;
  deleteMarker: (markerId: string) => void;
  toggleSnapToMarkers: (enabled: boolean) => void;
  getMarkerAtTime: (time: number, threshold?: number) => TimelineMarker | null;
  updateKeyframesAtCurrentTime: (elementId: string, updates: Partial<DesignElement>) => boolean;
}

const AnimationContext = createContext<AnimationContextValue | null>(null);

const initialState: AnimationState = {
  animations: {},
  timeline: DEFAULT_TIMELINE_STATE,
  sequences: {},
  activeSequenceId: null,
};

// Shared helper: maps engine property names onto a DesignElement partial.
// Handles all registered property paths including dot-notation paths for filters,
// 3D scene state, gradient stops, and all text/image/3D properties.
function applyEngineProps(
  props: Record<string, unknown>,
  element: DesignElement,
  animatedProps: Partial<DesignElement>
): void {
  for (const key of Object.keys(props)) {
    const val = props[key];
    if (val === undefined || key === '_pooled') continue;

    if (key.startsWith('threeDSceneState.')) {
      const path = key.replace('threeDSceneState.', '');
      const parts = path.split('.');
      const base = (animatedProps as any).threeDSceneState
        ? JSON.parse(JSON.stringify((animatedProps as any).threeDSceneState))
        : (element as any).threeDSceneState
          ? JSON.parse(JSON.stringify((element as any).threeDSceneState))
          : {};

      if (parts.length === 1) {
        base[parts[0]] = val;
      } else if (parts.length === 2) {
        if (!base[parts[0]]) base[parts[0]] = {};
        base[parts[0]][parts[1]] = val;
      } else if (parts.length === 3) {
        if (!base[parts[0]]) base[parts[0]] = {};
        if (!base[parts[0]][parts[1]]) base[parts[0]][parts[1]] = {};
        base[parts[0]][parts[1]][parts[2]] = val;
      }

      (animatedProps as any).threeDSceneState = base;
      continue;
    }

    if (key.startsWith('uvTransform.')) {
      const uvKey = key.replace('uvTransform.', '');
      const baseUV = (animatedProps as any).advancedTextureSettings?.uvTransform
        ? { ...(animatedProps as any).advancedTextureSettings.uvTransform }
        : (element as any).advancedTextureSettings?.uvTransform
          ? { ...(element as any).advancedTextureSettings.uvTransform }
          : { offsetX: 0, offsetY: 0, repeatX: 1, repeatY: 1, rotation: 0, centerX: 0.5, centerY: 0.5, matrixAutoUpdate: true };
      baseUV[uvKey] = val;
      (animatedProps as any).advancedTextureSettings = {
        ...((animatedProps as any).advancedTextureSettings ?? (element as any).advancedTextureSettings ?? {}),
        uvTransform: baseUV,
      };
      continue;
    }

    if (key.startsWith('filters.')) {
      const filterKey = key.replace('filters.', '') as keyof NonNullable<DesignElement['filters']>;
      const merged = { ...(animatedProps.filters ?? element.filters ?? {}) } as NonNullable<DesignElement['filters']>;
      (merged as Record<string, unknown>)[filterKey] = val;
      animatedProps.filters = merged;
      continue;
    }

    if (key.startsWith('gradientColor-')) {
      const id = key.replace('gradientColor-', '');
      const stops = [...(animatedProps.gradientColors ?? element.gradientColors ?? [])];
      const idx = stops.findIndex(s => s.id === id);
      if (idx !== -1) stops[idx] = { ...stops[idx], color: val as string };
      animatedProps.gradientColors = stops;
      continue;
    }

    if (key.startsWith('gradientPos-')) {
      const id = key.replace('gradientPos-', '');
      const stops = [...(animatedProps.gradientColors ?? element.gradientColors ?? [])];
      const idx = stops.findIndex(s => s.id === id);
      if (idx !== -1) stops[idx] = { ...stops[idx], position: val as number };
      animatedProps.gradientColors = stops;
      continue;
    }

    switch (key) {
      case 'x': animatedProps.x = val as number; break;
      case 'y': animatedProps.y = val as number; break;
      case 'width': animatedProps.width = val as number; break;
      case 'height': animatedProps.height = val as number; break;
      case 'rotation': animatedProps.rotation = val as number; break;
      case 'opacity': animatedProps.opacity = val as number; break;
      case 'fill': animatedProps.fill = val as string; break;
      case 'stroke': animatedProps.stroke = val as string; break;
      case 'strokeWidth': animatedProps.strokeWidth = val as number; break;
      case 'borderRadius': animatedProps.borderRadius = val as number; break;
      case 'shadowBlur':
        animatedProps.shadow = { ...element.shadow, ...animatedProps.shadow, blur: val as number };
        break;
      case 'shadowX':
        animatedProps.shadow = { ...element.shadow, ...animatedProps.shadow, x: val as number };
        break;
      case 'shadowY':
        animatedProps.shadow = { ...element.shadow, ...animatedProps.shadow, y: val as number };
        break;
      case 'fontSize': animatedProps.fontSize = val as number; break;
      case 'letterSpacing': animatedProps.letterSpacing = val as number; break;
      case 'lineHeight': animatedProps.lineHeight = val as number; break;
      case 'wordSpacing': animatedProps.wordSpacing = val as number; break;
      case 'textColor': animatedProps.textColor = val as string; break;
      case 'textStrokeWidth': animatedProps.textStrokeWidth = val as number; break;
      case 'textStrokeColor': animatedProps.textStrokeColor = val as string; break;
      case 'textShadowBlur': animatedProps.textShadowBlur = val as number; break;
      case 'textShadowOffsetX': animatedProps.textShadowOffsetX = val as number; break;
      case 'textShadowOffsetY': animatedProps.textShadowOffsetY = val as number; break;
      case 'textGlowSize': animatedProps.textGlowSize = val as number; break;
      case 'textGlowIntensity': animatedProps.textGlowIntensity = val as number; break;
      case 'textGradientAngle': animatedProps.textGradientAngle = val as number; break;
      case 'textTextureFillScale': animatedProps.textTextureFillScale = val as number; break;
      case 'textTextureFillOffsetX': animatedProps.textTextureFillOffsetX = val as number; break;
      case 'textTextureFillOffsetY': animatedProps.textTextureFillOffsetY = val as number; break;
      case 'textPatternSize': animatedProps.textPatternSize = val as number; break;
      case 'textPatternSpacing': animatedProps.textPatternSpacing = val as number; break;
      case 'textPatternAngle': animatedProps.textPatternAngle = val as number; break;
      case 'baselineShift': animatedProps.baselineShift = val as number; break;
      case 'textIndent': animatedProps.textIndent = val as number; break;
      case 'textPaddingTop': animatedProps.textPaddingTop = val as number; break;
      case 'textPaddingRight': animatedProps.textPaddingRight = val as number; break;
      case 'textPaddingBottom': animatedProps.textPaddingBottom = val as number; break;
      case 'textPaddingLeft': animatedProps.textPaddingLeft = val as number; break;
      case 'stagger': animatedProps.stagger = val as number; break;
      case 'gradientAngle': animatedProps.gradientAngle = val as number; break;
      case 'gradientCenterX': animatedProps.gradientCenterX = val as number; break;
      case 'gradientCenterY': animatedProps.gradientCenterY = val as number; break;
      case 'shapePatternOpacity': animatedProps.shapePatternOpacity = val as number; break;
      case 'shapePatternSize': animatedProps.shapePatternSize = val as number; break;
      case 'shapePatternSpacing': animatedProps.shapePatternSpacing = val as number; break;
      case 'shapePatternAngle': animatedProps.shapePatternAngle = val as number; break;
      case 'starPoints': animatedProps.starPoints = val as number; break;
      case 'starInnerRadius': animatedProps.starInnerRadius = val as number; break;
      case 'arrowheadSize': animatedProps.arrowheadSize = val as number; break;
      case 'smoothing': animatedProps.smoothing = val as number; break;
      case 'trimStart': animatedProps.trimStart = val as number; break;
      case 'trimEnd': animatedProps.trimEnd = val as number; break;
      case 'dashIntensity': animatedProps.dashIntensity = val as number; break;
    }
  }
}

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(animationReducer, initialState);

  const engineRef = useRef<TimelineEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new TimelineEngine({
      fps: DEFAULT_TIMELINE_STATE.fps,
      duration: DEFAULT_TIMELINE_STATE.duration,
      loop: DEFAULT_TIMELINE_STATE.loop,
    });
  }

  useEffect(() => {
    engineRef.current?.setConfig({
      fps: state.timeline.fps,
      duration: state.timeline.duration,
      loop: state.timeline.loop,
    });
  }, [state.timeline.fps, state.timeline.duration, state.timeline.loop]);

  useEffect(() => {
    const clips = animationsToEngineClips(state.animations);
    engineRef.current?.loadClipsFromAnimations(clips);
  }, [state.animations]);

  const setCurrentTime = useCallback((time: number) => {
    usePlaybackStore.getState().setCurrentTime(time);
  }, []);

  const setCurrentFrame = useCallback((frame: number) => {
    usePlaybackStore.getState().setCurrentFrame(frame);
  }, []);

  const setPlaying = useCallback((isPlaying: boolean) => {
    usePlaybackStore.getState().setPlaying(isPlaying);
  }, []);

  const setDuration = useCallback((duration: number) => {
    dispatch({ type: 'SET_DURATION', duration });
    usePlaybackStore.getState().setDuration(duration);
  }, []);

  const setFps = useCallback((fps: number) => {
    dispatch({ type: 'SET_FPS', fps });
    usePlaybackStore.getState().setFps(fps);
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    dispatch({ type: 'SET_LOOP', loop });
    usePlaybackStore.getState().setLoop(loop);
  }, []);

  const setPixelsPerSecond = useCallback((pixelsPerSecond: number) => {
    dispatch({ type: 'SET_PIXELS_PER_SECOND', pixelsPerSecond });
  }, []);

  const selectClip = useCallback((clipId: string | null) => {
    dispatch({ type: 'SELECT_CLIP', clipId });
  }, []);

  const selectClips = useCallback((clipIds: string[]) => {
    dispatch({ type: 'SELECT_CLIPS', clipIds });
  }, []);

  const batchUpdateClips = useCallback((updates: Array<{ elementId: string; updates: Partial<ElementAnimation> }>) => {
    dispatch({ type: 'BATCH_UPDATE_CLIPS', updates });
  }, []);

  const selectKeyframes = useCallback((keyframeIds: string[]) => {
    dispatch({ type: 'SELECT_KEYFRAMES', keyframeIds });
  }, []);

  const initAnimation = useCallback((elementId: string) => {
    // Read the live playhead position at the moment of creation so the clip
    // starts exactly where the playhead is, not at time 0.
    const clipStart = usePlaybackStore.getState().currentTime;
    dispatch({ type: 'INIT_ANIMATION', elementId, clipStart });
  }, []);

  const removeAnimation = useCallback((elementId: string) => {
    dispatch({ type: 'REMOVE_ANIMATION', elementId });
  }, []);

  const addKeyframe = useCallback(
    (elementId: string, property: AnimatableProperty, time: number, value: number | string, easing: EasingType = 'ease-out') => {
      const keyframe = createKeyframe(time, value, easing);
      dispatch({ type: 'ADD_KEYFRAME', elementId, property, keyframe });
      engineRef.current?.addKeyframe(elementId, property, keyframe);
    },
    []
  );

  const updateKeyframe = useCallback(
    (elementId: string, property: AnimatableProperty, keyframeId: string, updates: Partial<Keyframe>) => {
      dispatch({ type: 'UPDATE_KEYFRAME', elementId, property, keyframeId, updates });
      engineRef.current?.markDirty();
    },
    []
  );

  const deleteKeyframe = useCallback((elementId: string, property: AnimatableProperty, keyframeId: string) => {
    dispatch({ type: 'DELETE_KEYFRAME', elementId, property, keyframeId });
    engineRef.current?.removeKeyframe(elementId, property, keyframeId);
  }, []);

  const deleteTrack = useCallback((elementId: string, property: AnimatableProperty) => {
    dispatch({ type: 'DELETE_TRACK', elementId, property });
    engineRef.current?.markDirty();
  }, []);

  const deleteAllKeyframes = useCallback((elementId: string) => {
    dispatch({ type: 'DELETE_ALL_KEYFRAMES', elementId });
    engineRef.current?.markDirty();
  }, []);

  const updateClip = useCallback((elementId: string, updates: Partial<ElementAnimation>) => {
    dispatch({ type: 'UPDATE_CLIP', elementId, updates });
  }, []);

  const splitClip = useCallback((elementId: string, time: number) => {
    dispatch({ type: 'SPLIT_CLIP', elementId, time });
  }, []);

  const splitClips = useCallback((clips: Array<{ elementId: string; time: number }>) => {
    dispatch({ type: 'SPLIT_CLIPS', clips });
  }, []);

  const loadAnimations = useCallback((animations: Record<string, ElementAnimation>) => {
    dispatch({ type: 'LOAD_ANIMATIONS', animations });
  }, []);

  const loadAnimationState = useCallback((
    animations: Record<string, ElementAnimation>,
    sequences: Record<string, Sequence>,
    activeSequenceId: string | null
  ) => {
    dispatch({ type: 'LOAD_ANIMATION_STATE', animations, sequences, activeSequenceId });
  }, []);

  const getAnimatedElementState = useCallback(
    (element: DesignElement): Partial<DesignElement> => {
      const currentTime = usePlaybackStore.getState().currentTime;

      const animation = state.animations[element.id];
      if (animation) {
        if (!isClipActive(animation, currentTime)) {
          return { visible: false, opacity: 0 };
        }
      }

      const engine = engineRef.current;
      if (!engine) return {};

      const resolved = engine.getStateAtTime(currentTime);
      const props = resolved.get(element.id);
      if (!props) return {};

      const animatedProps: Partial<DesignElement> = {};
      applyEngineProps(props as Record<string, unknown>, element, animatedProps);
      return animatedProps;
    },
    [state.animations]
  );

  const hasKeyframesForProperty = useCallback(
    (elementId: string, property: AnimatableProperty): boolean => {
      const animation = state.animations[elementId];
      if (!animation) return false;
      const track = animation.tracks.find((t) => t.property === property);
      return track ? track.keyframes.length > 0 : false;
    },
    [state.animations]
  );

  const getTrack = useCallback(
    (elementId: string, property: AnimatableProperty): PropertyTrack | null => {
      const animation = state.animations[elementId];
      if (!animation) return null;
      return animation.tracks.find((t) => t.property === property) || null;
    },
    [state.animations]
  );

  const createSequence = useCallback(
    (name: string, frameRate: number, duration: number, canvasId: string): Sequence => {
      const sequence = createSequenceHelper(name, frameRate, duration, canvasId);
      dispatch({ type: 'CREATE_SEQUENCE', sequence });
      const store = usePlaybackStore.getState();
      store.setFps(frameRate);
      store.setDuration(duration);
      store.setCurrentTime(0);
      return sequence;
    },
    []
  );

  const updateSequence = useCallback((sequenceId: string, updates: Partial<Sequence>) => {
    dispatch({ type: 'UPDATE_SEQUENCE', sequenceId, updates });
  }, []);

  const deleteSequence = useCallback((sequenceId: string) => {
    dispatch({ type: 'DELETE_SEQUENCE', sequenceId });
  }, []);

  const setActiveSequence = useCallback((sequenceId: string | null) => {
    dispatch({ type: 'SET_ACTIVE_SEQUENCE', sequenceId });
    if (sequenceId) {
      const seq = state.sequences[sequenceId];
      if (seq) {
        const store = usePlaybackStore.getState();
        store.setFps(seq.frameRate);
        store.setDuration(seq.duration);
        store.setCurrentTime(0);
      }
    }
  }, [state.sequences]);

  const stepFrame = useCallback((direction: 'forward' | 'backward') => {
    const { fps, duration } = state.timeline;
    usePlaybackStore.getState().stepFrame(direction, fps, duration);
  }, [state.timeline.fps, state.timeline.duration]);

  const getActiveSequence = useCallback((): Sequence | null => {
    if (!state.activeSequenceId) return null;
    return state.sequences[state.activeSequenceId] || null;
  }, [state.activeSequenceId, state.sequences]);

  const computeAnimatedPropertiesAtTime = useCallback(
    (element: DesignElement, time: number): Partial<DesignElement> => {
      const engine = engineRef.current;
      if (!engine) return {};

      const resolved = engine.getStateAtTime(time);
      const props = resolved.get(element.id);
      if (!props) return {};

      const animatedProps: Partial<DesignElement> = {};
      applyEngineProps(props as Record<string, unknown>, element, animatedProps);
      return animatedProps;
    },
    [state.animations]
  );

  const addMarker = useCallback((time: number, name?: string, color?: string) => {
    const marker = createMarker(time, name, color);
    dispatch({ type: 'ADD_MARKER', marker });
  }, []);

  const updateMarker = useCallback((markerId: string, updates: Partial<TimelineMarker>) => {
    dispatch({ type: 'UPDATE_MARKER', markerId, updates });
  }, []);

  const deleteMarker = useCallback((markerId: string) => {
    dispatch({ type: 'DELETE_MARKER', markerId });
  }, []);

  const toggleSnapToMarkers = useCallback((enabled: boolean) => {
    dispatch({ type: 'TOGGLE_SNAP_TO_MARKERS', enabled });
  }, []);

  const getMarkerAtTime = useCallback((time: number, threshold: number = 0.1): TimelineMarker | null => {
    const markers = state.timeline.markers;
    for (const marker of markers) {
      if (Math.abs(marker.time - time) <= threshold) {
        return marker;
      }
    }
    return null;
  }, [state.timeline.markers]);

  const updateKeyframesAtCurrentTime = useCallback((elementId: string, updates: Partial<DesignElement>): boolean => {
    const animation = state.animations[elementId];
    if (!animation) return false;

    const currentTime = usePlaybackStore.getState().currentTime;
    const localCurrentTime = globalToLocalTime(currentTime, animation.clipStart);
    const threshold = 0.016;
    let updatedAny = false;

    // For each active track, re-read the current value generically from the
    // updated element state. This handles all registered properties without
    // needing a hardcoded mapping per-property.
    animation.tracks.forEach(track => {
      const kfAtTime = track.keyframes.find(kf => Math.abs(kf.time - localCurrentTime) <= threshold);
      if (!kfAtTime) return;

      // Build a temporary merged element to extract the updated value
      const merged = { ...updates } as Partial<DesignElement>;

      let newValue: number | string | undefined;

      if (track.property.startsWith('filters.')) {
        const filterKey = track.property.replace('filters.', '');
        const filtersUpdate = merged.filters as Record<string, unknown> | undefined;
        if (filtersUpdate && filterKey in filtersUpdate) {
          newValue = filtersUpdate[filterKey] as number;
        }
      } else if (track.property === 'shadowBlur' && merged.shadow) {
        newValue = merged.shadow.blur;
      } else if (track.property === 'shadowX' && merged.shadow) {
        newValue = merged.shadow.x;
      } else if (track.property === 'shadowY' && merged.shadow) {
        newValue = merged.shadow.y;
      } else {
        const directVal = (merged as Record<string, unknown>)[track.property];
        if (directVal !== undefined && (typeof directVal === 'number' || typeof directVal === 'string')) {
          newValue = directVal;
        }
      }

      if (newValue !== undefined) {
        updateKeyframe(elementId, track.property, kfAtTime.id, { value: newValue });
        updatedAny = true;
      }
    });

    return updatedAny;
  }, [state.animations, updateKeyframe]);

  const value = useMemo(
    () => ({
      state,
      setCurrentTime,
      setCurrentFrame,
      setPlaying,
      setDuration,
      setFps,
      setLoop,
      setPixelsPerSecond,
      selectClip,
      selectClips,
      batchUpdateClips,
      selectKeyframes,
      initAnimation,
      removeAnimation,
      addKeyframe,
      updateKeyframe,
      deleteKeyframe,
      deleteTrack,
      deleteAllKeyframes,
      updateClip,
      splitClip,
      splitClips,
      loadAnimations,
      loadAnimationState,
      getAnimatedElementState,
      hasKeyframesForProperty,
      getTrack,
      createSequence,
      updateSequence,
      deleteSequence,
      setActiveSequence,
      stepFrame,
      getActiveSequence,
      computeAnimatedPropertiesAtTime,
      addMarker,
      updateMarker,
      deleteMarker,
      toggleSnapToMarkers,
      getMarkerAtTime,
      updateKeyframesAtCurrentTime,
    }),
    [
      state,
      setCurrentTime,
      setCurrentFrame,
      setPlaying,
      setDuration,
      setFps,
      setLoop,
      setPixelsPerSecond,
      selectClip,
      selectClips,
      batchUpdateClips,
      selectKeyframes,
      initAnimation,
      removeAnimation,
      addKeyframe,
      updateKeyframe,
      deleteKeyframe,
      deleteTrack,
      deleteAllKeyframes,
      updateClip,
      splitClip,
      splitClips,
      loadAnimations,
      loadAnimationState,
      getAnimatedElementState,
      hasKeyframesForProperty,
      getTrack,
      createSequence,
      updateSequence,
      deleteSequence,
      setActiveSequence,
      stepFrame,
      getActiveSequence,
      computeAnimatedPropertiesAtTime,
      addMarker,
      updateMarker,
      deleteMarker,
      toggleSnapToMarkers,
      getMarkerAtTime,
      updateKeyframesAtCurrentTime,
    ]
  );

  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
}

export function useAnimation(): AnimationContextValue {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  return context;
}

export { AnimationContext };
