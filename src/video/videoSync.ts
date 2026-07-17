/**
 * videoSync — lightweight event bridge between the playback system and
 * the video rendering pipeline. Mirrors the audioSync pattern exactly.
 * VideoRenderer registers handlers; usePlayback fires them.
 */

export interface VideoSyncHandlers {
  onPlay: (time: number) => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onStop: () => void;
}

let handlers: VideoSyncHandlers | null = null;

export const videoSync = {
  register(h: VideoSyncHandlers): void {
    handlers = h;
  },

  unregister(): void {
    handlers = null;
  },

  play(time: number): void {
    handlers?.onPlay(time);
  },

  pause(): void {
    handlers?.onPause();
  },

  seek(time: number): void {
    handlers?.onSeek(time);
  },

  stop(): void {
    handlers?.onStop();
  },
};
