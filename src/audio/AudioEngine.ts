import { AudioClip, AudioTrack } from './types';

interface ActiveSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  clipId: string;
  trackId: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeSources: ActiveSource[] = [];
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private activeTrackGains = new Map<string, GainNode>();

  private ensureCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  loadAsset(assetId: string, buffer: AudioBuffer): void {
    this.buffers.set(assetId, buffer);
  }

  removeAsset(assetId: string): void {
    this.buffers.delete(assetId);
  }

  play(
    globalTime: number,
    clips: AudioClip[],
    tracks: Record<string, AudioTrack>
  ): void {
    this.stopAll();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const hasSolo = Object.values(tracks).some((t) => t.solo);

    for (const clip of clips) {
      if (clip.muted) continue;
      if (globalTime >= clip.endTime) continue;

      const track = tracks[clip.trackId];
      if (!track) continue;
      if (track.muted) continue;
      if (hasSolo && !track.solo) continue;

      const buffer = this.buffers.get(clip.assetId);
      if (!buffer) continue;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = track.volume ?? 1;

      const clipDuration = clip.endTime - clip.startTime;
      let when: number;
      let sourceOffset: number;
      let duration: number;

      if (globalTime <= clip.startTime) {
        when = ctx.currentTime + (clip.startTime - globalTime);
        sourceOffset = clip.offset;
        duration = clipDuration;
      } else {
        const elapsed = globalTime - clip.startTime;
        when = ctx.currentTime;
        sourceOffset = clip.offset + elapsed;
        duration = clipDuration - elapsed;
      }

      if (duration <= 0) continue;

      const fadeIn = clip.fadeIn ?? 0;
      const fadeOut = clip.fadeOut ?? 0;
      const vol = track.volume ?? 1;

      if (fadeIn > 0 || fadeOut > 0) {
        gainNode.gain.setValueAtTime(0.0001, when);
        if (fadeIn > 0) {
          gainNode.gain.linearRampToValueAtTime(vol, when + Math.min(fadeIn, duration * 0.5));
        } else {
          gainNode.gain.setValueAtTime(vol, when);
        }
        if (fadeOut > 0) {
          const fadeOutStart = when + duration - Math.min(fadeOut, duration * 0.5);
          gainNode.gain.setValueAtTime(vol, fadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0.0001, when + duration);
        }
      }

      source.connect(gainNode);
      gainNode.connect(this.masterGain!);

      source.start(when, sourceOffset, duration);
      this.activeSources.push({ source, gain: gainNode, clipId: clip.id, trackId: clip.trackId });
      this.activeTrackGains.set(clip.trackId, gainNode);
    }
  }

  setTrackVolume(trackId: string, volume: number): void {
    const gainNode = this.activeTrackGains.get(trackId);
    if (gainNode && this.ctx) {
      gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.01);
    }
  }

  pause(): void {
    this.stopAll();
  }

  seek(_globalTime: number): void {
    this.stopAll();
  }

  setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  private stopAll(): void {
    for (const active of this.activeSources) {
      try {
        active.source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
    this.activeTrackGains.clear();
  }

  dispose(): void {
    this.stopAll();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
  }
}

export const audioEngineInstance = new AudioEngine();
