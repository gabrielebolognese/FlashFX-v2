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
  /** Reported by TrackArea so the fit/jump actions (driven from menus) know the viewport width. */
  containerWidth: number;
  /** Timeline view toggle: draw audio/video waveforms on clips. */
  showWaveforms: boolean;
  /** Timeline view toggle: decode & paint video thumbnail strips on clips. */
  showThumbnails: boolean;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (frame: number) => void;
  scrubTo: (frame: number) => void;
  setZoomLevel: (zoom: number) => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  setFollowPlayhead: (follow: boolean) => void;
  setContainerWidth: (w: number) => void;
  toggleWaveforms: () => void;
  toggleThumbnails: () => void;
  zoomAtCursor: (cursorX: number, factor: number) => void;
  /** Zoom so the whole `durationFrames` span fits the timeline viewport (scroll to start). */
  fitTimeline: (durationFrames: number) => void;
  /** Scroll so the playhead is centered in the viewport. */
  jumpToPlayhead: () => void;
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
    containerWidth: 600,
    showWaveforms: true,
    showThumbnails: false,

    play: () => playbackController.play(),
    pause: () => playbackController.pause(),
    stop: () => playbackController.stop(),
    seekTo: (frame) => playbackController.seekTo(frame),
    scrubTo: (frame) => playbackController.scrubTo(frame),

    setZoomLevel: (zoom) => set({ zoomLevel: clampZoom(zoom) }),
    setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
    setScrollY: (y) => set({ scrollY: Math.max(0, y) }),
    setFollowPlayhead: (follow) => set({ followPlayhead: follow }),
    setContainerWidth: (w) => { if (w > 0 && w !== get().containerWidth) set({ containerWidth: w }); },
    toggleWaveforms: () => set({ showWaveforms: !get().showWaveforms }),
    toggleThumbnails: () => set({ showThumbnails: !get().showThumbnails }),

    zoomAtCursor: (cursorX, factor) => {
      const { zoomLevel, scrollX } = get();
      const newZoom = clampZoom(zoomLevel * factor);
      const frameUnderCursor = (cursorX + scrollX) / getFrameWidth(zoomLevel);
      const newScrollX = frameUnderCursor * getFrameWidth(newZoom) - cursorX;
      set({ zoomLevel: newZoom, scrollX: Math.max(0, newScrollX) });
    },

    fitTimeline: (durationFrames) => {
      const { containerWidth } = get();
      const dur = Math.max(1, durationFrames);
      // total width = dur * getFrameWidth(zoom) = dur * BASE * zoom; solve for full fit.
      const zoom = clampZoom((containerWidth - 24) / (dur * getFrameWidth(1)));
      set({ zoomLevel: zoom, scrollX: 0 });
    },

    jumpToPlayhead: () => {
      const { containerWidth, zoomLevel, currentFrame } = get();
      const target = currentFrame * getFrameWidth(zoomLevel) - containerWidth / 2;
      set({ scrollX: Math.max(0, target) });
    },
  };
});
