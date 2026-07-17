/**
 * SLICE 1 — Playback State
 *
 * Holds the highest-frequency state in the application: the playhead position
 * and play/pause status. Updates at up to 60fps during playback.
 *
 * ISOLATION GUARANTEE: Changes to this slice NEVER cause subscribers of any
 * other slice to re-render.
 *
 * Components PERMITTED to subscribe:
 *   - Canvas.tsx (reads currentTime via usePlaybackCurrentTime() for element animation)
 *   - GeneralTimeline.tsx / PlayheadIndicator (reads currentTime for ruler position)
 *   - TimelineControlsPanel (reads isPlaying for transport buttons)
 *   - usePlayback.ts (reads all fields to expose playback API)
 *
 * Change frequency: currentTime updates up to 60fps during playback.
 *   isPlaying changes only on user action (play/pause/stop).
 *   fps/duration/loop change only on sequence settings change.
 *
 * Architecture note: `currentTime` is intentionally kept in Zustand state (not a ref)
 * so that Zustand's subscribeWithSelector can power precise per-field subscriptions.
 * The canvas uses `usePlaybackCurrentTime()` which subscribes only to currentTime.
 * The transport button uses `usePlaybackIsPlaying()` which subscribes only to isPlaying.
 * These selectors prevent cross-field re-renders entirely.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getFrameAtTime, getFrameTime } from '../animation-engine/types';

export interface PlaybackSlice {
  currentTime: number;
  currentFrame: number;
  isPlaying: boolean;
  fps: number;
  duration: number;
  loop: boolean;

  setCurrentTime: (time: number) => void;
  setCurrentFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setFps: (fps: number) => void;
  setDuration: (duration: number) => void;
  setLoop: (loop: boolean) => void;
  // seekAndUpdate removed — was never called anywhere in the codebase.
  stepFrame: (direction: 'forward' | 'backward', fps: number, duration: number) => void;
}

export const usePlaybackStore = create<PlaybackSlice>()(
  subscribeWithSelector((set, get) => ({
    currentTime: 0,
    currentFrame: 0,
    isPlaying: false,
    fps: 30,
    duration: 10,
    loop: false,

    setCurrentTime: (time) => {
      const fps = get().fps;
      const frame = fps > 0 ? getFrameAtTime(fps, time) : 0;
      set({ currentTime: time, currentFrame: frame });
    },

    setCurrentFrame: (frame) => {
      const { fps, duration } = get();
      if (fps <= 0) return;
      const newTime = getFrameTime(fps, frame);
      const clampedTime = Math.max(0, Math.min(newTime, duration));
      const clampedFrame = getFrameAtTime(fps, clampedTime);
      set({ currentTime: clampedTime, currentFrame: clampedFrame });
    },

    setPlaying: (isPlaying) => set({ isPlaying }),

    setFps: (fps) => set({ fps }),

    setDuration: (duration) => set({ duration }),

    setLoop: (loop) => set({ loop }),

    stepFrame: (direction, fps, duration) => {
      if (fps <= 0) return;
      const { currentFrame } = get();
      const totalFrames = Math.ceil(duration * fps);
      let newFrame: number;
      if (direction === 'forward') {
        newFrame = Math.min(currentFrame + 1, Math.max(0, totalFrames - 1));
      } else {
        newFrame = Math.max(currentFrame - 1, 0);
      }
      const newTime = getFrameTime(fps, newFrame);
      set({ currentTime: newTime, currentFrame: newFrame });
    },
  }))
);

/**
 * Precise selector hooks — each component subscribes only to what it needs.
 * A component using usePlaybackIsPlaying() does NOT re-render when currentTime changes.
 * A component using usePlaybackCurrentTime() does NOT re-render when isPlaying changes.
 */

export const usePlaybackCurrentTime = (): number =>
  usePlaybackStore((s) => s.currentTime);

export const usePlaybackCurrentFrame = (): number =>
  usePlaybackStore((s) => s.currentFrame);

export const usePlaybackIsPlaying = (): boolean =>
  usePlaybackStore((s) => s.isPlaying);

export const usePlaybackFps = (): number =>
  usePlaybackStore((s) => s.fps);

export const usePlaybackDuration = (): number =>
  usePlaybackStore((s) => s.duration);

export const usePlaybackLoop = (): boolean =>
  usePlaybackStore((s) => s.loop);
