import type { Composition, AudioLayer } from '../../core/types';
import { evaluateNumber } from '../../core/interpolation';
import { mediaAssetManager } from './assetManager';
import { videoAudioPlayer } from '../video/videoAudioPlayer';

export interface AudioDiagnostics {
  contextState: AudioContextState | 'uninitialized';
  activeSources: number;
  pendingBuffers: string[];
  failedAssets: string[];
}

/**
 * Derives a unique scheduling key for each audible layer. Audio layers use
 * their layer id directly; video layers are prefixed to avoid collisions.
 */
function layerKey(layer: { id: string; type: string }): string {
  return layer.type === 'video' ? `video_${layer.id}` : layer.id;
}

class AudioPlaybackEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private gainNodes = new Map<string, GainNode>();
  private sourceNodes = new Map<string, AudioBufferSourceNode>();
  private activeKeys = new Set<string>();
  /** Asset ids whose video audio is currently synced (played through videoAudioPlayer). */
  private activeVideoAssets = new Set<string>();
  private isPlaying = false;
  private lastComposition: Composition | null = null;
  private lastFrame = 0;
  private lastFrameRate = 30;
  private failedAssets = new Set<string>();
  private pendingAssets = new Set<string>();
  private bufferReadyUnsub: (() => void) | null = null;

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.splitter = this.context.createChannelSplitter(2);
      this.analyserL = this.context.createAnalyser();
      this.analyserL.fftSize = 1024;
      this.analyserL.smoothingTimeConstant = 0.8;
      this.analyserR = this.context.createAnalyser();
      this.analyserR.fftSize = 1024;
      this.analyserR.smoothingTimeConstant = 0.8;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.splitter);
      this.splitter.connect(this.analyserL, 0);
      this.splitter.connect(this.analyserR, 1);
      this.analyser.connect(this.context.destination);
    }
    return this.context;
  }

  getAnalyserLeft(): AnalyserNode | null { return this.analyserL; }
  getAnalyserRight(): AnalyserNode | null { return this.analyserR; }
  getMasterAnalyser(): AnalyserNode | null { return this.analyser; }

  private async resumeContext(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('[AudioEngine] Failed to resume AudioContext:', err);
      }
    }
  }

  startPlayback(composition: Composition, currentFrame: number, frameRate: number): void {
    this.stopAllSources();
    this.isPlaying = true;
    this.lastComposition = composition;
    this.lastFrame = currentFrame;
    this.lastFrameRate = frameRate;

    this.resumeContext();
    this.evaluateAndSchedule(composition, currentFrame, frameRate);
    this.listenForBufferReady();
  }

  private listenForBufferReady(): void {
    if (this.bufferReadyUnsub) return;
    this.bufferReadyUnsub = mediaAssetManager.subscribe(() => {
      if (!this.isPlaying || !this.lastComposition) return;
      if (this.pendingAssets.size === 0) return;

      let anyResolved = false;
      for (const assetId of this.pendingAssets) {
        if (mediaAssetManager.getAudioBuffer(assetId)) {
          this.pendingAssets.delete(assetId);
          anyResolved = true;
        }
      }

      if (anyResolved) {
        this.evaluateAndSchedule(this.lastComposition!, this.lastFrame, this.lastFrameRate);
      }
    });
  }

  /**
   * Core scheduling method: determines which layers should be audible at the
   * given frame, starts sources for newly-active layers, and stops sources for
   * layers that are no longer active. This is called on every frame advance
   * so that clip transitions are handled seamlessly.
   */
  private evaluateAndSchedule(composition: Composition, currentFrame: number, frameRate: number): void {
    const ctx = this.ensureContext();
    const currentTime = currentFrame / frameRate;

    // Build track mute/hidden lookup
    const tracks = composition.tracks || [];
    const mutedTrackIds = new Set(tracks.filter((t) => t.muted || !t.visible).map((t) => t.id));

    // Determine which AUDIO layers should be audible right now. Video layers are
    // handled separately (reconcileVideoAudio) because their audio plays through
    // <video> elements that must be re-synced/re-muted every frame, not just at
    // clip activation.
    const shouldBeActive = new Set<string>();

    for (const layer of composition.layers) {
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      if (layer.type === 'audio' && !layer.audio.muted) {
        shouldBeActive.add(layerKey(layer));
      }
    }

    // Stop sources for audio layers that are no longer active
    for (const key of this.activeKeys) {
      if (!shouldBeActive.has(key)) {
        this.stopSource(key);
      }
    }

    // Start sources for newly-active audio layers (one-shot AudioBufferSourceNodes)
    for (const layer of composition.layers) {
      if (layer.type !== 'audio') continue;
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      const key = layerKey(layer);
      if (!shouldBeActive.has(key)) continue;
      if (this.activeKeys.has(key)) continue; // Already playing

      this.scheduleAudioLayer(layer, currentTime, currentFrame, frameRate, ctx);
    }

    // Reconcile video audio every frame (drift correction + live mute + pause
    // clips that left range).
    this.reconcileVideoAudio(composition, currentFrame, frameRate, mutedTrackIds);
  }

  /**
   * Reconcile video-layer audio every frame. Unlike `audio` layers (one-shot
   * AudioBufferSourceNodes started once), video audio plays through <video>
   * elements managed by videoAudioPlayer and must be re-synced to the playhead
   * each frame (drift correction), re-muted when the mute flag toggles mid-play,
   * and paused when a clip scrolls out of range. The old code only touched video
   * at clip activation, so video audio drifted, ignored live mute toggles, and
   * kept playing after a trimmed clip ended.
   */
  private reconcileVideoAudio(
    composition: Composition,
    currentFrame: number,
    frameRate: number,
    mutedTrackIds: Set<string>
  ): void {
    const currentTime = currentFrame / frameRate;
    const stillActive = new Set<string>();

    for (const layer of composition.layers) {
      if (layer.type !== 'video') continue;
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      const assetId = layer.video.assetId;
      const layerStartTimeSec = layer.inPoint / frameRate;
      const sourceStartOffsetSec = (layer.video.startOffset ?? 0) / layer.video.sourceFrameRate;

      videoAudioPlayer.syncToPlayhead(
        assetId,
        currentTime,
        this.isPlaying,
        layer.video.playbackRate,
        layerStartTimeSec,
        sourceStartOffsetSec
      );
      videoAudioPlayer.setMuted(assetId, layer.video.muted);
      stillActive.add(assetId);
    }

    // Pause assets whose clips left range (or whose track was muted/hidden).
    for (const assetId of this.activeVideoAssets) {
      if (!stillActive.has(assetId)) {
        videoAudioPlayer.pause(assetId);
      }
    }
    this.activeVideoAssets = stillActive;
  }

  private scheduleAudioLayer(
    layer: AudioLayer,
    currentTime: number,
    currentFrame: number,
    frameRate: number,
    ctx: AudioContext
  ): void {
    const buffer = mediaAssetManager.getAudioBuffer(layer.audio.assetId);
    if (!buffer) {
      this.pendingAssets.add(layer.audio.assetId);
      return;
    }

    const clipStartTime = layer.inPoint / frameRate;
    const sourceOffsetSec = (layer.audio.startOffset ?? 0) / frameRate;
    const offsetIntoClip = currentTime - clipStartTime + sourceOffsetSec;
    if (offsetIntoClip < 0 || offsetIntoClip >= buffer.duration) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const volume = evaluateNumber(layer.audio.volume, currentFrame);
    const pitch = evaluateNumber(layer.audio.pitch, currentFrame);

    source.playbackRate.value = Math.max(0.25, Math.min(4, Math.pow(2, pitch / 12)));

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(2, volume));
    source.connect(gain);
    gain.connect(this.masterGain!);

    const clipDuration = (layer.outPoint - layer.inPoint) / frameRate;
    const remainingClip = clipDuration - (currentTime - clipStartTime);
    const remainingBuffer = buffer.duration - offsetIntoClip;
    const playDuration = Math.min(remainingClip, remainingBuffer);

    try {
      source.start(0, offsetIntoClip, playDuration > 0 ? playDuration : undefined);
    } catch (err) {
      console.warn(`[AudioEngine] Failed to start audio source for layer "${layer.name}":`, err);
      return;
    }

    const key = layerKey(layer);
    this.sourceNodes.set(key, source);
    this.gainNodes.set(key, gain);
    this.activeKeys.add(key);
  }

  private stopSource(key: string): void {
    const source = this.sourceNodes.get(key);
    if (source) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
      this.sourceNodes.delete(key);
    }
    const gain = this.gainNodes.get(key);
    if (gain) {
      try { gain.disconnect(); } catch {}
      this.gainNodes.delete(key);
    }
    this.activeKeys.delete(key);
  }

  /**
   * Called on every frame advance during playback. Detects clip transitions
   * (new clips entering range, old clips leaving range) and updates the
   * active source set accordingly. Also updates volume/gain for ongoing clips.
   */
  updatePlayback(composition: Composition, currentFrame: number, frameRate: number): void {
    if (!this.isPlaying) return;
    this.lastComposition = composition;
    this.lastFrame = currentFrame;
    this.lastFrameRate = frameRate;

    this.evaluateAndSchedule(composition, currentFrame, frameRate);
    this.updateVolumes(composition, currentFrame);
  }

  private updateVolumes(composition: Composition, currentFrame: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;

    for (const layer of composition.layers) {
      // Video volume/mute is applied in reconcileVideoAudio via videoAudioPlayer
      // (its gain lives on the <video> element's node, not in this.gainNodes).
      if (layer.type !== 'audio') continue;
      const key = layerKey(layer);
      const gain = this.gainNodes.get(key);
      if (!gain) continue;
      if (layer.audio.muted) {
        gain.gain.setTargetAtTime(0, now, 0.02);
        continue;
      }
      const volume = evaluateNumber(layer.audio.volume, currentFrame);
      gain.gain.setTargetAtTime(Math.max(0, Math.min(2, volume)), now, 0.02);
    }
  }

  stopPlayback(): void {
    this.isPlaying = false;
    this.lastComposition = null;
    this.pendingAssets.clear();
    this.stopAllSources();

    if (this.bufferReadyUnsub) {
      this.bufferReadyUnsub();
      this.bufferReadyUnsub = null;
    }
  }

  private stopAllSources(): void {
    for (const source of this.sourceNodes.values()) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    for (const gain of this.gainNodes.values()) {
      try { gain.disconnect(); } catch {}
    }
    // Pause video audio too: it plays through <video> elements that stopping the
    // buffer sources doesn't touch, so without this it kept playing after pause.
    for (const assetId of this.activeVideoAssets) {
      videoAudioPlayer.pause(assetId);
    }
    this.sourceNodes.clear();
    this.gainNodes.clear();
    this.activeKeys.clear();
    this.activeVideoAssets.clear();
  }

  getDiagnostics(): AudioDiagnostics {
    return {
      contextState: this.context?.state ?? 'uninitialized',
      activeSources: this.sourceNodes.size,
      pendingBuffers: [...this.pendingAssets],
      failedAssets: [...this.failedAssets],
    };
  }

  destroy(): void {
    this.stopPlayback();
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
    this.context = null;
    this.analyser = null;
    this.analyserL = null;
    this.analyserR = null;
    this.splitter = null;
    this.masterGain = null;
    this.failedAssets.clear();
  }
}

export const audioPlaybackEngine = new AudioPlaybackEngine();
