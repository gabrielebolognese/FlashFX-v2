import { useRef, useCallback, useEffect } from 'react';
import { useAnimation } from './AnimationContext';
import { PlaybackScheduler } from '../engine/core/PlaybackScheduler';
import { audioSync } from '../audio/audioSync';
import { videoSync } from '../video/videoSync';
import {
  usePlaybackStore,
  usePlaybackCurrentTime,
  usePlaybackCurrentFrame,
  usePlaybackIsPlaying,
  usePlaybackFps,
  usePlaybackDuration,
  usePlaybackLoop,
} from '../store/playbackStore';

interface UsePlaybackReturn {
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  seekToFrame: (frame: number) => void;
  seekToStart: () => void;
  seekToEnd: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  isPlaying: boolean;
  currentTime: number;
  currentFrame: number;
  totalFrames: number;
  duration: number;
  fps: number;
}

export function usePlayback(): UsePlaybackReturn {
  const { setCurrentTime, setCurrentFrame, setPlaying } = useAnimation();

  const currentTime = usePlaybackCurrentTime();
  const currentFrame = usePlaybackCurrentFrame();
  const isPlaying = usePlaybackIsPlaying();
  const fps = usePlaybackFps();
  const duration = usePlaybackDuration();
  const loop = usePlaybackLoop();

  const totalFrames = Math.ceil(duration * fps);

  const schedulerRef = useRef<PlaybackScheduler | null>(null);
  const setCurrentTimeRef = useRef(setCurrentTime);
  const setPlayingRef = useRef(setPlaying);

  setCurrentTimeRef.current = setCurrentTime;
  setPlayingRef.current = setPlaying;

  if (!schedulerRef.current) {
    schedulerRef.current = new PlaybackScheduler(
      { fps, duration, loop },
      {
        onFrame: (time) => {
          setCurrentTimeRef.current(time);
        },
        onStateChange: (newState) => {
          setPlayingRef.current(newState === 'playing');
        },
        onComplete: () => {
          setPlayingRef.current(false);
        },
      }
    );
  }

  useEffect(() => {
    schedulerRef.current?.updateConfig({ fps, duration, loop });
    schedulerRef.current?.setLoop(loop);
  }, [fps, duration, loop]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.destroy();
    };
  }, []);

  const play = useCallback(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    const t = usePlaybackStore.getState().currentTime;
    scheduler.seek(t);
    scheduler.play();
    audioSync.play(t);
    videoSync.play(t);
  }, []);

  const pause = useCallback(() => {
    schedulerRef.current?.pause();
    audioSync.pause();
    videoSync.pause();
  }, []);

  const stop = useCallback(() => {
    schedulerRef.current?.stop();
    audioSync.stop();
    videoSync.stop();
  }, []);

  const togglePlay = useCallback(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;

    if (scheduler.getState() === 'playing') {
      scheduler.pause();
      audioSync.pause();
      videoSync.pause();
    } else {
      const dur = usePlaybackStore.getState().duration;
      const t = scheduler.getCurrentTime() >= dur ? 0 : scheduler.getCurrentTime();
      if (scheduler.getCurrentTime() >= dur) {
        scheduler.seek(0);
      }
      scheduler.play();
      audioSync.play(t);
      videoSync.play(t);
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    const dur = usePlaybackStore.getState().duration;
    const clamped = Math.max(0, Math.min(time, dur));
    schedulerRef.current?.seek(clamped);
    setCurrentTime(clamped);
    audioSync.seek(clamped);
    videoSync.seek(clamped);
  }, [setCurrentTime]);

  const seekToStart = useCallback(() => {
    schedulerRef.current?.seek(0);
    setCurrentTime(0);
    audioSync.seek(0);
    videoSync.seek(0);
  }, [setCurrentTime]);

  const seekToEnd = useCallback(() => {
    const dur = usePlaybackStore.getState().duration;
    schedulerRef.current?.seek(dur);
    setCurrentTime(dur);
    if (schedulerRef.current?.getState() === 'playing') {
      schedulerRef.current.pause();
      audioSync.pause();
      videoSync.pause();
    } else {
      audioSync.seek(dur);
      videoSync.seek(dur);
    }
  }, [setCurrentTime]);

  const seekToFrame = useCallback((frame: number) => {
    const { fps: currentFps, duration: currentDur } = usePlaybackStore.getState();
    if (currentFps <= 0) return;
    const max = Math.max(0, Math.ceil(currentDur * currentFps) - 1);
    const clamped = Math.max(0, Math.min(frame, max));
    const time = clamped / currentFps;
    schedulerRef.current?.seek(time);
    setCurrentFrame(clamped);
    audioSync.seek(time);
    videoSync.seek(time);
  }, [setCurrentFrame]);

  const stepForward = useCallback(() => {
    schedulerRef.current?.stepForward();
    const { currentFrame: cf, duration: dur, fps: f } = usePlaybackStore.getState();
    const max = Math.max(0, Math.ceil(dur * f) - 1);
    setCurrentFrame(Math.min(cf + 1, max));
  }, [setCurrentFrame]);

  const stepBackward = useCallback(() => {
    schedulerRef.current?.stepBackward();
    const { currentFrame: cf } = usePlaybackStore.getState();
    setCurrentFrame(Math.max(cf - 1, 0));
  }, [setCurrentFrame]);

  return {
    play,
    pause,
    stop,
    togglePlay,
    seekTo,
    seekToFrame,
    seekToStart,
    seekToEnd,
    stepForward,
    stepBackward,
    isPlaying,
    currentTime,
    currentFrame,
    totalFrames,
    duration,
    fps,
  };
}
