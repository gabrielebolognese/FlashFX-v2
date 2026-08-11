import { audioTransport } from '../audio/audioTransport';

const DRIFT_THRESHOLD_SEC = 0.08;

interface AudioPlayerRecord {
  element: HTMLVideoElement;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
  objectUrl: string;
  muted: boolean;
  refCount: number;
}

class VideoAudioPlayer {
  private players = new Map<string, AudioPlayerRecord>();

  initAudio(assetId: string, file: File): void {
    const existing = this.players.get(assetId);
    if (existing) {
      existing.refCount++;
      return;
    }

    const element = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    element.src = objectUrl;
    // 'metadata', NOT 'auto': 'auto' makes every hidden <video> buffer its ENTIRE file into memory the
    // moment it's created, so opening a project with N videos loaded N full files at once → OOM. With
    // 'metadata' the browser fetches only headers and buffers media on demand once the clip actually
    // plays (still smooth; buffering catches up during playback).
    element.preload = 'metadata';
    element.muted = false;
    element.volume = 1;
    element.style.display = 'none';
    document.body.appendChild(element);

    // Shared context + master graph → video audio reaches the master gain + VU
    // meters and is resumed with the rest of playback (was a private, never-resumed
    // context → silent on load + dead meters).
    const ctx = audioTransport.getContext();
    const sourceNode = ctx.createMediaElementSource(element);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    sourceNode.connect(gainNode);
    gainNode.connect(audioTransport.getMasterGain());

    this.players.set(assetId, {
      element,
      sourceNode,
      gainNode,
      objectUrl,
      muted: false,
      refCount: 1,
    });
  }

  hasAudioTrack(assetId: string): boolean {
    const record = this.players.get(assetId);
    if (!record) return false;
    const el = record.element;
    if ('audioTracks' in el && (el as any).audioTracks) {
      return (el as any).audioTracks.length > 0;
    }
    return true;
  }

  syncToPlayhead(
    assetId: string,
    compositionTimeSec: number,
    isPlaying: boolean,
    playbackRate: number,
    layerStartTimeSec: number,
    sourceStartOffsetSec: number
  ): void {
    const record = this.players.get(assetId);
    if (!record) return;

    const el = record.element;
    const targetTime = compositionTimeSec - layerStartTimeSec + sourceStartOffsetSec;

    if (targetTime < 0 || targetTime > el.duration) {
      if (!el.paused) el.pause();
      return;
    }

    if (isPlaying) {
      if (Math.abs(el.playbackRate - playbackRate) > 0.01) {
        el.playbackRate = playbackRate;
      }
      if (el.paused) {
        el.currentTime = targetTime;
        el.play().catch(() => {});
      } else {
        const drift = Math.abs(el.currentTime - targetTime);
        if (drift > DRIFT_THRESHOLD_SEC) {
          el.currentTime = targetTime;
        }
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
      el.currentTime = targetTime;
    }
  }

  /**
   * Pause a single asset's audio element. Used when a clip scrolls out of range:
   * syncToPlayhead only self-pauses when targetTime leaves [0, duration], which a
   * *trimmed* clip (outPoint before the source end) never does, so the caller
   * must pause it explicitly.
   */
  pause(assetId: string): void {
    const record = this.players.get(assetId);
    if (record && !record.element.paused) {
      record.element.pause();
    }
  }

  setMuted(assetId: string, muted: boolean): void {
    const record = this.players.get(assetId);
    if (!record) return;
    record.muted = muted;
    record.gainNode.gain.value = muted ? 0 : 1;
  }

  setVolume(assetId: string, volume: number): void {
    const record = this.players.get(assetId);
    if (!record) return;
    if (record.muted) return;
    record.gainNode.gain.value = Math.max(0, Math.min(2, volume));
  }

  addRef(assetId: string): void {
    const record = this.players.get(assetId);
    if (record) record.refCount++;
  }

  releaseRef(assetId: string): void {
    const record = this.players.get(assetId);
    if (!record) return;
    record.refCount--;
    if (record.refCount <= 0) {
      this.destroyAudio(assetId);
    }
  }

  destroyAudio(assetId: string): void {
    const record = this.players.get(assetId);
    if (!record) return;

    record.element.pause();
    URL.revokeObjectURL(record.objectUrl);
    record.sourceNode.disconnect();
    record.gainNode.disconnect();
    if (record.element.parentNode) {
      record.element.parentNode.removeChild(record.element);
    }
    this.players.delete(assetId);
  }

  pauseAll(): void {
    for (const record of this.players.values()) {
      if (!record.element.paused) {
        record.element.pause();
      }
    }
  }

  destroyAll(): void {
    for (const assetId of [...this.players.keys()]) {
      this.destroyAudio(assetId);
    }
  }
}

export const videoAudioPlayer = new VideoAudioPlayer();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      videoAudioPlayer.pauseAll();
    }
  });

  window.addEventListener('unload', () => {
    videoAudioPlayer.destroyAll();
  });
}
