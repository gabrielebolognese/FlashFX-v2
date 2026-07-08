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
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  setAudioContext(ctx: AudioContext, masterGain: GainNode): void {
    this.audioContext = ctx;
    this.masterGain = masterGain;
  }

  initAudio(assetId: string, file: File): void {
    const existing = this.players.get(assetId);
    if (existing) {
      existing.refCount++;
      return;
    }

    const element = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    element.src = objectUrl;
    element.preload = 'auto';
    element.muted = false;
    element.volume = 1;
    element.style.display = 'none';
    document.body.appendChild(element);

    const ctx = this.ensureContext();
    const sourceNode = ctx.createMediaElementSource(element);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    sourceNode.connect(gainNode);
    if (this.masterGain) {
      gainNode.connect(this.masterGain);
    } else {
      gainNode.connect(ctx.destination);
    }

    this.players.set(assetId, {
      element,
      sourceNode,
      gainNode,
      objectUrl,
      muted: false,
      refCount: 1,
    });
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
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
