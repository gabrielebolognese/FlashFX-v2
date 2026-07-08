import { create } from 'zustand';
import { timelineEngine } from '../engine/timeline';
import { PlaybackController } from '../engine/playback';
import { clampZoom, getFrameWidth } from '../ui/panels/timeline/timeUtils';

export const playbackController = new PlaybackController(timelineEngine);

interface TimelineState {
  currentFrame: number;
  isPlaying: boolean;
  playbackLagging: boolean;
  zoomLevel: number;
  scrollX: number;
  scrollY: number;
  followPlayhead: boolean;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (frame: number) => void;
  scrubTo: (frame: number) => void;
  setZoomLevel: (zoom: number) => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  setFollowPlayhead: (follow: boolean) => void;
  zoomAtCursor: (cursorX: number, factor: number) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => {
  playbackController.onFrameChange((frame) => {
    set({
      currentFrame: frame,
      isPlaying: playbackController.isPlaying,
    });
  });

  playbackController.onLagChange((lagging) => {
    set({ playbackLagging: lagging });
  });

  return {
    currentFrame: 0,
    isPlaying: false,
    playbackLagging: false,
    zoomLevel: 1,
    scrollX: 0,
    scrollY: 0,
    followPlayhead: true,

    play: () => playbackController.play(),
    pause: () => playbackController.pause(),
    stop: () => playbackController.stop(),
    seekTo: (frame) => playbackController.seekTo(frame),
    scrubTo: (frame) => playbackController.scrubTo(frame),

    setZoomLevel: (zoom) => set({ zoomLevel: clampZoom(zoom) }),
    setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
    setScrollY: (y) => set({ scrollY: Math.max(0, y) }),
    setFollowPlayhead: (follow) => set({ followPlayhead: follow }),

    zoomAtCursor: (cursorX, factor) => {
      const { zoomLevel, scrollX } = get();
      const newZoom = clampZoom(zoomLevel * factor);
      const frameUnderCursor = (cursorX + scrollX) / getFrameWidth(zoomLevel);
      const newScrollX = frameUnderCursor * getFrameWidth(newZoom) - cursorX;
      set({ zoomLevel: newZoom, scrollX: Math.max(0, newScrollX) });
    },
  };
});
