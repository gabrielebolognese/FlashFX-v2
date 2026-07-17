import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AudioState, AudioAction, AudioAsset, AudioClip, AudioTrack } from './types';
import { audioEngineInstance } from './AudioEngine';
import { audioSync } from './audioSync';
import { useAnimation } from '../animation-engine';

const initialState: AudioState = {
  assets: {},
  clips: {},
  tracks: {},
  trackOrder: [],
};

function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case 'ADD_ASSET':
      return { ...state, assets: { ...state.assets, [action.asset.id]: action.asset } };

    case 'REMOVE_ASSET': {
      const { [action.assetId]: _removedAsset, ...remainingAssets } = state.assets;
      const clipIdsToRemove = Object.values(state.clips)
        .filter((c) => c.assetId === action.assetId)
        .map((c) => c.id);
      const remainingClips = { ...state.clips };
      const updatedTracks = { ...state.tracks };
      for (const clipId of clipIdsToRemove) {
        const clip = remainingClips[clipId];
        if (clip) {
          const track = updatedTracks[clip.trackId];
          if (track) {
            updatedTracks[clip.trackId] = {
              ...track,
              clipIds: track.clipIds.filter((id) => id !== clipId),
            };
          }
          delete remainingClips[clipId];
        }
      }
      return {
        ...state,
        assets: remainingAssets,
        clips: remainingClips,
        tracks: updatedTracks,
      };
    }

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
              [track.id]: { ...track, clipIds: track.clipIds.filter((id) => id !== action.clipId) },
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
      const { [action.trackId]: _removed, ...remainingTracks } = state.tracks;
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

    default:
      return state;
  }
}

function computeWaveform(buffer: AudioBuffer, numSamples = 2000): { peaks: number[]; rms: number[] } {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const blockSize = Math.max(1, Math.floor(length / numSamples));
  const peaks: number[] = [];
  const rmsArr: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    let peak = 0;
    let sumSq = 0;
    let count = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, length);

    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > peak) peak = abs;
        sumSq += data[j] * data[j];
        count++;
      }
    }

    peaks.push(peak);
    rmsArr.push(count > 0 ? Math.sqrt(sumSq / count) : 0);
  }

  return { peaks, rms: rmsArr };
}

interface AudioContextValue {
  audioState: AudioState;
  importAudio: (file: File) => Promise<void>;
  addClipFromAsset: (assetId: string) => void;
  updateClip: (clipId: string, updates: Partial<AudioClip>) => void;
  removeClip: (clipId: string) => void;
  updateTrack: (trackId: string, updates: Partial<AudioTrack>) => void;
  removeTrack: (trackId: string) => void;
  removeAsset: (assetId: string) => void;
  selectedAudioClipId: string | null;
  setSelectedAudioClipId: (id: string | null) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [audioState, dispatch] = useReducer(audioReducer, initialState);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null);
  const { state: animState } = useAnimation();
  const audioStateRef = useRef(audioState);
  const isPlayingRef = useRef(animState.timeline.isPlaying);

  audioStateRef.current = audioState;
  isPlayingRef.current = animState.timeline.isPlaying;

  const addClipFromAsset = useCallback((assetId: string) => {
    const asset = audioStateRef.current.assets[assetId];
    if (!asset) return;

    const trackNumber = audioStateRef.current.trackOrder.length + 1;
    const trackId = uuidv4();
    const track: AudioTrack = {
      id: trackId,
      name: `Audio ${trackNumber}`,
      clipIds: [],
      volume: 1,
      muted: false,
      solo: false,
    };
    dispatch({ type: 'ADD_TRACK', track });

    const currentTime = animState.timeline.currentTime;
    const clipId = uuidv4();
    const clip: AudioClip = {
      id: clipId,
      assetId,
      startTime: currentTime,
      endTime: currentTime + asset.duration,
      offset: 0,
      trackId,
      muted: false,
      name: asset.fileName.replace(/\.[^.]+$/, ''),
      fadeIn: 0,
      fadeOut: 0,
    };
    dispatch({ type: 'ADD_CLIP', clip });
  }, [animState.timeline.currentTime]);

  const importAudio = useCallback(async (file: File): Promise<void> => {
    const arrayBuffer = await file.arrayBuffer();
    const decodeCtx = new window.AudioContext();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    await decodeCtx.close();

    const { peaks, rms } = computeWaveform(audioBuffer);

    const assetId = uuidv4();
    const asset: AudioAsset = {
      id: assetId,
      fileName: file.name,
      duration: audioBuffer.duration,
      waveform: peaks,
      rmsWaveform: rms,
    };

    audioEngineInstance.loadAsset(assetId, audioBuffer);
    dispatch({ type: 'ADD_ASSET', asset });

    const trackNumber = audioStateRef.current.trackOrder.length + 1;
    const trackId = uuidv4();
    const track: AudioTrack = {
      id: trackId,
      name: `Audio ${trackNumber}`,
      clipIds: [],
      volume: 1,
      muted: false,
      solo: false,
    };
    dispatch({ type: 'ADD_TRACK', track });

    const currentTime = animState.timeline.currentTime;
    const clipId = uuidv4();
    const clip: AudioClip = {
      id: clipId,
      assetId,
      startTime: currentTime,
      endTime: currentTime + audioBuffer.duration,
      offset: 0,
      trackId,
      muted: false,
      name: file.name.replace(/\.[^.]+$/, ''),
      fadeIn: 0,
      fadeOut: 0,
    };

    dispatch({ type: 'ADD_CLIP', clip });
  }, [animState.timeline.currentTime]);

  const updateClip = useCallback((clipId: string, updates: Partial<AudioClip>) => {
    dispatch({ type: 'UPDATE_CLIP', clipId, updates });
  }, []);

  const removeClip = useCallback((clipId: string) => {
    dispatch({ type: 'REMOVE_CLIP', clipId });
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<AudioTrack>) => {
    dispatch({ type: 'UPDATE_TRACK', trackId, updates });
    if (updates.volume !== undefined) {
      audioEngineInstance.setTrackVolume(trackId, updates.volume);
    }
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: 'REMOVE_TRACK', trackId });
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    audioEngineInstance.removeAsset(assetId);
    dispatch({ type: 'REMOVE_ASSET', assetId });
  }, []);

  useEffect(() => {
    audioSync.register({
      onPlay: (time) => {
        const { clips, tracks } = audioStateRef.current;
        audioEngineInstance.play(time, Object.values(clips), tracks);
      },
      onPause: () => {
        audioEngineInstance.pause();
      },
      onSeek: (time) => {
        audioEngineInstance.seek(time);
        if (isPlayingRef.current) {
          const { clips, tracks } = audioStateRef.current;
          audioEngineInstance.play(time, Object.values(clips), tracks);
        }
      },
      onStop: () => {
        audioEngineInstance.pause();
      },
    });

    return () => {
      audioSync.unregister();
    };
  }, []);

  return (
    <AudioContext.Provider value={{
      audioState,
      importAudio,
      addClipFromAsset,
      updateClip,
      removeClip,
      updateTrack,
      removeTrack,
      removeAsset,
      selectedAudioClipId,
      setSelectedAudioClipId,
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within an AudioProvider');
  return ctx;
}
