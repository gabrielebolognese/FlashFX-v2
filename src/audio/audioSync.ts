/**
 * audioSync is a lightweight event bridge that lets usePlayback notify the
 * audio system of play, pause, and seek events without creating a hard
 * dependency between the animation and audio modules.
 *
 * The AudioProvider registers handlers when mounted and unregisters on unmount.
 * usePlayback calls these handlers after its own scheduler operations.
 */

export interface AudioSyncHandlers {
  onPlay: (time: number) => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onStop: () => void;
}

let handlers: AudioSyncHandlers | null = null;

export const audioSync = {
  register(h: AudioSyncHandlers): void {
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
