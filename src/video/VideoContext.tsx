/**
 * VideoContext — React context for video state management.
 * Mirrors AudioContext exactly in structure and API surface.
 * Manages VideoAssets, VideoTracks, and VideoClips via useReducer.
 *
 * The VideoRenderer registers with videoSync to receive play/pause/seek
 * events from the playback system, mirroring how AudioProvider works.
 */
import React, { createContext, useContext, useReducer, useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { VideoState, VideoAction, VideoAsset, VideoClip, VideoTrack } from './types';
import { videoAssetManager } from './VideoAssetManager';
import { importVideoFile, createClipFromAsset } from './VideoImporter';
import { useAnimation } from '../animation-engine';

const initialState: VideoState = {
  assets: {},
  clips: {},
  tracks: {},
  trackOrder: [],
};

function videoReducer(state: VideoState, action: VideoAction): VideoState {
  switch (action.type) {
    case 'ADD_ASSET':
      return { ...state, assets: { ...state.assets, [action.asset.id]: action.asset } };

    case 'ADD_TRACK':
      return {
        ...state,
        tracks: { ...state.tracks, [action.track.id]: action.track },
        trackOrder: [...state.trackOrder, action.track.id],
      };

    case 'ADD_CLIP': {
      const track = state.tracks[action.clip.trackId];
      if (!track) return state;
      return {
        ...state,
        clips: { ...state.clips, [action.clip.id]: action.clip },
        tracks: {
          ...state.tracks,
          [track.id]: { ...track, clipIds: [...track.clipIds, action.clip.id] },
        },
      };
    }

    case 'UPDATE_CLIP': {
      const clip = state.clips[action.clipId];
      if (!clip) return state;
      return {
        ...state,
        clips: { ...state.clips, [action.clipId]: { ...clip, ...action.updates } },
      };
    }

    case 'REMOVE_CLIP': {
      const clip = state.clips[action.clipId];
      if (!clip) return state;
      const track = state.tracks[clip.trackId];
      const { [action.clipId]: _removed, ...remainingClips } = state.clips;
      return {
        ...state,
        clips: remainingClips,
        tracks: track
          ? {
              ...state.tracks,
              [track.id]: {
                ...track,
                clipIds: track.clipIds.filter((id) => id !== action.clipId),
              },
            }
          : state.tracks,
      };
    }

    case 'UPDATE_TRACK': {
      const track = state.tracks[action.trackId];
      if (!track) return state;
      return {
        ...state,
        tracks: { ...state.tracks, [action.trackId]: { ...track, ...action.updates } },
      };
    }

    case 'REMOVE_TRACK': {
      const track = state.tracks[action.trackId];
      if (!track) return state;
      const { [action.trackId]: _removedTrack, ...remainingTracks } = state.tracks;
      const remainingClips = { ...state.clips };
      for (const clipId of track.clipIds) {
        delete remainingClips[clipId];
      }
      return {
        ...state,
        clips: remainingClips,
        tracks: remainingTracks,
        trackOrder: state.trackOrder.filter((id) => id !== action.trackId),
      };
    }

    case 'REMOVE_ASSET': {
      const { [action.assetId]: _removedAsset, ...remainingAssets } = state.assets;
      videoAssetManager.removeFile(action.assetId);
      return { ...state, assets: remainingAssets };
    }

    default:
      return state;
  }
}

interface VideoContextValue {
  videoState: VideoState;
  importVideo: (file: File) => Promise<void>;
  addClipFromVideoAsset: (assetId: string) => void;
  /** Place a video asset at a specific canvas position. Returns the new clip id. */
  placeVideoAsset: (assetId: string, x: number, y: number, displayWidth: number, displayHeight: number) => string | null;
  updateClip: (clipId: string, updates: Partial<VideoClip>) => void;
  removeClip: (clipId: string) => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  removeTrack: (trackId: string) => void;
  removeAsset: (assetId: string) => void;
  selectedVideoClipId: string | null;
  setSelectedVideoClipId: (id: string | null) => void;
}

const VideoContext = createContext<VideoContextValue | null>(null);

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const [videoState, dispatch] = useReducer(videoReducer, initialState);
  const [selectedVideoClipId, setSelectedVideoClipId] = useState<string | null>(null);
  const { state: animState } = useAnimation();
  const videoStateRef = useRef(videoState);
  videoStateRef.current = videoState;

  const importVideo = useCallback(async (file: File): Promise<void> => {
    // Import only registers the asset in the pool — no timeline clip is created here.
    // The clip is created only when the user explicitly places the video on the canvas.
    const { asset } = await importVideoFile(file);
    dispatch({ type: 'ADD_ASSET', asset });
  }, []);

  const placeVideoAsset = useCallback((
    assetId: string,
    x: number,
    y: number,
    displayWidth: number,
    displayHeight: number
  ): string | null => {
    const asset = videoStateRef.current.assets[assetId];
    if (!asset) return null;

    const currentTime = animState.timeline.currentTime;
    const trackId = uuidv4();
    const zOrder = videoStateRef.current.trackOrder.length;

    const track: VideoTrack = {
      id: trackId,
      name: asset.fileName.replace(/\.[^.]+$/, ''),
      clipIds: [],
      muted: false,
      zOrder,
    };
    dispatch({ type: 'ADD_TRACK', track });

    const clipId = uuidv4();
    const clip: VideoClip = {
      id: clipId,
      assetId,
      startTime: currentTime,
      endTime: currentTime + asset.duration,
      offset: 0,
      trackId,
      name: asset.fileName.replace(/\.[^.]+$/, ''),
      transform: {
        x,
        y,
        scaleX: displayWidth / asset.width,
        scaleY: displayHeight / asset.height,
        rotation: 0,
      },
      opacity: 1,
      muted: false,
    };
    dispatch({ type: 'ADD_CLIP', clip });

    return clipId;
  }, [animState.timeline.currentTime]);

  const addClipFromVideoAsset = useCallback((assetId: string) => {
    const asset = videoStateRef.current.assets[assetId];
    if (!asset) return;

    const currentTime = animState.timeline.currentTime;
    const trackId = uuidv4();
    const zOrder = videoStateRef.current.trackOrder.length;

    const track: VideoTrack = {
      id: trackId,
      name: `Video ${videoStateRef.current.trackOrder.length + 1}`,
      clipIds: [],
      muted: false,
      zOrder,
    };
    dispatch({ type: 'ADD_TRACK', track });

    const clip = createClipFromAsset(asset, trackId, currentTime);
    dispatch({ type: 'ADD_CLIP', clip });
  }, [animState.timeline.currentTime]);

  const updateClip = useCallback((clipId: string, updates: Partial<VideoClip>) => {
    dispatch({ type: 'UPDATE_CLIP', clipId, updates });
  }, []);

  const removeClip = useCallback((clipId: string) => {
    dispatch({ type: 'REMOVE_CLIP', clipId });
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<VideoTrack>) => {
    dispatch({ type: 'UPDATE_TRACK', trackId, updates });
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: 'REMOVE_TRACK', trackId });
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    dispatch({ type: 'REMOVE_ASSET', assetId });
  }, []);

  return (
    <VideoContext.Provider value={{
      videoState,
      importVideo,
      addClipFromVideoAsset,
      placeVideoAsset,
      updateClip,
      removeClip,
      updateTrack,
      removeTrack,
      removeAsset,
      selectedVideoClipId,
      setSelectedVideoClipId,
    }}>
      {children}
    </VideoContext.Provider>
  );
}

export function useVideo(): VideoContextValue {
  const ctx = useContext(VideoContext);
  if (!ctx) throw new Error('useVideo must be used within a VideoProvider');
  return ctx;
}
